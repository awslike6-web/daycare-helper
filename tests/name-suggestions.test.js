/** 이름 제안과 교사 검수·일괄 저장·초안/응답 격리를 실제 화면 코드로 확인한다. */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../public/js/child-links.js', import.meta.url), 'utf8');
const children = [{ id: 'a', name: '김민수', age: '만 2세' }, { id: 'b', name: '김민서', age: '만 0세' }];
function browser(rawMemo = '김민수가 블록을 쌓음.\n김민서가 공을 굴림.', send) {
  const nodes = new Map(), calls = [], events = new Map();
  function node(id = '') {
    const value = { id, value: '', checked: false, disabled: false, hidden: false, textContent: '', dataset: {}, options: [], children: [], handlers: new Map(),
      addEventListener(event, fn) { this.handlers.set(event, fn); }, replaceChildren(...items) { this.children = items; this.options = items; if (items.length) this.value = items[0]?.value || ''; },
      append(...items) { this.children.push(...items); }, appendChild(item) { this.children.push(item); },
      set innerHTML(html) {
        for (const match of html.matchAll(/id="([^"]+)"/g)) nodes.set(match[1], node(match[1]));
        for (const match of html.matchAll(/<textarea id="([^"]+)"[^>]*>([^]*?)<\/textarea>/g)) nodes.get(match[1]).value = match[2];
      } };
    return value;
  }
  for (const id of ['rawMemoInput', 'childLinkChild', 'childLinkExcerpt', 'childLinkSummary', 'childLinkConfirmed', 'childLinkSave', 'childLinkQuote', 'childLinkStatus', 'btnSaveIndividualObs',
    'memoChildSuggestions', 'memoChildList', 'memoChildSave', 'memoChildStatus', 'memoChildCount', 'memoChildUnassigned', 'memoChildUnassignedList', 'memoChildUnassignedCount']) nodes.set(id, node(id));
  nodes.get('rawMemoInput').value = rawMemo;
  const window = { state: { authenticated: true, teacherId: 'teacher', selectedDate: '2026-10-04', selectedChild: { id: 'class-all' }, children },
    DaycareHTML: (parts, ...values) => parts.reduce((html, part, i) => html + part + (values[i] ?? ''), ''),
    DaycareMemo: { changed() {}, async flush() {} }, DaycareRecords: { async save() {}, async requestJson(path, options) {
      calls.push({ path, ...options });
      if (path.startsWith('/api/memo?')) return { source: 'notion', pageId: 'source', rawMemo: nodes.get('rawMemoInput').value };
      return send ? send(path, options) : { success: true, source: 'notion', childId: options.body.childId, pageId: 'saved-' + options.body.childId };
    } } };
  const document = { getElementById: id => nodes.get(id), createElement: () => node(), addEventListener(event, fn) { events.set(event, fn); } };
  class Option { constructor(label, value) { this.label = label; this.value = value; } }
  vm.runInNewContext(source, { window, document, Option, AbortController, URLSearchParams, console, setTimeout, clearTimeout });
  events.get('DOMContentLoaded')(); window.DaycareChildLinks.contextChanged();
  const change = async (id, value, event = 'input') => { const element = nodes.get(id); element.value = value; await element.handlers.get(event)?.(); };
  const confirm = async index => { const element = nodes.get('memo-confirm-' + index); element.checked = true; await element.handlers.get('change')(); };
  return { window, nodes, calls, change, confirm, links: window.DaycareChildLinks };
}
test('실명·조사·이름 약칭의 문장을 원문 그대로 제안하고 공동 관찰은 역할 확인 표시를 붙인다', () => {
  const page = browser();
  const result = page.links.suggestMemo('김민수가 블록을 쌓음.\n민서에게 공을 건넴.\n김민수와 김민서가 웃음.\n다시 주웠음.\n모두 산책함.', children);
  assert.equal(result.rows.length, 4); assert.equal(result.rows[0].childId, 'a'); assert.equal(result.rows[1].childId, 'b');
  assert.equal(result.rows[1].excerpt, '민서에게 공을 건넴.'); assert.match(result.rows[1].warning, /약칭/);
  assert.equal(result.rows.filter(row => /역할 확인/.test(row.warning)).length, 2);
  assert.deepEqual(Array.from(result.unassigned), ['다시 주웠음.', '모두 산책함.']);
});
test('동명이인과 같은 약칭은 선택을 비우며 실명 부분 일치와 일반 단어를 후보로 저장하지 않는다', () => {
  const page = browser(); const roster = [...children, { id: 'c', name: '이민서' }, { id: 'd', name: '김민수' }];
  const result = page.links.suggestMemo('김민수가 블록을 잡음.\n민서가 웃음.\n김민서가 공을 잡음.\n민서네 방문함.\n민수학교 행사.\n큰김민수나무.', roster);
  assert.equal(result.rows.length, 3); assert.equal(result.rows[0].childId, ''); assert.equal(result.rows[1].childId, ''); assert.equal(result.rows[2].childId, 'b');
  assert.equal(result.unassigned.length, 3);
});
test('쉼표 뒤 새 주어의 키워드 메모는 분리하고 상대에게 이어지는 공동 문장은 유지한다', () => {
  const page = browser(); const result = page.links.suggestMemo('민수 블록 쌓음, 민서 공 굴림.\n김민수가 공을 잡고, 김민서에게 건넴.', children);
  assert.equal(result.rows.length, 4); assert.equal(result.rows[0].excerpt, '민수 블록 쌓음,'); assert.equal(result.rows[1].excerpt, '민서 공 굴림.');
  assert.equal(result.rows[2].excerpt, '김민수가 공을 잡고, 김민서에게 건넴.'); assert.match(result.rows[2].warning, /역할 확인/);
});
test('같은 문장 반복은 중복 제안하지 않으며 많은 후보를 100건으로 제한한다', () => {
  const page = browser(); assert.equal(page.links.suggestMemo('김민수가 웃음.\n김민수가 웃음.', children).rows.length, 1);
  const result = page.links.suggestMemo(Array.from({ length: 103 }, (_, i) => `김민수가 블록 ${i}개를 봄.`).join('\n'), children);
  assert.equal(result.rows.length, 100); assert.equal(result.omitted, 3);
});
test('교사가 확인한 카드만 발췌와 실제 ID로 한 번에 저장하고 저장 상태를 남긴다', async () => {
  const page = browser(); await page.links.saveSuggestions(); assert.equal(page.calls.length, 0);
  await page.confirm(0); await page.change('memo-summary-0', '블록 쌓기를 관찰함');
  await page.links.saveSuggestions(); assert.equal(page.calls.length, 0);
  await page.confirm(0); await page.confirm(1); await page.links.saveSuggestions();
  const writes = page.calls.filter(call => call.path === '/api/logs/link-child'); assert.equal(writes.length, 2);
  assert.equal(writes[0].body.childId, 'a'); assert.equal(writes[0].body.excerpt, '김민수가 블록을 쌓음.');
  assert.equal(writes[1].body.childId, 'b'); assert.equal(writes[1].body.excerpt, '김민서가 공을 굴림.');
  assert.match(page.nodes.get('memoChildStatus').textContent, /2건 저장 완료/);
  assert.equal(page.links.captureDraft().suggestions.rows.filter(row => row.savedPageId).length, 2);
  assert.equal(page.nodes.get('memoChildSave').disabled, true);
});
test('원문에 없는 수정은 확인을 거부하고 이름 없는 문장은 수동 후보로만 추가한다', async () => {
  const page = browser('김민수가 블록을 쌓음.\n모두 산책함.');
  await page.change('memo-excerpt-0', '김민수가 밥을 먹음.'); await page.confirm(0);
  assert.equal(page.nodes.get('memo-confirm-0').checked, false); await page.links.saveSuggestions(); assert.equal(page.calls.length, 0);
  const button = page.nodes.get('memoChildUnassignedList').children[0].children[1]; await button.handlers.get('click')();
  assert.equal(page.links.captureDraft().suggestions.rows.length, 2); assert.equal(page.nodes.get('memo-child-1').value, '');
});
test('메모 변경은 즉시 확인을 해제하며 카드 수정본과 암호화에 넣을 복원 자료를 보존한다', async () => {
  const page = browser(); await page.change('memo-summary-0', '교사가 고친 요약'); await page.confirm(0);
  const draft = page.links.captureDraft(); assert.equal(draft.suggestions.rows[0].confirmed, false);
  page.nodes.get('rawMemoInput').value += '\n다시 주웠음.'; page.links.memoChanged();
  assert.equal(page.nodes.get('memo-confirm-0').checked, false); page.links.refreshSuggestions();
  assert.equal(page.nodes.get('memo-summary-0').value, '교사가 고친 요약');
  page.links.pause(); page.links.contextChanged(); page.links.restoreDraft(draft);
  assert.equal(page.nodes.get('memo-summary-0').value, '교사가 고친 요약'); assert.equal(page.nodes.get('memo-confirm-0').checked, false);
});
test('일부 저장 실패는 성공 행을 보존하고 남은 확인 항목만 재시도한다', async () => {
  let count = 0; const page = browser(undefined, (_, options) => {
    if (++count === 2) throw new Error('노션 연결 오류'); return { success: true, source: 'notion', pageId: 'saved', childId: options.body.childId };
  });
  await page.confirm(0); await page.confirm(1); await page.links.saveSuggestions();
  assert.match(page.nodes.get('memoChildStatus').textContent, /1\/2건 저장 완료/);
  assert.equal(page.links.captureDraft().suggestions.rows.filter(row => row.savedPageId).length, 1);
  await page.links.saveSuggestions(); assert.equal(page.calls.filter(call => call.path === '/api/logs/link-child').length, 3);
});
test('일괄 저장 연속 탭과 잠금 후 재로그인으로 돌아온 늦은 응답을 격리한다', async () => {
  let resolve; const page = browser(undefined, () => new Promise(done => { resolve = done; })); await page.confirm(0);
  const saving = page.links.saveSuggestions();
  for (let i = 0; i < 8 && !resolve; i++) await new Promise(done => setImmediate(done));
  await page.links.saveSuggestions(); assert.equal(page.calls.filter(call => call.path === '/api/logs/link-child').length, 1);
  page.links.pause(); page.window.state.authenticated = false; page.window.state.authenticated = true; page.links.contextChanged();
  const before = page.nodes.get('memoChildStatus').textContent;
  resolve({ success: true, source: 'notion', pageId: 'old', childId: 'a' }); await saving;
  assert.equal(page.nodes.get('memoChildStatus').textContent, before); assert.equal(page.links.captureDraft().suggestions.rows.some(row => row.savedPageId), false);
});
test('저장 중 수정된 나머지 카드는 전송하지 않으며 변경한 요약을 지우지 않는다', async () => {
  let resolve; const page = browser(undefined, () => new Promise(done => { resolve = done; })); await page.confirm(0); await page.confirm(1);
  const saving = page.links.saveSuggestions();
  for (let i = 0; i < 8 && !resolve; i++) await new Promise(done => setImmediate(done));
  await page.change('memo-summary-1', '저장 중 고친 요약'); resolve({ success: true, source: 'notion', pageId: 'saved', childId: 'a' }); await saving;
  assert.equal(page.calls.filter(call => call.path === '/api/logs/link-child').length, 1);
  assert.equal(page.nodes.get('memo-summary-1').value, '저장 중 고친 요약'); assert.match(page.nodes.get('memoChildStatus').textContent, /1\/2건 저장 완료/);
});
test('깨끗한 노션 메모를 먼저 조회하는 재진입에서도 보관한 카드 선택·요약을 뒤에 복원한다', async () => {
  const page = browser(); await page.change('memo-summary-0', '복원할 요약'); const draft = page.links.captureDraft();
  page.links.pause(); page.nodes.get('rawMemoInput').value = ''; page.links.contextChanged(); page.links.restoreDraft(draft);
  page.nodes.get('rawMemoInput').value = draft.suggestions.rawMemo; page.links.refreshSuggestions();
  assert.equal(page.nodes.get('memo-summary-0').value, '복원할 요약'); assert.equal(page.nodes.get('memo-confirm-0').checked, false);
});
test('완성본 저장 중에는 자동 제안의 일괄 저장 버튼도 잠그고 완료 후 복구한다', async () => {
  const page = browser(); await page.confirm(0); assert.equal(page.nodes.get('memoChildSave').disabled, false);
  page.window.state.savingNotion = true; page.links.refreshButtons(); assert.equal(page.nodes.get('memoChildSave').disabled, true);
  page.window.state.savingNotion = false; page.links.refreshButtons(); assert.equal(page.nodes.get('memoChildSave').disabled, false);
});
