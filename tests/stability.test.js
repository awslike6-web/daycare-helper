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
    replaceChildren(...nodes) { this.children = nodes; }, querySelectorAll() { return []; }, focus() {}, select() {} };
}
const authSource = await readFile(new URL('../public/js/auth-security.js', import.meta.url), 'utf8');
async function authFixture({ expired = false, session = false, registration = true, inviteReply, copyFails = false } = {}) {
  const nodes = new Map(); for (const id of ['authTeacherSelector', 'authGateModal', 'pinErrorMsg', 'rawMemoInput', 'generateBtn', 'resultsSection', 'authRegistrationHint']) nodes.set(id, element());
  const historyCalls = []; const profile = { id: 'teacher-a', key: 'wife', className: '검증반', name: '검증교사' };
  for (const id of ['openDeviceInviteBtn', 'deviceInviteBox', 'deviceInviteForm', 'deviceInvitePinInput', 'deviceInviteUrl',
    'deviceInviteResult', 'deviceInviteStatus', 'createDeviceInviteBtn', 'closeDeviceInviteBtn', 'copyDeviceInviteBtn', 'shareDeviceInviteBtn']) nodes.set(id, element());
  const copies = [], storage = [], inviteRequests = [], timers = [];
  const window = { state: {}, addEventListener() {} };
  const context = vm.createContext({ window, document: { body: { dataset: {} }, getElementById: id => nodes.get(id), createElement: element,
    querySelectorAll() { return []; }, addEventListener() {} }, location: { hash: '#register=가상토큰', pathname: '/', search: '' },
    history: { replaceState(...args) { historyCalls.push(args); } }, URL, URLSearchParams, HTMLInputElement: class {},
    navigator: { clipboard: { async writeText(value) { if (copyFails) throw new Error('복사 권한 없음'); copies.push(value); } } },
    localStorage: { getItem() { return null; }, setItem(...args) { storage.push(args); } }, setInterval(fn) { timers.push(fn); return timers.length; }, clearInterval() {}, setTimeout, clearTimeout, AbortController, DOMException, console,
    fetch: async (path, options) => path === '/api/auth/device-invite' ? (inviteRequests.push(JSON.parse(options.body)), inviteReply()) :
      path === '/api/auth/profiles' ? Response.json({ profiles: [profile] }) :
      path === '/api/auth/invite-status' ? expired ? Response.json({ error: '만료' }, { status: 403 }) : Response.json({ teacherId: profile.id, initial: false }) :
      path === '/api/session' ? session ? Response.json({ profile, expiresAt: Date.now() + 1000 }) : Response.json({ error: '인증 필요' }, { status: 401 }) : Response.json({ success: true }) });
  context.location.origin = 'https://daycare.test';
  if (!registration) context.location.hash = '';
  vm.runInContext(await readFile(new URL('../public/js/records-flow.js', import.meta.url), 'utf8'), context);
  vm.runInContext(authSource, context); await window.DaycareAuth.initAuthGate(); return { nodes, historyCalls, window, copies, storage, inviteRequests, timers, context };
}

test('직접 발급 화면은 PIN 실패 후 재시도·링크 복사를 제공하고 PIN·링크를 저장하지 않는다', async () => {
  const link = 'https://daycare.test/#register=' + 'a'.repeat(64); let attempts = 0;
  const fixture = await authFixture({ session: true, registration: false, inviteReply: () => ++attempts === 1 ?
    Response.json({ error: 'PIN이 맞지 않습니다.' }, { status: 401 }) : Response.json({ url: link, expiresAt: Date.now() + 1800000 }) });
  const { nodes, window } = fixture;
  nodes.get('openDeviceInviteBtn').onclick(); nodes.get('deviceInvitePinInput').value = '0009';
  await window.DaycareAuth.createDeviceInvite();
  assert.match(nodes.get('deviceInviteStatus').textContent, /PIN이 맞지/);
  assert.equal(nodes.get('deviceInvitePinInput').value, ''); assert.equal(nodes.get('createDeviceInviteBtn').disabled, false);
  nodes.get('deviceInvitePinInput').value = '4826'; await window.DaycareAuth.createDeviceInvite();
  assert.equal(nodes.get('deviceInviteUrl').value, link); assert.equal(nodes.get('deviceInviteResult').hidden, false);
  await nodes.get('copyDeviceInviteBtn').onclick(); assert.deepEqual(fixture.copies, [link]);
  assert.equal(JSON.stringify(fixture.storage).includes(link), false); assert.equal(JSON.stringify(fixture.storage).includes('4826'), false);
  nodes.get('closeDeviceInviteBtn').onclick(); assert.equal(nodes.get('deviceInviteUrl').value, '');
});

