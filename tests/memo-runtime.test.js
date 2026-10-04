/** 실제 workerd와 두 기기 쿠키로 AI 없이 노션 저장·동시 편집·응답 유실을 검증한다. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createTestHarness } from 'wrangler';

const teacherId = '11111111-1111-4111-8111-111111111111';
const childId = '22222222-2222-4222-8222-222222222222';
const secondTeacher = '55555555-5555-4555-8555-555555555555';
test('원시 메모의 실제 Worker 노션·기기 공유 종단', { timeout: 90000 }, async t => {
  const pages = new Map(); let creates = 0, patches = 0, loseReply = false, failWrite = false, edited = 0;
  const teachers = [{ id: teacherId, properties: { '교사명': { title: [{ plain_text: '가상 교사 A' }] }, '담당반': { select: { name: '사랑반' } } } },
    { id: secondTeacher, properties: { '교사명': { title: [{ plain_text: '가상 교사 B' }] }, '담당반': { select: { name: '소망반' } } } }];
  const children = [{ id: childId, properties: { '아동명': { title: [{ plain_text: '가상 원아' }] }, '소속 반': { select: { name: '사랑반' } } } }];
  const service = createServer(async (req, res) => {
    let body = ''; for await (const part of req) body += part;
    const input = body ? JSON.parse(body) : {}, path = new URL(req.url, 'http://localhost').pathname;
    let output;
    if (path === '/v1/databases/teachers/query') output = { results: teachers, has_more: false };
    else if (path === '/v1/databases/children/query') output = { results: children.filter(c => c.properties['소속 반'].select.name === input.filter?.select?.equals), has_more: false };
    else if (path === '/v1/databases/logs/query') output = { results: [...pages.values()].filter(p => (input.filter?.and || []).every(f => {
      const property = p.properties[f.property];
      if (f.title) return property?.title?.[0].text.content.startsWith(f.title.starts_with);
      if (f.select) return property?.select?.name === f.select.equals;
      if (f.relation) return property?.relation?.some(r => r.id === f.relation.contains);
      if (f.date?.equals) return property?.date?.start === f.date.equals;
      return true;
    })), has_more: false };
    else if (path === '/v1/pages' && req.method === 'POST') {
      if (failWrite) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end('{}'); return; }
      creates++; const id = crypto.randomUUID();
      output = { id, parent: input.parent, properties: input.properties, url: 'https://notion.test/' + id, last_edited_time: String(++edited) };
      pages.set(id, output);
      if (loseReply) { loseReply = false; req.socket.destroy(); return; }
    } else if (path.startsWith('/v1/pages/')) {
      output = pages.get(path.split('/')[3]);
      if (req.method === 'PATCH' && output) { patches++; output.properties = { ...output.properties, ...input.properties }; output.last_edited_time = String(++edited); }
    } else if (path.startsWith('/v1/blocks/')) output = { results: [], has_more: false };
    res.writeHead(output ? 200 : 404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(output || {}));
  });
  await new Promise(resolve => service.listen(0, '127.0.0.1', resolve));
  const harness = createTestHarness({ workers: [{ configPath: new URL('./wrangler.memo-test.toml', import.meta.url),
    secrets: { AUTH_PEPPER: '가상 메모 검증용', AUTH_ADMIN_SECRET: 'memo-test-only' },
    vars: { NOTION_PROXY_URL: 'http://127.0.0.1:' + service.address().port }
  }] });
  try {
    const origin = (await harness.listen()).url.origin;
    async function call(path, method = 'GET', body, cookie = '', extra = {}) {
      const response = await harness.fetch(origin + path, { method, headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: cookie, ...extra }, ...(body ? { body: JSON.stringify(body) } : {}) });
      return { status: response.status, data: await response.json(), response };
    }
    async function register(id = teacherId) {
      const invite = await call('/api/auth/invite', 'POST', { teacherId: id }, '', { Authorization: 'Bearer memo-test-only' });
      const registered = await call('/api/auth/register', 'POST', { invite: invite.data.token, pin: '4826', confirmPin: '4826', remember: true });
      assert.equal(registered.status, 200);
      return registered.response.headers.getSetCookie().map(v => v.split(';')[0]).join('; ');
    }
    const phone = await register(), pc = await register(), other = await register(secondTeacher);
    const date = '2026-10-04', query = '/api/memo?' + new URLSearchParams({ date, childId });
    let saved;
    await t.test('AI 없는 최초 저장·PC 조회와 같은 내용 쓰기 생략', async () => {
      const initial = await call(query, 'GET', undefined, phone); assert.equal(initial.data.version, 'empty');
      saved = await call('/api/memo', 'PUT', { date, childId, rawMemo: '블록을 손으로 잡음', baseVersion: 'empty' }, phone);
      assert.equal(saved.status, 200); assert.equal(saved.data.source, 'notion'); assert.equal(creates, 1);
      const loaded = await call(query, 'GET', undefined, pc); assert.equal(loaded.data.rawMemo, '블록을 손으로 잡음');
      await call('/api/memo', 'PUT', { date, childId, rawMemo: loaded.data.rawMemo, baseVersion: 'empty' }, phone);
      assert.equal(creates, 1); assert.equal(patches, 0);
    });
    await t.test('동시 편집은 한쪽만 저장하고 오래된 버전을 409로 보호한다', async () => {
      const baseVersion = saved.data.version;
      const responses = await Promise.all(['휴대폰 추가 메모', 'PC 추가 메모'].map((rawMemo, i) => call('/api/memo', 'PUT', { date, childId, rawMemo, baseVersion }, i ? pc : phone)));
      assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
      const rejected = responses.find(r => r.status === 409); assert.ok(rejected.data.current.rawMemo);
      assert.equal(creates, 1); assert.equal(patches, 1);
    });
    await t.test('다른 반·미인증·외부 출처·빈 메모·완성본 덮어쓰기를 거부한다', async () => {
      assert.equal((await call(query)).status, 401);
      assert.equal((await call(query, 'GET', undefined, other)).status, 403);
      assert.equal((await call('/api/memo', 'PUT', { date, childId, rawMemo: '위조', baseVersion: 'empty' }, phone, { Origin: 'https://evil.test' })).status, 403);
      assert.equal((await call('/api/memo', 'PUT', { date, childId, rawMemo: '', baseVersion: 'empty' }, phone)).status, 400);
      assert.equal((await call('/api/logs/save', 'POST', { date, childId, pageId: saved.data.pageId, rawMemo: '완성본', result: {} }, phone)).status, 409);
    });
    await t.test('최초 쓰기 응답이 유실되어도 조회 후 같은 행을 반환한다', async () => {
      const nextDate = '2026-10-05'; loseReply = true;
      const lost = await call('/api/memo', 'PUT', { date: nextDate, childId, rawMemo: '가상 메모 응답 유실', baseVersion: 'empty' }, phone);
      assert.equal(lost.status, 502); const count = creates;
      const read = await call('/api/memo?' + new URLSearchParams({ date: nextDate, childId }), 'GET', undefined, pc);
      assert.equal(read.status, 200); assert.equal(read.data.rawMemo, '가상 메모 응답 유실');
      const retry = await call('/api/memo', 'PUT', { date: nextDate, childId, rawMemo: read.data.rawMemo, baseVersion: 'empty' }, phone);
      assert.equal(retry.status, 200); assert.equal(creates, count);
    });
    await t.test('노션의 명확한 거부 뒤 연결을 복구하면 최초 저장을 재시도한다', async () => {
      const body = { date: '2026-10-06', childId, rawMemo: '연결 복구 가상 메모', baseVersion: 'empty' };
      failWrite = true; assert.equal((await call('/api/memo', 'PUT', body, phone)).status, 502);
      failWrite = false; assert.equal((await call('/api/memo', 'PUT', body, pc)).status, 200);
      const history = await call('/api/history', 'GET', undefined, phone);
      assert.ok(history.data.data.some(p => p.memoOnly && p.memo === body.rawMemo));
    });
  } finally { await harness.close(); await new Promise(resolve => service.close(resolve)); }
});
