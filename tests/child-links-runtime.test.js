/** 실제 Worker에서 동명이인·원문 근거·개인 조회·생성의 연결을 검증한다. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createTestHarness } from 'wrangler';
const teacherId = '11111111-1111-4111-8111-111111111111';
const ids = ['22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444'];
const rt = text => ({ rich_text: [{ text: { content: text } }] });
test('원아별 연결의 실제 실행기 종단', { timeout: 90000 }, async t => {
  const pages = new Map(), blocks = new Map(), prompts = [];
  let loseReply = false, creates = 0;
  const teachers = [{ id: teacherId, properties: { '교사명': { title: [{ text: { content: '가상 교사' } }] }, '담당반': { select: { name: '사랑반' } } } }];
  const children = ids.map((id, i) => ({ id, properties: { '아동명': { title: [{ text: { content: i < 2 ? '김하늘' : '박별' } }] }, '소속 반': { select: { name: '사랑반' } }, '생년월일/연령': rt('만 0세') } }));
  const service = createServer(async (req, res) => {
    let text = ''; for await (const part of req) text += part;
    const input = text ? JSON.parse(text) : {}, path = new URL(req.url, 'http://localhost').pathname;
    let output;
    if (path.includes('/models/')) {
      prompts.push(JSON.stringify(input));
      output = { candidates: [{ content: { parts: [{ text: JSON.stringify({ kidsnote: { content: '실제 메모로 작성' }, observation_summary: '관찰', individual_observations: [
        { child_name: '[아동2]', child_id: ids[2], source_excerpt: '[동명이인] 블록을 잡음.', summary: '블록을 잡음' },
        { child_name: '[아동3]', child_id: ids[0], source_excerpt: '[아동3] 천을 잡음.', summary: '천을 잡음' }
      ] }) }] } }] };
    } else if (path.endsWith('/databases/teachers/query')) output = { results: teachers, has_more: false };
    else if (path.endsWith('/databases/children/query')) output = { results: children.filter(c => c.properties['소속 반'].select.name === input.filter?.select?.equals), has_more: false };
    else if (path.endsWith('/query')) output = { results: [...pages.values()].filter(p => !p.archived && (input.filter?.and || []).every(f => {
      const prop = p.properties[f.property];
      if (f.title) return prop?.title?.some(x => x.text.content.startsWith(f.title.starts_with));
      if (f.select) return prop?.select?.name === f.select.equals;
      if (f.relation) return prop?.relation?.some(x => x.id === f.relation.contains);
      if (f.date?.equals) return prop?.date?.start === f.date.equals;
      if (f.date?.on_or_after) return prop?.date?.start >= f.date.on_or_after;
      if (f.date?.on_or_before) return prop?.date?.start <= f.date.on_or_before;
      return true;
    })), has_more: false };
    else if (path === '/v1/pages' && req.method === 'POST') {
      creates++; const id = crypto.randomUUID(); output = { id, properties: input.properties, parent: input.parent, url: 'https://notion.test/' + id };
      pages.set(id, output); blocks.set(id, input.children || []);
      if (loseReply) { loseReply = false; req.socket.destroy(); return; }
    } else if (path.startsWith('/v1/pages/')) {
      output = pages.get(path.split('/')[3]);
      if (output && req.method === 'PATCH') { output.properties = { ...output.properties, ...input.properties }; if (input.archived !== undefined) output.archived = input.archived; }
    } else if (path.startsWith('/v1/blocks/')) {
      const id = path.split('/')[3];
      if (req.method === 'PATCH') blocks.set(id, [...(blocks.get(id) || []), ...(input.children || [])]);
      output = { results: blocks.get(id) || [], has_more: false };
    }
    res.writeHead(output ? 200 : 404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(output || {}));
  });
  await new Promise(resolve => service.listen(0, '127.0.0.1', resolve));
  const serviceUrl = 'http://127.0.0.1:' + service.address().port;
  const harness = createTestHarness({ workers: [{ configPath: new URL('./wrangler.memo-test.toml', import.meta.url),
    secrets: { AUTH_PEPPER: '가상 연결 검증', AUTH_ADMIN_SECRET: 'child-link-test', GEMINI_API_KEY: '가짜 검증 키' },
    vars: { NOTION_PROXY_URL: serviceUrl, GEMINI_API_BASE: serviceUrl + '/models' }
  }] });
  try {
    const origin = (await harness.listen()).url.origin;
    async function call(path, method = 'GET', body, cookie = '', extra = {}) {
      const response = await harness.fetch(origin + path, { method, headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: cookie, ...extra }, ...(body ? { body: JSON.stringify(body) } : {}) });
      return { status: response.status, data: await response.json(), response };
    }
    const invite = await call('/api/auth/invite', 'POST', { teacherId }, '', { Authorization: 'Bearer child-link-test' });
    const registered = await call('/api/auth/register', 'POST', { invite: invite.data.token, pin: '4826', confirmPin: '4826' });
    const cookie = registered.response.headers.getSetCookie().map(v => v.split(';')[0]).join('; ');
    const date = '2026-10-04', rawMemo = '김하늘 블록을 잡음.\n김하늘 공을 굴림.\n박별 천을 잡음.';
    const memo = await call('/api/memo', 'PUT', { date, rawMemo, baseVersion: 'empty' }, cookie);
    assert.equal(memo.status, 200);
    const payload = { date, childId: ids[1], sourceId: memo.data.pageId, sourceRawMemo: rawMemo, excerpt: '김하늘 공을 굴림.', summary: '공을 굴림', confirmed: true };
    let linked;
    await t.test('동명이인의 두 번째 ID에 해당 발췌만 저장하고 첫 아이에게 연결하지 않는다', async () => {
      linked = await call('/api/logs/link-child', 'POST', payload, cookie); assert.equal(linked.status, 200);
      const detail = await call('/api/history/' + linked.data.pageId, 'GET', undefined, cookie);
      assert.deepEqual(detail.data.childIds, [ids[1]]); assert.equal(detail.data.raw_memo, payload.excerpt);
      assert.equal(detail.data.saved.result.child_link.sourceId, memo.data.pageId);
      assert.equal(detail.data.raw_memo.includes('블록'), false);
      const a = await call('/api/children/' + ids[0] + '/recent-logs', 'GET', undefined, cookie);
      const b = await call('/api/children/' + ids[1] + '/recent-logs', 'GET', undefined, cookie);
      assert.equal(a.data.logs.length, 0); assert.equal(b.data.logs.length, 1);
    });
    await t.test('같은 연결의 연속·동시 재시도는 같은 페이지이며 검수 요약 수정도 유지한다', async () => {
      const before = creates;
      const results = await Promise.all([0, 1].map(() => call('/api/logs/link-child', 'POST', payload, cookie)));
      assert.ok(results.every(r => r.status === 200 && r.data.pageId === linked.data.pageId)); assert.equal(creates, before);
      const edited = await call('/api/logs/link-child', 'POST', { ...payload, summary: '교사가 검수한 공 굴리기' }, cookie);
      assert.equal(edited.data.pageId, linked.data.pageId);
      const detail = await call('/api/history/' + linked.data.pageId, 'GET', undefined, cookie);
      assert.equal(detail.data.saved.result.observation_summary, '교사가 검수한 공 굴리기');
    });
    await t.test('미인증·외부 출처·다른 원아·날짜·원문 변경·근거 조작·확인 누락은 저장하지 않는다', async () => {
      assert.equal((await call('/api/logs/link-child', 'POST', payload)).status, 401);
      assert.equal((await call('/api/logs/link-child', 'POST', payload, cookie, { Origin: 'https://evil.test' })).status, 403);
      for (const [change, status] of [[{ childId: crypto.randomUUID() }, 403], [{ date: '2026-10-03' }, 403], [{ sourceRawMemo: '바뀐 원문' }, 409], [{ excerpt: '없는 관찰' }, 400], [{ confirmed: false }, 400]]) assert.equal((await call('/api/logs/link-child', 'POST', { ...payload, ...change }, cookie)).status, status);
      const normal = await call('/api/logs/save', 'POST', { date, childId: ids[1], pageId: linked.data.pageId, rawMemo: '전체 메모', result: {} }, cookie); assert.equal(normal.status, 409);
    });
    await t.test('개인 생성은 연결한 발췌만 과거 근거로 보내고 다른 아이의 문장을 보내지 않는다', async () => {
      const output = await call('/api/generate', 'POST', { date, childId: ids[1], rawMemo: '오늘 공을 잡음', selectedFormats: ['kidsnote'], evidenceIds: [linked.data.pageId] }, cookie);
      assert.equal(output.status, 200, JSON.stringify(output.data)); assert.equal(output.data.data.citation.sources[0].id, linked.data.pageId);
      const prompt = prompts.at(-1); assert.ok(prompt.includes('공을 굴림')); assert.equal(prompt.includes('천을 잡음.\\n'), false);
      assert.equal(prompt.includes('김하늘'), false);
    });
    await t.test('다중 관계·과거 반 전체 자동 분할은 개인 근거로 거부하고 동명이인 AI 후보는 미확인이다', async () => {
      const page = structuredClone(pages.get(linked.data.pageId)); page.id = crypto.randomUUID(); page.properties['원아'].relation.push({ id: ids[0] }); pages.set(page.id, page); blocks.set(page.id, []);
      assert.equal((await call('/api/generate', 'POST', { date, childId: ids[1], rawMemo: '오늘 관찰', selectedFormats: ['kidsnote'], evidenceIds: [page.id] }, cookie)).status, 403);
      const legacy = structuredClone(page); legacy.id = crypto.randomUUID(); legacy.properties['원아'].relation = [{ id: ids[1] }]; legacy.properties['참조 출처 요약'] = rt('한그루 보육일지 내 김하늘 놀이 팩트 자동 추출'); pages.set(legacy.id, legacy); blocks.set(legacy.id, []);
      assert.equal((await call('/api/generate', 'POST', { date, childId: ids[1], rawMemo: '오늘 관찰', selectedFormats: ['kidsnote'], evidenceIds: [legacy.id] }, cookie)).status, 403);
      const recent = await call('/api/children/' + ids[1] + '/recent-logs', 'GET', undefined, cookie); assert.equal(recent.data.logs.length, 1); assert.equal(recent.data.excludedCount, 2);
      const output = await call('/api/generate', 'POST', { date, childId: 'class-all', rawMemo, selectedFormats: ['kidsnote'], evidenceIds: [] }, cookie);
      assert.equal(output.status, 200, JSON.stringify(output.data)); const rows = output.data.data.individual_observations;
      assert.equal(rows[0].child_id, null); assert.equal(rows[0].source_excerpt, ''); assert.equal(rows[1].child_id, ids[2]);
      assert.equal(rows[1].source_excerpt, '박별 천을 잡음.');
    });
    await t.test('원아 연결 최초 쓰기 응답 유실 뒤에는 실제 반영을 읽고 중복 없이 반환한다', async () => {
      loseReply = true; const next = { ...payload, childId: ids[0], excerpt: '김하늘 블록을 잡음.', summary: '블록을 잡음' };
      const lost = await call('/api/logs/link-child', 'POST', next, cookie); assert.equal(lost.status, 502);
      const count = creates; const retry = await call('/api/logs/link-child', 'POST', next, cookie); assert.equal(retry.status, 200); assert.equal(creates, count);
    });
  } finally { await harness.close(); await new Promise(resolve => service.close(resolve)); }
});
