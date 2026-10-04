import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

test('암호화 초안은 평문을 남기지 않고 빈 새 화면에 덮이지 않으며 검수 문장을 복원한다', async () => {
  const elements = new Map();
  for (const id of ['rawMemoInput', 'kidsnoteContent', 'kidsnoteTitle', 'autoDraftRestoreBanner', 'autoDraftRestoreMeta', 'btnRestoreAutoDraft', 'btnDiscardAutoDraft', 'generateBtn', 'evidenceFrom', 'evidenceTo', 'evidenceStatus']) elements.set(id, { value: '', textContent: '', style: {}, readOnly: false });
  for (const id of ['repReflectionText', 'repSupportEnvText', 'repSupportSafetyText']) elements.set(id, { isContentEditable: true, textContent: '교사가 검수한 보육일지 문장' });
  const storage = new Map();
  const window = { state: { authenticated: true, teacherId: 'teacher-a', draftKey: '1a'.repeat(32),
    className: '사랑반', selectedChild: { id: 'child-a', name: '검증원아' }, children: [{ id: 'child-a' }], selectedDate: '2026-10-03',
    lastResult: { kidsnote: { content: 'AI 초안' }, class_daily_report: { reflection: 'AI 성찰', support: { environment: '', safety: '' } } }, photos: [], selectedFormats: ['kidsnote'], evidenceFrom: '2026-07-01', evidenceTo: '2026-09-30', evidenceIds: ['past-a'] }, addEventListener() {},
    ChildrenStore: { selectChild(child) { window.state.selectedChild = child; } }, updateRecordDate(date) { window.state.selectedDate = date; },
    AiEngine: { renderResults(data) { elements.get('kidsnoteContent').value = data.kidsnote.content; } } };
  elements.get('rawMemoInput').value = '검증원아의 실제 원시 메모'; elements.get('kidsnoteContent').value = '교사가 수정한 최종 문장';
  const context = vm.createContext({ window, document: { getElementById(id) { return elements.get(id); }, addEventListener() {} },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    crypto: webcrypto, structuredClone, TextEncoder, TextDecoder, btoa, atob, Uint8Array, Date, console });
  vm.runInContext(await readFile(new URL('../public/js/records-flow.js', import.meta.url), 'utf8'), context);
  await window.DaycareRecords.save(); const encrypted = storage.get('daycare_secure_draft_teacher-a');
  assert.ok(encrypted); assert.equal(encrypted.includes('원시 메모'), false); assert.equal(encrypted.includes('최종 문장'), false);
  window.state.lastResult = null; elements.get('rawMemoInput').value = ''; elements.get('kidsnoteContent').value = '';
  await window.DaycareRecords.save(); assert.equal(storage.get('daycare_secure_draft_teacher-a'), encrypted);
  await window.DaycareRecords.restore(); assert.equal(window.state.pendingDraft, true); assert.equal(elements.get('rawMemoInput').readOnly, true);
  await window.DaycareRecords.save(); assert.equal(storage.get('daycare_secure_draft_teacher-a'), encrypted);
  elements.get('btnRestoreAutoDraft').onclick();
  assert.equal(elements.get('kidsnoteContent').value, '교사가 수정한 최종 문장'); assert.equal(elements.get('rawMemoInput').value, '검증원아의 실제 원시 메모');
  assert.equal(window.state.pendingDraft, false); assert.equal(elements.get('rawMemoInput').readOnly, false);
  assert.equal(window.state.lastResult.class_daily_report.reflection, '교사가 검수한 보육일지 문장');
  assert.equal(window.state.lastResult.class_daily_report.support.environment, '교사가 검수한 보육일지 문장');
  assert.equal(window.state.evidenceTo, '2026-09-30'); assert.equal(elements.get('evidenceTo').value, '2026-09-30');
  await window.DaycareRecords.save(); window.DaycareRecords.clear(); assert.equal(storage.has('daycare_secure_draft_teacher-a'), false);
  window.state.lastResult = null; elements.get('rawMemoInput').value = ''; window.state.evidenceSelectionActive = true;
  await window.DaycareRecords.save(); assert.ok(storage.get('daycare_secure_draft_teacher-a'));
  window.state.evidenceIds = []; window.state.evidenceTo = '2026-10-03'; await window.DaycareRecords.restore();
  elements.get('btnRestoreAutoDraft').onclick(); assert.deepEqual(Array.from(window.state.evidenceIds), ['past-a']); assert.equal(window.state.evidenceTo, '2026-09-30');
});

test('월·분기 선택은 연도를 넘겨 계산하고 기존 선택과 늦게 오는 조회 결과를 폐기한다', async () => {
  const nodes = new Map();
  for (const id of ['evidenceFrom', 'evidenceTo', 'evidenceList', 'evidenceStatus', 'loadEvidenceBtn', 'rawMemoInput', 'evidence-currentMonth', 'evidence-previousMonth', 'evidence-currentQuarter', 'evidence-previousQuarter']) {
    nodes.set(id, { value: '', textContent: '', children: [], replaceChildren() { this.children = []; this.textContent = ''; }, append(node) { this.children.push(node); } });
  }
  const window = { state: { authenticated: true, teacherId: 't', selectedDate: '2026-01-15', selectedChild: { id: 'child-a' }, evidenceIds: ['old'] }, addEventListener() {} };
  let resolve;
  vm.runInNewContext(await readFile(new URL('../public/js/records-flow.js', import.meta.url), 'utf8'), {
    window, document: { getElementById: id => nodes.get(id), addEventListener() {} }, URLSearchParams, AbortController, DOMException, setTimeout, clearTimeout,
    fetch: () => new Promise(done => { resolve = done; }), console
  });
  window.DaycareRecords.initEvidence(); nodes.get('evidence-previousQuarter').onclick();
  assert.equal(window.state.evidenceFrom, '2025-10-01'); assert.equal(window.state.evidenceTo, '2025-12-31'); assert.equal(window.state.evidenceIds.length, 0);
  assert.equal(window.DaycareRecords.monthlyOptions().targetMonth, '2025-12');
  const loading = nodes.get('loadEvidenceBtn').onclick();
  nodes.get('evidence-previousMonth').onclick(); assert.equal(window.state.evidenceFrom, '2025-12-01');
  const message = nodes.get('evidenceList').textContent;
  resolve(Response.json({ data: [{ id: 'stale', date: '2025-10-10' }] })); await loading;
  assert.equal(nodes.get('evidenceList').textContent, message); assert.equal(nodes.get('evidenceList').children.length, 0);
  nodes.get('evidence-currentQuarter').onclick(); assert.equal(window.state.evidenceFrom, '2026-01-01'); assert.equal(window.state.evidenceTo, '2026-01-15');
  window.DaycareRecords.restoreEvidence({ from: '2025-07-01', to: '2025-09-30', sources: [{ id: 'saved-source', date: '2025-08-12' }] });
  assert.equal(window.state.evidenceTo, '2025-09-30'); assert.equal(nodes.get('evidenceFrom').value, '2025-07-01');
  assert.deepEqual(Array.from(window.state.evidenceIds), ['saved-source']);
});
