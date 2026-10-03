import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

test('암호화 초안은 평문을 남기지 않고 빈 새 화면에 덮이지 않으며 검수 문장을 복원한다', async () => {
  const elements = new Map();
  for (const id of ['rawMemoInput', 'kidsnoteContent', 'kidsnoteTitle', 'autoDraftRestoreBanner', 'autoDraftRestoreMeta', 'btnRestoreAutoDraft', 'btnDiscardAutoDraft', 'generateBtn', 'evidenceFrom', 'evidenceStatus']) elements.set(id, { value: '', textContent: '', style: {}, readOnly: false });
  for (const id of ['repReflectionText', 'repSupportEnvText', 'repSupportSafetyText']) elements.set(id, { isContentEditable: true, textContent: '교사가 검수한 보육일지 문장' });
  const storage = new Map();
  const window = { state: { authenticated: true, teacherId: 'teacher-a', draftKey: '1a'.repeat(32),
    className: '사랑반', selectedChild: { id: 'child-a', name: '검증원아' }, children: [{ id: 'child-a' }], selectedDate: '2026-10-03',
    lastResult: { kidsnote: { content: 'AI 초안' }, class_daily_report: { reflection: 'AI 성찰', support: { environment: '', safety: '' } } }, photos: [], selectedFormats: ['kidsnote'] }, addEventListener() {},
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
  await window.DaycareRecords.save(); window.DaycareRecords.clear(); assert.equal(storage.has('daycare_secure_draft_teacher-a'), false);
});
