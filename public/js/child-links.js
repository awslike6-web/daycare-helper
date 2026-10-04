/** 원아 ID 선택·원문 발췌·검수 저장의 공통 화면. 이름으로 자동 저장하지 않는다. */
(() => {
  const el = id => document.getElementById(id);
  const request = (...args) => window.DaycareRecords.requestJson(...args);
  let controller, busy = false, contextKey = '', epoch = 0;
  let suggestionRaw = '', suggestions = [], unassigned = [], suggestionTimer, restoredSuggestions;
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
  // 이름의 부분 문자열을 일반 단어로 오인하지 않고 원문 그대로 후보를 만든다.
  function suggestMemo(rawMemo, children = []) {
    const aliases = new Map();
    for (const child of children) {
      const name = child.name?.trim(); if (!name || !child.id) continue;
      if (!aliases.has(name)) aliases.set(name, { ids: [], short: false });
      aliases.get(name).ids.push(child.id);
    }
    for (const child of children) if (/^[가-힣]{3,4}$/u.test(child.name?.trim() || '')) {
      const short = child.name.trim().slice(1);
      if (aliases.get(short)?.short === false) continue;
      if (!aliases.has(short)) aliases.set(short, { ids: [], short: true });
      aliases.get(short).ids.push(child.id);
    }
    const names = [...aliases].sort((a, b) => b[0].length - a[0].length);
    const escapePattern = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const nextSubject = names.length ? new RegExp('^\\s*(?:' + names.map(([name]) => escapePattern(name)).join('|') + ')(?:이가|이는|이|가|은|는)?(?=\\s|:|$)', 'u') : null;
    const fragments = [];
    for (const match of String(rawMemo).matchAll(/[^\r\n.!?。！？;；]+(?:[.!?。！？;；]+)?/gu)) {
      let start = 0;
      // 쉼표 뒤에 새 원아가 주어로 시작할 때만 나눠 키워드 메모의 혼입을 줄인다.
      for (let index = 0; index < match[0].length; index++) if (/[,，]/u.test(match[0][index]) && nextSubject?.test(match[0].slice(index + 1))) {
        fragments.push(match[0].slice(start, index + 1)); start = index + 1;
      }
      fragments.push(match[0].slice(start));
    }
    const rows = [], remaining = [], seen = new Set(); let omitted = 0;
    for (const fragment of fragments) {
      const excerpt = fragment.trim(); if (!excerpt) continue;
      const occupied = [], found = new Map();
      for (const [name, alias] of names) {
        let offset = 0, index;
        while ((index = excerpt.indexOf(name, offset)) !== -1) {
          offset = index + name.length;
          if (occupied.some(([start, end]) => index < end && offset > start)) continue;
          if (index && /[\p{L}\p{N}]/u.test(excerpt[index - 1])) continue;
          const after = excerpt.slice(offset);
          if (after && /^[\p{L}\p{N}]/u.test(after) && !/^(?:이가|이는|이랑|에게|한테|와|과|은|는|이|가|을|를|의|도|만|랑)(?=[^\p{L}\p{N}]|$)/u.test(after)) continue;
          occupied.push([index, offset]);
          const ids = [...new Set(alias.ids)];
          const tag = ids.length === 1 ? ids[0] : '?' + name;
          const previous = found.get(tag);
          found.set(tag, { candidateIds: ids, short: !!previous?.short || alias.short, name });
        }
      }
      if (!found.size) { if (!remaining.includes(excerpt)) remaining.push(excerpt); continue; }
      for (const candidate of found.values()) {
        const identity = JSON.stringify([excerpt, [...candidate.candidateIds].sort()]);
        if (seen.has(identity)) continue; seen.add(identity);
        if (rows.length >= 100) { omitted++; continue; }
        rows.push({ identity, baseExcerpt: excerpt, excerpt, childId: candidate.candidateIds.length === 1 ? candidate.candidateIds[0] : '',
          candidateIds: candidate.candidateIds, summary: '', confirmed: false, savedPageId: '',
          warning: [candidate.candidateIds.length > 1 ? '동명이인 · 원아 선택 필요' : '', candidate.short ? '이름 약칭 · 원아 확인' : '', found.size > 1 ? '여러 아이가 나온 문장 · 행동 역할 확인' : ''].filter(Boolean).join(' / ') });
      }
    }
    return { rows, unassigned: remaining, omitted };
  }
  function suggestionStatus(message, error = false) {
    const node = el('memoChildStatus'); if (node) { node.textContent = message; node.dataset.kind = error ? 'error' : 'info'; }
  }
  function suggestionCount() {
    const count = suggestions.filter(row => row.confirmed && !row.dismissed).length;
    if (el('memoChildSave')) { el('memoChildSave').disabled = busy || state().savingIndividual || state().savingNotion || !count; el('memoChildSave').textContent = `확인한 ${count}건 노션에 저장`; }
    if (el('memoChildCount')) el('memoChildCount').textContent = `${suggestions.filter(row => !row.dismissed).length}건 제안 · ${count}건 확인`;
  }
  function renderSuggestions() {
    const list = el('memoChildList'); if (!list) return;
    list.replaceChildren(); const h = window.DaycareHTML;
    const sorted = suggestions.map((row, index) => ({ row, index })).filter(({ row }) => !row.dismissed)
      .sort((a, b) => childLabel((state().children || []).find(c => c.id === a.row.childId) || { name: '원아 확인 필요', id: '' }).localeCompare(childLabel((state().children || []).find(c => c.id === b.row.childId) || { name: '원아 확인 필요', id: '' }), 'ko'));
    for (const { row, index } of sorted) {
      const node = document.createElement('article'); node.className = 'memo-child-card';
      const warning = row.childId ? row.warning?.replace('원아 선택 필요', '선택한 원아 재확인') : row.warning;
      node.innerHTML = h`<div class="child-link-row"><label>연결할 원아<select id="memo-child-${index}" aria-label="메모 제안 ${index + 1} 원아"></select></label><button type="button" class="action-btn" id="memo-dismiss-${index}">제안 제외</button></div><p class="memo-child-warning">${warning || '이름으로 찾은 후보 · 실제 행동 주체를 확인하세요'}</p><label>이 아이의 원문 근거<textarea id="memo-excerpt-${index}" rows="3">${row.excerpt}</textarea></label><details ${row.summary ? 'open' : ''}><summary>관찰 요약 추가 (선택)</summary><label>관찰 요약<textarea id="memo-summary-${index}" rows="2" placeholder="확인한 행동만 적으세요">${row.summary}</textarea></label></details><label class="child-link-confirm"><input type="checkbox" id="memo-confirm-${index}"> 이 원아의 행동과 원문을 확인했습니다</label><p id="memo-saved-${index}" class="memo-child-saved">${row.savedPageId ? '✓ 노션 저장 완료' : ''}</p>`;
      list.appendChild(node); options(el('memo-child-' + index), row.childId);
      const check = el('memo-confirm-' + index); check.checked = !!row.confirmed;
      for (const [prefix, field] of [['memo-child-', 'childId'], ['memo-excerpt-', 'excerpt'], ['memo-summary-', 'summary']]) {
        el(prefix + index).addEventListener('input', () => {
          row[field] = el(prefix + index).value; row.confirmed = false; row.savedPageId = ''; check.checked = false;
          el('memo-saved-' + index).textContent = ''; suggestionCount(); window.DaycareRecords.save();
        });
      }
      check.addEventListener('change', () => {
        try { if (check.checked) validate({ ...row, confirmed: true }, input()); row.confirmed = check.checked; }
        catch (error) { check.checked = false; row.confirmed = false; suggestionStatus(error.message, true); }
        suggestionCount(); window.DaycareRecords.save();
      });
      el('memo-dismiss-' + index).addEventListener('click', () => { row.dismissed = true; row.confirmed = false; renderSuggestions(); window.DaycareRecords.save(); });
    }
    const other = el('memoChildUnassignedList'); other?.replaceChildren();
    if (el('memoChildUnassignedCount')) el('memoChildUnassignedCount').textContent = `${unassigned.length}개 문장`;
    if (el('memoChildUnassigned')) el('memoChildUnassigned').hidden = !unassigned.length;
    for (const excerpt of unassigned.slice(0, 100)) {
      const node = document.createElement('div'); node.className = 'memo-unassigned-item';
      const text = document.createElement('p'); text.textContent = excerpt;
      const button = document.createElement('button'); button.type = 'button'; button.className = 'action-btn'; button.textContent = '원아를 직접 선택해 연결';
      button.addEventListener('click', () => {
        if (suggestions.filter(row => !row.dismissed).length >= 100) { suggestionStatus('한 번에 100건까지 제안합니다. 메모를 나누어 연결해 주세요.', true); return; }
        const identity = JSON.stringify([excerpt, []]);
        if (!suggestions.some(row => row.identity === identity && !row.dismissed)) suggestions.push({ identity, baseExcerpt: excerpt, excerpt, childId: '', candidateIds: [], summary: '', confirmed: false, warning: '이름 없는 문장 · 행동 주체 직접 확인' });
        unassigned = unassigned.filter(text => text !== excerpt); renderSuggestions(); window.DaycareRecords.save();
      });
      node.append(text, button); other?.appendChild(node);
    }
    suggestionCount();
  }
  function refreshSuggestions() {
    clearTimeout(suggestionTimer); const panel = el('memoChildSuggestions'); if (!panel) return;
    const visible = state().authenticated && state().selectedChild?.id === 'class-all' && !state().pendingDraft;
    panel.hidden = !visible; if (!visible) return;
    const raw = input(), changed = raw !== suggestionRaw;
    const previous = restoredSuggestions || suggestions; restoredSuggestions = null;
    const parsed = suggestMemo(raw, state().children);
    const old = new Map(previous.map(row => [row.identity, row]));
    suggestions = parsed.rows.map(row => {
      const saved = old.get(row.identity);
      if (!saved) return row;
      return { ...row, childId: (state().children || []).some(c => c.id === saved.childId) ? saved.childId : '',
        excerpt: saved.excerpt, summary: saved.summary, savedPageId: saved.savedPageId || '', dismissed: saved.dismissed,
        confirmed: !changed && !!saved.confirmed };
    });
    // 원문에서 사라진 교사의 수정본은 버리지 않고 다시 확인하도록 남긴다.
    const kept = [];
    for (const row of previous) if (!suggestions.some(candidate => candidate.identity === row.identity) && !row.dismissed && (row.summary || row.excerpt !== row.baseExcerpt || !row.candidateIds?.length || (row.childId && (row.candidateIds.length !== 1 || row.childId !== row.candidateIds[0])))) {
      kept.push({ ...row, confirmed: false, warning: raw.includes(row.excerpt.trim()) ? row.warning : '원문이 변경됨 · 근거를 다시 가져오세요' });
    }
    const overflow = Math.max(0, suggestions.length + kept.length - 100);
    suggestions = [...kept, ...suggestions].slice(0, 100);
    suggestionRaw = raw; unassigned = parsed.unassigned.filter(text => !suggestions.some(row => !row.dismissed && row.baseExcerpt === text));
    renderSuggestions();
    suggestionStatus(parsed.omitted + overflow ? `제안 100건을 넘었습니다. 남은 후보 ${parsed.omitted + overflow}건은 메모를 나누어 확인해 주세요.` : changed && previous.length ? '메모가 바뀌어 확인 체크를 해제했습니다. 원아와 문장을 다시 확인하세요.' : '원문 그대로 제안했습니다. 원아와 행동을 확인한 카드만 저장하세요.');
  }
  function memoChanged() {
    if (input() === suggestionRaw) return;
    suggestions.forEach((row, index) => { row.confirmed = false; if (el('memo-confirm-' + index)) el('memo-confirm-' + index).checked = false; });
    suggestionCount(); clearTimeout(suggestionTimer); suggestionTimer = setTimeout(refreshSuggestions, 400);
  }
  async function saveSuggestions() {
    if (busy || state().savingIndividual || state().savingNotion) return;
    const token = key(), ticket = epoch, rawMemo = input();
    const rows = suggestions.filter(row => row.confirmed && !row.dismissed).map(row => ({ ...row }));
    try {
      if (state().selectedChild?.id !== 'class-all' || suggestionRaw !== rawMemo) throw new Error('최신 반 전체 메모의 제안을 다시 확인해 주세요.');
      if (!rows.length) throw new Error('원아와 원문을 확인한 카드를 체크해 주세요.');
      for (const row of rows) validate(row, rawMemo);
    } catch (error) { suggestionStatus(error.message, true); return; }
    controller = new AbortController(); busy = true; const owner = state(); owner.savingIndividual = true; owner.individualAbortController = controller;
    suggestionCount(); let count = 0;
    const same = row => {
      const live = suggestions.find(candidate => candidate.identity === row.identity);
      return live && !live.dismissed && live.confirmed && ['childId', 'excerpt', 'summary'].every(field => live[field] === row[field]);
    };
    try {
      await window.DaycareRecords.save(); const source = await sourceFor(rawMemo);
      for (const row of rows) {
        if (!unchanged(token, rawMemo, ticket)) throw new Error('메모나 대상이 변경됐습니다. 남은 항목을 다시 확인하세요.');
        if (!same(row)) throw new Error('카드가 수정되거나 확인이 해제됐습니다. 남은 항목을 다시 확인하세요.');
        suggestionStatus(`원아별 저장 중 · ${count}/${rows.length}건 완료`);
        const saved = await request('/api/logs/link-child', { method: 'POST', body: { ...source, date: owner.selectedDate, childId: row.childId, excerpt: row.excerpt, summary: row.summary, confirmed: true }, signal: controller.signal, timeoutMs: 120000 });
        if (!unchanged(token, rawMemo, ticket)) return;
        if (!saved.success || saved.source !== 'notion' || !saved.pageId) throw new Error('노션 저장 완료 응답을 확인하지 못했습니다.');
        count++; owner.isHistoryLoaded = false;
        const live = suggestions.find(candidate => candidate.identity === row.identity);
        if (same(row)) { live.savedPageId = saved.pageId; live.confirmed = false; }
        else if (live) live.warning = '이전 검수본 저장 완료 · 저장 중 수정한 내용은 다시 확인·저장하세요';
        renderSuggestions(); await window.DaycareRecords.save();
      }
      suggestionStatus(`원아별 기록 ${count}건 저장 완료 · 저장 중 수정한 카드와 미확인 문장은 별도로 확인하세요.`);
    } catch (error) { if (key() === token && epoch === ticket && owner.authenticated) suggestionStatus(`${count}/${rows.length}건 저장 완료 · 남은 항목: ${error.message}`, true); }
    finally { if (epoch === ticket) { busy = false; controller = null; owner.savingIndividual = false; owner.individualAbortController = null; suggestionCount(); } }
  }
  function pause() {
    epoch++;
    clearTimeout(suggestionTimer); suggestions = []; unassigned = []; suggestionRaw = ''; restoredSuggestions = null;
    el('memoChildList')?.replaceChildren(); el('memoChildUnassignedList')?.replaceChildren();
    if (el('memoChildSuggestions')) el('memoChildSuggestions').hidden = true;
    if (state().individualAbortController === controller) { state().savingIndividual = false; state().individualAbortController = null; }
    controller?.abort(); controller = null; busy = false; contextKey = '';
    for (const id of ['childLinkExcerpt', 'childLinkSummary']) if (el(id)) el(id).value = '';
    if (el('childLinkConfirmed')) el('childLinkConfirmed').checked = false;
    el('childLinkChild')?.replaceChildren(); status('원아와 원문 근거를 확인한 뒤 연결합니다.');
    if (el('childLinkSave')) el('childLinkSave').disabled = false;
    if (el('btnSaveIndividualObs')) el('btnSaveIndividualObs').disabled = false;
  }
  function contextChanged() {
    if (contextKey === key()) { options(el('childLinkChild'), el('childLinkChild')?.value); refreshSuggestions(); return; }
    pause(); contextKey = key();
    options(el('childLinkChild'), state().selectedChild?.id === 'class-all' ? '' : state().selectedChild?.id);
    refreshSuggestions();
  }
  function captureDraft() {
    return { contextKey: key(), childId: el('childLinkChild')?.value || '', excerpt: el('childLinkExcerpt')?.value || '', summary: el('childLinkSummary')?.value || '', suggestions: { rawMemo: suggestionRaw, rows: suggestions.map(row => ({ ...row, confirmed: false })) } };
  }
  function restoreDraft(draft) {
    contextChanged(); if (draft?.contextKey !== key()) return;
    options(el('childLinkChild'), draft.childId);
    if (el('childLinkExcerpt')) el('childLinkExcerpt').value = draft.excerpt || '';
    if (el('childLinkSummary')) el('childLinkSummary').value = draft.summary || '';
    restoredSuggestions = (draft.suggestions?.rows || []).slice(0, 100).map(row => ({ ...row, confirmed: false }));
    if (input() || !draft.suggestions?.rawMemo) refreshSuggestions();
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
    busy = true; controller = new AbortController(); el('childLinkSave').disabled = true; suggestionCount();
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
    finally { if (key() === token && epoch === ticket) { busy = false; controller = null; el('childLinkSave').disabled = false; suggestionCount(); } }
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
    suggestionCount();
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
    finally { if (epoch === ticket) { current.savingIndividual = false; current.individualAbortController = null; if (key() === token) { controller = null; busy = false; button.disabled = false; suggestionCount(); } } }
  }
  document.addEventListener('DOMContentLoaded', () => {
    el('memoChildSave')?.addEventListener('click', saveSuggestions);
    el('childLinkSave')?.addEventListener('click', saveRaw);
    el('childLinkQuote')?.addEventListener('click', () => takeSelection(el('childLinkExcerpt'), el('childLinkConfirmed')));
    for (const id of ['childLinkChild', 'childLinkExcerpt', 'childLinkSummary']) el(id)?.addEventListener('input', () => { el('childLinkConfirmed').checked = false; window.DaycareRecords.save(); });
  });
  window.DaycareChildLinks = { contextChanged, pause, captureDraft, restoreDraft, renderIndividual, saveIndividual, suggestMemo, refreshSuggestions, memoChanged, saveSuggestions, refreshButtons: suggestionCount };
})();
