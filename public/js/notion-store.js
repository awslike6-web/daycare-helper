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
  const NOTION_CONFIG = (window.DaycareConfig && window.DaycareConfig.NOTION_CONFIG) || {
    DAILY_LOG_DB_ID: '320a2711-5b68-809e-ba62-f2fefaa0bc9c',
    CHILDREN_DB_ID: '320a2711-5b68-8051-9f20-c637a7fefc65'
  };

  const showToast = (msg) => (typeof window.showToast === 'function' ? window.showToast(msg) : console.log(msg));

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
    try {
      const res = await fetch('/api/children', { method: 'GET' });
      if (!res.ok) throw new Error('원아 목록을 불러올 수 없습니다.');
      const json = await res.json();
      state.children = json.data || [];
    } catch (err) {
      console.warn('원아 목록 로드 실패, 로컬 캐시 폴백:', err);
      try {
        const cached = localStorage.getItem('daycare_children_cache');
        if (cached) state.children = JSON.parse(cached);
      } catch (e) {}
    }

    try {
      localStorage.setItem('daycare_children_cache', JSON.stringify(state.children || []));
    } catch (e) {}

    renderChildrenChips(selectedId);
  }

  function renderChildrenChips(keepSelectedId = null) {
    const state = window.state || {};
    const container = document.getElementById('childrenChipsList');
    if (!container) return;

    container.innerHTML = '';

    // 학급 필터링
    let visibleChildren = state.children || [];
    if (state.filterOnlyMyClass && state.className) {
      visibleChildren = visibleChildren.filter(c => {
        if (!c.className) return true;
        return c.className.trim() === state.className.trim();
      });
    }

    // 0. 학급 전체 공통 일지 가상 원아 칩 (처형분 전용)
    const allChild = {
      id: 'class-all',
      name: `${state.className || '우리 반'} 전체`,
      age: state.className?.includes('사랑') ? '만 0세' : '만 2세',
      gender: '공통',
      traits: '학급 영유아 전체 공통 놀이 흐름 및 일과',
      isClassAll: true
    };

    const chipsToRender = [allChild, ...visibleChildren];

    chipsToRender.forEach(child => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'child-chip';
      chip.dataset.id = child.id;

      const isCurrentSelected = (keepSelectedId && child.id === keepSelectedId) ||
        (state.selectedChild && state.selectedChild.id === child.id);

      if (isCurrentSelected) {
        chip.classList.add('active');
        state.selectedChild = child;
      }

      chip.innerHTML = `
        <span class="child-chip-name">${child.name}</span>
        <span class="child-chip-sub">${child.age || (child.isClassAll ? '학급' : '원아')}</span>
      `;

      chip.onclick = (e) => {
        e.preventDefault();
        selectChild(child);
      };

      container.appendChild(chip);
    });

    // 기본 선택 (선택된 아이가 없으면 첫 번째 아이 자동 선택)
    if (!state.selectedChild && chipsToRender.length > 0) {
      selectChild(chipsToRender[0]);
    }
  }

  function selectChild(child) {
    const state = window.state || {};
    state.selectedChild = child;

    const chips = document.querySelectorAll('.child-chip');
    chips.forEach(c => c.classList.toggle('active', c.dataset.id === child.id));

    // 학급 전체 선택 시 보육일지 서식 우선 추천
    if (child.isClassAll) {
      if (typeof window.switchResultTab === 'function') {
        window.switchResultTab('class_daily_report');
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
      document.getElementById('manageChildGender').value = childData.gender || '남';
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
      gender: document.getElementById('manageChildGender').value,
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
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('저장에 실패했습니다.');

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
      const res = await fetch('/api/health', { method: 'GET' });
      if (!res.ok) throw new Error('서버 응답 없음');
      const data = await res.json();
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

  async function checkDuplicateAndSave(date, childName, saveCallback) {
    try {
      const checkRes = await fetch(`/api/history?limit=10&child_name=${encodeURIComponent(childName)}`);
      if (checkRes.ok) {
        const json = await checkRes.json();
        const logs = json.data || [];
        const existing = logs.find(l => l.date === date);
        if (existing) {
          openDuplicateModal(existing, saveCallback);
          return;
        }
      }
    } catch (e) {
      console.warn('중복 검사 건너뜀:', e);
    }
    // 중복 없음: 즉시 저장 실행
    saveCallback({ overwrite: false });
  }

  function openDuplicateModal(existingLog, callback) {
    pendingSaveAction = callback;
    const modal = document.getElementById('duplicateConfirmModal');
    const metaEl = document.getElementById('dupModalMeta');
    if (!modal) {
      callback({ overwrite: false });
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
    const modal = document.getElementById('duplicateConfirmModal');

    if (btnCancel) {
      btnCancel.onclick = () => {
        if (modal) modal.style.display = 'none';
        pendingSaveAction = null;
      };
    }
    if (btnOverwrite) {
      btnOverwrite.onclick = () => {
        if (modal) modal.style.display = 'none';
        if (pendingSaveAction) pendingSaveAction({ overwrite: true, pageId: existingPageId });
      };
    }
    if (btnNew) {
      btnNew.onclick = () => {
        if (modal) modal.style.display = 'none';
        if (pendingSaveAction) pendingSaveAction({ overwrite: false });
      };
    }
  }

  // 1. 단일/통합 노션 저장 파이프라인
  async function handleSaveNotion() {
    const state = window.state || {};
    if (!state.lastResult) {
      showToast('저장할 일지 생성 결과가 없습니다.');
      return;
    }

    const childName = state.selectedChild?.name || '우리 반';
    const date = state.selectedDate || new Date().toISOString().split('T')[0];

    await checkDuplicateAndSave(date, childName, async ({ overwrite, pageId }) => {
      showToast('☁️ 노션 DB로 전송 중입니다...');
      try {
        const payload = {
          date,
          childId: state.selectedChild?.id,
          childName,
          className: state.className || '사랑반',
          teacherName: state.teacherName || '공가영 선생님',
          result: state.lastResult,
          overwrite,
          pageId
        };

        const res = await fetch('/api/save-notion', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error('노션 저장 실패');
        const json = await res.json();
        showToast('🎉 노션 [DAILY_LOG_DB]에 성공적으로 저장되었습니다!');

        if (typeof window.clearAutoDraft === 'function') {
          window.clearAutoDraft();
        }
      } catch (err) {
        showToast(`❌ 저장 실패: ${err.message}`);
      }
    });
  }

  // 2. 한그루 정규 놀이 보육일지 전용 노션 저장
  async function handleSaveClassReportNotion() {
    return handleSaveNotion();
  }

  // 3. 한그루 발달평가 전용 노션 저장
  async function handleSaveHangrooEvalNotion() {
    return handleSaveNotion();
  }

  // 4. 개별 관찰일지 노션 저장
  async function handleSaveIndividualObs() {
    return handleSaveNotion();
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
    const closeBtn = document.getElementById('closeHistoryModalBtn');
    const searchInput = document.getElementById('historySearchInput');
    const classFilter = document.getElementById('historyClassFilter');

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

  async function loadHistoryLogs() {
    const state = window.state || {};
    const container = document.getElementById('historyListContainer');
    if (container) {
      container.innerHTML = '<div style="text-align: center; padding: 30px; color: #64748B;">⏳ 노션 지난 기록을 불러오는 중...</div>';
    }

    try {
      const res = await fetch('/api/history?limit=30');
      if (!res.ok) throw new Error('기록 조회 실패');
      const json = await res.json();
      state.historyLogs = json.data || [];
      state.isHistoryLoaded = true;
      renderHistoryList();
    } catch (err) {
      if (container) {
        container.innerHTML = `<div style="text-align: center; padding: 30px; color: #EF4444;">❌ 지난 기록 로드 실패: ${err.message}</div>`;
      }
    }
  }

  function renderHistoryList() {
    const state = window.state || {};
    const container = document.getElementById('historyListContainer');
    const searchInput = document.getElementById('historySearchInput');
    const classFilter = document.getElementById('historyClassFilter');
    if (!container) return;

    const query = (searchInput?.value || '').trim().toLowerCase();
    const targetClass = classFilter?.value || 'all';

    let list = state.historyLogs || [];

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
      return;
    }

    container.innerHTML = '';
    list.forEach(item => {
      const card = document.createElement('div');
      card.className = 'history-item-card';
      card.style.cssText = 'padding: 12px 14px; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 8px; margin-bottom: 8px; cursor: pointer; transition: all 0.15s ease;';

      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
          <div style="display: flex; gap: 6px; align-items: center;">
            <span style="font-weight: 700; color: #1E293B;">${item.child_name || '원아'}</span>
            <span style="font-size: 11px; padding: 1px 6px; background: #EEF2FF; color: #4F46E5; border-radius: 4px;">${item.class_name || '우리 반'}</span>
          </div>
          <span style="font-size: 12px; color: #64748B;">📅 ${item.date || ''}</span>
        </div>
        <div style="font-size: 13px; color: #475569; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          ${item.summary || item.kidsnote_preview || '보육 일지 기록'}
        </div>
      `;

      card.onclick = () => renderHistoryDetail(item);
      container.appendChild(card);
    });
  }

  function renderHistoryDetail(item) {
    const detailPanel = document.getElementById('historyDetailPanel');
    if (!detailPanel) return;

    detailPanel.innerHTML = `
      <div style="padding: 16px; background: #F8FAFC; border-radius: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <h4 style="margin: 0; font-size: 16px; color: #1E293B;">${item.date} [${item.child_name}] 상세 기록</h4>
          <button type="button" id="btnRestoreHistory" class="action-btn" style="padding: 6px 12px; font-size: 12px; background: #4F46E5; color: #FFF; border: none; border-radius: 6px; cursor: pointer;">
            ↺ 화면에 복원하기
          </button>
        </div>
        <div style="background: #FFF; padding: 12px; border: 1px solid #E2E8F0; border-radius: 6px; font-size: 13px; line-height: 1.6; white-space: pre-wrap;">
          ${item.content || item.summary || '내용 없음'}
        </div>
      </div>
    `;

    const restoreBtn = document.getElementById('btnRestoreHistory');
    if (restoreBtn) {
      restoreBtn.onclick = () => {
        restoreHistoryToInputs(item);
        const modal = document.getElementById('historyModal');
        if (modal) modal.style.display = 'none';
        showToast(`🎉 [${item.child_name}]의 ${item.date} 기록이 화면에 복원되었습니다!`);
      };
    }
  }

  function restoreHistoryToInputs(item) {
    const rawMemoInput = document.getElementById('rawMemoInput');
    const state = window.state || {};
    if (rawMemoInput && item.memo) rawMemoInput.value = item.memo;
    if (item.date && typeof window.updateRecordDate === 'function') {
      window.updateRecordDate(item.date);
    }
    if (item.parsedData && typeof window.renderResults === 'function') {
      state.lastResult = item.parsedData;
      window.renderResults(item.parsedData);
    }
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
    handleSaveClassReportNotion,
    handleSaveHangrooEvalNotion,
    handleSaveIndividualObs,
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
  window.openHistoryModal = openHistoryModal;
  window.loadHistoryLogs = loadHistoryLogs;
})();
