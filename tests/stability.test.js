import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { generateDaycareLog, validateFormats } from '../api/gemini.js';
import { callNotionApi } from '../api/notion.js';
import { ApiError } from '../api/auth.js';

test('선택 서식이 없거나 제목만 있으면 완료로 처리하지 않는다', () => {
  assert.throws(() => validateFormats({ kidsnote: { title: '제목' } }, ['kidsnote']), { status: 502 });
  assert.throws(() => validateFormats({ kidsnote: { content: '관찰 사실' } }, ['kidsnote', 'observation']), { status: 502 });
  assert.throws(() => validateFormats({ kidsnote: '잘못된 형태' }, ['kidsnote']), { status: 502 });
  validateFormats({ kidsnote: { content: '관찰 사실' }, monthly_observation: { play_obs: { behavior: '블록을 잡음' } } }, ['kidsnote', 'observation']);
});

test('AI 503은 대체 호출로 복구하고 402는 결제 안내를 반환하며 재호출하지 않는다', async () => {
  const original = global.fetch; let calls = 0;
  try {
    global.fetch = async () => ++calls === 1 ? Response.json({}, { status: 503, headers: { 'Retry-After': '0.001' } }) :
      Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ kidsnote: { content: '가상 관찰 문장' } }) }] } }] });
    const output = await generateDaycareLog({ apiKey: '가상 키', selectedFormats: ['kidsnote'], rawMemo: '가상 메모', date: '2026-10-03' });
    assert.equal(calls, 2); assert.equal(output.meta.model_used, 'gemini-3.6-flash');
    calls = 0; global.fetch = async () => { calls++; return Response.json({}, { status: 402 }); };
    await assert.rejects(() => generateDaycareLog({ apiKey: '가상 키', selectedFormats: ['kidsnote'] }), error => error instanceof ApiError && error.status === 402 && /선불 잔액/.test(error.message));
    assert.equal(calls, 1);
  } finally { global.fetch = original; }
});

test('노션 제한은 Retry-After 후 재시도하며 쓰기 503은 중복 재전송하지 않는다', async () => {
  const original = global.fetch; let calls = 0;
  const env = { NOTION_PROXY_URL: 'https://notion.test' };
  try {
    global.fetch = async () => ++calls === 1 ? Response.json({ code: 'rate_limited' }, { status: 429, headers: { 'Retry-After': '0' } }) : Response.json({ id: '가상 페이지' });
    assert.equal((await callNotionApi(env, '/pages', 'POST', { properties: {} })).id, '가상 페이지'); assert.equal(calls, 2);
    calls = 0; global.fetch = async () => { calls++; return Response.json({}, { status: 503 }); };
    await assert.rejects(() => callNotionApi(env, '/pages', 'POST', {}), { status: 502 }); assert.equal(calls, 1);
  } finally { global.fetch = original; }
});

test('일부 서식이 빠진 응답은 대체 모델에서 다시 생성하여 모두 갖춘 뒤 반환한다', async () => {
  const original = global.fetch; let calls = 0;
  try {
    global.fetch = async () => {
      calls++;
      const data = { kidsnote: { content: '가상 관찰 문장' }, ...(calls > 1 ? { class_daily_report: { reflection: '가상 성찰 문장' } } : {}) };
      return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(data) }] } }] });
    };
    const result = await generateDaycareLog({ apiKey: '가상 키', selectedFormats: ['kidsnote', 'class_daily_report'] });
    assert.equal(calls, 2); assert.equal(result.data.class_daily_report.reflection, '가상 성찰 문장');
  } finally { global.fetch = original; }
});

