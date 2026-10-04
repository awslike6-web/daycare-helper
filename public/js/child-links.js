/** 원아 ID 선택·원문 발췌·검수 저장의 공통 화면. 이름으로 자동 저장하지 않는다. */
(() => {
  const el = id => document.getElementById(id);
  const request = (...args) => window.DaycareRecords.requestJson(...args);
  let controller, busy = false, contextKey = '', epoch = 0;
  const state = () => window.state || {};
  const key = () => [state().teacherId, state().selectedDate, state().selectedChild?.id || 'class-all'].join('/');
  const input = () => el('rawMemoInput')?.value || '';
  function status(text, error = false) {
    const node = el('childLinkStatus'); if (node) { node.textContent = text; node.dataset.kind = error ? 'error' : 'info'; }
  }
  function childLabel(c) {
    const duplicate = (state().children || []).filter(x => x.name === c.name).length > 1;
    return c.name + (c.age ? ' · ' + c.age : '') + (duplicate ? ' · 구분 ' + c.id.slice(-6) : '');
  }
  function options(select, selected = '') {
    if (!select) return;
    select.replaceChildren(new Option('원아를 확인해 선택하세요', ''), ...(state().children || []).map(c => new Option(childLabel(c), c.id)));
    if ([...select.options].some(o => o.value === selected)) select.value = selected;
  }
  function pause() {
    epoch++;
    if (state().individualAbortController === controller) { state().savingIndividual = false; state().individualAbortController = null; }
    controller?.abort(); controller = null; busy = false; contextKey = '';
    for (const id of ['childLinkExcerpt', 'childLinkSummary']) if (el(id)) el(id).value = '';
    if (el('childLinkConfirmed')) el('childLinkConfirmed').checked = false;
    el('childLinkChild')?.replaceChildren(); status('원아와 원문 근거를 확인한 뒤 연결합니다.');
    if (el('childLinkSave')) el('childLinkSave').disabled = false;
    if (el('btnSaveIndividualObs')) el('btnSaveIndividualObs').disabled = false;
  }
  function contextChanged() {
    if (contextKey === key()) { options(el('childLinkChild'), el('childLinkChild')?.value); return; }
    pause(); contextKey = key();
    options(el('childLinkChild'), state().selectedChild?.id === 'class-all' ? '' : state().selectedChild?.id);
  }
  function captureDraft() {
    return { contextKey: key(), childId: el('childLinkChild')?.value || '', excerpt: el('childLinkExcerpt')?.value || '', summary: el('childLinkSummary')?.value || '' };
  }
  function restoreDraft(draft) {
    contextChanged(); if (draft?.contextKey !== key()) return;
    options(el('childLinkChild'), draft.childId);
    if (el('childLinkExcerpt')) el('childLinkExcerpt').value = draft.excerpt || '';
    if (el('childLinkSummary')) el('childLinkSummary').value = draft.summary || '';
  }
  async function sourceFor(rawMemo) {
    const current = state(), params = new URLSearchParams({ date: current.selectedDate });
    if (current.selectedChild?.id && current.selectedChild.id !== 'class-all') params.set('childId', current.selectedChild.id);
    // 오늘 노션 원문을 확보한 뒤 같은 내용을 발췌한다. 충돌은 자동 덮어쓰지 않는다.
    window.DaycareMemo?.changed(); await window.DaycareMemo?.flush();
    const source = await request('/api/memo?' + params, { signal: controller.signal });
    if (!source.pageId || source.rawMemo !== rawMemo) throw new Error('원시 메모가 아직 노션 저장본과 다릅니다. 저장 완료 또는 충돌 확인 후 다시 연결해 주세요.');
    return { sourceId: source.pageId, sourceRawMemo: rawMemo };
  }
  function validate(row, rawMemo) {
    if (!(state().children || []).some(c => c.id === row.childId)) throw new Error('연결할 원아를 선택해 주세요.');
    if (!row.excerpt.trim() || !rawMemo.includes(row.excerpt.trim())) throw new Error('근거 문장은 원시 메모에서 그대로 가져와 주세요.');
    if (!row.confirmed) throw new Error('이 문장이 선택한 아이의 관찰인지 확인을 체크해 주세요.');
  }
  function unchanged(token, rawMemo, ticket) { return state().authenticated && key() === token && epoch === ticket && input() === rawMemo && !controller?.signal.aborted; }
  async function saveRaw() {
    if (busy || state().savingIndividual || state().savingNotion) return;
    const token = key(), ticket = epoch, rawMemo = input(), row = { ...captureDraft(), confirmed: !!el('childLinkConfirmed')?.checked };
    try { validate(row, rawMemo); } catch (error) { status(error.message, true); return; }
    busy = true; controller = new AbortController(); el('childLinkSave').disabled = true;
    try {
      await window.DaycareRecords.save(); status('노션 원문을 확인하고 원아 기록에 연결하는 중입니다.');
      const source = await sourceFor(rawMemo);
      if (!unchanged(token, rawMemo, ticket)) throw new Error('메모 또는 대상이 변경됐습니다. 다시 확인해 주세요.');
      const saved = await request('/api/logs/link-child', { method: 'POST', body: { ...source, childId: row.childId, date: state().selectedDate, excerpt: row.excerpt, summary: row.summary, confirmed: true }, signal: controller.signal, timeoutMs: 120000 });
      if (!unchanged(token, rawMemo, ticket)) return;
      if (!saved.success || saved.source !== 'notion') throw new Error('노션 저장 응답을 확인하지 못했습니다.');
      state().isHistoryLoaded = false;
      const name = (state().children || []).find(c => c.id === saved.childId)?.name || '원아';
      const changed = ['childId', 'excerpt', 'summary'].some(field => captureDraft()[field] !== row[field]);
      status(`${name}의 원시 메모 연결 완료 · ${changed ? '저장 중 수정한 연결은 다시 확인·저장해 주세요.' : '보관함과 개인 근거 조회에서 확인할 수 있습니다.'}`);
      el('childLinkConfirmed').checked = false;
      await window.DaycareRecords.save();
    } catch (error) { if (key() === token && epoch === ticket && state().authenticated) status('연결 실패 · ' + error.message, true); }
    finally { if (key() === token && epoch === ticket) { busy = false; controller = null; el('childLinkSave').disabled = false; } }
  }
  function renderIndividual(data) {
    const card = el('individualObsCard'), list = el('individualObsList'); if (!card || !list) return;
    list.replaceChildren(); const items = Array.isArray(data.individual_observations) ? data.individual_observations : [];
    card.style.display = items.length ? 'block' : 'none';
    items.forEach((item, index) => {
      const node = document.createElement('div'); node.className = 'individual-obs-item'; node.id = 'indiv-obs-item-' + index;
      const h = window.DaycareHTML;
      node.innerHTML = h`<div class="child-link-row"><label>연결할 원아<select id="indiv-obs-child-${index}" aria-label="개별 요약 ${index + 1} 원아"></select></label><span id="indiv-obs-status-${index}" hidden>✓ 저장됨</span></div><small>${item.child_name || '원아 미확인'} · ${item.standard_area || '영역 확인 필요'}</small><label>원시 메모 근거<textarea id="indiv-obs-excerpt-${index}" rows="2" placeholder="이 아이의 행동이 나타난 원문 부분을 그대로 붙여 넣으세요">${item.source_excerpt || ''}</textarea></label><button type="button" id="indiv-obs-quote-${index}" class="action-btn">위 메모에서 선택한 부분 가져오기</button><label>검수한 관찰 요약<textarea id="indiv-obs-input-${index}" rows="2">${item.summary || item.observation_summary || ''}</textarea></label><label class="child-link-confirm"><input type="checkbox" class="indiv-obs-checkbox indiv-obs-check" data-idx="${index}"> 선택한 원아의 행동과 근거를 확인했습니다</label>`;
      list.appendChild(node); options(el('indiv-obs-child-' + index), item.child_id || '');
      const check = node.querySelector('.indiv-obs-checkbox');
      check.checked = false;
      check.addEventListener('change', () => { node.classList.toggle('active', check.checked); window.updateSelectedIndivObsCount?.(); });
      for (const id of ['indiv-obs-child-', 'indiv-obs-excerpt-', 'indiv-obs-input-']) el(id + index).addEventListener('input', () => {
        check.checked = false; item.saved_page_id = null; el('indiv-obs-status-' + index).hidden = true;
        window.updateSelectedIndivObsCount?.(); window.DaycareRecords.save();
      });
      el('indiv-obs-quote-' + index).addEventListener('click', () => takeSelection(el('indiv-obs-excerpt-' + index), check));
    });
    window.updateSelectedIndivObsCount?.();
  }
  function takeSelection(target, check) {
    const raw = el('rawMemoInput'); const quote = raw.value.slice(raw.selectionStart, raw.selectionEnd);
    if (!quote.trim()) { window.showToast?.('원시 메모에서 해당 아이의 문장을 먼저 선택해 주세요. 직접 복사해 붙여 넣어도 됩니다.'); return; }
    target.value = quote; check.checked = false;
    if (el('reviewConfirmed')) el('reviewConfirmed').checked = false;
    window.DaycareRecords.save(); window.updateSelectedIndivObsCount?.();
  }
  async function saveIndividual() {
    const current = state(); if (busy || current.savingIndividual || current.savingNotion) return;
    if (!el('reviewConfirmed')?.checked) { window.DaycareRecords.saveStatus('관찰 요약을 검수하고 검수 확인을 체크해 주세요.', 'error'); return; }
    const result = window.DaycareRecords.capture(), token = key(), ticket = epoch, rawMemo = result?.rawMemo || '';
    const checked = [...document.querySelectorAll('.indiv-obs-checkbox:checked')];
    const rows = checked.map(check => {
      const i = Number(check.dataset.idx), item = result.individual_observations[i];
      return { index: i, childId: el('indiv-obs-child-' + i).value, excerpt: el('indiv-obs-excerpt-' + i).value,
        summary: el('indiv-obs-input-' + i).value, confirmed: check.checked, standardArea: item.standard_area || '', activityArea: item.activity || '' };
    });
    try {
      if (!rows.length) throw new Error('원아와 근거를 확인한 항목을 선택해 주세요.');
      if (input() !== rawMemo) throw new Error('생성 이후 원시 메모가 변경됐습니다. 최신 메모로 다시 생성해 주세요.');
      for (const row of rows) validate(row, rawMemo);
    } catch (error) { window.DaycareRecords.saveStatus(error.message, 'error'); return; }
    controller = new AbortController(); current.individualAbortController = controller; current.savingIndividual = true; busy = true;
    const button = el('btnSaveIndividualObs'); button.disabled = true; let count = 0;
    try {
      await window.DaycareRecords.save(); const source = await sourceFor(rawMemo);
      for (const row of rows) {
        if (!unchanged(token, rawMemo, ticket) || !el('reviewConfirmed')?.checked || JSON.stringify(window.DaycareRecords.capture().individual_observations) !== JSON.stringify(result.individual_observations)) throw new Error('메모·원아·검수 내용이 변경됐습니다. 미저장 항목을 다시 확인해 주세요.');
        window.DaycareRecords.saveStatus(`원아별 근거 저장 중 · ${count}/${rows.length}건 완료`);
        const saved = await request('/api/logs/link-child', { method: 'POST', body: { ...source, ...row, date: current.selectedDate }, signal: controller.signal, timeoutMs: 120000 });
        if (!unchanged(token, rawMemo, ticket)) return;
        if (!saved.success || saved.source !== 'notion') throw new Error('노션 저장 응답을 확인하지 못했습니다.');
        count++; const item = state().lastResult.individual_observations[row.index];
        item.saved_page_id = saved.pageId; result.individual_observations[row.index].saved_page_id = saved.pageId;
        el('indiv-obs-status-' + row.index).hidden = false; current.isHistoryLoaded = false;
        await window.DaycareRecords.save();
      }
      const changed = !el('reviewConfirmed')?.checked || JSON.stringify(window.DaycareRecords.capture().individual_observations) !== JSON.stringify(result.individual_observations);
      window.DaycareRecords.saveStatus(`원아별 근거 ${count}건 연결 완료 · ${changed ? '저장 중 수정한 내용은 다시 확인·저장해 주세요.' : '발췌문과 검수 요약이 노션에 저장됐습니다.'}`, changed ? 'info' : 'success');
    } catch (error) { if (key() === token && epoch === ticket && current.authenticated) window.DaycareRecords.saveStatus(`원아별 연결 ${count}/${rows.length}건 완료 · 미저장 항목: ${error.message}`, 'error'); }
    finally { if (epoch === ticket) { current.savingIndividual = false; current.individualAbortController = null; if (key() === token) { controller = null; busy = false; button.disabled = false; } } }
  }
  document.addEventListener('DOMContentLoaded', () => {
    el('childLinkSave')?.addEventListener('click', saveRaw);
    el('childLinkQuote')?.addEventListener('click', () => takeSelection(el('childLinkExcerpt'), el('childLinkConfirmed')));
    for (const id of ['childLinkChild', 'childLinkExcerpt', 'childLinkSummary']) el(id)?.addEventListener('input', () => { el('childLinkConfirmed').checked = false; window.DaycareRecords.save(); });
  });
  window.DaycareChildLinks = { contextChanged, pause, captureDraft, restoreDraft, renderIndividual, saveIndividual };
})();
