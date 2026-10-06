/** 실제 사진 확인·메모 자동 저장·암호화 초안·생성 컨트롤러를 함께 실행한다. */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const sources = await Promise.all(['records-flow', 'memo-sync', 'photo-memo', 'ai-engine'].map(name => readFile(new URL('../public/js/' + name + '.js', import.meta.url), 'utf8')));
const tick = () => new Promise(resolve => setImmediate(resolve));
function browser() {
  const nodes = new Map(), events = new Map(), timers = new Map(), storage = new Map(), memos = new Map(), calls = [];
  let count = 0, timer = 0;
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { value: '', textContent: '', checked: false, dataset: {}, style: {}, hidden: true, handlers: {},
      addEventListener(type, fn) { this.handlers[type] = fn; }, scrollIntoView() {}, focus() {}, classList: { add() {}, remove() {}, toggle() {} } });
    return nodes.get(id);
  };
  const api = { failSave: false, photoWait: null, async fetch(path, options = {}) {
    const body = options.body ? JSON.parse(options.body) : Object.fromEntries(new URL(path, 'https://app.test').searchParams);
    calls.push({ path, options, body });
    if (path === '/api/photo-memo') {
      if (api.photoWait) await api.photoWait;
      return Response.json({ success: true, context: { childId: body.childId, date: body.date, teacherId: 't' },
        data: { rawMemo: '사진 1: 빨간 옷을 입은 아이가 블록을 손으로 잡고 있음.', limitations: '행동 주체는 교사가 확인해야 함.' } });
    }
    if (path === '/api/generate') return Response.json({ error: '생성 요청 본문 확인 완료' }, { status: 400 });
    const id = body.date + '/' + body.childId;
    const current = memos.get(id) || { source: 'notion', rawMemo: '', version: 'empty', pageId: null };
    if (options.method === 'PUT') {
      if (api.failSave) throw new TypeError('가상 오프라인');
      if (body.baseVersion !== current.version) return Response.json({ error: '동시 편집', current }, { status: 409 });
      const saved = { source: 'notion', rawMemo: body.rawMemo, version: String(++count), pageId: 'memo-page' };
      memos.set(id, saved); return Response.json(saved);
    }
    return Response.json(current);
  } };
  const document = { visibilityState: 'visible', getElementById: node, querySelectorAll: () => [], addEventListener(type, fn) { const list = events.get(type) || []; list.push(fn); events.set(type, list); } };
  const window = { state: { authenticated: true, teacherId: 't', className: '가상반', draftKey: 'ab'.repeat(32), selectedDate: '2026-10-07',
    selectedChild: { id: 'c', name: '가상원아' }, children: [{ id: 'c', name: '가상원아' }], photos: ['data:image/png;base64,YQ=='], selectedFormats: ['kidsnote'] },
    showToast() {}, addEventListener(type, fn) { events.set(type, [fn]); },
    ChildrenStore: { selectChild(child) { window.state.selectedChild = child; } }, updateRecordDate(date) { window.state.selectedDate = date; } };
  const context = vm.createContext({ window, document, fetch: api.fetch.bind(api), localStorage: { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) },
    crypto, TextEncoder, TextDecoder, atob, btoa, structuredClone, URLSearchParams, AbortSignal, AbortController, DOMException, queueMicrotask,
    setTimeout(fn, ms) { const id = ++timer; timers.set(id, { fn, ms }); return id; }, clearTimeout: id => timers.delete(id),
    setInterval(fn, ms) { const id = ++timer; timers.set(id, { fn, ms, interval: true }); return id; }, clearInterval: id => timers.delete(id), console: { log() {}, error() {}, warn() {} } });
  sources.forEach(source => vm.runInContext(source, context));
  for (const fn of events.get('DOMContentLoaded') || []) fn();
  node('photoConsentCheck').checked = true;
  return { api, window, node, calls, storage, memos, events, timers, photo: window.DaycarePhotoMemo, memo: window.DaycareMemo, records: window.DaycareRecords };
}
test('사진만 생성하면 먼저 별도 초안을 보여주며 자동·화면 종료 저장으로 미확인 사실이 전송되지 않는다', async () => {
  const b = browser(); await b.memo.start(); await b.window.AiEngine.handleGenerate();
  assert.equal(b.calls.filter(c => c.path === '/api/photo-memo').length, 1);
  assert.equal(b.node('rawMemoInput').value, ''); assert.equal(b.node('photoMemoPanel').hidden, false);
  assert.equal(b.calls.filter(c => c.options.method === 'PUT' || c.path === '/api/generate').length, 0);
  await b.memo.flush(); await b.events.get('pagehide')[0](); await b.memo.flush();
  assert.equal(b.calls.filter(c => c.options.method === 'PUT').length, 0);
  await b.photo.confirm(); assert.equal(b.memos.size, 0);
  b.node('photoMemoText').value = '사진 1: 블록을 오른손으로 잡고 있음.'; b.node('photoMemoText').handlers.input();
  b.node('photoMemoConfirmed').checked = true; await b.photo.confirm();
  const saved = b.memos.get('2026-10-07/c'); assert.match(saved.rawMemo, /사진 기반 행동 메모 · 교사 확인/); assert.match(saved.rawMemo, /오른손/);
  assert.equal(b.calls.filter(c => c.options.method === 'PUT').length, 1);
  await b.window.AiEngine.handleGenerate();
  assert.equal(b.calls.find(c => c.path === '/api/generate').body.rawMemo, saved.rawMemo);
  assert.equal(b.calls.filter(c => c.path === '/api/photo-memo').length, 1);
});
test('편집 때 확인을 해제하며 기존 메모가 바뀌면 덮어쓰지 않고 선택 원아·날짜 변경은 요청을 취소한다', async () => {
  const b = browser(); await b.memo.start(); await b.photo.create();
  b.node('photoMemoConfirmed').checked = true; b.node('photoMemoText').value = '수정한 행동'; b.node('photoMemoText').handlers.input();
  assert.equal(b.node('photoMemoConfirmed').checked, false);
  b.node('rawMemoInput').value = '교사가 새로 입력한 메모'; b.node('photoMemoConfirmed').checked = true;
  await b.photo.confirm(); assert.equal(b.node('rawMemoInput').value, '교사가 새로 입력한 메모'); assert.equal(b.memos.size, 0);
  b.photo.discard(); let release; b.api.photoWait = new Promise(resolve => { release = resolve; });
  const pending = b.photo.create(); await tick();
  const controller = b.window.state.currentAbortController; assert.ok(controller);
  b.window.state.selectedDate = '2026-10-08'; b.photo.contextChanged(); assert.equal(controller.signal.aborted, true);
  release(); await pending; assert.equal(b.node('photoMemoPanel').hidden, true); assert.equal(b.window.state.currentAbortController, null);
});
test('사진 초안은 암호화 보관·복원하고 확인은 재요청하며 사진이 빠진 복원본은 저장하지 않는다', async () => {
  const b = browser(); await b.memo.start(); await b.photo.create(); b.node('photoMemoConfirmed').checked = true;
  await b.records.save(); const encrypted = b.storage.get('daycare_secure_draft_t');
  assert.ok(encrypted); assert.equal(encrypted.includes('빨간 옷'), false);
  b.photo.pause(); b.window.state.photos = []; await b.records.restore(); b.node('btnRestoreAutoDraft').onclick(); await tick();
  assert.equal(b.node('photoMemoConfirmed').checked, false); assert.match(b.node('photoMemoText').value, /빨간 옷/); assert.equal(b.node('rawMemoInput').value, '');
  const draft = b.photo.captureDraft(); b.window.state.photos = []; b.photo.restoreDraft(draft); await tick();
  b.node('photoMemoConfirmed').checked = true; await b.photo.confirm(); assert.equal(b.memos.size, 0); assert.equal(b.node('photoMemoSave').disabled, true);
});
test('오프라인 확인 메모는 보존하고 저장 전 서식 생성을 막으며 복구 후 중복 추가 없이 저장한다', async () => {
  const b = browser(); await b.memo.start(); await b.photo.create(); b.api.failSave = true;
  b.node('photoMemoConfirmed').checked = true; await b.photo.confirm();
  const text = b.node('rawMemoInput').value; assert.match(text, /교사 확인/); assert.equal(await b.photo.ready(), false);
  assert.equal(b.memos.size, 0); assert.match(b.node('photoMemoStatus').textContent, /저장 상태|저장 완료/);
  b.api.failSave = false; assert.equal(await b.photo.ready(), true); await b.photo.confirm();
  assert.equal(b.memos.get('2026-10-07/c').rawMemo, text); assert.equal((text.match(/교사 확인/g) || []).length, 1);
});
test('다른 기기 메모가 생긴 동안 확인하면 충돌을 보존하고 임의 덮어쓰기·서식 생성을 막는다', async () => {
  const b = browser(); await b.memo.start(); await b.photo.create();
  b.memos.set('2026-10-07/c', { source: 'notion', version: 'remote', rawMemo: '다른 기기 관찰 메모', pageId: 'memo-page' });
  b.node('photoMemoConfirmed').checked = true; await b.photo.confirm();
  assert.equal(b.node('memoConflict').hidden, false); assert.equal(await b.photo.ready(), false);
  assert.equal(b.memos.get('2026-10-07/c').rawMemo, '다른 기기 관찰 메모'); assert.match(b.node('rawMemoInput').value, /교사 확인/);
});
