/** 원문 연결 화면의 확인·명확한 대상·늦은 응답 격리를 검증한다. */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../public/js/child-links.js', import.meta.url), 'utf8');
function browser(send = async () => ({ success: true, source: 'notion', childId: 'child-b', pageId: 'linked' })) {
  const nodes = new Map(), calls = [], events = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { id, value: '', checked: false, disabled: false, textContent: '', dataset: {}, options: [],
      handlers: new Map(), addEventListener(event, fn) { this.handlers.set(event, fn); }, replaceChildren(...items) { this.options = items; this.value = items[0]?.value || ''; } });
    return nodes.get(id);
  };
  const rawMemo = '김하늘 블록을 잡음.\n김하늘 공을 굴림.';
  const window = { state: { authenticated: true, teacherId: 'teacher', selectedDate: '2026-10-04', selectedChild: { id: 'class-all' },
    children: [{ id: 'child-a', name: '김하늘', age: '만 0세' }, { id: 'child-b', name: '김하늘', age: '만 2세' }] },
    DaycareMemo: { changed() {}, async flush() {} }, DaycareRecords: { async save() {}, async requestJson(path, options) {
      calls.push({ path, ...options }); return path.startsWith('/api/memo?') ? { source: 'notion', pageId: 'source', rawMemo } : send(path, options);
    } } };
  const document = { getElementById: id => id.startsWith('memoChild') ? null : node(id), addEventListener(event, fn) { events.set(event, fn); } };
  class Option { constructor(label, value) { this.label = label; this.value = value; } }
  vm.runInNewContext(source, { window, document, Option, AbortController, URLSearchParams, console, setTimeout, clearTimeout });
  events.get('DOMContentLoaded')(); window.DaycareChildLinks.contextChanged(); node('rawMemoInput').value = rawMemo;
  const row = () => { node('childLinkChild').value = 'child-b'; node('childLinkExcerpt').value = '김하늘 공을 굴림.'; node('childLinkSummary').value = '공을 굴림'; node('childLinkConfirmed').checked = true; };
  return { window, node, calls, row, save: () => node('childLinkSave').handlers.get('click')() };
}
test('확인·원아 ID·정확한 발췌 없이는 전송하지 않고 동명이인 두 번째 ID만 전송한다', async () => {
  const page = browser(); await page.save(); assert.equal(page.calls.length, 0);
  page.row(); page.node('childLinkConfirmed').checked = false; await page.save(); assert.equal(page.calls.length, 0);
  page.row(); page.node('childLinkExcerpt').value = '메모에 없는 행동'; await page.save(); assert.equal(page.calls.length, 0);
  page.row(); await page.save(); const write = page.calls.find(c => c.path === '/api/logs/link-child');
  assert.equal(write.body.childId, 'child-b'); assert.equal(write.body.excerpt, '김하늘 공을 굴림.');
  assert.equal(write.body.confirmed, true); assert.match(page.node('childLinkStatus').textContent, /연결 완료/);
});
test('연속 저장을 제한하고 잠금·재로그인 뒤 이전 응답으로 원문이나 상태를 다시 표시하지 않는다', async () => {
  let resolve; const page = browser(() => new Promise(done => { resolve = done; })); page.row();
  const first = page.save();
  for (let i = 0; i < 8 && !resolve; i++) await new Promise(done => setImmediate(done));
  await page.save(); assert.equal(page.calls.filter(c => c.path === '/api/logs/link-child').length, 1);
  page.window.DaycareChildLinks.pause(); page.window.state.authenticated = false;
  page.window.state.authenticated = true; page.window.DaycareChildLinks.contextChanged();
  const before = page.node('childLinkStatus').textContent;
  resolve({ success: true, source: 'notion', childId: 'child-b', pageId: 'linked' }); await first;
  assert.equal(page.node('childLinkStatus').textContent, before); assert.equal(page.node('childLinkExcerpt').value, '');
});
test('저장 중 바꾼 원아·근거는 이전 저장 완료와 구분하여 재검수를 안내한다', async () => {
  let resolve; const page = browser(() => new Promise(done => { resolve = done; })); page.row(); const first = page.save();
  for (let i = 0; i < 8 && !resolve; i++) await new Promise(done => setImmediate(done));
  page.node('childLinkChild').value = 'child-a'; page.node('childLinkExcerpt').value = '김하늘 블록을 잡음.';
  resolve({ success: true, source: 'notion', childId: 'child-b', pageId: 'linked' }); await first;
  assert.match(page.node('childLinkStatus').textContent, /저장 중 수정한 연결/); assert.equal(page.node('childLinkExcerpt').value, '김하늘 블록을 잡음.');
});