test('링크 만료와 복사 권한 거부를 안내하고 오래된 링크를 숨긴다', async () => {
  const deadline = Date.now() + 1800000;
  const fixture = await authFixture({ session: true, registration: false, copyFails: true,
    inviteReply: () => Response.json({ url: 'https://daycare.test/#register=' + 'b'.repeat(64), expiresAt: deadline }) });
  fixture.nodes.get('deviceInvitePinInput').value = '4826'; await fixture.window.DaycareAuth.createDeviceInvite();
  await fixture.nodes.get('copyDeviceInviteBtn').onclick(); assert.match(fixture.nodes.get('deviceInviteStatus').textContent, /길게 눌러/);
  vm.runInContext(`Date.now = () => ${deadline + 1}`, fixture.context); fixture.timers.at(-1)();
  assert.equal(fixture.nodes.get('deviceInviteResult').hidden, true); assert.equal(fixture.nodes.get('deviceInviteUrl').value, '');
  assert.match(fixture.nodes.get('deviceInviteStatus').textContent, /만료/);
});

test('발급 연속 탭을 제한하고 잠금 뒤 늦은 응답으로 링크가 다시 보이지 않는다', async () => {
  let release;
  const fixture = await authFixture({ session: true, registration: false, inviteReply: () => new Promise(resolve => { release = resolve; }) });
  fixture.nodes.get('deviceInvitePinInput').value = '4826'; const pending = fixture.window.DaycareAuth.createDeviceInvite();
  await fixture.window.DaycareAuth.createDeviceInvite(); assert.equal(fixture.inviteRequests.length, 1);
  await fixture.window.DaycareAuth.lock();
  release(Response.json({ url: 'https://daycare.test/#register=' + 'c'.repeat(64), expiresAt: Date.now() + 1800000 }));
  await pending;
  assert.equal(fixture.nodes.get('deviceInviteUrl').value, ''); assert.equal(fixture.nodes.get('deviceInviteResult').hidden, true);
  assert.equal(fixture.nodes.get('createDeviceInviteBtn').disabled, false);
});
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
    structuredClone, AbortController, DOMException, setTimeout, clearTimeout, console, localStorage: { removeItem() {} }, fetch: async () => { requests++; await wait; return Response.json({ error: '가상 저장 오류' }, { status: 502 }); } });
  vm.runInContext(await readFile(new URL('../public/js/records-flow.js', import.meta.url), 'utf8'), context);
  const options = { extractCleanObsSummary: () => '검수 요약', checkDuplicateAndSave: async (_date, _name, callback) => callback({ overwrite: false }) };
  await window.DaycareRecords.saveNotion(options); assert.match(nodes.get('notionSaveStatus').textContent, /검수 확인/); assert.equal(requests, 0);
  nodes.get('reviewConfirmed').checked = true; const first = window.DaycareRecords.saveNotion(options); const second = window.DaycareRecords.saveNotion(options);
  await second; release(); await first; assert.equal(requests, 1); assert.equal(state.savingNotion, false);
  assert.match(nodes.get('notionSaveStatus').textContent, /가상 저장 오류/); assert.equal(state.lastResult.kidsnote.content, '교사가 검수한 문장');
  assert.equal(nodes.get('generateBtn').disabled, false);
});