function element() {
  const classes = new Set();
  return { value: '', textContent: '', style: {}, dataset: {}, children: [], checked: false, disabled: false,
    classList: { toggle(key, on) { if (on) classes.add(key); else classes.delete(key); } },
    append(...nodes) { this.children.push(...nodes); }, appendChild(node) { this.children.push(node); },
    replaceChildren(...nodes) { this.children = nodes; }, querySelectorAll() { return []; }, focus() {} };
}
const authSource = await readFile(new URL('../public/js/auth-security.js', import.meta.url), 'utf8');
async function authFixture({ expired = false, session = false } = {}) {
  const nodes = new Map(); for (const id of ['authTeacherSelector', 'authGateModal', 'pinErrorMsg', 'rawMemoInput', 'generateBtn', 'resultsSection', 'authRegistrationHint']) nodes.set(id, element());
  const historyCalls = []; const profile = { id: 'teacher-a', key: 'wife', className: '검증반', name: '검증교사' };
  const window = { state: {}, addEventListener() {} };
  const context = vm.createContext({ window, document: { body: { dataset: {} }, getElementById: id => nodes.get(id), createElement: element,
    querySelectorAll() { return []; }, addEventListener() {} }, location: { hash: '#register=가상토큰', pathname: '/', search: '' },
    history: { replaceState(...args) { historyCalls.push(args); } }, URLSearchParams, HTMLInputElement: class {},
    localStorage: { getItem() { return null; }, setItem() {} }, setInterval() { return 1; }, clearInterval() {}, console,
    fetch: async path => path === '/api/auth/profiles' ? Response.json({ profiles: [profile] }) :
      path === '/api/auth/invite-status' ? expired ? Response.json({ error: '만료' }, { status: 403 }) : Response.json({ teacherId: profile.id, initial: false }) :
      path === '/api/session' ? session ? Response.json({ profile, expiresAt: Date.now() + 1000 }) : Response.json({ error: '인증 필요' }, { status: 401 }) : Response.json({ success: true }) });
  vm.runInContext(authSource, context); await window.DaycareAuth.initAuthGate(); return { nodes, historyCalls, window };
}
test('유효한 등록 링크는 PIN 성공 전 보존되고 교사 선택 스타일 구조를 유지한다', async () => {
  const fixture = await authFixture(); assert.equal(fixture.historyCalls.length, 0);
  const button = fixture.nodes.get('authTeacherSelector').children[0];
  assert.equal(button.children[0].className, 'auth-chip-icon'); assert.equal(button.children[1].children[1].textContent, '검증반');
});
test('만료된 링크도 선택 화면을 초기화하고 이미 등록된 정상 세션을 복구한다', async () => {
  const fixture = await authFixture({ expired: true, session: true });
  assert.equal(fixture.nodes.get('authTeacherSelector').children.length, 1); assert.equal(fixture.historyCalls.length, 1);
  assert.equal(fixture.window.state.authenticated, true); assert.equal(fixture.nodes.get('authGateModal').style.display, 'none');
});

test('검수 누락·저장 실패를 지속 표시하고 연속 저장을 한 요청으로 제한한다', async () => {
  const nodes = new Map(); for (const id of ['rawMemoInput', 'kidsnoteContent', 'reviewConfirmed', 'notionSaveStatus', 'generateBtn']) nodes.set(id, element());
  nodes.get('rawMemoInput').value = '가상 원시 메모'; nodes.get('kidsnoteContent').value = '교사가 검수한 문장';
  const state = { authenticated: true, teacherId: 'teacher-a', selectedDate: '2026-10-03', selectedChild: { id: 'class-all' }, lastResult: { kidsnote: { content: '초안' } } };
  const window = { state, addEventListener() {} }; let requests = 0, release;
  const wait = new Promise(resolve => { release = resolve; });
  const context = vm.createContext({ window, document: { getElementById: id => nodes.get(id), querySelectorAll: () => [nodes.get('generateBtn')], addEventListener() {} },
    structuredClone, console, localStorage: { removeItem() {} }, fetch: async () => { requests++; await wait; return Response.json({ error: '가상 저장 오류' }, { status: 502 }); } });
  vm.runInContext(await readFile(new URL('../public/js/records-flow.js', import.meta.url), 'utf8'), context);
  const options = { extractCleanObsSummary: () => '검수 요약', checkDuplicateAndSave: async (_date, _name, callback) => callback({ overwrite: false }) };
  await window.DaycareRecords.saveNotion(options); assert.match(nodes.get('notionSaveStatus').textContent, /검수 확인/); assert.equal(requests, 0);
  nodes.get('reviewConfirmed').checked = true; const first = window.DaycareRecords.saveNotion(options); const second = window.DaycareRecords.saveNotion(options);
  await second; release(); await first; assert.equal(requests, 1); assert.equal(state.savingNotion, false);
  assert.match(nodes.get('notionSaveStatus').textContent, /가상 저장 오류/); assert.equal(state.lastResult.kidsnote.content, '교사가 검수한 문장');
  assert.equal(nodes.get('generateBtn').disabled, false);
});
