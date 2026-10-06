/** 가상 키로 관리자 점검의 권한·정보 노출·실패 분류를 확인한다. */
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.js';
import { diagnoseAi } from '../api/ai-diagnostics.js';
const origin = 'https://daycare.example';
const env = { AUTH_ADMIN_SECRET: 'fake-admin-only', GEMINI_API_KEY: 'fake-ai-private' };
function request(headers = {}, method = 'POST') {
  return new Request(origin + '/api/admin/ai-status', { method, headers: { Origin: origin, 'Content-Type': 'application/json', ...headers } });
}
test('관리자 점검은 비인증·외부 출처·GET을 거부하고 AI를 호출하지 않는다', async () => {
  const previous = global.fetch; let calls = 0;
  global.fetch = async () => { calls++; throw new Error('호출되면 안 됩니다.'); };
  try {
    assert.equal((await worker.fetch(request(), env)).status, 403);
    assert.equal((await worker.fetch(request({ Authorization: 'Bearer fake-admin-only', Origin: 'https://other.example' }), env)).status, 403);
    assert.equal((await worker.fetch(request({}, 'GET'), env)).status, 405);
    assert.equal(calls, 0);
  } finally { global.fetch = previous; }
});
test('점검은 짧은 가상 요청만 보내고 키·상류 원문을 응답에 포함하지 않는다', async () => {
  const previous = global.fetch; const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return options.method === 'GET' ? Response.json({ models: [{ name: 'models/gemini-3.8-flash' }, { name: 'models/gemini-3.6-flash' }] }) :
      Response.json({ error: { status: 'UNAVAILABLE', message: 'private upstream message fake-ai-private' } }, { status: 503 });
  };
  try {
    const response = await worker.fetch(request({ Authorization: 'Bearer fake-admin-only' }), env);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    const body = await response.json();
    assert.match(body.keyFingerprint, /^[a-f0-9]{16}$/);
    assert.equal(body.results[0].primaryAvailable, true);
    assert.equal(body.results[1].httpStatus, 503);
    assert.equal(body.results[2].upstreamStatus, 'UNAVAILABLE');
    assert.equal(calls.length, 3);
    assert.equal(JSON.stringify(body).includes(env.GEMINI_API_KEY), false);
    assert.equal(JSON.stringify(body).includes('private upstream message'), false);
    assert.ok(calls.slice(1).every(c => JSON.parse(c.options.body).contents[0].parts[0].text === 'Connection check only. Return OK.'));
  } finally { global.fetch = previous; }
});
test('전송 오류는 원문을 숨기고 키 누락은 외부 호출 전 거부한다', async () => {
  const previous = global.fetch;
  global.fetch = async () => { throw new Error('private transport details'); };
  try {
    const result = await diagnoseAi(env);
    assert.ok(result.results.every(r => r.failed));
    assert.equal(JSON.stringify(result).includes('private transport details'), false);
    await assert.rejects(() => diagnoseAi({}), { status: 503 });
  } finally { global.fetch = previous; }
});
