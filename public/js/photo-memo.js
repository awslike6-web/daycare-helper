/** 사진 행동 초안은 별도 검수란에 보관하고 교사 확인 후 기존 메모 저장을 사용한다. */
(() => {
  const el = id => document.getElementById(id);
  const state = () => window.state || {};
  const input = () => el('rawMemoInput')?.value || '';
  const key = () => [state().teacherId, state().selectedChild?.id, state().selectedDate].join('/');
  let draft = null, sourcePhotos = [], controller = null, requestContext = '', epoch = 0, validating = false, saving = false, missingPhotos = false;
  const live = token => state().authenticated && !state().pendingDraft && key() === token;
  const samePhotos = photos => JSON.stringify(photos) === JSON.stringify(state().photos || []);
  async function digest(photos) {
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(photos)))), b => b.toString(16).padStart(2, '0')).join('');
  }
  function status(text, error = false) {
    const node = el('photoMemoStatus'); if (node) { node.textContent = text; node.dataset.kind = error ? 'error' : 'info'; }
  }
  function render() {
    const panel = el('photoMemoPanel'); if (!panel) return;
    panel.hidden = !draft;
    if (!draft) return;
    el('photoMemoTarget').textContent = `${state().selectedChild?.name || '선택 원아'} · 관찰일 ${state().selectedDate}`;
    el('photoMemoText').value = draft.rawMemo;
    el('photoMemoLimitations').textContent = draft.limitations || '사진에 보이는 행동과 실제 원아·관찰일을 확인하세요.';
    el('photoMemoText').readOnly = !!draft.acceptedMemo || saving;
    el('photoMemoConfirmed').disabled = !!draft.acceptedMemo || validating || saving || missingPhotos;
    el('photoMemoSave').disabled = !!draft.acceptedMemo || validating || saving || missingPhotos || !draft.rawMemo.trim() || !el('photoMemoConfirmed').checked;
  }
  function reveal() { render(); el('photoMemoPanel')?.scrollIntoView?.({ block: 'center', behavior: 'smooth' }); }
  function pause() {
    epoch++; controller?.abort();
    if (state().currentAbortController === controller) state().currentAbortController = null;
    controller = null; requestContext = ''; draft = null; sourcePhotos = []; validating = saving = missingPhotos = false;
    if (el('photoMemoConfirmed')) el('photoMemoConfirmed').checked = false;
    if (el('photoMemoText')) el('photoMemoText').value = '';
    if (el('photoMemoLimitations')) el('photoMemoLimitations').textContent = '';
    if (el('photoMemoPanel')) el('photoMemoPanel').hidden = true;
    if (el('photoMemoCreate')) el('photoMemoCreate').disabled = false;
    status('사진에서 확인할 수 있는 행동을 메모로 만듭니다.');
  }
  function contextChanged() {
    if ((controller && requestContext !== key()) || (draft && draft.contextKey !== key()) || (draft && !samePhotos(sourcePhotos))) pause();
  }
  function photosChanged() { pause(); }
  function memoChanged() {
    if (draft && !draft.acceptedMemo && input() !== draft.originalMemo) {
      el('photoMemoConfirmed').checked = false;
      status('기존 메모가 변경됐습니다. 현재 메모를 보존합니다. 사진 초안을 닫고 다시 만들어 주세요.', true);
      render();
    }
  }
  async function create() {
    const s = state();
    if (!s.authenticated || s.pendingDraft || s.savingNotion || s.savingIndividual || s.currentAbortController || saving) return;
    if (!s.selectedChild || s.selectedChild.id === 'class-all') { window.showToast?.('사진 행동 메모를 남길 원아 한 명을 선택해 주세요.'); return; }
    if (!s.photos?.length) { window.showToast?.('사진을 먼저 첨부해 주세요.'); return; }
    if (!el('photoConsentCheck')?.checked) { window.showToast?.('사진의 외부 AI 전송 동의를 확인해 주세요.'); return; }
    if (draft && draft.contextKey === key() && samePhotos(sourcePhotos)) { reveal(); return; }
    const token = key(), ticket = ++epoch, photos = [...s.photos], originalMemo = input();
    const run = new AbortController(); controller = run; requestContext = token; s.currentAbortController = run;
    el('photoMemoCreate').disabled = true;
    status('사진에서 보이는 행동 메모를 만드는 중입니다. 아직 노션에 저장하지 않습니다.');
    window.DaycareRecords?.generationStatus('사진 행동 메모 생성 중 · 완료 후 먼저 확인해 주세요.');
    try {
      await window.DaycareRecords.save();
      const photoHash = await digest(photos);
      const result = await window.DaycareRecords.requestJson('/api/photo-memo', { method: 'POST', signal: run.signal, timeoutMs: 120000,
        body: { childId: s.selectedChild.id, date: s.selectedDate, images: photos, photoConsent: true } });
      if (!live(token) || ticket !== epoch || !samePhotos(photos) || run.signal.aborted) return;
      if (input() !== originalMemo) { status('분석 중 메모가 변경되어 초안을 반영하지 않았습니다. 현재 메모에서 다시 만들어 주세요.', true); return; }
      if (result.context?.childId !== s.selectedChild.id || result.context?.date !== s.selectedDate || result.context?.teacherId !== s.teacherId) throw new Error('사진 메모의 원아·관찰일을 확인해 주세요.');
      draft = { contextKey: token, originalMemo, rawMemo: result.data.rawMemo, limitations: result.data.limitations, photoHash, acceptedMemo: '' };
      sourcePhotos = photos; el('photoMemoConfirmed').checked = false;
      status(draft.rawMemo ? '초안은 이 기기에만 보관합니다. 선택 원아의 행동만 남겨 수정하고 확인해 주세요.' : '명확한 행동을 확인하지 못했습니다. 사진을 보고 실제 행동을 직접 작성하거나 다시 첨부해 주세요.');
      window.DaycareRecords.generationStatus('사진 행동 메모를 확인·저장한 뒤 서식 생성을 눌러 주세요.');
      reveal(); await window.DaycareRecords.save();
    } catch (error) {
      if (live(token) && ticket === epoch) { status(error.name === 'AbortError' ? '사진 메모 생성을 중단했습니다. 사진은 보관합니다.' : '사진 메모 생성 실패 · ' + error.message, true); window.DaycareRecords.generationStatus('사진 메모 생성 실패 · ' + error.message, 'error'); }
    } finally {
      if (controller === run) { controller = null; if (s.currentAbortController === run) s.currentAbortController = null; el('photoMemoCreate').disabled = false; }
    }
  }
  async function confirm() {
    const c = draft;
    if (!c || c.acceptedMemo || saving || validating || missingPhotos || !live(c.contextKey) || !samePhotos(sourcePhotos)) return;
    if (!el('photoMemoConfirmed').checked || !c.rawMemo.trim()) { status('원아·관찰일·행동을 확인하고 체크해 주세요.', true); return; }
    if (input() !== c.originalMemo) { memoChanged(); return; }
    const ticket = epoch; saving = true; render();
    c.acceptedMemo = [c.originalMemo.trim(), '[사진 기반 행동 메모 · 교사 확인]\n' + c.rawMemo.trim()].filter(Boolean).join('\n\n');
    window.DaycareRecords.invalidateResult();
    el('rawMemoInput').value = c.acceptedMemo;
    window.DaycareChildLinks?.memoChanged(); window.DaycareMemo?.changed();
    status('확인한 행동 메모를 노션에 저장하는 중입니다.'); render();
    try {
      await window.DaycareRecords.save(); await window.DaycareMemo?.start(); await window.DaycareMemo?.flush();
      if (draft !== c || ticket !== epoch || !live(c.contextKey)) return;
      const saved = window.DaycareMemo?.snapshot();
      const ok = saved && !saved.dirty && saved.baseText === c.acceptedMemo && input() === c.acceptedMemo;
      status(ok ? '행동 메모 노션 저장 완료 · 월·분기 참조 기록으로 사용할 수 있습니다. 이제 서식을 생성하세요.' : '확인한 메모는 입력창과 이 기기에 보관했습니다. 메모 저장 상태·다른 기기 충돌을 확인하고 [지금 메모 저장]으로 다시 저장하세요.', !ok);
    } finally { if (draft === c && ticket === epoch) { saving = false; render(); window.DaycareRecords.save(); } }
  }
  async function ready() {
    if (!draft) return true;
    if (!draft.acceptedMemo) { reveal(); window.showToast?.('사진 행동 메모의 원아·관찰일·내용을 먼저 확인하고 저장해 주세요.'); return false; }
    if (saving || validating) return false;
    const c = draft;
    await window.DaycareMemo?.flush();
    if (draft !== c || !live(c.contextKey)) return false;
    const memo = window.DaycareMemo?.snapshot();
    if (!memo || memo.dirty || memo.baseText !== input()) { status('노션 메모 저장 완료 또는 다른 기기 충돌을 확인한 뒤 생성하세요.', true); return false; }
    return true;
  }
  function captureDraft() { return draft ? { ...draft } : null; }
  function restoreDraft(saved) {
    pause(); if (!saved || saved.contextKey !== key()) return;
    draft = { ...saved }; sourcePhotos = [...(state().photos || [])]; validating = true; render();
    const c = draft, ticket = epoch;
    digest(sourcePhotos).then(hash => {
      if (draft !== c || epoch !== ticket) return;
      validating = false;
      if (hash !== c.photoHash && !c.acceptedMemo) { missingPhotos = true; status('초안은 보관했지만 사진을 다시 확인해야 합니다. 원본 사진을 첨부하고 새로 만들어 주세요.', true); render(); }
      else { status(c.acceptedMemo ? '확인한 메모의 노션 저장 상태를 확인하세요.' : '복원된 사진 메모입니다. 원아·관찰일·문장을 다시 확인해 주세요.'); render(); }
    });
  }
  function discard() { pause(); window.DaycareRecords?.save(); }
  function init() {
    el('photoMemoCreate')?.addEventListener('click', create);
    el('photoMemoSave')?.addEventListener('click', confirm);
    el('photoMemoDiscard')?.addEventListener('click', discard);
    el('photoMemoText')?.addEventListener('input', () => { if (!draft || draft.acceptedMemo) return; draft.rawMemo = el('photoMemoText').value; el('photoMemoConfirmed').checked = false; render(); window.DaycareRecords.save(); });
    el('photoMemoConfirmed')?.addEventListener('change', render);
  }
  window.DaycarePhotoMemo = { create, confirm, ready, pause, contextChanged, photosChanged, memoChanged, captureDraft, restoreDraft, discard };
  document.addEventListener('DOMContentLoaded', init);
})();
