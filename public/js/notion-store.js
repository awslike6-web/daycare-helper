/**
 * 📦 daycare-helper Data & Notion Bridge Core (notion-store.js)
 * 2026 Modern Vanilla JS (ES2024+)
 * 
 * 통합 구성:
 *  - 원아 데이터 저장소 및 마스킹/가명화 가드 (구 children-store.js)
 *  - 노션 DB 직결 저장 및 헬스체크 / 중복 감지 (구 notion-bridge.js)
 *  - 지난 보육 기록 보관함 모달 및 과거 데이터 1초 복원 (구 history-viewer.js)
 */

(function () {
  const safeHTML = (...args) => window.DaycareHTML(...args);
  const showToast = (msg) => (typeof window.showToast === 'function' ? window.showToast(msg) : console.log(msg));
  const requestJson = (...args) => window.DaycareRecords.requestJson(...args);

  // ============================================================================
  // 1. 개인정보 실명 마스킹 및 안전 가명화 가드 (Privacy Guard)
  // ============================================================================
  function maskChildNameInText(text, realName, fakeName = '아동A') {
    if (!text || !realName) return text || '';
    const escaped = realName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp(escaped, 'g'), fakeName);
  }

  function unmaskChildNameInText(text, realName, fakeName = '아동A') {
    if (!text || !realName) return text || '';
    const escaped = fakeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp(escaped, 'g'), realName);
  }

  function maskPayload(payload, realName) {
    if (!payload || !realName) return { maskedPayload: payload, maskMap: {} };
    const fakeName = '아동A';
    const copy = JSON.parse(JSON.stringify(payload));

    if (copy.childName) copy.childName = fakeName;
    if (copy.rawMemo) copy.rawMemo = maskChildNameInText(copy.rawMemo, realName, fakeName);
    if (copy.childTraits) copy.childTraits = maskChildNameInText(copy.childTraits, realName, fakeName);

    return {
      maskedPayload: copy,
      maskMap: { [fakeName]: realName }
    };
  }

  function unmaskResult(resultData, realName) {
    if (!resultData || !realName) return resultData;
    const jsonStr = JSON.stringify(resultData);
    const unmaskedStr = jsonStr.replace(/아동A/g, realName);
    try {
      return JSON.parse(unmaskedStr);
    } catch (e) {
      return resultData;
    }
  }

  // ============================================================================
  // 2. 원아 목록 관리 및 퀵 선택 칩 (Children Store)
  // ============================================================================
  async function loadChildren(selectedId = null) {
    const state = window.state || {};
    if (!state.authenticated) { state.children = []; return; }
    const teacherId = state.teacherId;
    const json = await requestJson('/api/children');
    if (!state.authenticated || state.teacherId !== teacherId) return;
    state.children = json.children || [];
    renderChildrenChips(selectedId);
  }

  function renderChildrenChips(keepSelectedId = null) {
    const state = window.state || {};
    const container = document.getElementById('childScrollContainer') || document.getElementById('childrenChipsList');
    if (!container) return;

    container.innerHTML = '';

    const curClass = state.className || '';
    const visibleChildren = (state.children || []).filter(c => (c.className || c.childClass) === curClass);

    // 0. 학급 전체 공통 일지 가상 원아 칩 (보육일지 전용)
    const allChild = {
      id: 'class-all',
      name: `${curClass} 전체`,
      age: curClass.includes('사랑') ? '만 0세' : '만 2세',
      gender: '공통',
      traits: '학급 영유아 전체 공통 놀이 흐름 및 일과',
      isClassAll: true
    };

    const chipsToRender = [allChild, ...visibleChildren];

    chipsToRender.forEach(child => {
      const chip = document.createElement('div');
      chip.className = 'child-chip';
      chip.dataset.id = child.id;

      const isCurrentSelected = child.id === (keepSelectedId || state.selectedChild?.id);

      if (isCurrentSelected) {
        chip.classList.add('active');
        if (state.selectedChild?.id !== child.id) window.DaycareRecords?.resetEvidence();
        state.selectedChild = child;
      }

      const avatar = child.isClassAll ? '🌱' : (child.gender === '여' ? '👧' : '🧒');
      const label = !child.isClassAll && chipsToRender.filter(c => c.name === child.name).length > 1 ? `${child.name} · ${child.age || '연령 확인'} · 구분 ${child.id.slice(-6)}` : child.name;
      chip.innerHTML = safeHTML`
        <span class="child-avatar">${avatar}</span>
        <span>${label}</span>
      `;

      chip.onclick = (e) => {
        e.preventDefault();
        selectChild(child);
      };

      container.appendChild(chip);
    });

    // 기본 선택 (선택된 아이가 없거나 현재 학급에 맞지 않으면 첫 번째 아이 자동 선택)
    if (!state.selectedChild || !chipsToRender.some(c => c.id === state.selectedChild.id)) {
      if (chipsToRender.length > 0) {
        selectChild(chipsToRender[0]);
      }
    } else {
      selectChild(state.selectedChild);
    }
  }

  function selectChild(child) {
    if (!child) return;
    const state = window.state || {};
    if (state.selectedChild?.id !== child.id) {
      window.DaycareRecords?.invalidateResult(); window.DaycareRecords?.resetEvidence();
      window.DaycareMemo?.beforeContextChange();
    }
    state.selectedChild = child;
    window.DaycareChildLinks?.contextChanged();

    const chips = document.querySelectorAll('.child-chip');
    chips.forEach(c => c.classList.toggle('active', c.dataset.id === child.id));

    // 선택 원아 카드 UI 동기화
    const selectedChildAge = document.getElementById('selectedChildAge');
    const classFilterText = document.getElementById('classFilterText');
    const childTraitsText = document.getElementById('childTraitsText');
    const childParentText = document.getElementById('childParentText');
    const childAlertText = document.getElementById('childAlertText');

    if (selectedChildAge) selectedChildAge.textContent = child.age || '연령 확인 필요';
    if (classFilterText) classFilterText.textContent = `${state.className || '우리 반'} 전용`;
    if (childTraitsText) childTraitsText.textContent = `💡 성향: ${child.traits || '특이사항 없음'}`;

    if (childParentText) {
      if (child.parentStyle) {
        childParentText.textContent = `💌 소통 맞춤: ${child.parentStyle}`;
        childParentText.style.display = 'block';
      } else {
        childParentText.style.display = 'none';
      }
    }

    if (childAlertText) {
      if (child.allergies && child.allergies !== '없음') {
        childAlertText.textContent = `⚠️ 주의: ${child.allergies}`;
        childAlertText.style.display = 'block';
      } else {
        childAlertText.style.display = 'none';
      }
    }

    // 학급 전체 선택 시 보육일지 서식 우선 추천
    if (child.isClassAll) {
      if (window.AiEngine && typeof window.AiEngine.switchResultTab === 'function') {
        window.AiEngine.switchResultTab('class_daily_report');
      }
    }

    showToast(`👶 [${child.name}] 원아가 선택되었습니다.`);
  }

  // ============================================================================
  // 3. 원아 추가/수정 모달 제어
  // ============================================================================
  function openChildModal(mode = 'add', childData = null) {
    const modal = document.getElementById('childManageModal');
    const titleEl = document.getElementById('childModalTitle');
    const form = document.getElementById('childManageForm');
    if (!modal || !form) return;

    form.reset();
    document.getElementById('manageChildId').value = childData?.id || '';
    document.getElementById('manageChildClass').value = childData?.className || (window.state?.className || '사랑반');

    if (mode === 'edit' && childData) {
      if (titleEl) titleEl.textContent = `✏️ ${childData.name} 원아 정보 수정`;
      document.getElementById('manageChildName').value = childData.name || '';
      document.getElementById('manageChildAge').value = childData.age || '만 2세';
      document.getElementById('manageChildTraits').value = childData.traits || '';
      document.getElementById('manageChildParentStyle').value = childData.parentStyle || '';
      document.getElementById('manageChildAllergies').value = childData.allergies || '';
    } else {
      if (titleEl) titleEl.textContent = '👶 새 원아 등록';
    }

    modal.style.display = 'flex';
  }

  async function handleChildFormSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('manageChildId').value;
    const payload = {
      name: document.getElementById('manageChildName').value.trim(),
      className: document.getElementById('manageChildClass').value.trim(),
      age: document.getElementById('manageChildAge').value.trim(),
      traits: document.getElementById('manageChildTraits').value.trim(),
      parentStyle: document.getElementById('manageChildParentStyle').value.trim(),
      allergies: document.getElementById('manageChildAllergies').value.trim()
    };

    if (!payload.name) {
      showToast('원아 이름을 입력해주세요.');
      return;
    }

    try {
      const url = id ? `/api/children/${id}` : '/api/children';
      const method = id ? 'PUT' : 'POST';
      await requestJson(url, { method, body: payload, timeoutMs: 120000 });

      showToast(`🎉 [${payload.name}] 원아 정보가 성공적으로 저장되었습니다!`);
      const modal = document.getElementById('childManageModal');
      if (modal) modal.style.display = 'none';
      await loadChildren(id || null);
    } catch (err) {
      showToast(`❌ 원아 저장 오류: ${err.message}`);
    }
  }

  // ============================================================================
  // 4. 노션 DB 통신 및 헬스체크 (Notion Bridge)
  // ============================================================================
  async function checkHealth() {
    const badge = document.getElementById('notionStatusBadge');
    const text = document.getElementById('notionStatusText');
    try {
      const data = await requestJson('/api/connection');
      if (data.status === 'ok') {
        if (badge) { badge.className = 'badge badge-connected'; }
        if (text) { text.textContent = '노션 정상 연동'; }
      } else {
        throw new Error('노션 미연결');
      }
    } catch (e) {
      if (badge) { badge.className = 'badge badge-error'; }
      if (text) { text.textContent = '노션 점검 필요'; }
    }
  }

  // 노션 일지 중복 저장 확인 및 처리
  let pendingSaveAction = null;

  function finishDuplicate(choice = null) {
    const callback = pendingSaveAction; pendingSaveAction = null;
    const modal = document.getElementById('duplicateLogModal'); if (modal) modal.style.display = 'none';
    callback?.(choice);
  }

  async function checkDuplicateAndSave(date, childName, saveCallback, signal) {
    try {
      const childId = window.state?.selectedChild?.id;
      const params = new URLSearchParams({ from: date, to: date, limit: '100', ...(childId && childId !== 'class-all' ? { childId } : {}) });
      const json = await requestJson('/api/history?' + params, { signal });
      if (signal?.aborted) return false;
      const citation = window.state?.lastResult?.citation;
      const existing = (json.data || []).find(l => !l.memoOnly && !l.linkedChildMemo && !l.needsChildReview &&
        !!l.periodSummary === !!citation?.historyOnly && (!citation?.historyOnly || l.citationSummary?.includes(`참조 기간 ${citation.from || '시작 제한 없음'} ~ ${citation.to} ·`)) &&
        (childId === 'class-all' ? !l.childIds?.length && !l.childId : l.childId === childId));
      if (existing) {
        window.DaycareRecords?.saveStatus('같은 날짜의 기록이 있습니다. 열린 창에서 저장 방식을 선택해 주세요.');
        const cancel = () => finishDuplicate(); let choice;
        signal?.addEventListener('abort', cancel, { once: true });
        try { choice = await new Promise(resolve => openDuplicateModal(existing, resolve)); }
        finally { signal?.removeEventListener('abort', cancel); }
        return choice ? await saveCallback(choice) : false;
      }
      return await saveCallback({ overwrite: false });
    } catch (error) { throw new Error('저장 확인 단계: ' + error.message); }
  }

  function openDuplicateModal(existingLog, callback) {
    pendingSaveAction = callback;
    const modal = document.getElementById('duplicateLogModal');
    const metaEl = document.getElementById('duplicateModalDesc');
    if (!modal) {
      pendingSaveAction = null; callback(null);
      return;
    }
    if (metaEl) {
      metaEl.textContent = `[${existingLog.date}] '${existingLog.child_name}' 원아의 일지가 이미 등록되어 있습니다.`;
    }
    modal.style.display = 'flex';
    setupDuplicateModalListeners(existingLog.id);
  }

  function setupDuplicateModalListeners(existingPageId) {
    const btnCancel = document.getElementById('btnDupCancel');
    const btnOverwrite = document.getElementById('btnDupOverwrite');
    const btnNew = document.getElementById('btnDupNew');
    const modal = document.getElementById('duplicateLogModal');
    const close = document.getElementById('btnDuplicateModalClose');
    if (close) close.onclick = () => finishDuplicate();
    const append = document.getElementById('btnDupAppend');
    if (append) append.onclick = () => finishDuplicate({ append: true, pageId: existingPageId });

    if (btnCancel) {
      btnCancel.onclick = () => {
        finishDuplicate();
      };
    }
    if (btnOverwrite) {
      btnOverwrite.onclick = () => {
        finishDuplicate({ overwrite: true, pageId: existingPageId });
      };
    }
    if (btnNew) {
      btnNew.onclick = () => {
        finishDuplicate({ overwrite: false });
      };
    }
  }

  // 순수 관찰 요약 추출 (인삿말 등 알림장 서두 오염 원천 차단)
  function extractCleanObsSummary(result, rawMemo) {
    if (!result) return (rawMemo || '자유놀이 및 일과 관찰').slice(0, 60);

    const isGreeting = (str) => {
      if (!str || typeof str !== 'string') return true;
      const t = str.trim();
      return (
        t.startsWith('안녕') ||
        t.startsWith('반갑') ||
        t.startsWith('선생님') ||
        t.startsWith('학부모') ||
        t.startsWith('어머님') ||
        t.startsWith('아버님') ||
        t.includes('하루를 전해') ||
        t.includes('바람과 함께') ||
        t.length < 5
      );
    };

    // 1. AI 생성 observation_summary가 유효하고 인삿말이 아닌 경우 (최우선)
    if (result.observation_summary && !isGreeting(result.observation_summary)) {
      return result.observation_summary.trim().slice(0, 80);
    }

    // 2. 한그루 보육일지 반성평가(reflection) 또는 놀이 활동
    if (result.class_daily_report) {
      const rep = result.class_daily_report;
      const refText = rep.reflection || rep.play_activity || rep.play_theme || '';
      const cleanRef = refText.split(/[\n.]/).map(s => s.trim()).filter(s => s && !isGreeting(s))[0];
      if (cleanRef) return cleanRef.slice(0, 80);
    }

    // 3. 개별 관찰일지 행동 관찰 (observation_log.behavior)
    if (result.observation_log?.behavior) {
      const bText = result.observation_log.behavior;
      const cleanB = bText.split(/[.!\n]/).map(s => s.trim()).filter(s => s && !isGreeting(s))[0];
      if (cleanB) return cleanB.slice(0, 80);
    }

    // 4. 월간 관찰일지 행동 관찰
    if (result.monthly_observation?.play_obs?.behavior) {
      const bText = result.monthly_observation.play_obs.behavior;
      const cleanB = bText.split(/[.!\n]/).map(s => s.trim()).filter(s => s && !isGreeting(s))[0];
      if (cleanB) return cleanB.slice(0, 80);
    }

    // 5. 교사 원시 메모 (rawMemo)
    if (rawMemo && !isGreeting(rawMemo)) {
      return rawMemo.trim().slice(0, 80);
    }

    return '자유놀이 및 일과 관찰 요약';
  }

  // 1. 단일/통합 노션 저장 파이프라인
  async function handleSaveNotion() {
    return window.DaycareRecords.saveNotion({ checkDuplicateAndSave, extractCleanObsSummary });
  }

  // 2. 한그루 정규 놀이 보육일지 전용 노션 저장
  async function handleSaveClassReportNotion() {
    return handleSaveNotion();
  }

  // 3. 한그루 발달평가 전용 노션 저장
  async function handleSaveHangrooEvalNotion() {
    return handleSaveNotion();
  }

  // 4. 감지된 원아별 놀이 요약 (선택된 원아 개별 노션 분할 저장)
  function updateSelectedIndivObsCount() {
    const checkboxes = document.querySelectorAll('.indiv-obs-checkbox:checked, .indiv-obs-check:checked');
    const countBadge = document.getElementById('individualObsCountBadge');
    const btnText = document.getElementById('btnSaveIndividualObsText');
    const count = checkboxes.length;
    if (countBadge) countBadge.textContent = `${count}명 선택됨`;
    if (btnText) btnText.textContent = `선택한 ${count}명 개별 관찰일지 DB에 반영`;
  }

  async function handleSaveIndividualObs() {
    return window.DaycareChildLinks.saveIndividual();
  }

  // ============================================================================
  // 5. 지난 보육 기록 보관함 모달 (History Viewer)
  // ============================================================================
  async function openHistoryModal() {
    const modal = document.getElementById('historyModal');
    if (!modal) return;
    modal.style.display = 'flex';
    setupHistoryModalListeners();
    await loadHistoryLogs();
  }

  function setupHistoryModalListeners() {
    const modal = document.getElementById('historyModal');
    const closeBtn = document.getElementById('btnCloseHistoryModal');
    const searchInput = document.getElementById('historySearchInput');
    const classFilter = document.getElementById('historyClassSelect');
    const childFilter = document.getElementById('historyChildSelect');
    if (classFilter) {
      classFilter.replaceChildren(new Option(window.state.className, window.state.className));
      classFilter.disabled = true;
    }
    if (childFilter) {
      childFilter.replaceChildren(new Option('전체 원아', 'all'), ...window.state.children.map(c => new Option(c.name, c.id)));
      childFilter.onchange = renderHistoryList;
    }
    const typeFilter = document.getElementById('historyTypeSelect');
    if (typeFilter) typeFilter.onchange = renderHistoryList;
    const refresh = document.getElementById('btnRefreshHistory');
    if (refresh) refresh.onclick = () => loadHistoryLogs();

    if (closeBtn && modal) {
      closeBtn.onclick = () => { modal.style.display = 'none'; };
    }
    if (searchInput) {
      searchInput.oninput = () => renderHistoryList();
    }
    if (classFilter) {
      classFilter.onchange = () => renderHistoryList();
    }
  }

  async function loadHistoryLogs(cursor = null) {
    const state = window.state || {};
    const container = document.getElementById('historyListContainer');
    if (container && !cursor) {
      container.innerHTML = '<div style="text-align: center; padding: 30px; color: #64748B;">⏳ 노션 지난 기록을 불러오는 중...</div>';
    }

    try {
      const teacherId = state.teacherId;
      const json = await requestJson('/api/history?limit=50' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''));
      if (!state.authenticated || state.teacherId !== teacherId) return;
      state.historyLogs = cursor ? [...(state.historyLogs || []), ...(json.data || [])] : json.data || [];
      state.historyNextCursor = json.nextCursor;
      state.isHistoryLoaded = true;
      renderHistoryList();
    } catch (err) {
      if (container) {
        container.innerHTML = safeHTML`<div style="text-align: center; padding: 30px; color: #EF4444;">❌ 지난 기록 로드 실패: ${err.message}</div>`;
      }
    }
  }

  function renderHistoryList() {
    const state = window.state || {};
    const container = document.getElementById('historyListContainer');
    const searchInput = document.getElementById('historySearchInput');
    const classFilter = document.getElementById('historyClassSelect');
    if (!container) return;

    const query = (searchInput?.value || '').trim().toLowerCase();
    const targetClass = classFilter?.value || 'all';

    let list = state.historyLogs || [];
    const childId = document.getElementById('historyChildSelect')?.value;
    if (childId && childId !== 'all') list = list.filter(item => item.childIds?.includes(childId) || item.childId === childId);
    const type = document.getElementById('historyTypeSelect')?.value;
    if (type === 'kidsnote') list = list.filter(item => item.kidsnoteText);
    if (type === 'report') list = list.filter(item => !item.childIds?.length && !item.childId);
    if (type === 'obs') list = list.filter(item => item.behavior || item.summary);

    // 필터링
    if (targetClass !== 'all') {
      list = list.filter(item => (item.class_name || '').includes(targetClass));
    }
    if (query) {
      list = list.filter(item =>
        (item.child_name || '').toLowerCase().includes(query) ||
        (item.date || '').includes(query) ||
        (item.summary || '').toLowerCase().includes(query)
      );
    }

    if (list.length === 0) {
      container.innerHTML = '<div style="text-align: center; padding: 40px; color: #94A3B8;">조건에 맞는 지난 기록이 없습니다.</div>';
    } else container.innerHTML = '';
    list.forEach(item => {
      const card = document.createElement('div');
      card.className = 'history-item-card';
      card.style.cssText = 'padding: 12px 14px; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 8px; margin-bottom: 8px; cursor: pointer; transition: all 0.15s ease;';

      card.innerHTML = safeHTML`
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
          <div style="display: flex; gap: 6px; align-items: center;">
            <span style="font-weight: 700; color: #1E293B;">${item.child_name || '원아'}</span>
            <span style="font-size: 11px; padding: 1px 6px; background: #EEF2FF; color: #4F46E5; border-radius: 4px;">${item.class_name || '우리 반'}</span>
          </div>
          <span style="font-size: 12px; color: #64748B;">📅 ${item.date || ''}</span>
        </div>
        <div style="font-size: 13px; color: #475569; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          ${item.periodSummary ? '📚 기간 종합 서류 · ' : item.needsChildReview ? '⚠️ 원아별 연결 확인 필요 · ' : item.linkedChildMemo ? '👶 원아 근거 연결 · ' : ''}${item.memoOnly ? '📝 자동 저장 메모 · ' + item.memo : item.summary || item.memo || item.kidsnote_preview || '보육 일지 기록'}
        </div>
      `;

      card.onclick = () => renderHistoryDetail(item);
      container.appendChild(card);
    });
    if (state.historyNextCursor) {
      const more = document.createElement('button'); more.type = 'button'; more.className = 'action-btn'; more.textContent = '이전 기록 더 보기';
      more.onclick = async () => { more.disabled = true; await loadHistoryLogs(state.historyNextCursor); }; container.appendChild(more);
    }
  }

  async function renderHistoryDetail(item) {
    try {
      const teacherId = window.state?.teacherId;
      const detail = await requestJson('/api/history/' + encodeURIComponent(item.id));
      if (!window.state?.authenticated || window.state.teacherId !== teacherId) return;
      item = { ...item, ...detail, child_name: detail.saved?.childName || item.child_name };
    } catch (error) { showToast(error.message); return; }
    const detailPanel = document.getElementById('historyDetailBody');
    if (!detailPanel) return;
    const detailModal = document.getElementById('historyDetailModal');
    if (detailModal) detailModal.style.display = 'flex';
    const closeDetail = document.getElementById('btnCloseHistoryDetailModal');
    if (closeDetail) closeDetail.onclick = () => { detailModal.style.display = 'none'; };
    const copy = document.getElementById('btnCopyHistoryText');
    if (copy) copy.onclick = () => window.AiEngine.copyTextToClipboard(JSON.stringify(item.parsedData || { memo: item.memo, summary: item.summary, content: item.content }, null, 2));
    const print = document.getElementById('btnPrintHistory');
    if (print) print.onclick = () => { window.state.printHistory = item; window.print(); };

    detailPanel.innerHTML = safeHTML`
      <div style="padding: 16px; background: #F8FAFC; border-radius: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <h4 style="margin: 0; font-size: 16px; color: #1E293B;">${item.date} [${item.child_name}] 상세 기록</h4>
          <button type="button" id="btnRestoreHistory" class="action-btn" style="padding: 6px 12px; font-size: 12px; background: #4F46E5; color: #FFF; border: none; border-radius: 6px; cursor: pointer;">
            ↺ 화면에 복원하기
          </button>
        </div>
        <div style="background: #FFF; padding: 12px; border: 1px solid #E2E8F0; border-radius: 6px; font-size: 13px; line-height: 1.6; white-space: pre-wrap;">
          ${item.content || item.summary || item.memo || '내용 없음'}
        </div>
      </div>
    `;

    const restoreBtn = document.getElementById('btnRestoreHistory');
    if (restoreBtn) {
      restoreBtn.onclick = () => {
        restoreHistoryToInputs(item);
        const modal = document.getElementById('historyModal');
        if (modal) modal.style.display = 'none';
        if (detailModal) detailModal.style.display = 'none';
        showToast(item.parsedData ? `🎉 [${item.child_name}]의 ${item.date} 기록이 화면에 복원되었습니다!` : '이전 형식의 원시 메모를 복원했습니다. 완성 문장은 상세 보기에서 확인해 주세요.');
      };
    }
  }

  function restoreHistoryToInputs(item) {
    const rawMemoInput = document.getElementById('rawMemoInput');
    const state = window.state || {};
    window.DaycareRecords?.invalidateResult();
    state.pendingDraft = false;
    if (rawMemoInput) rawMemoInput.readOnly = false;
    const draftBanner = document.getElementById('autoDraftRestoreBanner'); if (draftBanner) draftBanner.style.display = 'none';
    const generateButton = document.getElementById('generateBtn'); if (generateButton) generateButton.disabled = false;
    const child = state.children.find(c => c.id === item.childId);
    if (child) selectChild(child);
    else if (!item.childId) renderChildrenChips('class-all');
    if (rawMemoInput) rawMemoInput.value = item.memo || '';
    window.DaycareMemo?.restoredText();
    if (item.date && typeof window.updateRecordDate === 'function') {
      window.updateRecordDate(item.date);
    }
    if (item.parsedData && typeof window.renderResults === 'function') {
      const formats = { kidsnote: 'kidsnote', class_daily_report: 'class_daily_report', monthly_observation: 'observation', hangroo_eval: 'hangroo_eval', parent_counseling: 'counseling', daily_care_log: 'daily_care', play_support: 'play_support' };
      state.selectedFormats = Object.entries(formats).filter(([key]) => item.parsedData[key]).map(([, value]) => value);
      state.lastResult = item.parsedData;
      state.originalResult = structuredClone(item.parsedData);
      window.DaycareRecords?.restoreEvidence(item.parsedData.citation);
      window.syncFormatChipsUI?.();
      window.renderResults(item.parsedData);
      window.DaycareRecords?.save();
    }
    window.DaycareMemo?.start();
  }

  // ============================================================================
  // 6. 글로벌 노출 및 파사드 유지 (Facade)
  // ============================================================================
  window.ChildrenStore = {
    loadChildren,
    renderChildrenChips,
    selectChild,
    openChildModal,
    handleChildFormSubmit,
    maskChildNameInText,
    unmaskChildNameInText,
    maskPayload,
    unmaskResult
  };

  window.DaycareNotion = {
    checkHealth,
    handleSaveNotion,
    cancelPendingSave: () => finishDuplicate(),
    handleSaveClassReportNotion,
    handleSaveHangrooEvalNotion,
    handleSaveIndividualObs,
    updateSelectedIndivObsCount,
    openHistoryModal,
    loadHistoryLogs
  };

  // 하위 호환 단독 전역 함수 바인딩
  window.loadChildren = loadChildren;
  window.renderChildrenChips = renderChildrenChips;
  window.selectChild = selectChild;
  window.openChildModal = openChildModal;
  window.handleChildFormSubmit = handleChildFormSubmit;
  window.checkHealth = checkHealth;
  window.handleSaveNotion = handleSaveNotion;
  window.handleSaveClassReportNotion = handleSaveClassReportNotion;
  window.handleSaveHangrooEvalNotion = handleSaveHangrooEvalNotion;
  window.handleSaveIndividualObs = handleSaveIndividualObs;
  window.updateSelectedIndivObsCount = updateSelectedIndivObsCount;
  window.openHistoryModal = openHistoryModal;
  window.loadHistoryLogs = loadHistoryLogs;
})();
