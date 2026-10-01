/**
 * 🧸 daycare-helper Frontend Application Logic (app.js)
 * 2026 Modern Vanilla JS (ES2024+)
 */

document.addEventListener('DOMContentLoaded', () => {
  // ============================================================================
  // 0. 프리셋 및 교사 프로필 참조 (config.js 및 auth-gate.js 연동)
  // ============================================================================
  const { PERSONA_PRESETS, PARENT_PRESETS, TEACHER_PROFILES, TEACHER_PAGE_MAP, NOTION_CONFIG } = window.DaycareConfig || window;
  const initialTeacherKey = localStorage.getItem('daycare_active_teacher') || 'wife';
  const initialProfile = (TEACHER_PROFILES && TEACHER_PROFILES[initialTeacherKey]) || (TEACHER_PROFILES && TEACHER_PROFILES.wife) || { key: 'wife', className: '사랑반', name: '공가영 선생님' };

  const state = {
    activeTeacherKey: initialProfile.key,
    className: initialProfile.className,
    teacherName: initialProfile.name,
    filterOnlyMyClass: true, // 🔒 항상 담당 학급만 100% 철통 격리
    children: [],
    selectedChild: null,
    mode: initialProfile.key === 'sister_in_law' ? 'class_report' : 'all_suite',
    activityArea: '자유놀이 및 일상생활',
    photos: [], // base64 strings
    teacherStyle: getTeacherStyle(initialProfile.key),
    persona: getTeacherPersona(initialProfile.key),
    isRecording: false,
    recognition: null,
    lastResult: null,
    originalResult: null, // ↺ 최초 생성본 (원래대로 복원용)
    selectedDate: new Date().toISOString().split('T')[0], // 📅 소급 작성 날짜 (기본: 오늘)
    historyLogs: [], // 📂 지난 기록 보관함 캐시
    isHistoryLoaded: false,
    selectedHistoryLog: null,
    currentAbortController: null, // ⏹️ AI 생성 즉시 중단용 제어기
    isGenerationAborted: false,
    selectedFormats: (() => {
      try {
        const saved = localStorage.getItem('daycare_selected_formats');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch (e) {}
      return ['class_daily_report', 'kidsnote']; // 🌟 기본값: 놀이 보육일지 + 알림장 2대 서식 집중
    })()
  };
  window.state = state;

  // ============================================================================
  // 2. DOM 요소 참조
  // ============================================================================

  const modeSwitcher = document.getElementById('modeSwitcher');
  const areaGrid = document.getElementById('areaGrid');
  const voiceMicBtn = document.getElementById('voiceMicBtn');
  const rawMemoInput = document.getElementById('rawMemoInput');
  const photoFileInput = document.getElementById('photoFileInput');
  const generateBtn = document.getElementById('generateBtn');
  const btnCancelAiGenerate = document.getElementById('btnCancelAiGenerate');

  const kidsnoteCard = document.getElementById('kidsnoteCard');
  const observationCard = document.getElementById('observationCard');
  const dailyCareCard = document.getElementById('dailyCareCard');
  const counselingCard = document.getElementById('counselingCard');
  const playSupportCard = document.getElementById('playSupportCard');
  const copyKidsnoteBtn = document.getElementById('copyKidsnoteBtn');
  const shareKidsnoteBtn = document.getElementById('shareKidsnoteBtn');

  const kidsnoteRefineBox = document.getElementById('kidsnoteRefineBox');
  const resetKidsnoteBtn = document.getElementById('resetKidsnoteBtn');
  const customRefineInput = document.getElementById('customRefineInput');
  const customRefineBtn = document.getElementById('customRefineBtn');

  const btnAutoDistributeDates = document.getElementById('btnAutoDistributeDates');
  const monthlyObsTargetMonth = document.getElementById('monthlyObsTargetMonth');

  const copyMonthlyObsHwpBtn = document.getElementById('copyMonthlyObsHwpBtn');
  const printMonthlyObsBtn = document.getElementById('printMonthlyObsBtn');

  const obsStandardArea = document.getElementById('obsStandardArea');
  const obsActivityName = document.getElementById('obsActivityName');
  const obsBehaviorContent = document.getElementById('obsBehaviorContent');
  const obsEvaluationContent = document.getElementById('obsEvaluationContent');
  const copyObservationBtn = document.getElementById('copyObservationBtn');

  const classDailyReportCard = document.getElementById('classDailyReportCard');
  const copyHangrooReportBtn = document.getElementById('copyHangrooReportBtn');
  const copyHwpTableBtn = document.getElementById('copyHwpTableBtn');
  const printReportBtn = document.getElementById('printReportBtn');
  const copyFullReportTextBtn = document.getElementById('copyFullReportTextBtn');
  const saveClassReportNotionBtn = document.getElementById('saveClassReportNotionBtn');

  const hangrooEvalCard = document.getElementById('hangrooEvalCard');
  const copyHangrooEvalBtn = document.getElementById('copyHangrooEvalBtn');
  const copyHangrooEvalHwpBtn = document.getElementById('copyHangrooEvalHwpBtn');
  const saveHangrooEvalNotionBtn = document.getElementById('saveHangrooEvalNotionBtn');
  const copyHangrooObsBtn = document.getElementById('copyHangrooObsBtn');

  const btnSaveIndividualObs = document.getElementById('btnSaveIndividualObs');

  const dailyPlaySummary = document.getElementById('dailyPlaySummary');
  const dailyPlayEval = document.getElementById('dailyPlayEval');
  const dailyNextPlan = document.getElementById('dailyNextPlan');
  const copyDailyCareBtn = document.getElementById('copyDailyCareBtn');

  const counselRoutine = document.getElementById('counselRoutine');
  const counselSocial = document.getElementById('counselSocial');
  const counselDev = document.getElementById('counselDev');
  const counselOpinion = document.getElementById('counselOpinion');
  const copyCounselingBtn = document.getElementById('copyCounselingBtn');

  const playExtension = document.getElementById('playExtension');
  const playMaterials = document.getElementById('playMaterials');
  const playTips = document.getElementById('playTips');
  const copyPlaySupportBtn = document.getElementById('copyPlaySupportBtn');

  const toastMessage = document.getElementById('toastMessage');

  // ============================================================================
  // 3-A. 🧸 2-Way 보안 잠금 게이트 및 교사 스위처 (auth-gate.js에서 자동 처리)
  // ============================================================================

  // 📅 소급 작성 날짜 변경 및 UI 갱신 함수 (settings-controller.js 연동)
  function updateRecordDate(dateStr) {
    if (window.SettingsController && typeof window.SettingsController.updateRecordDate === 'function') {
      window.SettingsController.updateRecordDate(dateStr);
    }
  }

  // ============================================================================
  // 3. 초기화 (Init)
  // ============================================================================
  function init() {
    // 🔐 2-Way 보안 게이트 초기화
    initAuthGate();

    // 📅 작성 날짜 셋업 (오늘 날짜 기본)
    updateRecordDate(state.selectedDate || new Date().toISOString().split('T')[0]);

    // 👩‍🏫 교사 프로필 스위처 버튼 동기화
    syncTeacherSwitcherUI();

    updatePersonaUI();

    // 🔐 보안 세션 확인 (Cloudflare Access D-7 체크)
    checkSecuritySession();

    // Web Speech API 초기화
    setupSpeechRecognition();

    // 헬스체크 및 원아 목록 로드
    checkHealth();
    loadChildren();

    // 📝 이전에 작성 중이던 메모 자동 복원 (Autosave Restore)
    try {
      const savedDraft = localStorage.getItem('daycare_draft_memo');
      if (savedDraft && rawMemoInput) {
        rawMemoInput.value = savedDraft;
      }
    } catch (e) {}

    // 🛡️ 작성 중이던 일지 자동 복원 배너 확인 (Crash Guard)
    checkAndRestoreAutoDraft();

    // 이벤트 리스너 등록
    setupEventListeners();

    // 📑 서식 선택 툴바 초기화 (상시 저장 및 토큰 절감)
    initFormatSelector();
  }

  // ============================================================================
  // 3-B. 🛡️ 안심 임시보관 및 복원 (auto-draft.js 모듈 위임)
  // ============================================================================
  function saveAutoDraft() {
    if (window.AutoDraft && typeof window.AutoDraft.save === 'function') {
      window.AutoDraft.save(state);
    }
  }

  function clearAutoDraft() {
    if (window.AutoDraft && typeof window.AutoDraft.clear === 'function') {
      window.AutoDraft.clear();
    }
  }
  window.clearAutoDraft = clearAutoDraft;

  function checkAndRestoreAutoDraft() {
    if (window.AutoDraft && typeof window.AutoDraft.checkAndRestore === 'function') {
      window.AutoDraft.checkAndRestore({
        renderResults,
        initFormatSelector,
        showToast
      });
    }
  }

  // ============================================================================
  // 3-C. 📑 생성 서식 선택 툴바 관리 (상시 체크 유지 & 토큰 70% 절감)
  // ============================================================================
  function initFormatSelector() {
    const formatChips = document.querySelectorAll('.format-chip');
    if (!formatChips || formatChips.length === 0) return;

    formatChips.forEach(chip => {
      const fmt = chip.dataset.format;
      const isActive = state.selectedFormats.includes(fmt);
      chip.classList.toggle('active', isActive);
    });

    formatChips.forEach(chip => {
      chip.addEventListener('click', (e) => {
        e.preventDefault();
        const fmt = chip.dataset.format;
        const isCurrentlyActive = state.selectedFormats.includes(fmt);

        if (isCurrentlyActive) {
          if (state.selectedFormats.length <= 1) {
            showToast('⚠️ 최소 1개 이상의 서식을 선택해야 합니다.');
            return;
          }
          state.selectedFormats = state.selectedFormats.filter(f => f !== fmt);
          chip.classList.remove('active');
        } else {
          state.selectedFormats.push(fmt);
          chip.classList.add('active');
        }

        try {
          localStorage.setItem('daycare_selected_formats', JSON.stringify(state.selectedFormats));
        } catch (err) {}

        updateGenerateBtnText();
      });
    });

    updateGenerateBtnText();
  }

  function updateGenerateBtnText() {
    const generateBtnText = document.getElementById('generateBtnText');
    if (!generateBtnText) return;
    const names = [];
    if (state.selectedFormats.includes('class_daily_report')) names.push('보육일지');
    if (state.selectedFormats.includes('kidsnote')) names.push('알림장');
    if (state.selectedFormats.includes('observation')) names.push('관찰일지');
    if (state.selectedFormats.includes('daily_care')) names.push('일일일지');
    if (state.selectedFormats.includes('counseling')) names.push('상담일지');
    if (state.selectedFormats.includes('play_support')) names.push('지원안');

    const summary = names.slice(0, 2).join('·') + (names.length > 2 ? ` 외 ${names.length - 2}종` : '');
    generateBtnText.textContent = `✨ 선택한 서식 스마트 즉시 생성 (${summary})`;
  }

  // ============================================================================
  // 3-B. 보안 세션, 페르소나 UI 및 교사 스위처 (auth-gate.js에서 자동 처리)
  // ============================================================================

  // ============================================================================
  // 3-F. 🧸 평가제 월간 관찰일지 날짜 자동 분산 헬퍼 (daycare-date-utils.js 모듈로 분리 완료)
  // ============================================================================

  // ============================================================================
  // 4. 이벤트 리스너 등록
  // ============================================================================
  function setupEventListeners() {
    // ⚙️ 교사 스위처, 소급 캘린더, 가이드/설정/원아 모달, 메모 2-Tap (settings-controller.js 연동)
    if (window.SettingsController && typeof window.SettingsController.setupSettingsListeners === 'function') {
      window.SettingsController.setupSettingsListeners({ showToast });
    }

    // 모드 스위처 클릭 (숨김 상태여도 null-safe)
    if (modeSwitcher) {
      modeSwitcher.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          modeSwitcher.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          state.mode = btn.dataset.mode;
        });
      });
    }

    // 🧸 월간 관찰일지 평일 자동 분산 버튼
    if (btnAutoDistributeDates) {
      btnAutoDistributeDates.addEventListener('click', () => autoDistributeObsDates());
    }
    if (monthlyObsTargetMonth) {
      monthlyObsTargetMonth.addEventListener('change', () => autoDistributeObsDates());
    }
    // 페이지 로드 시 관찰일지 기본 날짜/영역 1회 자동 초기화
    if (typeof initMonthlyObsPanel === 'function') {
      try { initMonthlyObsPanel(); } catch (e) { /* ignore */ }
    }

    // 활동 영역 칩 클릭 (숨김 상태여도 null-safe)
    if (areaGrid) {
      areaGrid.querySelectorAll('.area-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          areaGrid.querySelectorAll('.area-chip').forEach(c => c.classList.remove('active'));
          chip.classList.add('active');
          state.activityArea = chip.dataset.area;
        });
      });
    }

    // 사진 파일 첨부
    photoFileInput.addEventListener('change', handlePhotoUpload);

    // 생성 버튼 클릭
    generateBtn.addEventListener('click', handleGenerate);

    // 결과 탭 스위처 클릭
    resultTabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        resultTabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.tab;
        
        // 5대 서식 + 한그루 서식 카드 전체 숨김 후 선택된 탭만 노출
        if (classDailyReportCard) classDailyReportCard.style.display = 'none';
        kidsnoteCard.style.display = 'none';
        observationCard.style.display = 'none';
        if (hangrooEvalCard) hangrooEvalCard.style.display = 'none';
        if (dailyCareCard) dailyCareCard.style.display = 'none';
        if (counselingCard) counselingCard.style.display = 'none';
        if (playSupportCard) playSupportCard.style.display = 'none';

        if (tab === 'class_daily_report' && classDailyReportCard) classDailyReportCard.style.display = 'block';
        else if (tab === 'kidsnote') kidsnoteCard.style.display = 'flex';
        else if (tab === 'observation') observationCard.style.display = 'block';
        else if (tab === 'hangroo_eval' && hangrooEvalCard) hangrooEvalCard.style.display = 'block';
        else if (tab === 'daily_care' && dailyCareCard) dailyCareCard.style.display = 'flex';
        else if (tab === 'counseling' && counselingCard) counselingCard.style.display = 'flex';
        else if (tab === 'play_support' && playSupportCard) playSupportCard.style.display = 'flex';
      });
    });

    // 0. 한그루 ERP 및 실무 공문서 버튼 (한그루 복사, 한글 표 복사, A4 인쇄, 노션 저장)
    if (copyHangrooReportBtn) copyHangrooReportBtn.addEventListener('click', handleCopyHangrooReport);
    if (copyHwpTableBtn) copyHwpTableBtn.addEventListener('click', handleCopyHwpTable);
    if (printReportBtn) printReportBtn.addEventListener('click', () => window.print());
    if (copyFullReportTextBtn) copyFullReportTextBtn.addEventListener('click', handleCopyFullReportText);
    if (saveClassReportNotionBtn) saveClassReportNotionBtn.addEventListener('click', handleSaveClassReportNotion);

    // 0-A. 🧩 감지된 원아별 놀이 요약 분할 저장 버튼
    if (btnSaveIndividualObs) btnSaveIndividualObs.addEventListener('click', handleSaveIndividualObs);

    // 0-B. 🧸 한그루 ERP 월간 관찰일지 버튼 (한그루 복사, 한글 표 복사, A4 인쇄)
    if (copyHangrooObsBtn) copyHangrooObsBtn.addEventListener('click', handleCopyHangrooObs);
    if (copyMonthlyObsHwpBtn) copyMonthlyObsHwpBtn.addEventListener('click', handleCopyMonthlyObsHwp);
    if (printMonthlyObsBtn) printMonthlyObsBtn.addEventListener('click', () => window.print());

    // 0-C. 📊 한그루 ERP 발달평가 버튼 (한그루 복사, 한글 복사, 노션 저장)
    if (copyHangrooEvalBtn) copyHangrooEvalBtn.addEventListener('click', handleCopyHangrooEval);
    if (copyHangrooEvalHwpBtn) copyHangrooEvalHwpBtn.addEventListener('click', handleCopyHangrooEvalHwp);
    if (saveHangrooEvalNotionBtn) saveHangrooEvalNotionBtn.addEventListener('click', handleSaveHangrooEvalNotion);

    // 1. 키즈노트 알림장 복사 및 공유
    if (copyKidsnoteBtn) copyKidsnoteBtn.addEventListener('click', handleCopyKidsnote);
    if (shareKidsnoteBtn) shareKidsnoteBtn.addEventListener('click', handleShareKidsnote);

    // 2. 평가제 관찰일지 복사
    if (copyObservationBtn) {
      copyObservationBtn.addEventListener('click', () => {
        const text = `[관찰일지 - ${obsStandardArea ? obsStandardArea.textContent : ''} / ${obsActivityName ? obsActivityName.textContent : ''}]\n\n[행동 관찰]\n${obsBehaviorContent ? obsBehaviorContent.value : ''}\n\n[지원 및 평가]\n${obsEvaluationContent ? obsEvaluationContent.value : ''}`;
        copyTextToClipboard(text, '📋 평가제 관찰일지가 복사되었습니다.');
      });
    }

    // 3. 일일 보육일지 복사
    if (copyDailyCareBtn) {
      copyDailyCareBtn.addEventListener('click', () => {
        const text = `[일일 보육일지 - 놀이 평가 및 지원 계획]\n\n1. 놀이 흐름 요약:\n${dailyPlaySummary ? dailyPlaySummary.value : ''}\n\n2. 교사 종합 평가:\n${dailyPlayEval ? dailyPlayEval.value : ''}\n\n3. 내일 놀이 연계 및 지원 계획:\n${dailyNextPlan ? dailyNextPlan.value : ''}`;
        copyTextToClipboard(text, '📋 보육일지 놀이평가 및 지원계획이 복사되었습니다.');
      });
    }

    // 4. 학부모 상담 면담일지 복사
    if (copyCounselingBtn) {
      copyCounselingBtn.addEventListener('click', () => {
        const text = `[학부모 상담 면담일지 요약 - ${state.selectedChild?.name || '원아'}]\n\n1. 기본생활습관: ${counselRoutine ? counselRoutine.value : ''}\n2. 대인관계 및 사회성: ${counselSocial ? counselSocial.value : ''}\n3. 발달 특성: ${counselDev ? counselDev.value : ''}\n4. 종합 상담 의견: ${counselOpinion ? counselOpinion.value : ''}`;
        copyTextToClipboard(text, '📋 학부모 상담 일지가 복사되었습니다.');
      });
    }

    // 5. 놀이 지원안 복사
    if (copyPlaySupportBtn) {
      copyPlaySupportBtn.addEventListener('click', () => {
        const text = `[놀이 지원 & 환경구성안]\n\n1. 확장 놀이 아이디어:\n${playExtension ? playExtension.value : ''}\n\n2. 추천 준비 교구:\n${playMaterials ? playMaterials.value : ''}\n\n3. 교사 추천 발문 팁:\n${playTips ? playTips.value : ''}`;
        copyTextToClipboard(text, '📋 놀이 지원 및 환경구성안이 복사되었습니다.');
      });
    }

    // 🪄 AI 실시간 다듬기 (Quick Refine) 칩 클릭
    if (kidsnoteRefineBox) {
      const refinePrompts = {
        cheerful: '문맥에 어울리는 따뜻하고 예쁜 이모지를 1~2개 더 자연스럽게 넣고, 한층 더 다정하고 발랄하며 사랑스러운 말투로 다듬어줘',
        detailed: '아이가 놀잇감을 조작하며 집중한 표정과 놀이 과정을 조금 더 자세하고 풍성하게 1~2문장 늘려서 서술해줘',
        compact: '문장의 군더더기를 줄이고 핵심 놀이와 성취감 중심으로 조금 더 간결하고 단정하게 다듬어줘',
        meal: '본문 끝부분에 오늘 점심 식사 시간에 스스로 숟가락으로 골고루 맛있게 잘 먹었다는 기특한 식습관 칭찬 1줄을 자연스럽게 덧붙여줘'
      };

      kidsnoteRefineBox.querySelectorAll('.refine-chip[data-refine]').forEach(chip => {
        chip.addEventListener('click', () => {
          const type = chip.dataset.refine;
          const prompt = refinePrompts[type];
          if (prompt) handleRefine(prompt);
        });
      });

      // ↺ 원래대로 복원 버튼
      if (resetKidsnoteBtn) {
        resetKidsnoteBtn.addEventListener('click', handleResetOriginal);
      }

      // 직접 지시 입력창 및 버튼
      if (customRefineBtn && customRefineInput) {
        customRefineBtn.addEventListener('click', () => {
          const val = customRefineInput.value.trim();
          if (val) {
            handleRefine(val);
            customRefineInput.value = '';
          }
        });
        customRefineInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            const val = customRefineInput.value.trim();
            if (val) {
              handleRefine(val);
              customRefineInput.value = '';
            }
          }
        });
      }
    }

    // (노션 저장 버튼 리스너들은 export-formatters.js에서 바인딩 완료)

    // 🎭 페르소나 설정 및 🔐 보안 세션 배너 (settings-controller.js에서 처리)

    // 👶 원아 관리 모달 및 🎭 페르소나/우리 반 저장 (settings-controller.js에서 처리)

    // 📝 관찰 메모 실시간 자동 저장은 settings-controller.js에서 처리

    // 🗑️ 작성 중인 메모 2-Tap 안전 비우기는 settings-controller.js에서 처리 완료
    // ⏹️ AI 생성 중단 버튼 이벤트 리스너
    if (btnCancelAiGenerate) {
      btnCancelAiGenerate.addEventListener('click', () => {
        if (state.currentAbortController) {
          state.isGenerationAborted = true;
          state.currentAbortController.abort();
          showToast('⏹️ AI 생성을 즉시 중단하고 있습니다...');
        }
      });
    }

    // 🚀 PWA 홈 화면 위젯 및 바로가기 URL 파라미터 체크 (?action=mic, ?action=history, ?teacher=sandbox 등)
    setTimeout(() => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const actionParam = urlParams.get('action');
        const modeParam = urlParams.get('mode');
        const teacherParam = urlParams.get('teacher');

        if (teacherParam && ['wife', 'sister_in_law', 'sandbox'].includes(teacherParam)) {
          switchTeacherProfile(teacherParam);
        }

        if (modeParam && modeSwitcher) {
          const targetModeBtn = modeSwitcher.querySelector(`.mode-btn[data-mode="${modeParam}"]`);
          if (targetModeBtn) {
            targetModeBtn.click();
            showToast(`🧸 [${targetModeBtn.textContent.trim()}] 모드로 전환되었습니다.`);
          }
        }

        if (actionParam === 'mic') {
          setTimeout(() => {
            if (rawMemoInput) {
              rawMemoInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
              rawMemoInput.focus();
            }
            if (voiceMicBtn && !state.isRecording) {
              try {
                voiceMicBtn.click();
              } catch (e) {
                console.warn('Voice mic auto-trigger error:', e);
              }
            }
            showToast('🎙️ 음성 메모 모드입니다. 마이크 버튼을 눌러 말씀하세요!');
          }, 350);
        }

        if (actionParam === 'history') {
          setTimeout(() => {
            if (typeof openHistoryModal === 'function') {
              openHistoryModal();
              showToast('📂 [지난 기록 보관함]을 열었습니다.');
            }
          }, 400);
        }
      } catch (err) {
        console.warn('URL params check error:', err);
      }
    }, 200);
  }

  // ============================================================================
  // 5. 토스트 알림 헬퍼
  // ============================================================================
  let toastTimeout = null;
  function showToast(message) {
    if (toastTimeout) clearTimeout(toastTimeout);
    toastMessage.textContent = message;
    toastMessage.classList.add('show');
    toastTimeout = setTimeout(() => {
      toastMessage.classList.remove('show');
    }, 2400);
  }

  // ============================================================================
  // 6 & 7. 노션 직결 브릿지 & 원아 목록 관리 (notion-bridge.js & children-store.js에서 처리)
  // ============================================================================

  // ============================================================================
  // 8 & 9. Web Speech API 및 사진 업로드 핸들러 (media-assistant.js 모듈로 분리 완료)
  // ============================================================================

  // ============================================================================
  // 9-B. 원아의 노션 실제 과거 관찰 기록 스캔 (시계열 팩트 기반 검증)
  // ============================================================================
  // ============================================================================
  // 9-B & 10. 과거 관찰 기록 스캔 및 AI 생성 (ai-generator.js 위임)
  // ============================================================================
  async function fetchChildPastLogs(childId, childName) {
    if (window.AiGenerator && typeof window.AiGenerator.fetchChildPastLogs === 'function') {
      return window.AiGenerator.fetchChildPastLogs(childId, childName);
    }
    return [];
  }

  async function handleGenerate() {
    if (window.AiGenerator && typeof window.AiGenerator.handleGenerate === 'function') {
      return window.AiGenerator.handleGenerate();
    }
  }

  // 11. 생성 결과 렌더링
  // ============================================================================
  function renderResults(data) {
    if (window.ResultsRenderer && typeof window.ResultsRenderer.renderResults === 'function') {
      window.ResultsRenderer.renderResults(data);
    }
  }
  window.renderResults = renderResults;
  // 11-B. 처형분 실무 공문서 버튼 핸들러 (한글 HWP 표 복사, 텍스트 복사, 노션 저장)
  // ============================================================================
  // ============================================================================
  // 11-B. 처형분 실무 공문서 및 한그루 ERP 복사 핸들러 (export-formatters.js 모듈로 분리 완료)
  // ============================================================================

  // 5, 6, 7. 노션 저장 래퍼 (notion-bridge.js 연동)
  const handleSaveHangrooEvalNotion = () => window.DaycareNotion?.handleSaveHangrooEvalNotion?.() || showToast('노션 연동 모듈 준비 중');
  const handleSaveClassReportNotion = () => window.DaycareNotion?.handleSaveClassReportNotion?.() || showToast('노션 연동 모듈 준비 중');
  const handleSaveIndividualObs = () => window.DaycareNotion?.handleSaveIndividualObs?.() || showToast('노션 연동 모듈 준비 중');

  // ============================================================================
  // 11-C. 키즈노트 알림장 복사 및 공유 핸들러 (export-formatters.js 모듈로 분리 완료)
  // ============================================================================

  // ============================================================================
  // 9 & 10. 노션 DB 저장 & 지난 기록 보관함 (notion-bridge.js & history-viewer.js 연동)
  // ============================================================================

  // 📂 지난 보육 기록 보관함 리스너 등록 (history-viewer.js 연동)
  if (typeof setupHistoryListeners === 'function') {
    setupHistoryListeners();
  } else if (window.setupHistoryListeners) {
    window.setupHistoryListeners();
  }

  // 애플리케이션 시작
  init();
});

