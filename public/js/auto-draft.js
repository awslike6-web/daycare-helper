/**
 * 🛡️ daycare-helper Auto-Draft Module (auto-draft.js)
 * 2026 Modern Vanilla JS (ES2024+)
 * 
 * 주요 역할:
 *  - AI 생성 완료 및 메모 타이핑 시 브라우저 localStorage 실시간 자동 보관 (Crash Guard)
 *  - 창 닫힘, 새로고침 후 재접속 시 상단 복원 배너 표시 및 1초 원클릭 복원
 *  - 노션 저장 성공 시 안전 클리어
 */

(function () {
  const STORAGE_KEY = 'daycare_auto_draft';

  /**
   * 실시간 임시보관
   */
  function saveAutoDraft(customState = null) {
    const state = customState || window.state || {};
    const rawMemoInput = document.getElementById('rawMemoInput');

    if (!state.lastResult && (!rawMemoInput || !rawMemoInput.value.trim())) return;

    try {
      const draftData = {
        timestamp: Date.now(),
        date: state.selectedDate || new Date().toISOString().split('T')[0],
        childId: state.selectedChild?.id || null,
        childName: state.selectedChild?.name || '원아',
        className: state.className || '',
        rawMemo: rawMemoInput ? rawMemoInput.value : '',
        lastResult: state.lastResult || null,
        originalResult: state.originalResult || null,
        selectedFormats: state.selectedFormats || []
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draftData));
    } catch (e) {
      console.warn('[AutoDraft] 임시저장 오류:', e);
    }
  }

  /**
   * 임시저장 데이터 삭제 및 배너 숨김
   */
  function clearAutoDraft() {
    try {
      localStorage.removeItem(STORAGE_KEY);
      const banner = document.getElementById('autoDraftRestoreBanner');
      if (banner) banner.style.display = 'none';
    } catch (e) {}
  }

  /**
   * 재접속 시 임시저장 존재 여부 검사 및 복원 배너 바인딩
   */
  function checkAndRestoreAutoDraft(callbacks = {}) {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return;
      const draft = JSON.parse(saved);
      if (!draft || (!draft.lastResult && !draft.rawMemo)) return;

      const today = new Date().toISOString().split('T')[0];
      const isRecent = (draft.date === today) || ((Date.now() - (draft.timestamp || 0)) < 24 * 3600 * 1000);
      if (!isRecent) return;

      const banner = document.getElementById('autoDraftRestoreBanner');
      const metaEl = document.getElementById('autoDraftRestoreMeta');
      const btnRestore = document.getElementById('btnRestoreAutoDraft');
      const btnDiscard = document.getElementById('btnDiscardAutoDraft');
      const rawMemoInput = document.getElementById('rawMemoInput');
      const state = window.state || {};

      if (banner) {
        if (metaEl) {
          metaEl.textContent = `${draft.date} [${draft.childName || '원아'}] 작성본이 안전하게 보관되어 있습니다.`;
        }
        banner.style.display = 'flex';

        if (btnRestore) {
          btnRestore.onclick = (e) => {
            e.preventDefault();
            // 1. 메모 복원
            if (rawMemoInput && draft.rawMemo) {
              rawMemoInput.value = draft.rawMemo;
            }
            // 2. 결과물 복원
            if (draft.lastResult) {
              state.lastResult = draft.lastResult;
              state.originalResult = draft.originalResult || draft.lastResult;
              if (typeof callbacks.renderResults === 'function') {
                callbacks.renderResults(draft.lastResult);
              } else if (window.ResultsRenderer && typeof window.ResultsRenderer.renderResults === 'function') {
                window.ResultsRenderer.renderResults(draft.lastResult);
              } else if (typeof window.renderResults === 'function') {
                window.renderResults(draft.lastResult);
              }
            }
            // 3. 서식 칩 복원
            if (Array.isArray(draft.selectedFormats) && draft.selectedFormats.length > 0) {
              state.selectedFormats = draft.selectedFormats;
              if (typeof callbacks.initFormatSelector === 'function') {
                callbacks.initFormatSelector();
              } else if (typeof window.initFormatSelector === 'function') {
                window.initFormatSelector();
              }
            }
            banner.style.display = 'none';
            const toastFn = callbacks.showToast || window.showToast;
            if (typeof toastFn === 'function') toastFn('🎉 작성 중이던 일지 내용이 성공적으로 복원되었습니다!');
          };
        }

        if (btnDiscard) {
          btnDiscard.onclick = (e) => {
            e.preventDefault();
            clearAutoDraft();
            const toastFn = callbacks.showToast || window.showToast;
            if (typeof toastFn === 'function') toastFn('임시 저장본이 삭제되었습니다.');
          };
        }
      }
    } catch (e) {
      console.warn('[checkAndRestoreAutoDraft] 복원 오류:', e);
    }
  }

  // 🌐 전역 노출 및 파사드 유지
  window.AutoDraft = {
    save: saveAutoDraft,
    clear: clearAutoDraft,
    checkAndRestore: checkAndRestoreAutoDraft
  };
  window.saveAutoDraft = saveAutoDraft;
  window.clearAutoDraft = clearAutoDraft;
  window.checkAndRestoreAutoDraft = checkAndRestoreAutoDraft;
})();
