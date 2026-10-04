/** 메모 자동 저장의 대기 시간·암호화·복구·대상 격리·충돌 선택 검증. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../public/js/memo-sync.js', import.meta.url), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
function server() {
  const memos = new Map(); let sequence = 0;
  return { memos, calls: [], online: true, async fetch(path, options = {}) {
    this.calls.push({ path, ...options });
    if (!this.online) throw new TypeError('검증용 오프라인');
    const input = options.body ? JSON.parse(options.body) : Object.fromEntries(new URL(path, 'https://app.test').searchParams);
    const id = input.date + '/' + input.childId, current = memos.get(id) || { source: 'notion', rawMemo: '', version: 'empty', pageId: null };
    if (options.method === 'PUT') {
      if (input.rawMemo === current.rawMemo) return Response.json({ ...current, success: true });
      if (input.baseVersion !== current.version) return Response.json({ error: '동시 편집', current }, { status: 409 });
      const saved = { source: 'notion', success: true, rawMemo: input.rawMemo, version: String(++sequence), pageId: 'fake-page', updatedAt: new Date().toISOString() };
      memos.set(id, saved); return Response.json(saved);
    }
    return Response.json(current);
  } };
}
function browser(api, storage = new Map()) {
  const nodes = new Map(), events = new Map(), timers = new Map(); let number = 0;
  function node(id) {
    if (!nodes.has(id)) nodes.set(id, { value: '', textContent: '', dataset: {}, hidden: true, handlers: {}, addEventListener(type, fn) { this.handlers[type] = fn; } });
    return nodes.get(id);
  }
  const document = { visibilityState: 'visible', getElementById: node, addEventListener(type, fn) { events.set(type, fn); } };
  const window = { state: { authenticated: true, teacherId: 'fake-teacher', draftKey: 'ab'.repeat(32), selectedChild: { id: 'fake-child' }, selectedDate: '2026-10-04' },
    addEventListener(type, fn) { events.set(type, fn); }, DaycareRecords: { save() {}, invalidateResult() { window.state.lastResult = null; } } };
  const localStorage = { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) };
  vm.runInNewContext(source, { window, document, localStorage, crypto, TextEncoder, TextDecoder, atob, btoa, URLSearchParams, AbortSignal, fetch: api.fetch.bind(api), queueMicrotask,
    setTimeout(fn, ms) { const id = ++number; timers.set(id, { fn, ms }); return id; }, clearTimeout: id => timers.delete(id),
    setInterval(fn, ms) { const id = ++number; timers.set(id, { fn, ms, interval: true }); return id; } });
  events.get('DOMContentLoaded')();
  return { window, document, storage, nodes, timers, events, memo: window.DaycareMemo, input: node('rawMemoInput'), node };
}
test('입력 후 5초·연속 입력 30초 기준과 암호화 보관·PC 동일 메모', async () => {
  const api = server(), phone = browser(api); await phone.memo.start();
  phone.input.value = '실제 관찰 키워드'; phone.memo.changed(); await phone.memo.persist();
  assert.ok([...phone.timers.values()].some(t => t.ms === 5000));
  assert.ok([...phone.timers.values()].some(t => t.ms === 30000 && !t.interval));
  assert.ok([...phone.storage.values()].every(v => !v.includes('실제 관찰 키워드')));
  const puts = () => api.calls.filter(c => c.method === 'PUT'); assert.equal(puts().length, 0);
  await phone.memo.flush(); assert.equal(puts().length, 1);
  await phone.memo.flush(); assert.equal(puts().length, 1);
  const pc = browser(api); await pc.memo.start(); assert.equal(pc.input.value, phone.input.value);
  assert.match(phone.node('memoSyncStatus').textContent, /노션 저장 완료/);
});
test('동시 수정은 두 메모를 보존하고 합치기 선택 후 새 버전으로 저장한다', async () => {
  const api = server(), phone = browser(api); await phone.memo.start();
  phone.input.value = '오전 메모'; phone.memo.changed(); await phone.memo.flush();
  const pc = browser(api); await pc.memo.start();
  pc.input.value += '\nPC 추가'; pc.memo.changed(); await pc.memo.flush();
  phone.input.value += '\n폰 추가'; phone.memo.changed(); await phone.memo.flush();
  assert.equal(phone.node('memoConflict').hidden, false); assert.match(phone.input.value, /폰 추가/); assert.match(phone.node('memoRemoteText').value, /PC 추가/);
  await phone.node('memoMerge').handlers.click(); await phone.memo.flush();
  const merged = api.memos.get('2026-10-04/fake-child').rawMemo; assert.match(merged, /PC 추가/); assert.match(merged, /폰 추가/);
});
test('오프라인 미전송 내용을 재진입 복원하고 연결 복구 후 전송한다', async () => {
  const api = server(), phone = browser(api); await phone.memo.start(); api.online = false;
  phone.input.value = '오프라인 관찰 메모'; phone.memo.changed(); await phone.memo.flush(); await phone.memo.persist();
  assert.match(phone.node('memoSyncStatus').textContent, /저장 대기/);
  const reopened = browser(api, phone.storage); await reopened.memo.start(); assert.equal(reopened.input.value, '오프라인 관찰 메모');
  api.online = true; await reopened.events.get('online')(); await tick(); await reopened.memo.flush();
  assert.equal(api.memos.get('2026-10-04/fake-child').rawMemo, '오프라인 관찰 메모');
});
test('다른 날짜로 이동해도 대기 메모를 섞지 않고 빈 입력으로 노션을 지우지 않는다', async () => {
  const api = server(), phone = browser(api); await phone.memo.start();
  phone.input.value = '첫날 메모'; phone.memo.changed(); await phone.memo.persist(); await phone.memo.flush();
  phone.memo.beforeContextChange(); phone.window.state.selectedDate = '2026-10-05';
  await tick(); await phone.memo.start(); assert.equal(phone.input.value, '');
  phone.input.value = '둘째날 메모'; phone.memo.changed(); await phone.memo.flush();
  phone.memo.clearEditor(); phone.input.value = ''; phone.memo.changed(); await phone.memo.flush();
  assert.equal(api.memos.get('2026-10-04/fake-child').rawMemo, '첫날 메모'); assert.equal(api.memos.get('2026-10-05/fake-child').rawMemo, '둘째날 메모');
  await phone.node('memoReload').handlers.click(); await tick(); assert.equal(phone.input.value, '둘째날 메모');
});
test('화면 숨김 때 keepalive 저장을 시도하고 잠금 뒤 늦은 응답을 화면에 반영하지 않는다', async () => {
  const api = server(), phone = browser(api); await phone.memo.start();
  phone.input.value = '앱 전환 직전 메모'; phone.memo.changed(); phone.document.visibilityState = 'hidden';
  await phone.events.get('visibilitychange')(); await phone.memo.flush();
  assert.ok(api.calls.some(c => c.method === 'PUT' && c.keepalive));
  phone.memo.pause(); phone.window.state.authenticated = false;
  assert.equal(phone.node('memoConflict').hidden, true); assert.equal(phone.node('memoRemoteText').value, '');
});
test('재로그인 후 추가 입력한 대기본을 이전 요청의 늦은 성공이 지우지 않는다', async () => {
  const api = server(), phone = browser(api); await phone.memo.start();
  const original = api.fetch.bind(api); let release;
  api.fetch = async (path, options) => {
    const response = await original(path, options);
    if (options.method === 'PUT' && !release) await new Promise(resolve => { release = resolve; });
    return response;
  };
  // VM의 fetch 바인딩도 늦은 응답을 받도록 새 검증 브라우저를 구성한다.
  const device = browser(api); await device.memo.start();
  device.input.value = '이전 요청의 메모'; device.memo.changed(); const first = device.memo.flush();
  await tick(); assert.ok(release);
  device.memo.pause(); device.window.state.authenticated = false; device.input.value = '';
  device.window.state.authenticated = true; await device.memo.start();
  device.input.value = '재로그인 후 추가한 메모'; device.memo.changed(); await device.memo.persist();
  assert.equal(device.storage.size, 1);
  release(); await first;
  assert.equal(device.storage.size, 1); assert.equal(device.input.value, '재로그인 후 추가한 메모');
});