test('중복 선택 대기 중 잠금이 저장 대기를 끝내고 다음 저장 버튼을 복구한다', async () => {
  const nodes = new Map();
  for (const id of ['rawMemoInput', 'kidsnoteContent', 'reviewConfirmed', 'notionSaveStatus', 'generateBtn', 'saveAllUnifiedNotionBtn',
    'duplicateLogModal', 'btnDupCancel', 'btnDupNew', 'authGateModal']) nodes.set(id, element());
  nodes.get('reviewConfirmed').checked = true; nodes.get('rawMemoInput').value = '가상 메모'; nodes.get('kidsnoteContent').value = '검수본';
  const state = { authenticated: true, teacherId: 'teacher-a', selectedDate: '2026-10-03', selectedChild: { id: 'class-all' }, lastResult: { kidsnote: { content: '초안' } } };
  const buttons = [nodes.get('generateBtn'), nodes.get('saveAllUnifiedNotionBtn')];
  const window = { state, addEventListener() {} }; let writes = 0;
  const context = vm.createContext({ window, document: { body: { dataset: {} }, getElementById: id => nodes.get(id), addEventListener() {},
    querySelectorAll: selector => selector.includes('NotionBtn') ? buttons : selector === '.modal-overlay' ? [nodes.get('duplicateLogModal')] : [] },
    structuredClone, AbortController, DOMException, setTimeout, clearTimeout, setInterval, clearInterval, URLSearchParams, console,
    localStorage: { removeItem() {} }, fetch: async path => path.startsWith('/api/history') ? Response.json({ data: [{ id: 'existing', date: state.selectedDate }] }) :
      path === '/api/logs/save' ? (writes++, Response.json({ success: true, source: 'notion', pageId: 'saved' })) : Response.json({ success: true }) });
  for (const file of ['records-flow', 'notion-store', 'auth-security']) vm.runInContext(await readFile(new URL(`../public/js/${file}.js`, import.meta.url), 'utf8'), context);
  const pending = window.DaycareNotion.handleSaveNotion();
  await new Promise(resolve => setImmediate(resolve)); assert.equal(nodes.get('duplicateLogModal').style.display, 'flex');
  await window.DaycareAuth.lock(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(state.savingNotion, false); assert.equal(buttons[1].disabled, false); assert.equal(writes, 0); await pending;
  Object.assign(state, { authenticated: true, selectedChild: { id: 'class-all' }, lastResult: { kidsnote: { content: '검수본' } } });
  const next = window.DaycareNotion.handleSaveNotion(); await new Promise(resolve => setImmediate(resolve));
  nodes.get('btnDupNew').onclick(); await next; assert.equal(writes, 1); assert.equal(state.savingNotion, false);
});

test('응답·본문 수신 지연과 취소는 제한 시간 안에 끝나며 쓰기를 재전송하지 않는다', async () => {
  const window = { addEventListener() {} }; let calls = 0;
  const context = vm.createContext({ window, document: { getElementById() {}, addEventListener() {} },
    AbortController, DOMException, setTimeout, clearTimeout, console, fetch: async () => { calls++; return { ok: true, json: () => new Promise(() => {}) }; } });
  vm.runInContext(await readFile(new URL('../public/js/records-flow.js', import.meta.url), 'utf8'), context);
  await assert.rejects(window.DaycareRecords.requestJson('/api/logs/save', { method: 'POST', body: {}, timeoutMs: 15 }), error => error.name === 'TimeoutError' && /보관함/.test(error.message));
  assert.equal(calls, 1);
  const controller = new AbortController();
  const pending = window.DaycareRecords.requestJson('/api/history', { signal: controller.signal }); controller.abort();
  await assert.rejects(pending, { name: 'AbortError' }); assert.equal(calls, 2);
  const before = new AbortController(); before.abort();
  await assert.rejects(window.DaycareRecords.requestJson('/api/history', { signal: before.signal }), { name: 'AbortError' }); assert.equal(calls, 2);
});

test('잠금이 진행 중 쓰기와 개별 저장을 취소하며 늦은 응답을 새 화면에 반영하지 않는다', async () => {
  const nodes = new Map(); for (const id of ['reviewConfirmed', 'rawMemoInput', 'kidsnoteContent', 'notionSaveStatus', 'generateBtn', 'saveAllUnifiedNotionBtn']) nodes.set(id, element());
  nodes.get('reviewConfirmed').checked = true; nodes.get('rawMemoInput').value = '가상 메모';
  const state = { authenticated: true, teacherId: 'teacher-a', selectedDate: '2026-10-03', selectedChild: { id: 'class-all' }, lastResult: { kidsnote: { content: '검수본' } } };
  const buttons = [nodes.get('generateBtn'), nodes.get('saveAllUnifiedNotionBtn')];
  const window = { state, addEventListener() {} }; let release, posted = false;
  const context = vm.createContext({ window, document: { getElementById: id => nodes.get(id), querySelectorAll: () => buttons, addEventListener() {} },
    structuredClone, AbortController, DOMException, setTimeout, clearTimeout, console, fetch: () => { posted = true; return new Promise(resolve => { release = resolve; }); } });
  vm.runInContext(await readFile(new URL('../public/js/records-flow.js', import.meta.url), 'utf8'), context);
  const options = { extractCleanObsSummary: () => '', checkDuplicateAndSave: async (_date, _child, callback) => callback({ overwrite: false }) };
  const first = window.DaycareRecords.saveNotion(options); await new Promise(resolve => setImmediate(resolve)); assert.equal(posted, true);
  state.individualAbortController = new AbortController(); window.DaycareRecords.cancelSave();
  Object.assign(state, { authenticated: false, teacherId: 'teacher-b', lastResult: null });
  nodes.get('notionSaveStatus').textContent = ''; await first;
  assert.equal(state.savingNotion, false); assert.equal(state.individualAbortController.signal.aborted, true); assert.equal(buttons[1].disabled, false);
  release(Response.json({ success: true, source: 'notion', pageId: 'late' })); await new Promise(resolve => setImmediate(resolve));
  assert.equal(nodes.get('notionSaveStatus').textContent, ''); assert.equal(state.lastResult, null);
});
