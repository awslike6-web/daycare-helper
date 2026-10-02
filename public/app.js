/**
 * 🧸 daycare-helper Main UI Controller (app.js)
 * 2026 Modern Vanilla JS (ES2024+)
 * 
 * 주요 역할:
 *  - 애플리케이션 라이프사이클 및 전역 상태(state) 단일 원천
 *  - 📑 생성 서식 선택 툴바 이벤트 위임 (Event Delegation) 100% 무결성 토글
 *  - 📅 소급 작성 날짜 / 캘린더 동기화
 *  - 🎙️ 음성 인식 (STT) 및 사진 업로드
 *  - 🛡️ 작성 중 일지 실시간 임시보관 및 복원 (AutoDraft)
 *  - ⚙️ 환경설정 / 가이드 / 페르소나 모달 제어
 */

document.addEventListener('DOMContentLoaded', () => {
  // ============================================================================
  // 0. 토스트 알림 헬퍼 (글로벌 단일 원천)
  // ============================================================================
  let toastTimeout = null;
  function showToast(message) {
    const toastEl = document.getElementById('toastMessage');
    if (!toastEl) {
      console.log('[Toast]', message);
      return;
    }
    if (toastTimeout) clearTimeout(toastTimeout);
    toastEl.textContent = message;
    toastEl.classList.add('show');
    toastTimeout = setTimeout(() => {
      toastEl.classList.remove('show');
    }, 2400);
  }
  window.showToast = showToast;

  // ============================================================================
  // 1. 프로필 참조 및 전역 상태 (Single Source of Truth)
  // ============================================================================
  const { TEACHER_PROFILES } = window.DaycareConfig || {};
  const initialTeacherKey = localStorage.getItem('daycare_active_teacher') || 'wife';
  const initialProfile = (TEACHER_PROFILES && TEACHER_PROFILES[initialTeacherKey]) ||
    (TEACHER_PROFILES && TEACHER_PROFILES.wife) ||
    { key: 'wife', className: '사랑반', name: '공가영 선생님' };

  const getStyleFn = window.DaycareAuth?.getTeacherStyle || (() => '다정하고 꼼꼼한 선생님');
  const getPersonaFn = window.DaycareAuth?.getTeacherPersona || (() => ({ name: '맞춤 페르소나' }));

  const state = {
    activeTeacherKey: initialProfile.key,
    className: localStorage.getItem('daycare_class_name') || initialProfile.className,
    teacherName: localStorage.getItem('daycare_teacher_name') || initialProfile.name,
    filterOnlyMyClass: true,
    children: [],
    selectedChild: null,
    mode: initialProfile.key === 'sister_in_law' ? 'class_report' : 'all_suite',
    activityArea: '자유놀이 및 일상생활',
    photos: [],
    teacherStyle: getStyleFn(initialProfile.key),
    persona: getPersonaFn(initialProfile.key),
    isRecording: false,
    recognition: null,
    lastResult: null,
    originalResult: null,
    selectedDate: new Date().toISOString().split('T')[0],
    historyLogs: [],
    isHistoryLoaded: false,
    selectedHistoryLog: null,
    currentAbortController: null,
    isGenerationAborted: false,
    selectedFormats: (() => {
      try {
        const saved = localStorage.getItem('daycare_selected_formats');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch (e) {}
      return ['class_daily_report', 'kidsnote']; // 기본 2대 서식 집중
    })()
  };
  window.state = state;

  // ============================================================================
  // 2. 📑 생성 서식 선택 툴바 관리 (Event Delegation 완전 무결성)
  // ============================================================================
  function initFormatSelector() {
    const grid = document.getElementById('formatChipsGrid');
    if (!grid) return;

    // UI 상태 반영
    syncFormatChipsUI();

    // 단일 이벤트 위임 바인딩 (자식 span을 눌러도 100% 정상 작동)
    grid.onclick = (e) => {
      const chip = e.target.closest('.format-chip');
      if (!chip) return;
      e.preventDefault();

      const fmt = chip.getAttribute('data-format');
      if (!fmt) return;

      const isCurrentlyActive = state.selectedFormats.includes(fmt);

      if (isCurrentlyActive) {
        if (state.selectedFormats.length <= 1) {
          showToast('⚠️ 최소 1개 이상의 서식을 선택해야 합니다.');
          return;
        }
        state.selectedFormats = state.selectedFormats.filter(f => f !== fmt);
      } else {
        state.selectedFormats.push(fmt);
      }

      try {
        localStorage.setItem('daycare_selected_formats', JSON.stringify(state.selectedFormats));
      } catch (err) {}

      syncFormatChipsUI();
      updateGenerateBtnText();
    };

    updateGenerateBtnText();
  }

  function syncFormatChipsUI() {
    const chips = document.querySelectorAll('.format-chip');
    chips.forEach(chip => {
      const fmt = chip.getAttribute('data-format');
      const isActive = state.selectedFormats.includes(fmt);
      chip.classList.toggle('active', isActive);
    });
  }

  function updateGenerateBtnText() {
    const generateBtnText = document.getElementById('generateBtnText');
    if (!generateBtnText) return;

    const names = [];
    if (state.selectedFormats.includes('class_daily_report')) names.push('보육일지');
    if (state.selectedFormats.includes('kidsnote')) names.push('알림장');
    if (state.selectedFormats.includes('observation')) names.push('관찰일지');
    if (state.selectedFormats.includes('hangroo_eval')) names.push('발달평가');
    if (state.selectedFormats.includes('daily_care')) names.push('일일일지');
    if (state.selectedFormats.includes('counseling')) names.push('상담일지');
    if (state.selectedFormats.includes('play_support')) names.push('지원안');

    const summary = names.slice(0, 2).join('·') + (names.length > 2 ? ` 외 ${names.length - 2}종` : '');
    generateBtnText.textContent = `✨ 선택한 서식 스마트 즉시 생성 (${summary || '기본 서식'})`;
  }

  window.initFormatSelector = initFormatSelector;
  window.syncFormatChipsUI = syncFormatChipsUI;

  // ============================================================================
  // 3. 📅 소급 작성 날짜 동기화 및 캘린더
  // ============================================================================
  function updateRecordDate(dateStr) {
    if (!dateStr) return;
    state.selectedDate = dateStr;

    const recordDatePicker = document.getElementById('recordDatePicker');
    const headerDateText = document.getElementById('headerDateText');
    const retroDateBadge = document.getElementById('retroDateBadge');
    const headerDateWrapper = document.getElementById('headerDateWrapper');

    if (recordDatePicker) recordDatePicker.value = dateStr;
    const dt = new Date(dateStr + 'T00:00:00');
    const options = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' };
    if (headerDateText) headerDateText.textContent = dt.toLocaleDateString('ko-KR', options);

    const todayStr = new Date().toISOString().split('T')[0];
    const isRetro = (dateStr !== todayStr);
    if (retroDateBadge) {
      retroDateBadge.style.display = isRetro ? 'inline-block' : 'none';
    }
    if (headerDateWrapper) {
      if (isRetro) {
        headerDateWrapper.title = `소급 작성 중 (${dateStr}) - 클릭하여 날짜 변경`;
        headerDateWrapper.style.borderColor = '#EF4444';
        headerDateWrapper.style.background = '#FEF2F2';
      } else {
        headerDateWrapper.title = '클릭하여 소급 작성 날짜 변경';
        headerDateWrapper.style.borderColor = '#CBD5E1';
        headerDateWrapper.style.background = '#F8FAFC';
      }
    }
  }
  window.updateRecordDate = updateRecordDate;

  // ============================================================================
  // 4. 🛡️ 안심 자동 임시보관 및 복원 (Crash Guard)
  // ============================================================================
  const DRAFT_STORAGE_KEY = 'daycare_auto_draft';

  function saveAutoDraft() {
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
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draftData));
    } catch (e) {}
  }

  function clearAutoDraft() {
    try {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      const banner = document.getElementById('autoDraftRestoreBanner');
      if (banner) banner.style.display = 'none';
    } catch (e) {}
  }

  function checkAndRestoreAutoDraft() {
    try {
      const saved = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (!saved) return;
      const draft = JSON.parse(saved);
      if (!draft || (!draft.lastResult && !draft.rawMemo)) return;

      const banner = document.getElementById('autoDraftRestoreBanner');
      const metaEl = document.getElementById('autoDraftRestoreMeta');
      const btnRestore = document.getElementById('btnRestoreAutoDraft');
      const btnDiscard = document.getElementById('btnDiscardAutoDraft');
      const rawMemoInput = document.getElementById('rawMemoInput');

      if (banner) {
        if (metaEl) {
          metaEl.textContent = `${draft.date} [${draft.childName || '원아'}] 작성본이 안전하게 보관되어 있습니다.`;
        }
        banner.style.display = 'flex';

        if (btnRestore) {
          btnRestore.onclick = (e) => {
            e.preventDefault();
            if (rawMemoInput && draft.rawMemo) rawMemoInput.value = draft.rawMemo;
            if (draft.lastResult) {
              state.lastResult = draft.lastResult;
              state.originalResult = draft.originalResult || draft.lastResult;
              if (window.AiEngine && typeof window.AiEngine.renderResults === 'function') {
                window.AiEngine.renderResults(draft.lastResult);
              }
            }
            if (Array.isArray(draft.selectedFormats) && draft.selectedFormats.length > 0) {
              state.selectedFormats = draft.selectedFormats;
              syncFormatChipsUI();
              updateGenerateBtnText();
            }
            banner.style.display = 'none';
            showToast('🎉 작성 중이던 일지 내용이 복원되었습니다!');
          };
        }

        if (btnDiscard) {
          btnDiscard.onclick = (e) => {
            e.preventDefault();
            clearAutoDraft();
            showToast('임시 저장본이 삭제되었습니다.');
          };
        }
      }
    } catch (e) {}
  }

  window.saveAutoDraft = saveAutoDraft;
  window.clearAutoDraft = clearAutoDraft;
  window.AutoDraft = { save: saveAutoDraft, clear: clearAutoDraft, checkAndRestore: checkAndRestoreAutoDraft };

  // ============================================================================
  // 5. 🎙️ Web Speech API 및 사진 첨부 (Media Assistant)
  // ============================================================================
  function setupSpeechRecognition() {
    const voiceMicBtn = document.getElementById('voiceMicBtn');
    const micIcon = document.getElementById('micIcon');
    const micStatusText = document.getElementById('micStatusText');
    const rawMemoInput = document.getElementById('rawMemoInput');
    if (!voiceMicBtn) return;

    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      voiceMicBtn.style.opacity = '0.5';
      voiceMicBtn.onclick = () => showToast('이 브라우저는 음성 인식을 지원하지 않습니다.');
      return;
    }

    const recognition = new SpeechRec();
    recognition.lang = 'ko-KR';
    recognition.continuous = true;
    recognition.interimResults = false;

    recognition.onstart = () => {
      state.isRecording = true;
      voiceMicBtn.classList.add('recording');
      if (micIcon) micIcon.textContent = '⏹️';
      if (micStatusText) micStatusText.textContent = '듣고 있어요...';
      showToast('마이크가 켜졌습니다. 말씀하세요!');
    };

    recognition.onresult = (event) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) transcript += event.results[i][0].transcript + ' ';
      }
      if (transcript.trim() && rawMemoInput) {
        const cur = rawMemoInput.value.trim();
        rawMemoInput.value = cur ? `${cur}\n${transcript.trim()}` : transcript.trim();
        try { localStorage.setItem('daycare_draft_memo', rawMemoInput.value); } catch (e) {}
        showToast('🎙️ 음성 메모가 입력되었습니다.');
      }
    };

    recognition.onerror = () => stopRecording();
    recognition.onend = () => stopRecording();

    function stopRecording() {
      state.isRecording = false;
      if (voiceMicBtn) voiceMicBtn.classList.remove('recording');
      if (micIcon) micIcon.textContent = '🎙️';
      if (micStatusText) micStatusText.textContent = '음성 메모';
    }

    voiceMicBtn.onclick = () => {
      if (state.isRecording) {
        recognition.stop();
      } else {
        try { recognition.start(); } catch (e) {}
      }
    };
  }

  function handlePhotoUpload(e) {
    if (!state.photos) state.photos = [];
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    if (state.photos.length + files.length > 6) {
      showToast('사진은 최대 6장까지만 첨부할 수 있습니다.');
      return;
    }

    files.forEach(file => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        state.photos.push(event.target.result);
        renderPhotoPreviews();
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  }

  function renderPhotoPreviews() {
    const box = document.getElementById('photoPreviews');
    if (!box) return;
    box.innerHTML = '';
    state.photos.forEach((src, idx) => {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'position: relative; width: 64px; height: 64px; border-radius: 8px; overflow: hidden; border: 1px solid #CBD5E1;';
      wrap.innerHTML = `
        <img src="${src}" style="width: 100%; height: 100%; object-fit: cover;">
        <button type="button" style="position: absolute; top: 2px; right: 2px; background: rgba(0,0,0,0.6); color: #FFF; border: none; border-radius: 50%; width: 18px; height: 18px; font-size: 11px; cursor: pointer;">&times;</button>
      `;
      wrap.querySelector('button').onclick = () => {
        state.photos.splice(idx, 1);
        renderPhotoPreviews();
      };
      box.appendChild(wrap);
    });
  }

  // ============================================================================
  // 6. ⚙️ 모달 및 화면 이벤트 리스너 통합 바인딩
  // ============================================================================
  function setupAllEventListeners() {
    // 1. 모드 스위처 (필요 시)
    const modeSwitcher = document.getElementById('modeSwitcher');
    if (modeSwitcher) {
      modeSwitcher.querySelectorAll('.mode-btn').forEach(btn => {
        btn.onclick = () => {
          modeSwitcher.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          state.mode = btn.dataset.mode;
        };
      });
    }

    // 2. 소급 캘린더
    const recordDatePicker = document.getElementById('recordDatePicker');
    if (recordDatePicker) {
      recordDatePicker.onchange = (e) => {
        updateRecordDate(e.target.value);
        showToast(`📅 작성 날짜가 [${e.target.value}]로 변경되었습니다.`);
      };
    }

    // 3. 교사 스위처 버튼 바인딩
    const btnWife = document.getElementById('btnSwitchWife');
    const btnSister = document.getElementById('btnSwitchSisterInLaw');
    const btnSandbox = document.getElementById('btnSwitchSandbox');
    if (btnWife) btnWife.onclick = () => window.DaycareAuth?.handleTeacherSwitchClick('wife');
    if (btnSister) btnSister.onclick = () => window.DaycareAuth?.handleTeacherSwitchClick('sister_in_law');
    if (btnSandbox) btnSandbox.onclick = () => window.DaycareAuth?.handleTeacherSwitchClick('sandbox');

    // 4. 사진 파일 업로드
    const photoFileInput = document.getElementById('photoFileInput');
    if (photoFileInput) photoFileInput.onchange = handlePhotoUpload;

    // 5. 메모 2-Tap 안전 비우기
    const rawMemoInput = document.getElementById('rawMemoInput');
    const btnClearMemo = document.getElementById('btnClearMemoBtn');
    if (btnClearMemo && rawMemoInput) {
      let isWaiting = false;
      let timer = null;
      btnClearMemo.onclick = () => {
        if (!rawMemoInput.value.trim() && (!state.photos || state.photos.length === 0)) {
          showToast('비울 메모가 없습니다.');
          return;
        }
        if (!isWaiting) {
          isWaiting = true;
          btnClearMemo.innerHTML = '<span>⚠️</span> <span>정말 비울까요?</span>';
          btnClearMemo.style.background = '#FEE2E2';
          btnClearMemo.style.color = '#DC2626';
          timer = setTimeout(() => {
            isWaiting = false;
            btnClearMemo.innerHTML = '<span>🗑️</span> <span>비우기</span>';
            btnClearMemo.style.background = '#F1F5F9';
            btnClearMemo.style.color = '#64748B';
          }, 3000);
          showToast('3초 안에 한 번 더 누르면 메모와 사진이 비워집니다.');
        } else {
          clearTimeout(timer);
          isWaiting = false;
          btnClearMemo.innerHTML = '<span>🗑️</span> <span>비우기</span>';
          btnClearMemo.style.background = '#F1F5F9';
          btnClearMemo.style.color = '#64748B';
          rawMemoInput.value = '';
          state.photos = [];
          renderPhotoPreviews();
          try { localStorage.removeItem('daycare_draft_memo'); } catch (e) {}
          showToast('🗑️ 메모와 사진이 깨끗하게 비워졌습니다.');
        }
      };

      rawMemoInput.oninput = () => {
        try { localStorage.setItem('daycare_draft_memo', rawMemoInput.value); } catch (e) {}
        saveAutoDraft();
      };
    }

    // 6. 생성 버튼 바인딩
    const generateBtn = document.getElementById('generateBtn');
    if (generateBtn) {
      generateBtn.onclick = () => window.AiEngine?.handleGenerate();
    }

    // 7. 결과 탭 스위처 바인딩
    const resultTabBtns = document.querySelectorAll('.result-tab-btn');
    resultTabBtns.forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        const tab = btn.dataset.tab;
        if (window.AiEngine && typeof window.AiEngine.switchResultTab === 'function') {
          window.AiEngine.switchResultTab(tab);
        }
      };
    });

    // 8. 내보내기 리스너 바인딩
    if (window.AiEngine && typeof window.AiEngine.setupExportListeners === 'function') {
      window.AiEngine.setupExportListeners();
    }

    // 9. 설정 & 가이드 모달 바인딩
    const headerGuideBtn = document.getElementById('headerGuideBtn');
    const teacherGuideModal = document.getElementById('teacherGuideModal');
    const btnCloseGuideModal = document.getElementById('btnCloseGuideModal');
    if (headerGuideBtn && teacherGuideModal) {
      headerGuideBtn.onclick = () => { teacherGuideModal.style.display = 'flex'; };
    }
    if (btnCloseGuideModal && teacherGuideModal) {
      btnCloseGuideModal.onclick = () => { teacherGuideModal.style.display = 'none'; };
    }

    const headerHistoryBtn = document.getElementById('headerHistoryBtn');
    if (headerHistoryBtn) {
      headerHistoryBtn.onclick = () => window.DaycareNotion?.openHistoryModal();
    }

    const headerClassNameBtn = document.getElementById('headerClassNameBtn');
    const headerPersonaBtn = document.getElementById('headerPersonaBtn');
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsModal = document.getElementById('settingsModal');
    const closeSettingsBtn = document.getElementById('closeSettingsBtn');

    const openSettings = () => {
      if (settingsModal) settingsModal.style.display = 'flex';
      window.DaycareAuth?.updatePersonaUI();
    };

    if (headerClassNameBtn) headerClassNameBtn.onclick = openSettings;
    if (headerPersonaBtn) headerPersonaBtn.onclick = openSettings;
    if (settingsBtn) settingsBtn.onclick = openSettings;
    if (closeSettingsBtn && settingsModal) {
      closeSettingsBtn.onclick = () => { settingsModal.style.display = 'none'; };
    }

    // 원아 관리 모달 버튼
    const addChildBtn = document.getElementById('addChildBtn');
    const editChildBtn = document.getElementById('editChildBtn');
    const closeChildModalBtn = document.getElementById('closeChildModalBtn');
    const childManageModal = document.getElementById('childManageModal');
    const childManageForm = document.getElementById('childManageForm');

    if (addChildBtn) addChildBtn.onclick = () => window.ChildrenStore?.openChildModal('add');
    if (editChildBtn) editChildBtn.onclick = () => {
      if (state.selectedChild) window.ChildrenStore?.openChildModal('edit', state.selectedChild);
      else showToast('수정할 원아를 먼저 선택해주세요.');
    };
    if (closeChildModalBtn && childManageModal) {
      closeChildModalBtn.onclick = () => { childManageModal.style.display = 'none'; };
    }
    if (childManageForm) {
      childManageForm.onsubmit = (e) => window.ChildrenStore?.handleChildFormSubmit(e);
    }
  }

  // ============================================================================
  // 7. 애플리케이션 초기화 (Init)
  // ============================================================================
  function init() {
    // 1. 보안 게이트 초기화
    if (window.DaycareAuth && typeof window.DaycareAuth.initAuthGate === 'function') {
      window.DaycareAuth.initAuthGate();
    }

    // 2. 소급 작성 날짜 초기화 (오늘 기본)
    updateRecordDate(state.selectedDate || new Date().toISOString().split('T')[0]);

    // 3. 교사 UI 및 페르소나 동기화
    window.DaycareAuth?.syncTeacherSwitcherUI();
    window.DaycareAuth?.updatePersonaUI();
    window.DaycareAuth?.checkSecuritySession();

    // 4. 음성 인식 초기화
    setupSpeechRecognition();

    // 5. 헬스체크 및 원아 목록 로드
    window.DaycareNotion?.checkHealth();
    window.ChildrenStore?.loadChildren();

    // 6. 작성 중 메모 복원
    try {
      const savedMemo = localStorage.getItem('daycare_draft_memo');
      const rawMemoInput = document.getElementById('rawMemoInput');
      if (savedMemo && rawMemoInput) rawMemoInput.value = savedMemo;
    } catch (e) {}

    // 7. 충돌 방지 자동 복원 배너 확인
    checkAndRestoreAutoDraft();

    // 8. 전역 이벤트 리스너 통합 등록
    setupAllEventListeners();

    // 9. 📑 서식 선택 툴바 초기화 (이벤트 위임 바인딩)
    initFormatSelector();
  }

  // 앱 실행
  init();
});
