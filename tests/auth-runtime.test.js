/** 가상 계정만으로 실제 workerd의 인증 예외·쿠키·세션을 검증한다. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createTestHarness } from 'wrangler';
import { authCookies } from '../api/auth.js';

const teacherId = '11111111-1111-4111-8111-111111111111';
const fakePin = '4826';
test('실제 Worker 실행기의 PIN 오류 안내와 재시도·등록 쿠키·세션', { timeout: 90000 }, async t => {
  const notion = createServer((req, res) => {
    req.resume();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ results: [{ id: teacherId, properties: {
      '교사명': { title: [{ plain_text: '가상 연구 교사' }] }, '담당반': { select: { name: '연구반' } }
    } }], has_more: false }));
  });
  await new Promise(resolve => notion.listen(0, '127.0.0.1', resolve));
  const server = createTestHarness({ workers: [{
    configPath: new URL('./wrangler.auth-test.toml', import.meta.url),
    secrets: { AUTH_PEPPER: '가상 실행기 전용 비밀값', AUTH_ADMIN_SECRET: 'runtime-test-admin-only' },
    vars: { NOTION_PROXY_URL: `http://127.0.0.1:${notion.address().port}` }
  }] });
  try {
    const address = await server.listen();
    const origin = address.url.origin;
    async function call(path, body, cookie = '', admin = false) {
      return server.fetch(origin + path, { method: body ? 'POST' : 'GET', headers: {
        Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}),
        ...(admin ? { Authorization: 'Bearer runtime-test-admin-only' } : {})
      }, ...(body ? { body: JSON.stringify(body) } : {}) });
    }
    async function invite() {
      const response = await call('/api/auth/invite', { teacherId }, '', true);
      assert.equal(response.status, 200);
      return (await response.json()).token;
    }
    function cookieOf(response) {
      const values = response.headers.getSetCookie();
      assert.equal(values.length, 2, '기기·세션 쿠키를 모두 발급');
      values.forEach(value => assert.match(value, /HttpOnly; SameSite=Strict/));
      return values.map(value => value.split(';')[0]).join('; ');
    }
    const bindings = await server.getWorker().getEnv();
    const control = bindings.AUTH_STORE.get(bindings.AUTH_STORE.idFromName('daycare-auth-v1'));
    async function device(cookie, options = {}) {
      const deviceToken = cookie.split('; ').find(v => v.startsWith('daycare_device='))?.split('=')[1];
      const response = await control.fetch('http://auth.internal/test-device', { method: 'POST', body: JSON.stringify({ deviceToken, ...options }) });
      assert.equal(response.status, 200); return response.json();
    }
    await t.test('없는 등록 링크는 서버 재시작 없이 403으로 안내한다', async () => {
      const response = await call('/api/auth/register', { invite: '가상 만료 링크', pin: fakePin });
      assert.equal(response.status, 403);
      assert.match((await response.json()).error, /만료되었거나 사용/);
    });
    let cookie;
    let firstDeviceCookie;
    await t.test('첫 등록은 쿠키를 발급하고 후속 세션이 연구반을 반환한다', async () => {
      const token = await invite();
      const mismatch = await call('/api/auth/register', { invite: token, pin: fakePin, confirmPin: '0009' });
      assert.equal(mismatch.status, 400); assert.match((await mismatch.json()).error, /한 번 더/);
      const response = await call('/api/auth/register', { invite: token, pin: fakePin, confirmPin: fakePin, remember: true });
      assert.equal(response.status, 200);
      cookie = cookieOf(response);
      firstDeviceCookie = cookie;
      const session = await call('/api/session', undefined, cookie);
      assert.equal(session.status, 200);
      const data = await session.json();
      assert.equal(data.profile.id, teacherId); assert.equal(data.profile.className, '연구반');
      assert.equal(data.draftKey.length, 64);
    });
    await t.test('새 기기에서 틀린 PIN을 안내한 뒤 같은 링크로 재시도한다', async () => {
      const token = await invite();
      const failed = await call('/api/auth/register', { invite: token, pin: '0009' });
      assert.equal(failed.status, 401); assert.match((await failed.json()).error, /PIN이 맞지/);
      assert.equal((await call('/api/auth/invite-status', { invite: token })).status, 200);
      const success = await call('/api/auth/register', { invite: token, pin: fakePin, remember: true });
      assert.equal(success.status, 200); cookie = cookieOf(success);
      assert.equal((await call('/api/auth/invite-status', { invite: token })).status, 403);
    });
    await t.test('같은 교사의 여러 기기는 등록을 유지하고 만료를 각각 연장한다', async () => {
      const otherExpiry = Date.now() + 60000;
      await device(cookie, { expires: otherExpiry });
      assert.equal((await call('/api/session', undefined, firstDeviceCookie)).status, 200);
      const renewed = await call('/api/auth/login', { teacherId, pin: fakePin, remember: true }, firstDeviceCookie);
      assert.equal(renewed.status, 200); firstDeviceCookie = cookieOf(renewed);
      assert.ok((await device(firstDeviceCookie)).expires > Date.now() + 29 * 86400000);
      assert.equal((await device(cookie)).expires, otherExpiry);
      assert.equal((await call('/api/session', undefined, cookie)).status, 200);
    });
    await t.test('재로그인 실패·다른 교사 거부 후에도 올바른 PIN으로 진입한다', async () => {
      const failed = await call('/api/auth/login', { teacherId, pin: '0009' }, cookie);
      assert.equal(failed.status, 401); assert.match((await failed.json()).error, /PIN이 맞지/);
      assert.equal((await call('/api/auth/login', { teacherId: '다른 가상 교사', pin: fakePin }, cookie)).status, 403);
      const success = await call('/api/auth/login', { teacherId, pin: fakePin, remember: true }, cookie);
      assert.equal(success.status, 200);
      cookie = cookieOf(success);
      const sessionCookie = success.headers.getSetCookie()[0].split(';')[0];
      const deviceCookie = cookie.split('; ').find(v => v.startsWith('daycare_device='));
      assert.equal((await call('/api/session', undefined, `${deviceCookie}; ${sessionCookie}`)).status, 200);
      assert.equal((await call('/api/session')).status, 401);
    });
    await t.test('조회·틀린 PIN·다른 교사 선택은 기기 만료를 연장하지 않는다', async () => {
      const expires = Date.now() + 60000;
      await device(cookie, { expires });
      assert.equal((await call('/api/auth/profiles', undefined, cookie)).status, 200);
      assert.equal((await call('/api/session', undefined, cookie)).status, 200);
      const failed = await call('/api/auth/login', { teacherId, pin: '0009', remember: true }, cookie);
      assert.equal(failed.status, 401); assert.equal(failed.headers.getSetCookie().length, 0);
      assert.equal((await call('/api/auth/login', { teacherId: '다른 가상 교사', pin: fakePin }, cookie)).status, 403);
      assert.equal((await device(cookie)).expires, expires);
    });
    await t.test('PIN 성공은 서버·쿠키를 30일 연장하고 원래 만료일 이후에도 진입한다', async () => {
      const originalExpiry = Date.now() + 3000;
      await device(cookie, { expires: originalExpiry });
      const before = Date.now();
      const success = await call('/api/auth/login', { teacherId, pin: fakePin, remember: true }, cookie);
      assert.equal(success.status, 200);
      const renewedCookie = cookieOf(success);
      assert.equal(renewedCookie.split('; ').find(v => v.startsWith('daycare_device=')), cookie.split('; ').find(v => v.startsWith('daycare_device=')));
      success.headers.getSetCookie().forEach(value => assert.match(value, /Max-Age=2592000/));
      assert.equal(JSON.stringify(await success.json()).includes('deviceToken'), false, '인증 토큰은 JSON으로 배포하지 않는다');
      const saved = await device(renewedCookie);
      assert.ok(saved.expires >= before + 30 * 86400000 && saved.expires <= Date.now() + 30 * 86400000);
      cookie = renewedCookie;
      await new Promise(resolve => setTimeout(resolve, Math.max(0, originalExpiry - Date.now() + 20)));
      assert.equal((await call('/api/auth/login', { teacherId, pin: fakePin, remember: true }, cookie)).status, 200);
    });
    await t.test('로그인 유지 옵션을 끈 경우에도 기기는 30일·세션은 1일로 갱신한다', async () => {
      const success = await call('/api/auth/login', { teacherId, pin: fakePin, remember: false }, cookie);
      assert.equal(success.status, 200); cookie = cookieOf(success);
      const values = success.headers.getSetCookie();
      assert.match(values.find(v => v.startsWith('daycare_device=')), /Max-Age=2592000/);
      assert.match(values.find(v => v.startsWith('daycare_session=')), /Max-Age=86400/);
    });
    await t.test('만료되거나 해제한 기기는 올바른 PIN이라도 새 등록 링크를 요구한다', async () => {
      await device(cookie, { expires: Date.now() - 1 });
      const failed = await call('/api/auth/login', { teacherId, pin: fakePin }, cookie);
      assert.equal(failed.status, 403); assert.equal(failed.headers.getSetCookie().length, 0);
      assert.ok((await device(cookie)).expires < Date.now());
      const success = await call('/api/auth/register', { invite: await invite(), pin: fakePin, remember: true });
      assert.equal(success.status, 200); cookie = cookieOf(success);
      assert.equal((await call('/api/auth/logout', { forget: true }, cookie)).status, 200);
      assert.equal((await call('/api/auth/login', { teacherId, pin: fakePin }, cookie)).status, 403);
      assert.equal(await device(cookie), null);
      assert.equal((await call('/api/session', undefined, firstDeviceCookie)).status, 200, '다른 기기의 등록·세션은 유지한다');
      const fresh = await call('/api/auth/register', { invite: await invite(), pin: fakePin, remember: true });
      assert.equal(fresh.status, 200); cookie = cookieOf(fresh);
    });
    await t.test('잘못된 PIN 5회 이후에는 실제 실행기도 429로 제한한다', async () => {
      const originalExpiry = (await device(cookie)).expires;
      for (let i = 0; i < 5; i++) assert.equal((await call('/api/auth/login', { teacherId, pin: '0009' }, cookie)).status, 401);
      const locked = await call('/api/auth/login', { teacherId, pin: fakePin }, cookie);
      assert.equal(locked.status, 429); assert.match((await locked.json()).error, /15분/);
      assert.equal(locked.headers.getSetCookie().length, 0);
      assert.equal((await device(cookie)).expires, originalExpiry);
    });
  } finally {
    await server.close();
    await new Promise(resolve => notion.close(resolve));
  }
});

test('HTTPS 기기 쿠키의 연장에도 HttpOnly·SameSite·Secure 보호를 유지한다', () => {
  const values = authCookies(new Request('https://daycare.test/api/auth/login'), {
    daycare_device: { token: '가상토큰', maxAge: 2592000 }
  });
  assert.match(values[0], /HttpOnly; SameSite=Strict; Secure; Max-Age=2592000/);
});
