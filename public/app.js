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
    selectedDate: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date()),
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
    if (state.selectedDate !== dateStr) { window.DaycareRecords?.invalidateResult(); window.DaycareMemo?.beforeContextChange(); }
    state.selectedDate = dateStr;
    window.DaycareRecords?.resetEvidence();

    const recordDatePicker = document.getElementById('recordDatePicker');
    const headerDateText = document.getElementById('headerDateText');
    const retroDateBadge = document.getElementById('retroDateBadge');
    const headerDateWrapper = document.getElementById('headerDateWrapper');

    if (recordDatePicker) recordDatePicker.value = dateStr;
    const dt = new Date(dateStr + 'T00:00:00');
    const options = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' };
    if (headerDateText) headerDateText.textContent = dt.toLocaleDateString('ko-KR', options);

    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
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
  const saveAutoDraft = () => { window.DaycareMemo?.changed(); return window.DaycareRecords?.save(); };
  const clearAutoDraft = () => window.DaycareRecords?.clear();
  window.saveAutoDraft = saveAutoDraft;
  window.clearAutoDraft = clearAutoDraft;
  window.AutoDraft = { save: saveAutoDraft, clear: clearAutoDraft, checkAndRestore: () => window.DaycareRecords?.restore() };

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
        saveAutoDraft();
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

  async function handlePhotoUpload(e) {
    if (!state.photos) state.photos = [];
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    if (state.photos.length + files.length > 6) {
      showToast('사진은 최대 6장까지만 첨부할 수 있습니다.');
      return;
    }

    const teacherId = state.teacherId;
    e.target.disabled = true;
    try {
      for (const file of files) {
        if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') throw new Error('일반 사진 파일(JPEG, PNG, WebP)을 첨부해 주세요.');
        const image = await createImageBitmap(file);
        try {
          const ratio = Math.min(1, 1280 / Math.max(image.width, image.height));
          const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.width * ratio)); canvas.height = Math.max(1, Math.round(image.height * ratio));
          const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
          // 새 사진으로 다시 인코딩하여 용량을 줄이고 원본 위치 메타데이터를 보내지 않는다.
          const photo = canvas.toDataURL('image/jpeg', 0.75);
          if (!state.authenticated || state.teacherId !== teacherId) return;
          state.photos.push(photo); renderPhotoPreviews(); await saveAutoDraft();
        } finally { image.close(); }
      }
    } catch (error) { showToast('사진 첨부 실패: ' + error.message); }
    finally { e.target.value = ''; e.target.disabled = false; }
  }

  function renderPhotoPreviews() {
    const box = document.getElementById('photoPreviews');
    if (!box) return;
    box.innerHTML = '';
    state.photos.forEach((src, idx) => {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'position: relative; width: 64px; height: 64px; border-radius: 8px; overflow: hidden; border: 1px solid #CBD5E1;';
      const image = document.createElement('img'); image.src = src; image.alt = '첨부 사진'; image.style.cssText = 'width: 100%; height: 100%; object-fit: cover;';
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.setAttribute('aria-label', '사진 삭제');
      remove.style.cssText = 'position:absolute;top:2px;right:2px;background:rgba(0,0,0,.6);color:#fff;border:0;border-radius:50%;width:18px;height:18px;';
      wrap.append(image, remove);
      remove.onclick = () => {
        state.photos.splice(idx, 1);
        renderPhotoPreviews(); saveAutoDraft();
      };
      box.appendChild(wrap);
    });
  }
  window.renderPhotoPreviews = renderPhotoPreviews;

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
          window.DaycareMemo?.clearEditor();
          rawMemoInput.value = '';
          state.photos = [];
          renderPhotoPreviews();
          clearAutoDraft();
          showToast('🗑️ 메모와 사진이 깨끗하게 비워졌습니다.');
        }
      };

      rawMemoInput.oninput = () => {
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
      window.DaycareAuth?.clearDeviceInvite();
      if (settingsModal) settingsModal.style.display = 'flex';
      window.DaycareAuth?.updatePersonaUI();
    };

    if (headerClassNameBtn) headerClassNameBtn.onclick = openSettings;
    if (headerPersonaBtn) headerPersonaBtn.onclick = openSettings;
    if (settingsBtn) settingsBtn.onclick = openSettings;
    if (closeSettingsBtn && settingsModal) {
      closeSettingsBtn.onclick = () => { settingsModal.style.display = 'none'; window.DaycareAuth?.clearDeviceInvite(); };
    }

    // 10. 가이드 모달 확인 버튼
    const btnConfirmGuideModal = document.getElementById('btnConfirmGuideModal');
    if (btnConfirmGuideModal && teacherGuideModal) {
      btnConfirmGuideModal.onclick = () => { teacherGuideModal.style.display = 'none'; };
    }

    // 11. AI 생성 즉시 중단 버튼
    const btnCancelAiGenerate = document.getElementById('btnCancelAiGenerate');
    if (btnCancelAiGenerate) {
      btnCancelAiGenerate.onclick = () => {
        if (state.currentAbortController) {
          state.isGenerationAborted = true;
          state.currentAbortController.abort();
          showToast('⏹️ AI 생성을 즉시 중단하고 있습니다...');
        }
      };
    }

    // 12. 설정 모달 저장 버튼
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    const settingClassNameInput = document.getElementById('settingClassNameInput');
    const settingTeacherNameInput = document.getElementById('settingTeacherNameInput');
    const personaSampleNote = document.getElementById('personaSampleNote');
    const personaCallStyle = document.getElementById('personaCallStyle');
    const personaEmojiLevel = document.getElementById('personaEmojiLevel');

    if (saveSettingsBtn) {
      saveSettingsBtn.onclick = async () => {
        const newClassName = state.className;
        const newTeacherName = state.teacherName;
        const classChanged = (newClassName !== state.className);

        state.className = newClassName;
        state.teacherName = newTeacherName;
        try {
          localStorage.setItem('daycare_class_name', newClassName);
          localStorage.setItem('daycare_teacher_name', newTeacherName);
        } catch (e) {}

        const headerClassNameText = document.getElementById('headerClassNameText');
        if (headerClassNameText) headerClassNameText.textContent = newClassName;

        const currentPersona = window.DaycareAuth?.getTeacherPersona(state.activeTeacherKey) || {};
        const updatedPersona = {
          ...currentPersona,
          sampleNote: personaSampleNote ? personaSampleNote.value.trim() : (currentPersona.sampleNote || ''),
          callStyle: personaCallStyle ? personaCallStyle.value : (currentPersona.callStyle || '우리 [아동A]'),
          emojiLevel: personaEmojiLevel ? personaEmojiLevel.value : (currentPersona.emojiLevel || 'moderate')
        };
        state.persona = updatedPersona;
        try { await window.DaycareAuth?.saveProfile(updatedPersona); } catch (e) { showToast('노션 문체 저장 실패: ' + e.message); return; }

        if (classChanged && window.ChildrenStore?.loadChildren) {
          window.ChildrenStore.loadChildren();
        }
        if (settingsModal) settingsModal.style.display = 'none';
        window.DaycareAuth?.clearDeviceInvite();
        showToast(`🌱 '${newClassName}' (${newTeacherName}) 맞춤 설정이 성공적으로 저장되었습니다!`);
      };
    }

    // 13. 페르소나 프리셋 칩 클릭
    const personaPresetGrid = document.getElementById('personaPresetGrid');
    const { PERSONA_PRESETS } = window.DaycareConfig || {};
    if (personaPresetGrid && PERSONA_PRESETS) {
      personaPresetGrid.querySelectorAll('.persona-chip').forEach(chip => {
        chip.onclick = () => {
          personaPresetGrid.querySelectorAll('.persona-chip').forEach(c => c.classList.remove('active'));
          chip.classList.add('active');
          const presetKey = chip.dataset.preset;
          const preset = PERSONA_PRESETS[presetKey];
          if (preset) {
            state.persona = { ...state.persona, name: preset.name, tone: preset.tone };
            window.DaycareAuth?.updatePersonaUI();
            showToast(`✨ '${preset.name}' 스타일이 적용되었습니다. [저장]을 눌러주세요.`);
          }
        };
      });
    }

    // 14. 노션 프로필 동기화
    const syncTeacherFromNotionBtn = document.getElementById('syncTeacherFromNotionBtn');
    if (syncTeacherFromNotionBtn) {
      syncTeacherFromNotionBtn.onclick = () => window.DaycareAuth?.syncProfile();
    }

    // 15. 보안 세션 배너 제어
    const closeSessionBannerBtn = document.getElementById('closeSessionBannerBtn');
    const dismissSessionBannerBtn = document.getElementById('dismissSessionBannerBtn');
    const testBannerToggleBtn = document.getElementById('testBannerToggleBtn');
    const sessionExpiryBanner = document.getElementById('sessionExpiryBanner');

    const hideSessionBanner = () => {
      if (sessionExpiryBanner) sessionExpiryBanner.style.display = 'none';
    };

    if (closeSessionBannerBtn) closeSessionBannerBtn.onclick = hideSessionBanner;
    if (dismissSessionBannerBtn) {
      dismissSessionBannerBtn.onclick = () => {
        try {
          localStorage.setItem('daycare_dismissed_session_exp', Math.floor(Date.now() / 1000 + 86400 * 7).toString());
        } catch (e) {}
        hideSessionBanner();
        showToast('✅ 보안 세션 알림을 확인 완료했습니다.');
      };
    }
    if (testBannerToggleBtn) {
      testBannerToggleBtn.onclick = () => {
        if (sessionExpiryBanner) {
          const isHidden = (sessionExpiryBanner.style.display === 'none' || !sessionExpiryBanner.style.display);
          sessionExpiryBanner.style.display = isHidden ? 'flex' : 'none';
          showToast(isHidden ? '🧪 세션 안내 배너를 표시했습니다.' : '테스트 배너를 닫았습니다.');
        }
      };
    }

    // 16. 모달 내부 PIN 변경 제어 및 로그아웃
    const openChangePinBtn = document.getElementById('openChangePinBtn');
    const changePinArea = document.getElementById('pinChangeBox');
    const saveNewPinBtn = document.getElementById('saveNewPinBtn');
    const cancelNewPinBtn = document.getElementById('cancelNewPinBtn');
    const modalLogoutBtn = document.getElementById('modalLogoutBtn');
    const newPinInput = document.getElementById('newPinInput');

    if (openChangePinBtn && changePinArea) {
      openChangePinBtn.onclick = () => {
        changePinArea.style.display = (changePinArea.style.display === 'none' || !changePinArea.style.display) ? 'block' : 'none';
        if (newPinInput) newPinInput.focus();
      };
    }
    if (cancelNewPinBtn && changePinArea) {
      cancelNewPinBtn.onclick = () => {
        changePinArea.style.display = 'none';
        if (newPinInput) newPinInput.value = '';
      };
    }
    if (saveNewPinBtn && newPinInput) {
      saveNewPinBtn.onclick = () => window.DaycareAuth?.changePin();
    }

    if (modalLogoutBtn) {
      modalLogoutBtn.onclick = () => {
        const headerLogoutBtn = document.getElementById('headerLogoutBtn');
        if (headerLogoutBtn) headerLogoutBtn.click();
        if (settingsModal) settingsModal.style.display = 'none';
        window.DaycareAuth?.clearDeviceInvite();
      };
    }

    // 17. 결과 탭 명시적 ID 바인딩
    const tabClassDailyReport = document.getElementById('tabClassDailyReport');
    const tabHangrooEval = document.getElementById('tabHangrooEval');
    if (tabClassDailyReport) {
      tabClassDailyReport.onclick = () => window.AiEngine?.switchResultTab('class_daily_report');
    }
    if (tabHangrooEval) {
      tabHangrooEval.onclick = () => window.AiEngine?.switchResultTab('hangroo_eval');
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
    // 2. 소급 작성 날짜 초기화 (오늘 기본)
    updateRecordDate(state.selectedDate || new Date().toISOString().split('T')[0]);

    // 3. 교사 UI 및 페르소나 동기화
    window.DaycareAuth?.syncTeacherSwitcherUI();
    window.DaycareAuth?.updatePersonaUI();
    window.DaycareAuth?.checkSecuritySession();

    // 4. 음성 인식 초기화
    setupSpeechRecognition();

    // 8. 전역 이벤트 리스너 통합 등록
    setupAllEventListeners();

    // 9. 📑 서식 선택 툴바 초기화 (이벤트 위임 바인딩)
    initFormatSelector();
    window.DaycareAuth?.initAuthGate();
  }

  // 앱 실행
  init();
});
