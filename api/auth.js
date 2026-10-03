/** 등록된 기기의 PIN 인증과 서버 세션. 보육 정보는 저장하지 않는다. */
const DAY = 86400000;
const IDLE = 60 * 60000;
const encoder = new TextEncoder();
export class ApiError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export function randomToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
}
async function digest(value) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))), b => b.toString(16).padStart(2, '0')).join('');
}
function equal(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function pinHash(pin, salt, pepper) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(pin + pepper), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: encoder.encode(salt), iterations: 100000, hash: 'SHA-256' }, key, 256);
  return Array.from(new Uint8Array(bits), b => b.toString(16).padStart(2, '0')).join('');
}
function requirePin(pin) {
  if (!/^\d{4}$/.test(pin || '')) throw new ApiError('PIN은 숫자 4자리로 입력해 주세요.');
}
export function cookies(request) {
  return Object.fromEntries((request.headers.get('Cookie') || '').split(';').map(s => s.trim().split('=')).filter(p => p.length === 2));
}
export function authCookies(request, values) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return Object.entries(values).map(([name, value]) => `${name}=${value.token || ''}; Path=/; HttpOnly; SameSite=Strict${secure}; Max-Age=${value.maxAge || 0}`);
}
export function checkMutation(request) {
  if (['GET', 'HEAD'].includes(request.method)) return;
  if (request.headers.get('Origin') !== new URL(request.url).origin) throw new ApiError('허용되지 않은 요청입니다.', 403);
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw new ApiError('JSON 요청이 필요합니다.', 415);
}
export async function authCall(env, op, body = {}) {
  if (!env.AUTH_STORE || !env.AUTH_PEPPER) throw new ApiError('보안 저장소 설정이 필요합니다.', 503);
  const stub = env.AUTH_STORE.get(env.AUTH_STORE.idFromName('daycare-auth-v1'));
  const response = await stub.fetch('https://auth.internal/' + op, { method: 'POST', body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new ApiError(data.error, response.status);
  return data;
}
export async function requireSession(request, env) {
  const c = cookies(request);
  return authCall(env, 'session', { sessionToken: c.daycare_session, deviceToken: c.daycare_device });
}

export class AuthStore {
  constructor(state, env) { this.state = state; this.db = state.storage; this.env = env; }
  async fetch(request) {
    try {
      // 동시 PIN 시도와 초대 사용을 직렬화하여 잠금/일회성 조건을 보장한다.
      return await this.state.blockConcurrencyWhile(async () => {
        // 콜백 밖으로 예외가 나가면 객체가 재시작되어 안내와 실패 횟수 기록을 잃는다.
        try {
          const data = await this.run(new URL(request.url).pathname.slice(1), await request.json());
          return Response.json(data);
        } catch (error) {
          return this.failure(error);
        }
      });
    } catch (error) {
      return this.failure(error);
    }
  }
  failure(error) {
    return Response.json({ error: error instanceof ApiError ? error.message : '인증 처리에 실패했습니다.' },
      { status: error instanceof ApiError ? error.status : 500 });
  }
  async getDevice(token) {
    if (!token) return null;
    const device = await this.db.get('device:' + await digest(token));
    return device && device.expires > Date.now() ? device : null;
  }
  async throttle(key, verify) {
    const storeKey = 'attempt:' + await digest(key);
    const now = Date.now();
    let entry = await this.db.get(storeKey) || { count: 0, until: 0, started: now };
    if (entry.until > now) throw new ApiError('PIN 시도가 많습니다. 15분 뒤 다시 시도해 주세요.', 429);
    if (now - entry.started > 15 * 60000) entry = { count: 0, until: 0, started: now };
    const valid = await verify();
    if (valid) { await this.db.delete(storeKey); return; }
    entry.count++;
    if (entry.count >= 5) entry.until = now + 15 * 60000;
    await this.db.put(storeKey, entry);
    throw new ApiError('PIN이 맞지 않습니다.', 401);
  }
  async issueSession(device, deviceToken, remember) {
    const token = randomToken();
    const maxAge = remember ? 30 * 86400 : 86400;
    await this.db.put('session:' + await digest(token), {
      teacherId: device.teacherId, className: device.className,
      deviceHash: await digest(deviceToken), expires: Date.now() + maxAge * 1000,
      idleUntil: Date.now() + IDLE, version: device.version
    });
    return { sessionToken: token, sessionMaxAge: maxAge, teacherId: device.teacherId, className: device.className };
  }
  async session(b) {
    const device = await this.getDevice(b.deviceToken);
    const session = b.sessionToken && await this.db.get('session:' + await digest(b.sessionToken));
    const account = device && await this.db.get('account:' + device.teacherId);
    if (!device || !session || !account || session.deviceHash !== await digest(b.deviceToken) ||
      session.teacherId !== device.teacherId || session.version !== account.version ||
      session.expires <= Date.now() || session.idleUntil <= Date.now()) throw new ApiError('PIN으로 잠금을 풀어 주세요.', 401);
    session.idleUntil = Date.now() + IDLE;
    await this.db.put('session:' + await digest(b.sessionToken), session);
    if (!account.draftKey) { account.draftKey = randomToken(); await this.db.put('account:' + device.teacherId, account); }
    return { teacherId: session.teacherId, className: session.className, expiresAt: session.expires, draftKey: account.draftKey };
  }
  async run(op, b) {
    if (op === 'invite') {
      const token = randomToken();
      await this.db.put('invite:' + await digest(token), { teacherId: b.teacherId, className: b.className, expires: Date.now() + 30 * 60000 });
      return { token, expiresIn: 1800 };
    }
    if (op === 'status') {
      const device = await this.getDevice(b.deviceToken);
      return { registered: !!device, teacherId: device?.teacherId || null };
    }
    if (op === 'invite-status') {
      const invite = await this.db.get('invite:' + await digest(b.invite || ''));
      if (!invite || invite.expires <= Date.now()) throw new ApiError('기기 등록 링크가 만료되었거나 사용되었습니다.', 403);
      return { teacherId: invite.teacherId, initial: !await this.db.get('account:' + invite.teacherId) };
    }
    if (op === 'register') {
      requirePin(b.pin);
      const inviteKey = 'invite:' + await digest(b.invite || '');
      const invite = await this.db.get(inviteKey);
      if (!invite || invite.expires <= Date.now()) throw new ApiError('기기 등록 링크가 만료되었거나 사용되었습니다.', 403);
      let account = await this.db.get('account:' + invite.teacherId);
      if (account) {
        await this.throttle('account:' + invite.teacherId, async () => equal(account.hash, await pinHash(b.pin, account.salt, this.env.AUTH_PEPPER)));
      } else {
        if (b.pin !== b.confirmPin) throw new ApiError('새 PIN을 한 번 더 확인해 주세요.');
        const salt = randomToken();
        account = { salt, hash: await pinHash(b.pin, salt, this.env.AUTH_PEPPER), version: 1, draftKey: randomToken() };
        await this.db.put('account:' + invite.teacherId, account);
      }
      await this.db.delete(inviteKey);
      const deviceToken = randomToken();
      const device = { teacherId: invite.teacherId, className: invite.className, version: account.version, expires: Date.now() + 30 * DAY };
      await this.db.put('device:' + await digest(deviceToken), device);
      await this.db.setAlarm(Date.now() + DAY);
      return { ...await this.issueSession(device, deviceToken, b.remember), deviceToken, deviceMaxAge: 30 * 86400 };
    }
    if (op === 'login') {
      requirePin(b.pin);
      const device = await this.getDevice(b.deviceToken);
      if (!device || device.teacherId !== b.teacherId) throw new ApiError('이 선생님의 기기 등록 링크로 먼저 등록해 주세요.', 403);
      const account = await this.db.get('account:' + device.teacherId);
      await this.throttle('account:' + device.teacherId, async () => !!account && equal(account.hash, await pinHash(b.pin, account.salt, this.env.AUTH_PEPPER)));
      device.version = account.version;
      return this.issueSession(device, b.deviceToken, b.remember);
    }
    if (op === 'session') return this.session(b);
    if (op === 'logout') {
      if (b.sessionToken) await this.db.delete('session:' + await digest(b.sessionToken));
      if (b.forget && b.deviceToken) await this.db.delete('device:' + await digest(b.deviceToken));
      return { success: true };
    }
    if (op === 'change-pin') {
      const session = await this.session(b);
      requirePin(b.pin); requirePin(b.currentPin);
      if (b.pin !== b.confirmPin) throw new ApiError('새 PIN 확인이 일치하지 않습니다.');
      const account = await this.db.get('account:' + session.teacherId);
      await this.throttle('account:' + session.teacherId, async () => equal(account.hash, await pinHash(b.currentPin, account.salt, this.env.AUTH_PEPPER)));
      account.salt = randomToken(); account.hash = await pinHash(b.pin, account.salt, this.env.AUTH_PEPPER); account.version++;
      await this.db.put('account:' + session.teacherId, account);
      return { success: true };
    }
    throw new ApiError('없는 인증 기능입니다.', 404);
  }
  async alarm() {
    const now = Date.now();
    for (const prefix of ['invite:', 'session:', 'device:', 'attempt:']) {
      const entries = await this.db.list({ prefix });
      const expired = [...entries].filter(([, value]) => (value.expires || value.started + DAY) <= now).map(([key]) => key);
      if (expired.length) await this.db.delete(expired);
    }
    await this.db.setAlarm(now + DAY);
  }
}
