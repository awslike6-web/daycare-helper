import test from 'node:test';
import assert from 'node:assert/strict';
import { AuthStore } from '../api/auth.js';
import worker from '../worker.js';
import { getRecentChildLogs, saveDailyLogToNotion, getLogDetail } from '../api/notion.js';
import { guardDaycareProxy } from '../api/notion-proxy-guard.js';

const teacherId = '11111111-1111-4111-8111-111111111111';
const childId = '22222222-2222-4222-8222-222222222222';
const dbId = '3e0a2711-5b68-8122-9eea-dd49bf8a625c';
const text = value => ({ rich_text: [{ plain_text: value }] });
const title = value => ({ title: [{ plain_text: value }] });
function store() {
  const map = new Map();
  const state = { storage: {
    async get(k) { return structuredClone(map.get(k)); }, async put(k, v) { map.set(k, structuredClone(v)); },
    async delete(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) map.delete(key); },
    async list({ prefix }) { return new Map([...map].filter(([k]) => k.startsWith(prefix))); }, async setAlarm() {}
  }, async blockConcurrencyWhile(fn) { return fn(); } };
  return new AuthStore(state, { AUTH_PEPPER: '테스트 전용 서버 비밀값' });
}
async function register(auth) {
  const invitation = await auth.run('invite', { teacherId, className: '사랑반' });
  return auth.run('register', { invite: invitation.token, pin: '4826', confirmPin: '4826', remember: true });
}
test('기기 등록은 일회성이며 등록 없는 PIN·틀린 교사·변조 토큰을 거부한다', async () => {
  const auth = store(); const invite = await auth.run('invite', { teacherId, className: '사랑반' });
  const tokens = await auth.run('register', { invite: invite.token, pin: '4826', confirmPin: '4826', remember: true });
  await assert.rejects(() => auth.run('register', { invite: invite.token, pin: '4826' }), { status: 403 });
  await assert.rejects(() => auth.run('login', { pin: '4826', teacherId }), { status: 403 });
  await assert.rejects(() => auth.run('login', { pin: '4826', teacherId: '다른교사', deviceToken: tokens.deviceToken }), { status: 403 });
  const session = await auth.run('session', tokens); assert.equal(session.className, '사랑반'); assert.equal(session.draftKey.length, 64);
  await assert.rejects(() => auth.run('session', { ...tokens, sessionToken: '변조' }), { status: 401 });
});
test('PIN 5회 실패는 서버에서 잠기고 PIN 변경·로그아웃은 기존 세션을 폐기한다', async () => {
  const auth = store(); const tokens = await register(auth);
  for (let i = 0; i < 5; i++) await assert.rejects(() => auth.run('login', { teacherId, deviceToken: tokens.deviceToken, pin: '1110' }), { status: 401 });
  await assert.rejects(() => auth.run('login', { teacherId, deviceToken: tokens.deviceToken, pin: '4826' }), { status: 429 });
  const second = store(); const valid = await register(second);
  const originalKey = (await second.run('session', valid)).draftKey;
  await second.run('change-pin', { ...valid, currentPin: '4826', pin: '5738', confirmPin: '5738' });
  await assert.rejects(() => second.run('session', valid), { status: 401 });
  const fresh = await second.run('login', { teacherId, deviceToken: valid.deviceToken, pin: '5738', remember: true });
  assert.equal((await second.run('session', { ...fresh, deviceToken: valid.deviceToken })).draftKey, originalKey);
  await second.run('logout', { ...fresh, deviceToken: valid.deviceToken, forget: true });
  await assert.rejects(() => second.run('session', { ...fresh, deviceToken: valid.deviceToken }), { status: 401 });
});
function notionFixture() {
  const teacher = { id: teacherId, properties: { '교사명': title('테스트 교사'), '담당반': { select: { name: '사랑반' } }, '평소 알림장 예시문': text('테스트아동이 블록 놀이를 했답니다.') } };
  const child = { id: childId, properties: { '아동명': title('테스트아동'), '소속 반': { select: { name: '사랑반' } }, '생년월일/연령': text('만 0세'), '성향 및 특이사항': text('테스트아동의 놀이 성향') } };
  const log = { id: '33333333-3333-4333-8333-333333333333', parent: { database_id: dbId }, url: 'https://www.notion.so/33333333333343338333333333333333', properties: {
    '작성일자': { date: { start: '2026-10-01' } }, '학급': { select: { name: '사랑반' } }, '원아': { relation: [{ id: childId }] },
    '관찰 요약': { rich_text: [{ plain_text: '첫 요약 ' }, { plain_text: '뒤 요약' }] }, '원시 메모/키워드': text('테스트아동 블록을 손으로 잡음'), '관찰일지 최종본': text('블록을 잡음') } };
  const requests = []; let saved;
  return { requests, get saved() { return saved; }, teacher, child, log, async fetch(url, init = {}) {
    if (url instanceof Request) { init = { method: url.method, headers: Object.fromEntries(url.headers), body: ['GET', 'HEAD'].includes(url.method) ? null : await url.text() }; url = url.url; }
    const input = init.body ? JSON.parse(init.body) : null; requests.push({ url: String(url), input, headers: init.headers });
    if (String(url).includes('generativelanguage')) return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ kidsnote: { content: '[아동1]가 블록을 잡았어요.' }, observation_summary: '블록을 잡음', individual_observations: [] }) }] } }] });
    if (String(url).endsWith('/databases/teachers/query')) return Response.json({ results: [teacher], has_more: false });
    if (String(url).endsWith('/databases/children/query')) return Response.json({ results: [child], has_more: false });
    if (String(url).includes('/databases/' + dbId + '/query')) return Response.json({ results: [log], has_more: false });
    if (String(url).endsWith('/pages') && init.method === 'POST') { saved = input; return Response.json({ id: log.id, url: log.url }); }
    if (String(url).includes('/pages/')) return Response.json(log);
    if (String(url).includes('/blocks/')) return Response.json({ results: saved?.children || [], has_more: false });
    throw new Error('예상하지 않은 경로: ' + url);
  } };
}
function envFor(auth) {
  return { AUTH_PEPPER: '테스트', AUTH_STORE: { idFromName() { return 'test'; }, get() { return { fetch: request => auth.fetch(typeof request === 'string' ? new Request(request, arguments[1]) : request) }; } },
    NOTION_PROXY_URL: 'https://notion.test', NOTION_TEACHER_DB_ID: 'teachers', NOTION_CHILD_DB_ID: 'children', NOTION_DAILY_LOG_DB_ID: dbId, GEMINI_API_KEY: '가짜 AI 키' };
}
test('노션 프록시만 있는 환경에서도 관찰 요약과 원시 메모를 실제 기록으로 반환한다', async () => {
  const fixture = notionFixture(); const previous = global.fetch; global.fetch = fixture.fetch;
  try {
    const logs = await getRecentChildLogs(childId, '테스트아동', envFor(store()), '사랑반');
    assert.equal(logs.source, 'notion'); assert.equal(logs.logs[0].summary, '첫 요약 뒤 요약'); assert.equal(logs.logs[0].raw_memo, '테스트아동 블록을 손으로 잡음');
  } finally { global.fetch = previous; }
});
test('검수한 전체 서식·원시 메모·교사 관계를 저장하고 완전히 복원한다', async () => {
  const fixture = notionFixture(); const previous = global.fetch; global.fetch = fixture.fetch;
  const result = { observation_summary: '블록을 잡음', kidsnote: { content: '교사가 고친 알림장' }, hangroo_eval: { development_summary: '검수한 발달평가' }, parent_counseling: { counseling_opinion: '검수한 상담 준비 초안' }, citation: { sources: [{ id: fixture.log.id }] } };
  try {
    await saveDailyLogToNotion({ date: '2026-10-02', childId, childName: '테스트아동', childClass: '사랑반', teacherId, teacherName: '테스트 교사', rawMemo: '실제 원시 메모', result }, envFor(store()));
    assert.equal(fixture.saved.properties['작성교사'].relation[0].id, teacherId);
    assert.equal(fixture.saved.properties['원시 메모/키워드'].rich_text[0].text.content, '실제 원시 메모');
    const restored = await getLogDetail(envFor(store()), fixture.log.id, '사랑반'); assert.deepEqual(restored.parsedData, result);
    await assert.rejects(() => getLogDetail(envFor(store()), fixture.log.id, '소망반'), { status: 403 });
  } finally { global.fetch = previous; }
});
test('공용 프록시는 보육 DB·하위 페이지·검색을 막고 서버 전용 요청은 캐시 없이 전달한다', async () => {
  const mock = async () => Response.json({ parent: { database_id: dbId } });
  const resolver = () => 'Bearer 테스트토큰';
  for (const path of ['/v1/databases/' + dbId + '/query', '/v1/pages/' + childId, '/v1/search']) {
    const result = await guardDaycareProxy(new Request('https://proxy.test' + path), {}, mock, resolver); assert.equal(result.status, 403);
  }
  const result = await guardDaycareProxy(new Request('https://proxy.test/v1/pages/' + childId, { headers: { 'X-Daycare-Service-Key': 'test-service-secret' } }), { DAYCARE_SERVICE_KEY: 'test-service-secret' }, mock, resolver);
  assert.equal(result.status, 200); assert.equal(result.headers.get('Cache-Control'), 'no-store');
  assert.equal(await guardDaycareProxy(new Request('https://proxy.test/v1/databases/374a27115b688042bb61e6a102242e12/query'), {}, mock, resolver), null);
});
test('인증 없는 API·위조한 Access 헤더·외부 사이트 변경 요청·브라우저 키 배포를 거부한다', async () => {
  const auth = store(); const env = envFor(auth);
  env.AUTH_STORE.get = () => ({ fetch: (url, init) => auth.fetch(new Request(url, init)) });
  const response = await worker.fetch(new Request('https://daycare.test/api/children', { headers: { 'Cf-Access-Authenticated-User-Email': 'forged@example.test' } }), env); assert.equal(response.status, 401);
  const mutation = await worker.fetch(new Request('https://daycare.test/api/children', { method: 'POST', headers: { Origin: 'https://evil.test', 'Content-Type': 'application/json' }, body: '{}' }), env); assert.equal(mutation.status, 403);
  const key = await worker.fetch(new Request('https://daycare.test/api/gemini-key'), env); assert.equal(key.status, 410); assert.equal((await key.text()).includes(env.GEMINI_API_KEY), false);
});
test('인증된 생성은 실제 선택 기록만 쓰고 모든 등록 원아 이름을 AI 전송 전에 가명화한다', async () => {
  const auth = store(); const tokens = await register(auth); const env = envFor(auth);
  env.AUTH_STORE.get = () => ({ fetch: (url, init) => auth.fetch(new Request(url, init)) });
  const fixture = notionFixture(); const previous = global.fetch; global.fetch = fixture.fetch;
  const headers = { Cookie: `daycare_device=${tokens.deviceToken}; daycare_session=${tokens.sessionToken}`, Origin: 'https://daycare.test', 'Content-Type': 'application/json' };
  try {
    const foreign = await worker.fetch(new Request('https://daycare.test/api/children/44444444-4444-4444-8444-444444444444', { method: 'PATCH', headers, body: '{}' }), env); assert.equal(foreign.status, 403);
    const response = await worker.fetch(new Request('https://daycare.test/api/generate', { method: 'POST', headers, body: JSON.stringify({ childId, date: '2026-10-02', rawMemo: '테스트아동 블록 잡음', selectedFormats: ['kidsnote'], evidenceIds: [fixture.log.id], className: '소망반' }) }), env);
    assert.equal(response.status, 200); const output = await response.json(); assert.equal(output.data.citation.sources[0].id, fixture.log.id);
    assert.equal(output.data.kidsnote.content, '테스트아동가 블록을 잡았어요.');
    const sent = fixture.requests.find(r => r.url.includes('generativelanguage')); assert.equal(JSON.stringify(sent.input).includes('테스트아동'), false);
    assert.equal(JSON.stringify(sent.input).includes('첫 요약 뒤 요약'), true); assert.equal(sent.url.includes('key='), false);
    const wrongDate = await worker.fetch(new Request('https://daycare.test/api/logs/save', { method: 'POST', headers, body: JSON.stringify({ childId, date: '2026-10-03', result: output.data }) }), env);
    assert.equal(wrongDate.status, 409);
  } finally { global.fetch = previous; }
});
