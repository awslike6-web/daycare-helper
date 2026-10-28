/** 등록된 기기의 PIN 인증과 서버 세션. 보육 정보는 저장하지 않는다. */
const DAY = 86400000;
const DEVICE_MAX_AGE = 30 * 86400;
const IDLE = 60 * 60000;
// 사용 현황: 30분 넘게 쉬면 새 접속, 마지막 활동은 5분 단위로 갱신, 90일 보관.
const VISIT_GAP = 30 * 60000;
const VISIT_TOUCH = 5 * 60000;
const USAGE_DAYS = 90;
const USAGE_MAX_RANGE = 92;
const USAGE_COUNTS = { generate: 'generates', save: 'saves' };
const KST = 9 * 3600000;
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
/** 서식 생성·완성 저장 성공 횟수를 남긴다. 기록 실패가 교사 작업을 막지 않는다. */
export async function countUsage(request, env, kind) {
  const c = cookies(request);
  try { await authCall(env, 'usage-count', { sessionToken: c.daycare_session, deviceToken: c.daycare_device, kind }); }
  catch (error) { console.error('보육비서 사용 기록 실패', kind, error.status || 500); }
}
function kstText(ms) { return new Date(ms + KST).toISOString().slice(0, 16).replace('T', ' '); }
function kstStart(date) {
  const ms = Date.parse(date + 'T00:00:00+09:00');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || Number.isNaN(ms) || kstText(ms).slice(0, 10) !== date) throw new ApiError('조회 날짜는 YYYY-MM-DD로 입력해 주세요.');
  return ms;
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
  usageTable() {
    if (!this.usageReady) {
      // 교사 ID·시각·기기 표시값·횟수만 둔다. IP·브라우저 정보·메모·원아 정보는 저장하지 않는다.
      this.db.sql.exec(`CREATE TABLE IF NOT EXISTS usage_visits (id INTEGER PRIMARY KEY AUTOINCREMENT,
        teacher_id TEXT NOT NULL, device TEXT NOT NULL, start_kind TEXT NOT NULL, started_at INTEGER NOT NULL,
        last_at INTEGER NOT NULL, generates INTEGER NOT NULL DEFAULT 0, saves INTEGER NOT NULL DEFAULT 0)`);
      this.db.sql.exec('CREATE INDEX IF NOT EXISTS usage_visits_recent ON usage_visits (teacher_id, device, last_at)');
      this.db.sql.exec('CREATE INDEX IF NOT EXISTS usage_visits_started ON usage_visits (started_at)');
      this.usageReady = true;
    }
    return this.db.sql;
  }
  recordUsage(write) {
    if (!this.db.sql) return;
    try { write(this.usageTable(), Date.now()); }
    catch (error) { console.error('보육비서 사용 기록 실패', error?.name || 'Error'); }
  }
  startVisit(teacherId, deviceHash, kind) {
    this.recordUsage((sql, now) => sql.exec('INSERT INTO usage_visits (teacher_id, device, start_kind, started_at, last_at) VALUES (?, ?, ?, ?, ?)',
      teacherId, deviceHash.slice(0, 12), kind, now, now));
  }
  touchVisit(teacherId, deviceHash, kind) {
    this.recordUsage((sql, now) => {
      const device = deviceHash.slice(0, 12), column = USAGE_COUNTS[kind];
      const visit = sql.exec('SELECT id, last_at FROM usage_visits WHERE teacher_id = ? AND device = ? AND last_at >= ? ORDER BY last_at DESC LIMIT 1',
        teacherId, device, now - VISIT_GAP).toArray()[0];
      const id = visit ? visit.id : sql.exec("INSERT INTO usage_visits (teacher_id, device, start_kind, started_at, last_at) VALUES (?, ?, 'resume', ?, ?) RETURNING id",
        teacherId, device, now, now).one().id;
      if (column) sql.exec(`UPDATE usage_visits SET ${column} = ${column} + 1, last_at = ? WHERE id = ?`, now, id);
      else if (visit && now - visit.last_at >= VISIT_TOUCH) sql.exec('UPDATE usage_visits SET last_at = ? WHERE id = ?', now, id);
    });
  }
  usageReport(b) {
    const to = b.to || kstText(Date.now()).slice(0, 10);
    const end = kstStart(to) + DAY;
    const from = b.from || kstText(end - 7 * DAY).slice(0, 10);
    const start = kstStart(from);
    if (start >= end || end - start > USAGE_MAX_RANGE * DAY) throw new ApiError(`조회 기간은 1~${USAGE_MAX_RANGE}일로 지정해 주세요.`);
    const teacherFilter = typeof b.teacherId === 'string' && b.teacherId ? b.teacherId : null;
    const rows = this.usageTable().exec(`SELECT teacher_id, device, start_kind, started_at, last_at, generates, saves FROM usage_visits
      WHERE started_at >= ? AND started_at < ?${teacherFilter ? ' AND teacher_id = ?' : ''} ORDER BY started_at`,
      ...[start, end, teacherFilter].filter(v => v !== null)).toArray();
    const teachers = new Map();
    for (const row of rows) {
      const t = teachers.get(row.teacher_id) || { teacherId: row.teacher_id, visits: 0, logins: 0, resumes: 0, days: new Set(),
        minutes: 0, generates: 0, saves: 0, devices: new Set(), first: row.started_at, last: 0 };
      t.visits++; row.start_kind === 'resume' ? t.resumes++ : t.logins++;
      t.days.add(kstText(row.started_at).slice(0, 10)); t.devices.add(row.device);
      t.minutes += Math.round((row.last_at - row.started_at) / 60000);
      t.generates += row.generates; t.saves += row.saves; t.last = Math.max(t.last, row.last_at);
      teachers.set(row.teacher_id, t);
    }
    return { from, to, retentionDays: USAGE_DAYS,
      teachers: [...teachers.values()].map(t => ({ teacherId: t.teacherId, visits: t.visits, logins: t.logins, resumes: t.resumes,
        activeDays: t.days.size, minutes: t.minutes, generates: t.generates, saves: t.saves, devices: t.devices.size,
        firstAt: kstText(t.first), lastAt: kstText(t.last) })),
      ...(b.includeVisits === true ? { visits: rows.map(row => ({ teacherId: row.teacher_id, device: row.device, kind: row.start_kind,
        startedAt: kstText(row.started_at), lastAt: kstText(row.last_at), minutes: Math.round((row.last_at - row.started_at) / 60000),
        generates: row.generates, saves: row.saves })) } : {}) };
  }
  async getDevice(token) {
    if (!token) return null;
    const device = await this.db.get('device:' + await digest(token));
    return device && device.expires > Date.now() ? device : null;
  }
  async getInvite(token) {
    const key = 'invite:' + await digest(token || '');
    const invite = await this.db.get(key);
    if (!invite || invite.expires <= Date.now()) throw new ApiError('기기 등록 링크가 만료되었거나 사용되었습니다.', 403);
    if (invite.issuerDeviceHash) {
      const issuer = await this.db.get('device:' + invite.issuerDeviceHash);
      const account = await this.db.get('account:' + invite.teacherId);
      if (!issuer || issuer.expires <= Date.now() || issuer.teacherId !== invite.teacherId ||
          issuer.inviteKey !== key || account?.version !== invite.version) {
        throw new ApiError('기기 등록 링크가 무효화되었습니다. 등록된 기기에서 다시 발급해 주세요.', 403);
      }
    }
    return invite;
  }
  async createInvite(teacherId, className, deviceToken) {
    const token = randomToken(), key = 'invite:' + await digest(token);
    const expires = Date.now() + 30 * 60000;
    const invite = { teacherId, className, expires };
    if (deviceToken) {
      const device = await this.getDevice(deviceToken);
      if (!device || device.teacherId !== teacherId) throw new ApiError('기기 등록을 확인해 주세요.', 403);
      if (device.inviteKey) await this.db.delete(device.inviteKey);
      Object.assign(invite, { issuerDeviceHash: await digest(deviceToken), version: device.version });
      device.inviteKey = key;
      await this.db.put('device:' + invite.issuerDeviceHash, device);
    }
    await this.db.put(key, invite);
    return { token, expiresIn: 1800, expiresAt: expires };
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
    const maxAge = remember ? DEVICE_MAX_AGE : 86400;
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
    this.touchVisit(session.teacherId, session.deviceHash);
    if (!account.draftKey) { account.draftKey = randomToken(); await this.db.put('account:' + device.teacherId, account); }
    return { teacherId: session.teacherId, className: session.className, expiresAt: session.expires, draftKey: account.draftKey };
  }
  async run(op, b) {
    if (op === 'invite') {
      return this.createInvite(b.teacherId, b.className);
    }
    if (op === 'device-invite') {
      const session = await this.session(b);
      requirePin(b.currentPin);
      const account = await this.db.get('account:' + session.teacherId);
      await this.throttle('account:' + session.teacherId,
        async () => equal(account.hash, await pinHash(b.currentPin, account.salt, this.env.AUTH_PEPPER)));
      return this.createInvite(session.teacherId, session.className, b.deviceToken);
    }
    if (op === 'status') {
      const device = await this.getDevice(b.deviceToken);
      return { registered: !!device, teacherId: device?.teacherId || null };
    }
    if (op === 'invite-status') {
      const invite = await this.getInvite(b.invite);
      return { teacherId: invite.teacherId, initial: !await this.db.get('account:' + invite.teacherId) };
    }
    if (op === 'register') {
      requirePin(b.pin);
      const inviteKey = 'invite:' + await digest(b.invite || '');
      const invite = await this.getInvite(b.invite);
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
      const device = { teacherId: invite.teacherId, className: invite.className, version: account.version, expires: Date.now() + DEVICE_MAX_AGE * 1000 };
      await this.db.put('device:' + await digest(deviceToken), device);
      await this.db.setAlarm(Date.now() + DAY);
      const session = await this.issueSession(device, deviceToken, b.remember);
      this.startVisit(device.teacherId, await digest(deviceToken), 'register');
      return { ...session, deviceToken, deviceMaxAge: DEVICE_MAX_AGE };
    }
    if (op === 'login') {
      requirePin(b.pin);
      const device = await this.getDevice(b.deviceToken);
      if (!device || device.teacherId !== b.teacherId) throw new ApiError('이 선생님의 기기 등록 링크로 먼저 등록해 주세요.', 403);
      const account = await this.db.get('account:' + device.teacherId);
      await this.throttle('account:' + device.teacherId, async () => !!account && equal(account.hash, await pinHash(b.pin, account.salt, this.env.AUTH_PEPPER)));
      device.version = account.version;
      const session = await this.issueSession(device, b.deviceToken, b.remember);
      // 기존 PIN 인증에 성공한 기기만 서버와 브라우저의 등록 기한을 함께 갱신한다.
      device.expires = Date.now() + DEVICE_MAX_AGE * 1000;
      await this.db.put('device:' + await digest(b.deviceToken), device);
      this.startVisit(device.teacherId, await digest(b.deviceToken), 'login');
      // 사용 기록 정리가 멈추지 않도록 등록 때 시작한 일일 알람을 확인한다.
      if (!await this.db.getAlarm()) await this.db.setAlarm(Date.now() + DAY);
      return { ...session, deviceToken: b.deviceToken, deviceMaxAge: DEVICE_MAX_AGE };
    }
    if (op === 'session') return this.session(b);
    if (op === 'usage-count') {
      if (!USAGE_COUNTS[b.kind]) throw new ApiError('없는 사용 기록 종류입니다.');
      const session = await this.session(b);
      this.touchVisit(session.teacherId, await digest(b.deviceToken), b.kind);
      return { success: true };
    }
    if (op === 'usage-report') return this.usageReport(b);
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
    this.recordUsage(sql => sql.exec('DELETE FROM usage_visits WHERE started_at < ?', now - USAGE_DAYS * DAY));
    await this.db.setAlarm(now + DAY);
  }
}
