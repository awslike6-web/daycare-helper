/** 검수본 수집, 암호화 임시보관, 누적 기록 선택의 공통 파사드. */
(() => {
  const el = id => document.getElementById(id);
  const fieldText = element => typeof element?.value === 'string' && !element.isContentEditable ? element.value : element?.textContent || '';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  window.DaycareHTML = (parts, ...values) => parts.reduce((html, part, i) => html + part + (i < values.length ? escape(values[i]) : ''), '');
  let queue = Promise.resolve(), restoring = false, revision = 0;
  function setStatus(id, message, kind = 'info') {
    const node = el(id); if (!node) return;
    node.textContent = message; node.dataset.kind = kind; node.hidden = !message;
  }
  const saveStatus = (message, kind) => setStatus('notionSaveStatus', message, kind);
  const generationStatus = (message, kind) => setStatus('generationStatus', message, kind);
  function generationProgress() {
    const start = Date.now(); generationStatus('AI에 요청했습니다. 사진과 서식이 많으면 시간이 더 걸릴 수 있습니다.');
    const update = () => {
      if (el('loadingStepText')) el('loadingStepText').textContent = `AI 응답을 기다리는 중 · ${Math.floor((Date.now() - start) / 1000)}초 경과 · 입력 내용은 임시보관됩니다.`;
    };
    update(); return setInterval(update, 1000);
  }
  function availableFormats(data) {
    const keys = { kidsnote: 'kidsnote', class_daily_report: 'class_daily_report', observation: 'monthly_observation',
      hangroo_eval: 'hangroo_eval', daily_care: 'daily_care_log', counseling: 'parent_counseling', play_support: 'play_support' };
    return Object.entries(keys).filter(([, key]) => data[key]).map(([format]) => format);
  }
  // 통신이나 본문 수신이 멈춰도 대기를 종료한다. 쓰기는 자동 재전송하지 않는다.
  async function requestJson(path, { method = 'GET', body, signal, timeoutMs = 60000 } = {}) {
    const controller = new AbortController(); let timeout, onAbort;
    const cancelled = new Promise((_, reject) => {
      onAbort = () => { controller.abort(); reject(new DOMException('요청을 취소했습니다.', 'AbortError')); };
      signal?.addEventListener('abort', onAbort, { once: true });
      timeout = setTimeout(() => {
        controller.abort();
        const write = path === '/api/logs/save' || path === '/api/logs/link-child';
        reject(Object.assign(new Error(write ? '저장 응답 시간이 초과됐습니다. 내용은 임시보관됩니다. 재시도 전에 보관함에서 저장 여부를 확인해 주세요.' : '응답 시간이 초과됐습니다. 연결을 확인한 뒤 다시 시도해 주세요.'), { name: 'TimeoutError' }));
      }, timeoutMs);
    });
    try {
      if (signal?.aborted) onAbort();
      else return await Promise.race([cancelled, (async () => {
        const response = await fetch(path, { method, signal: controller.signal, ...(body !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
        const json = await response.json();
        if (!response.ok) throw Object.assign(new Error(json.error || '서버 연결을 확인해 주세요.'), { status: response.status });
        return json;
      })()]);
      return await cancelled;
    } catch (error) {
      if (error.name === 'TypeError') throw new Error(['/api/logs/save', '/api/logs/link-child'].includes(path) ? '저장 응답을 확인하지 못했습니다. 연결을 확인하고 재시도 전에 보관함을 조회해 주세요.' : '연결을 확인한 뒤 다시 시도해 주세요.');
      throw error;
    } finally { clearTimeout(timeout); signal?.removeEventListener('abort', onAbort); }
  }
  let saving = false, saveController;
  function cancelSave() {
    saveController?.abort(); window.state?.individualAbortController?.abort();
    window.DaycareNotion?.cancelPendingSave();
  }
  async function saveNotion({ checkDuplicateAndSave, extractCleanObsSummary }) {
    const state = window.state || {};
    if (saving || state.savingIndividual) { window.showToast?.('이전 저장을 처리하고 있습니다. 화면의 저장 상태를 확인해 주세요.'); return; }
    if (!state.lastResult) { saveStatus('저장할 생성 결과가 없습니다.', 'error'); return; }
    if (!el('reviewConfirmed')?.checked) {
      saveStatus('아직 저장되지 않았습니다. 위의 검수 확인을 체크한 뒤 저장을 눌러 주세요.', 'error');
      el('reviewConfirmed')?.focus(); window.showToast?.('실제 관찰 사실을 확인한 뒤 검수 확인을 체크해 주세요.'); return;
    }
    const result = structuredClone(capture());
    const rawMemo = el('rawMemoInput')?.value.trim() || result.rawMemo || '';
    const payload = { date: state.selectedDate, childId: state.selectedChild?.id, childName: state.selectedChild?.name || '학급 전체',
      className: state.className, teacherName: state.teacherName, activityArea: state.activityArea || '자유놀이',
      rawMemo, obsSummary: extractCleanObsSummary(result, rawMemo), result };
    const teacherId = state.teacherId;
    const buttons = [...document.querySelectorAll('[id$="NotionBtn"], #saveNotionBtn, #generateBtn')];
    const disabled = buttons.map(b => b.disabled);
    const controller = new AbortController(); saveController = controller;
    saving = true; state.savingNotion = true; buttons.forEach(b => { b.disabled = true; });
    window.DaycareChildLinks?.refreshButtons();
    try {
      await save();
      saveStatus('저장 전 같은 날짜의 기록을 확인하는 중입니다.');
      const saved = await checkDuplicateAndSave(payload.date, payload.childName, async choice => {
        if (controller.signal.aborted || !state.authenticated || state.teacherId !== teacherId || state.selectedDate !== payload.date || state.selectedChild?.id !== payload.childId) throw new Error('원아·날짜·교사가 변경됐습니다. 현재 작성본을 다시 확인해 주세요.');
        saveStatus('노션에 검수본과 원시 메모를 저장하는 중입니다.');
        const json = await requestJson('/api/logs/save', { method: 'POST', body: { ...payload, ...choice }, signal: controller.signal, timeoutMs: 120000 });
        if (!json.success || json.source !== 'notion' || !json.pageId) throw new Error(json.error || '노션 저장 완료 응답을 확인하지 못했습니다.');
        if (controller.signal.aborted || !state.authenticated || state.teacherId !== teacherId) return false;
        state.isHistoryLoaded = false;
        const unchanged = state.teacherId === teacherId && state.selectedDate === payload.date && state.selectedChild?.id === payload.childId &&
          JSON.stringify(capture()) === JSON.stringify(result) && (el('rawMemoInput')?.value.trim() || result.rawMemo || '') === rawMemo;
        if (unchanged) clear();
        else await save();
        const complete = result.citation?.historyOnly ? '기간 종합 서류 노션 저장 완료 · 선택 근거와 검수본을 보관했습니다. 관찰 원문은 별도로 유지됩니다.' : '노션 저장 완료 · 원시 메모와 검수본이 기록되었습니다. 보관함에서 확인할 수 있습니다.';
        saveStatus(unchanged ? complete : '노션 저장 완료 · 저장 중 추가한 수정은 아직 저장되지 않았습니다. 다시 검수·저장해 주세요.', unchanged ? 'success' : 'info');
        window.showToast?.('노션에 저장했습니다. 보관함에서 확인할 수 있습니다.'); return true;
      }, controller.signal);
      if (!saved && state.authenticated && state.teacherId === teacherId) saveStatus('저장을 취소했습니다. 작성 내용은 임시보관됩니다.');
    } catch (error) {
      if (state.authenticated && state.teacherId === teacherId) {
        await save(); saveStatus('저장 실패 · ' + error.message, 'error'); window.showToast?.('저장 실패: ' + error.message);
      }
    } finally {
      saving = false; saveController = null; state.savingNotion = false;
      window.DaycareChildLinks?.refreshButtons();
      buttons.forEach((b, i) => { b.disabled = b.id === 'generateBtn' && state.pendingDraft ? true : disabled[i]; });
    }
  }
  function capture() {
    const state = window.state || {};
    if (!state.lastResult) return null;
    const result = structuredClone(state.lastResult);
    const fields = {
      kidsnote: { content: 'kidsnoteContent' },
      class_daily_report: { reflection: 'repReflectionText', support_environment: 'repSupportEnvText', support_safety: 'repSupportSafetyText' },
      hangroo_eval: { development_summary: 'hangrooEvalSummaryText', support_plan: 'hangrooEvalSupportText' },
      daily_care_log: { play_summary: 'dailyPlaySummary', play_evaluation: 'dailyPlayEval', next_support_plan: 'dailyNextPlan' },
      parent_counseling: { daily_routine: 'counselRoutine', social_relations: 'counselSocial', development_feature: 'counselDev', counseling_opinion: 'counselOpinion' },
      play_support: { play_theme: 'playExtension', interest_cue: 'playMaterials', teacher_support: 'playTips' }
    };
    for (const [section, mapping] of Object.entries(fields)) if (result[section]) {
      for (const [key, id] of Object.entries(mapping)) if (el(id)) result[section][key] = fieldText(el(id));
    }
    if (result.class_daily_report) {
      if (result.class_daily_report.support) {
        result.class_daily_report.support.environment = fieldText(el('repSupportEnvText'));
        result.class_daily_report.support.safety = fieldText(el('repSupportSafetyText'));
      }
      // 표시된 안전/바깥놀이 합성 문장을 그대로 보존하여 복원 시 다시 합성하지 않는다.
      result.class_daily_report.reviewed_safety_text = fieldText(el('repSupportSafetyText'));
      result.class_daily_report.activities?.forEach((activity, index) => {
        for (const key of ['observation', 'learning_content']) {
          const node = document.querySelector?.(`[data-review-activity="${index}"] [data-review-field="${key}"]`);
          if (node) activity[key] = node.textContent;
        }
      });
    }
    if (result.kidsnote && el('kidsnoteTitle')) result.kidsnote.title = el('kidsnoteTitle').textContent;
    if (result.monthly_observation) {
      const month = result.monthly_observation;
      for (const [section, prefix] of [['play_obs', 'obs1'], ['daily_obs', 'obs2']]) if (month[section]) {
        month[section].behavior = el(prefix + 'BehaviorText')?.textContent || '';
        month[section].teacher_support = el(prefix + 'SupportText')?.textContent || '';
      }
      if (month.monthly_summary) {
        month.monthly_summary.development_summary = el('monthlySummaryDevText')?.textContent || '';
        month.monthly_summary.next_month_plan = el('monthlySummaryPlanText')?.textContent || '';
      }
    }
    if (Array.isArray(result.individual_observations)) result.individual_observations.forEach((item, i) => {
      if (el('indiv-obs-input-' + i)) item.summary = el('indiv-obs-input-' + i).value;
      if (el('indiv-obs-child-' + i)) item.child_id = el('indiv-obs-child-' + i).value || null;
      if (el('indiv-obs-excerpt-' + i)) item.source_excerpt = el('indiv-obs-excerpt-' + i).value;
    });
    state.lastResult = result;
    return result;
  }
  const storageKey = id => 'daycare_secure_draft_' + id;
  const encode = data => btoa(String.fromCharCode(...data));
  const decode = data => Uint8Array.from(atob(data), c => c.charCodeAt(0));
  async function cryptoKey(hex) {
    return crypto.subtle.importKey('raw', Uint8Array.from(hex.match(/../g), s => parseInt(s, 16)), 'AES-GCM', false, ['encrypt', 'decrypt']);
  }
  function save() {
    const state = window.state;
    if (!state?.authenticated || !state.draftKey || restoring || state.pendingDraft) return queue;
    if (!state.lastResult && !el('rawMemoInput')?.value.trim() && !state.photos?.length && !(state.evidenceSelectionActive && state.evidenceIds?.length)) return queue;
    capture();
    const id = state.teacherId, key = state.draftKey;
    const data = { timestamp: Date.now(), date: state.selectedDate, childId: state.selectedChild?.id,
      className: state.className, childName: state.selectedChild?.name, rawMemo: el('rawMemoInput')?.value || '',
      lastResult: state.lastResult, originalResult: state.originalResult, selectedFormats: state.selectedFormats,
      persona: state.persona, evidenceIds: state.evidenceIds || [], evidenceFrom: state.evidenceFrom, evidenceTo: state.evidenceTo,
      photos: state.photos || [], memoSync: window.DaycareMemo?.snapshot() || null, childLinkDraft: window.DaycareChildLinks?.captureDraft() || null };
    const current = revision;
    queue = queue.catch(() => {}).then(async () => {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const bytes = new TextEncoder().encode(JSON.stringify(data));
      const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await cryptoKey(key), bytes));
      // 큰 사진으로 저장 한도를 넘으면 메모·문서부터 보존하고 사진 재첨부를 안내한다.
      if (current !== revision) return;
      try { localStorage.setItem(storageKey(id), JSON.stringify({ iv: encode(iv), data: encodeLarge(cipher) })); }
      catch {
        if (data.photos.length) { data.photos = []; window.showToast?.('메모와 문서는 보관합니다. 사진은 다시 첨부해 주세요.');
          const reduced = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await cryptoKey(key), new TextEncoder().encode(JSON.stringify(data))));
          localStorage.setItem(storageKey(id), JSON.stringify({ iv: encode(iv), data: encodeLarge(reduced) }));
        } else throw new Error('기기 저장 공간이 부족합니다.');
      }
    }).catch(error => window.showToast?.('임시보관 실패: ' + error.message));
    return queue;
  }
  function encodeLarge(bytes) {
    let text = ''; for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(text);
  }
  function clear() {
    revision++; if (window.state?.teacherId) localStorage.removeItem(storageKey(window.state.teacherId));
    if (window.state) window.state.pendingDraft = false;
    if (el('rawMemoInput')) el('rawMemoInput').readOnly = false;
    if (el('generateBtn')) el('generateBtn').disabled = false;
    if (el('autoDraftRestoreBanner')) el('autoDraftRestoreBanner').style.display = 'none';
  }
  async function restore() {
    const state = window.state;
    if (!state?.authenticated || !state.draftKey) return;
    // 구 버전의 평문 메모는 로그인한 해당 학급에만 이관한다.
    try {
      const legacy = JSON.parse(localStorage.getItem('daycare_auto_draft') || 'null');
      if (legacy?.className === state.className && !localStorage.getItem(storageKey(state.teacherId))) {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await cryptoKey(state.draftKey), new TextEncoder().encode(JSON.stringify(legacy))));
        localStorage.setItem(storageKey(state.teacherId), JSON.stringify({ iv: encode(iv), data: encodeLarge(cipher) }));
        localStorage.removeItem('daycare_auto_draft'); localStorage.removeItem('daycare_draft_memo');
      }
      localStorage.removeItem('daycare_children_cache');
      ['wife', 'sister_in_law', 'sandbox'].forEach(key => { localStorage.removeItem('daycare_custom_pin_' + key); localStorage.removeItem('daycare_teacher_persona_' + key); });
      const saved = JSON.parse(localStorage.getItem(storageKey(state.teacherId)) || 'null'); if (!saved) return;
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(saved.iv) }, await cryptoKey(state.draftKey), decode(saved.data));
      const draft = JSON.parse(new TextDecoder().decode(plain));
      if (draft.className !== state.className) return;
      // 메모만 있는 초안은 노션 공유본과 비교하여 자동 복원한다. 문서·사진 초안은 기존 확인을 유지한다.
      if (!draft.lastResult && !draft.photos?.length && !draft.evidenceIds?.length && window.DaycareMemo) {
        const child = state.children.find(c => c.id === draft.childId);
        if (child || draft.childId === 'class-all') {
          if (child) window.ChildrenStore.selectChild(child);
          else window.ChildrenStore.renderChildrenChips('class-all');
          window.updateRecordDate?.(draft.date);
          const clean = draft.memoSync && draft.memoSync.rawMemo === draft.rawMemo && draft.memoSync.dirty === false;
          el('rawMemoInput').value = clean ? '' : draft.rawMemo || '';
          state.memoRestoredAt = draft.timestamp || 0;
          window.DaycareChildLinks?.restoreDraft(draft.childLinkDraft);
          return;
        }
      }
      const banner = el('autoDraftRestoreBanner'); if (!banner) return;
      state.pendingDraft = true; el('rawMemoInput').readOnly = true; el('generateBtn').disabled = true;
      if (el('autoDraftRestoreMeta')) el('autoDraftRestoreMeta').textContent = `${draft.date} · ${draft.childName || '우리 반'} 작성 내용이 보관되어 있습니다.`;
      banner.style.display = 'flex';
      el('btnRestoreAutoDraft').onclick = () => {
        restoring = true;
        const child = state.children.find(c => c.id === draft.childId);
        if (child) window.ChildrenStore.selectChild(child);
        else if (draft.childId === 'class-all') window.ChildrenStore.renderChildrenChips('class-all');
        else if (draft.childId && draft.childId !== 'class-all') { window.showToast?.('원아 소속이 변경되어 이전 초안을 복원할 수 없습니다.'); restoring = false; return; }
        window.updateRecordDate?.(draft.date);
        el('rawMemoInput').value = draft.rawMemo || ''; el('rawMemoInput').readOnly = false; el('generateBtn').disabled = false;
        state.memoRestoredAt = draft.timestamp || 0;
        Object.assign(state, { lastResult: draft.lastResult, originalResult: draft.originalResult, selectedFormats: draft.selectedFormats || state.selectedFormats,
          photos: draft.photos || [], evidenceIds: draft.evidenceIds || [], evidenceSelectionActive: !!draft.evidenceIds?.length, evidenceFrom: draft.evidenceFrom, evidenceTo: draft.evidenceTo || draft.date, persona: draft.persona || state.persona });
        if (draft.lastResult) window.AiEngine?.renderResults(draft.lastResult);
        window.DaycareChildLinks?.restoreDraft(draft.childLinkDraft);
        window.syncFormatChipsUI?.(); window.DaycareAuth?.updatePersonaUI();
        if (el('evidenceFrom')) el('evidenceFrom').value = draft.evidenceFrom || draft.date.slice(0, 7) + '-01';
        if (el('evidenceTo')) el('evidenceTo').value = state.evidenceTo;
        updateEvidenceCount(); window.renderPhotoPreviews?.();
        banner.style.display = 'none'; state.pendingDraft = false; restoring = false; window.DaycareChildLinks?.refreshSuggestions(); save(); window.DaycareMemo?.start();
      };
      el('btnDiscardAutoDraft').onclick = () => { clear(); window.DaycareMemo?.start(); };
    } catch { window.showToast?.('임시보관 내용을 읽을 수 없습니다. 기존 저장본은 보존합니다.'); }
  }
  function forget() {
    window.DaycareMemo?.forget();
    clear();
    window.showToast?.('이 기기의 등록과 임시보관을 해제했습니다.');
  }
  function invalidateResult() {
    const state = window.state || {};
    if (state.lastResult) save();
    state.currentAbortController?.abort();
    state.lastResult = null; state.originalResult = null;
    if (el('resultsSection')) el('resultsSection').style.display = 'none';
    if (el('reviewConfirmed')) el('reviewConfirmed').checked = false;
  }
  let evidenceSequence = 0;
  async function loadEvidence() {
    const state = window.state; const list = el('evidenceList'); if (!state?.authenticated || !list) return;
    const seq = ++evidenceSequence; const child = state.selectedChild?.id, teacher = state.teacherId, date = state.selectedDate;
    state.evidenceIds = []; state.evidenceSelectionActive = false; list.replaceChildren(); updateEvidenceCount();
    const from = el('evidenceFrom').value, to = el('evidenceTo').value;
    if (!from || !to || from > to || to > state.selectedDate) { window.showToast?.('참조 기간은 작성일 이전으로 선택해 주세요.'); return; }
    state.evidenceFrom = from; state.evidenceTo = to;
    let cursor, count = 0;
    try {
      do {
        const params = new URLSearchParams({ from, to, limit: '100', ...(child && child !== 'class-all' ? { childId: child } : {}), ...(cursor ? { cursor } : {}) });
        const json = await requestJson('/api/history?' + params);
        if (seq !== evidenceSequence || !state.authenticated || state.teacherId !== teacher || state.selectedChild?.id !== child || state.selectedDate !== date) return;
        json.data.forEach(log => {
          count++; const label = document.createElement('label'); label.className = 'evidence-row';
          const check = document.createElement('input'); check.type = 'checkbox'; check.value = log.id;
          if (log.periodSummary || log.needsChildReview || (child && child !== 'class-all' && (log.childIds?.length !== 1 || log.childId !== child))) check.disabled = true;
          check.onchange = () => {
            const ids = [...list.querySelectorAll('input:checked')].map(i => i.value);
            if (ids.length > 60) { check.checked = false; window.showToast?.('한 번에 최대 60건까지 선택할 수 있습니다.'); return; }
            state.evidenceIds = ids; state.evidenceSelectionActive = true; save(); updateEvidenceCount();
          };
          const text = document.createElement('span'); text.textContent = `${log.date} · ${log.child_name}${log.periodSummary ? ' · 기간 종합 서류 (원래 관찰 기록을 선택하세요)' : check.disabled ? ' · 원아별 연결 확인 필요 (선택 불가)' : ''} · 요약: ${log.summary || '(요약 없음)'}\n원시 메모: ${log.raw_memo || '(메모 없음)'}`;
          label.append(check, text); list.appendChild(label);
        }); cursor = json.nextCursor;
      } while (cursor && count < 500);
      if (!count) list.textContent = '이 기간에 저장된 관찰 기록이 없습니다. 오늘 메모만으로 작성할 수 있습니다.';
      if (cursor) list.append('최근 500건까지 표시했습니다. 기간을 좁혀 조회해 주세요.');
      updateEvidenceCount();
    } catch (error) { if (seq === evidenceSequence) list.textContent = '조회 실패: ' + error.message; }
  }
  function updateEvidenceCount() {
    const state = window.state || {};
    const period = state.evidenceFrom && state.evidenceTo ? ` · ${state.evidenceFrom} ~ ${state.evidenceTo}` : '';
    if (el('evidenceStatus')) el('evidenceStatus').textContent = `${state.evidenceIds?.length || 0}건 선택${period} · 선택한 실제 기록만 AI가 참고합니다.`;
  }
  function changeEvidencePeriod() {
    evidenceSequence++; const state = window.state; if (!state) return;
    state.evidenceIds = []; state.evidenceSelectionActive = false; state.evidenceFrom = el('evidenceFrom')?.value; state.evidenceTo = el('evidenceTo')?.value;
    if (el('evidenceList')) el('evidenceList').textContent = '기간이 바뀌었습니다. 기록 조회 후 사용할 기록을 다시 선택하세요.';
    updateEvidenceCount(); save();
  }
  function setEvidencePeriod(kind) {
    const date = window.state?.selectedDate; if (!date) return;
    const [year, month] = date.split('-').map(Number);
    let startMonth = kind.includes('Quarter') ? Math.floor((month - 1) / 3) * 3 : month - 1;
    if (kind.startsWith('previous')) startMonth -= kind.includes('Quarter') ? 3 : 1;
    const start = new Date(Date.UTC(year, startMonth, 1)).toISOString().slice(0, 10);
    const end = new Date(Date.UTC(year, startMonth + (kind.includes('Quarter') ? 3 : 1), 0)).toISOString().slice(0, 10);
    el('evidenceFrom').value = start; el('evidenceTo').value = end > date ? date : end;
    changeEvidencePeriod();
  }
  function initEvidence() {
    const date = window.state?.selectedDate; if (!date || !el('evidenceFrom')) return;
    el('evidenceFrom').value = date.slice(0, 7) + '-01'; el('evidenceTo').value = date; el('evidenceTo').max = date;
    window.state.evidenceFrom = el('evidenceFrom').value; window.state.evidenceTo = date;
    for (const id of ['evidenceFrom', 'evidenceTo']) el(id).onchange = changeEvidencePeriod;
    for (const kind of ['currentMonth', 'previousMonth', 'currentQuarter', 'previousQuarter']) {
      const button = el('evidence-' + kind); if (button) button.onclick = () => setEvidencePeriod(kind);
    }
    el('loadEvidenceBtn').onclick = loadEvidence; updateEvidenceCount();
  }
  function resetEvidence() {
    evidenceSequence++; if (window.state) { window.state.evidenceIds = []; window.state.evidenceSelectionActive = false; }
    el('evidenceList')?.replaceChildren(); initEvidence();
  }
  function restoreEvidence(citation) {
    const state = window.state; if (!state || !citation?.sources?.length) return;
    evidenceSequence++; state.evidenceIds = citation.sources.map(source => source.id); state.evidenceSelectionActive = true;
    state.evidenceFrom = citation.from || citation.sources.map(source => source.date).sort()[0];
    state.evidenceTo = citation.to || state.selectedDate;
    if (el('evidenceFrom')) el('evidenceFrom').value = state.evidenceFrom;
    if (el('evidenceTo')) el('evidenceTo').value = state.evidenceTo;
    if (el('evidenceList')) el('evidenceList').textContent = '저장본의 선택 근거를 복원했습니다. 다시 조회하면 사용할 기록을 새로 선택합니다.';
    updateEvidenceCount();
  }
  document.addEventListener('input', event => {
    if (event.target.id === 'reviewConfirmed') return;
    if (event.target.closest('#resultsSection, #rawMemoInput')) {
      if (el('reviewConfirmed')) el('reviewConfirmed').checked = false;
      if (window.state?.lastResult) saveStatus('수정한 내용은 아직 노션에 저장되지 않았습니다. 검수 확인 후 저장해 주세요.');
    }
    if (event.target.closest('#resultsSection, #rawMemoInput, #personaSampleNote')) save();
  });
  document.addEventListener('click', event => { if (event.target.closest('#resultsSection')) capture(); }, true);
  window.addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(); });
  // 인쇄에서는 현재 열어 둔 서식의 검수 문장을 줄바꿈까지 보존한다.
  window.addEventListener('beforeprint', () => {
    el('daycarePrintOutput')?.remove(); if (!window.state?.authenticated) return;
    const saved = window.state.printHistory;
    if (saved) {
      const copy = document.createElement('div'); copy.id = 'daycarePrintOutput'; copy.className = 'daycare-print-output'; copy.style.whiteSpace = 'pre-wrap';
      copy.textContent = `${saved.date} · ${saved.child_name}\n\n${saved.content || saved.summary || ''}\n\n원시 메모\n${saved.memo || ''}`;
      document.body.appendChild(copy); return;
    }
    if (!window.state.lastResult) return;
    capture();
    const targets = { class_daily_report: 'officialReportSheet', observation: 'officialObsSheet', hangroo_eval: 'officialHangrooEvalSheet',
      kidsnote: 'kidsnoteCard', daily_care: 'dailyCareCard', counseling: 'counselingCard', play_support: 'playSupportCard' };
    const active = document.querySelector('.result-tab-btn.active')?.dataset.tab; const original = el(targets[active]); if (!original) return;
    const copy = original.cloneNode(true); copy.id = 'daycarePrintOutput'; copy.className = 'daycare-print-output';
    copy.querySelectorAll('textarea, input').forEach((node, index) => {
      const text = document.createElement('div'); text.textContent = original.querySelectorAll('textarea, input')[index].value;
      text.style.cssText = 'white-space:pre-wrap;font:inherit;line-height:1.6'; node.replaceWith(text);
    });
    copy.querySelectorAll('button, .kidsnote-refine-box, #kidsnoteRefineBox').forEach(node => node.remove());
    document.body.appendChild(copy);
  });
  window.addEventListener('afterprint', () => { el('daycarePrintOutput')?.remove(); if (window.state) window.state.printHistory = null; });
  const monthlyOptions = () => ({ targetMonth: el('monthlyObsTargetMonth')?.value || window.state?.evidenceTo?.slice(0, 7) || window.state?.selectedDate?.slice(0, 7),
    date1: el('monthlyObsDate1')?.value || '', date2: el('monthlyObsDate2')?.value || '',
    area1: el('monthlyObsArea1')?.value || '', area2: el('monthlyObsArea2')?.value || '' });
  window.DaycareRecords = { capture, save, clear, restore, forget, invalidateResult, initEvidence, resetEvidence, escape, monthlyOptions,
    saveNotion, cancelSave, requestJson, saveStatus, generationStatus, generationProgress, availableFormats, restoreEvidence };
})();
