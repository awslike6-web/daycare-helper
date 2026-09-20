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
    isGenerationAborted: false
  };
  window.state = state;

  // ============================================================================
  // 2. DOM 요소 참조
  // ============================================================================
  const headerDateWrapper = document.getElementById('headerDateWrapper');
  const headerDateText = document.getElementById('headerDateText');
  const recordDatePicker = document.getElementById('recordDatePicker');
  const retroDateBadge = document.getElementById('retroDateBadge');
  const headerHistoryBtn = document.getElementById('headerHistoryBtn');
  const headerClassNameBtn = document.getElementById('headerClassNameBtn');
  const headerClassNameText = document.getElementById('headerClassNameText');
  const notionStatusBadge = document.getElementById('notionStatusBadge');
  const notionStatusText = document.getElementById('notionStatusText');
  const childScrollContainer = document.getElementById('childScrollContainer');
  const selectedChildAge = document.getElementById('selectedChildAge');
  const classFilterToggleBtn = document.getElementById('classFilterToggleBtn');
  const classFilterIcon = document.getElementById('classFilterIcon');
  const classFilterText = document.getElementById('classFilterText');
  const childTraitsText = document.getElementById('childTraitsText');
  const childParentText = document.getElementById('childParentText');
  const childAlertText = document.getElementById('childAlertText');
  const addChildBtn = document.getElementById('addChildBtn');
  const editChildBtn = document.getElementById('editChildBtn');
  const childManageModal = document.getElementById('childManageModal');
  const childModalTitle = document.getElementById('childModalTitle');
  const closeChildModalBtn = document.getElementById('closeChildModalBtn');
  const childManageForm = document.getElementById('childManageForm');
  const manageChildId = document.getElementById('manageChildId');
  const manageChildName = document.getElementById('manageChildName');
  const manageChildAge = document.getElementById('manageChildAge');
  const manageChildClass = document.getElementById('manageChildClass');
  const manageChildTraits = document.getElementById('manageChildTraits');
  const manageChildParentStyle = document.getElementById('manageChildParentStyle');
  const parentPresetGrid = document.getElementById('parentPresetGrid');
  const manageChildAllergies = document.getElementById('manageChildAllergies');
  const saveChildBtn = document.getElementById('saveChildBtn');
  const syncTeacherFromNotionBtn = document.getElementById('syncTeacherFromNotionBtn');

  // 👩‍🏫 교사 프로필 1초 원터치 스위처 버튼
  const btnSwitchWife = document.getElementById('btnSwitchWife');
  const btnSwitchSisterInLaw = document.getElementById('btnSwitchSisterInLaw');
  const btnSwitchSandbox = document.getElementById('btnSwitchSandbox');

  // ❓ 선생님 맞춤 사용 가이드 모달 요소
  const headerGuideBtn = document.getElementById('headerGuideBtn');
  const teacherGuideModal = document.getElementById('teacherGuideModal');
  const btnCloseGuideModal = document.getElementById('btnCloseGuideModal');
  const btnConfirmGuideModal = document.getElementById('btnConfirmGuideModal');

  const modeSwitcher = document.getElementById('modeSwitcher');
  const areaSection = document.getElementById('areaSection');
  const areaGrid = document.getElementById('areaGrid');
  const voiceMicBtn = document.getElementById('voiceMicBtn');
  const micIcon = document.getElementById('micIcon');
  const micStatusText = document.getElementById('micStatusText');
  const rawMemoInput = document.getElementById('rawMemoInput');
  const btnClearMemoBtn = document.getElementById('btnClearMemoBtn');
  const photoFileInput = document.getElementById('photoFileInput');
  const photoPreviews = document.getElementById('photoPreviews');
  const generateBtn = document.getElementById('generateBtn');
  const loadingBox = document.getElementById('loadingBox');
  const loadingStepText = document.getElementById('loadingStepText');
  const btnCancelAiGenerate = document.getElementById('btnCancelAiGenerate');

  // 결과 영역 요소들
  const resultsSection = document.getElementById('resultsSection');
  const resultTabs = document.getElementById('resultTabs');
  const resultTabBtns = document.querySelectorAll('.result-tab-btn');
  const kidsnoteCard = document.getElementById('kidsnoteCard');
  const observationCard = document.getElementById('observationCard');
  const dailyCareCard = document.getElementById('dailyCareCard');
  const counselingCard = document.getElementById('counselingCard');
  const playSupportCard = document.getElementById('playSupportCard');
  const kidsnoteTitle = document.getElementById('kidsnoteTitle');
  const kidsnoteContent = document.getElementById('kidsnoteContent');
  const kidsnoteTags = document.getElementById('kidsnoteTags');
  const copyKidsnoteBtn = document.getElementById('copyKidsnoteBtn');
  const shareKidsnoteBtn = document.getElementById('shareKidsnoteBtn');

  // 🪄 AI 실시간 다듬기 (Quick Refine) 요소들
  const kidsnoteRefineBox = document.getElementById('kidsnoteRefineBox');
  const refiningSpinner = document.getElementById('refiningSpinner');
  const resetKidsnoteBtn = document.getElementById('resetKidsnoteBtn');
  const customRefineInput = document.getElementById('customRefineInput');
  const customRefineBtn = document.getElementById('customRefineBtn');

  // 🧸 평가제 월간 연속 관찰일지 DOM 요소들
  const monthlyObsPanel = document.getElementById('monthlyObsPanel');
  const btnAutoDistributeDates = document.getElementById('btnAutoDistributeDates');
  const monthlyObsTargetMonth = document.getElementById('monthlyObsTargetMonth');
  const monthlyObsDate1 = document.getElementById('monthlyObsDate1');
  const monthlyObsArea1 = document.getElementById('monthlyObsArea1');
  const monthlyObsDate2 = document.getElementById('monthlyObsDate2');
  const monthlyObsArea2 = document.getElementById('monthlyObsArea2');

  const copyMonthlyObsHwpBtn = document.getElementById('copyMonthlyObsHwpBtn');
  const printMonthlyObsBtn = document.getElementById('printMonthlyObsBtn');
  const monthlyObsDocTitle = document.getElementById('monthlyObsDocTitle');
  const monthlyObsChildName = document.getElementById('monthlyObsChildName');
  const monthlyObsTeacherName = document.getElementById('monthlyObsTeacherName');
  const monthlyObsPeriod = document.getElementById('monthlyObsPeriod');
  const obs1DateMeta = document.getElementById('obs1DateMeta');
  const obs1AreaBadge = document.getElementById('obs1AreaBadge');
  const obs1ActivityTitle = document.getElementById('obs1ActivityTitle');
  const obs1BehaviorText = document.getElementById('obs1BehaviorText');
  const obs1SupportText = document.getElementById('obs1SupportText');
  const obs2DateMeta = document.getElementById('obs2DateMeta');
  const obs2AreaBadge = document.getElementById('obs2AreaBadge');
  const obs2ActivityTitle = document.getElementById('obs2ActivityTitle');
  const obs2BehaviorText = document.getElementById('obs2BehaviorText');
  const obs2SupportText = document.getElementById('obs2SupportText');
  const obs2GrowthText = document.getElementById('obs2GrowthText');
  const monthlySummaryDevText = document.getElementById('monthlySummaryDevText');
  const monthlySummaryPlanText = document.getElementById('monthlySummaryPlanText');

  const obsStandardArea = document.getElementById('obsStandardArea');
  const obsActivityName = document.getElementById('obsActivityName');
  const obsBehaviorContent = document.getElementById('obsBehaviorContent');
  const obsEvaluationContent = document.getElementById('obsEvaluationContent');
  const citationBox = document.getElementById('citationBox');
  const citationSummaryText = document.getElementById('citationSummaryText');
  const copyObservationBtn = document.getElementById('copyObservationBtn');
  const saveNotionBtn = document.getElementById('saveNotionBtn');

  // 📄 처형분 실무 정규 보육일지 공문서 요소들
  const tabClassDailyReport = document.getElementById('tabClassDailyReport');
  const classDailyReportCard = document.getElementById('classDailyReportCard');
  const repDocTitle = document.getElementById('repDocTitle');
  const repHdrClass = document.getElementById('repHdrClass');
  const repHdrDate = document.getElementById('repHdrDate');
  const repHdrTheme = document.getElementById('repHdrTheme');
  const repHdrSignTeacher = document.getElementById('repHdrSignTeacher');
  const repHdrSignDirector = document.getElementById('repHdrSignDirector');
  const reportCurriculumTbody = document.getElementById('reportCurriculumTbody');
  const repReflectionText = document.getElementById('repReflectionText');
  const repSupportEnvText = document.getElementById('repSupportEnvText');
  const repSupportSafetyText = document.getElementById('repSupportSafetyText');
  const copyHwpTableBtn = document.getElementById('copyHwpTableBtn');
  const printReportBtn = document.getElementById('printReportBtn');
  const copyFullReportTextBtn = document.getElementById('copyFullReportTextBtn');
  const saveClassReportNotionBtn = document.getElementById('saveClassReportNotionBtn');

  // 🧩 감지된 원아별 놀이 요약 (교사 1초 눈 검수 & 개별 저장) 요소들
  const individualObsCard = document.getElementById('individualObsCard');
  const individualObsCountBadge = document.getElementById('individualObsCountBadge');
  const individualObsList = document.getElementById('individualObsList');
  const btnSaveIndividualObs = document.getElementById('btnSaveIndividualObs');
  const btnSaveIndividualObsText = document.getElementById('btnSaveIndividualObsText');

  // 📂 지난 보육 기록 보관함 DOM 요소들
  const historyModal = document.getElementById('historyModal');
  const btnCloseHistoryModal = document.getElementById('btnCloseHistoryModal');
  const btnRefreshHistory = document.getElementById('btnRefreshHistory');
  const historyClassSelect = document.getElementById('historyClassSelect');
  const historyChildSelect = document.getElementById('historyChildSelect');
  const historyTypeSelect = document.getElementById('historyTypeSelect');
  const historySearchInput = document.getElementById('historySearchInput');
  const historyListContainer = document.getElementById('historyListContainer');

  // 📖 기록 상세 보기 모달 DOM 요소들
  const historyDetailModal = document.getElementById('historyDetailModal');
  const btnCloseHistoryDetailModal = document.getElementById('btnCloseHistoryDetailModal');
  const historyDetailTitle = document.getElementById('historyDetailTitle');
  const historyDetailMeta = document.getElementById('historyDetailMeta');
  const historyDetailBody = document.getElementById('historyDetailBody');
  const btnCopyHistoryText = document.getElementById('btnCopyHistoryText');
  const btnCopyHistoryHwp = document.getElementById('btnCopyHistoryHwp');
  const btnPrintHistory = document.getElementById('btnPrintHistory');

  // 3대 추가 서식 필드 및 복사 버튼
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
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsModal = document.getElementById('settingsModal');
  const closeSettingsBtn = document.getElementById('closeSettingsBtn');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  const headerPersonaBtn = document.getElementById('headerPersonaBtn');
  const headerPersonaText = document.getElementById('headerPersonaText');
  const personaPresetGrid = document.getElementById('personaPresetGrid');
  const personaSampleNote = document.getElementById('personaSampleNote');
  const personaCallStyle = document.getElementById('personaCallStyle');
  const personaEmojiLevel = document.getElementById('personaEmojiLevel');
  const personaClosingGreeting = document.getElementById('personaClosingGreeting');
  const settingClassNameInput = document.getElementById('settingClassNameInput');
  const settingTeacherNameInput = document.getElementById('settingTeacherNameInput');

  // 🔐 Cloudflare Access 보안 세션 배너 및 모달 요소
  const sessionExpiryBanner = document.getElementById('sessionExpiryBanner');
  const sessionDdayBadge = document.getElementById('sessionDdayBadge');
  const sessionDescText = document.getElementById('sessionDescText');
  const dismissSessionBannerBtn = document.getElementById('dismissSessionBannerBtn');
  const closeSessionBannerBtn = document.getElementById('closeSessionBannerBtn');
  const sessionStatusTag = document.getElementById('sessionStatusTag');
  const sessionUserEmailText = document.getElementById('sessionUserEmailText');
  const sessionExpiryDateText = document.getElementById('sessionExpiryDateText');
  const sessionDaysLeftText = document.getElementById('sessionDaysLeftText');
  const testBannerToggleBtn = document.getElementById('testBannerToggleBtn');

  // 🧸 2-Way 보안 잠금 게이트 (Auth Gate) 요소
  const authGateModal = document.getElementById('authGateModal');
  const tabPinBtn = document.getElementById('tabPinBtn');
  const tabEmailBtn = document.getElementById('tabEmailBtn');
  const pinPanel = document.getElementById('pinPanel');
  const emailPanel = document.getElementById('emailPanel');
  const pinDotsContainer = document.getElementById('pinDotsContainer');
  const pinDots = pinDotsContainer ? pinDotsContainer.querySelectorAll('.pin-dot') : [];
  const pinErrorMsg = document.getElementById('pinErrorMsg');
  const keypadButtons = document.querySelectorAll('.keypad-btn');
  const keypadClearBtn = document.getElementById('keypadClearBtn');
  const keypadBackspaceBtn = document.getElementById('keypadBackspaceBtn');
  const emailLoginForm = document.getElementById('emailLoginForm');
  const authEmailInput = document.getElementById('authEmailInput');
  const emailErrorMsg = document.getElementById('emailErrorMsg');
  const rememberAuthCheck = document.getElementById('rememberAuthCheck');
  const headerLogoutBtn = document.getElementById('headerLogoutBtn');
  const modalLogoutBtn = document.getElementById('modalLogoutBtn');
  const openChangePinBtn = document.getElementById('openChangePinBtn');
  const pinChangeBox = document.getElementById('pinChangeBox');
  const newPinInput = document.getElementById('newPinInput');
  const saveNewPinBtn = document.getElementById('saveNewPinBtn');
  const cancelNewPinBtn = document.getElementById('cancelNewPinBtn');

  let currentSessionData = null;
  let pinBuffer = '';

  // ============================================================================
  // 3-A. 🧸 2-Way 보안 잠금 게이트 및 교사 스위처 (auth-gate.js에서 자동 처리)
  // ============================================================================

  // 📅 소급 작성 날짜 변경 및 UI 갱신 함수
  function updateRecordDate(dateStr) {
    if (!dateStr) return;
    state.selectedDate = dateStr;
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

    // 이벤트 리스너 등록
    setupEventListeners();
  }

  // ============================================================================
  // 3-B. 보안 세션, 페르소나 UI 및 교사 스위처 (auth-gate.js에서 자동 처리)
  // ============================================================================

  // ============================================================================
  // 3-F. 🧸 평가제 월간 연속 관찰일지 날짜 자동 분산 및 초기화 헬퍼
  // ============================================================================
  function getWeekdaysInRange(year, month, startDay, endDay) {
    const weekdays = [];
    const daysInMonth = new Date(year, month, 0).getDate();
    const maxDay = Math.min(endDay, daysInMonth);
    for (let d = startDay; d <= maxDay; d++) {
      const dt = new Date(year, month - 1, d);
      const dayOfWeek = dt.getDay();
      if (dayOfWeek >= 1 && dayOfWeek <= 5) { // 월~금 평일만 필터링
        const padMonth = String(month).padStart(2, '0');
        const padDay = String(d).padStart(2, '0');
        weekdays.push(`${year}-${padMonth}-${padDay}`);
      }
    }
    return weekdays;
  }

  function getDayOfWeekName(dateStr) {
    if (!dateStr) return '';
    try {
      const dt = new Date(dateStr + 'T00:00:00');
      const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
      return dayNames[dt.getDay()] || '';
    } catch (e) {
      return '';
    }
  }

  function autoDistributeObsDates() {
    let ym = monthlyObsTargetMonth ? monthlyObsTargetMonth.value : '';
    if (!ym) {
      const now = new Date();
      ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      if (monthlyObsTargetMonth) monthlyObsTargetMonth.value = ym;
    }
    const [yearStr, monthStr] = ym.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);

    const phase1List = getWeekdaysInRange(year, month, 2, 10); // 상순 평일 (2일~10일)
    const phase2List = getWeekdaysInRange(year, month, 16, 25); // 하순 평일 (16일~25일)

    const date1 = phase1List.length > 0 ? phase1List[Math.floor(Math.random() * phase1List.length)] : `${ym}-08`;
    const date2 = phase2List.length > 0 ? phase2List[Math.floor(Math.random() * phase2List.length)] : `${ym}-22`;

    if (monthlyObsDate1) monthlyObsDate1.value = date1;
    if (monthlyObsDate2) monthlyObsDate2.value = date2;

    // 원아 성향/연령 맞춤 추천 영역 자동 매핑
    let defArea1 = '의사소통';
    let defArea2 = '사회관계';

    if (state.selectedChild) {
      const age = state.selectedChild.age || '';
      const traits = state.selectedChild.traits || '';
      if (age.includes('0세')) {
        defArea1 = '기본생활';
        defArea2 = '신체운동';
      } else if (traits.includes('발화') || traits.includes('말') || traits.includes('소통')) {
        defArea1 = '의사소통';
        defArea2 = '사회관계';
      } else if (traits.includes('신체') || traits.includes('대근육') || traits.includes('춤')) {
        defArea1 = '신체운동';
        defArea2 = '사회관계';
      }
    }

    if (monthlyObsArea1) monthlyObsArea1.value = defArea1;
    if (monthlyObsArea2) monthlyObsArea2.value = defArea2;

    showToast(`🎲 ${month}월 평일 관찰일(1차: ${date1.slice(5)}, 2차: ${date2.slice(5)})이 자동 분산되었습니다.`);
  }

  function initMonthlyObsPanel() {
    if (!monthlyObsTargetMonth) return;
    if (!monthlyObsTargetMonth.value) {
      const now = new Date();
      monthlyObsTargetMonth.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }
    if (!monthlyObsDate1 || !monthlyObsDate1.value || !monthlyObsDate2 || !monthlyObsDate2.value) {
      autoDistributeObsDates();
    }
  }

  // ============================================================================
  // 4. 이벤트 리스너 등록
  // ============================================================================
  function setupEventListeners() {
    // 👩‍🏫 교사 프로필 1초 원터치 스위처 이벤트 (보안 PIN 인증 게이트 거침)
    if (btnSwitchWife) {
      btnSwitchWife.addEventListener('click', () => handleTeacherSwitchClick('wife'));
    }
    if (btnSwitchSisterInLaw) {
      btnSwitchSisterInLaw.addEventListener('click', () => handleTeacherSwitchClick('sister_in_law'));
    }
    if (btnSwitchSandbox) {
      btnSwitchSandbox.addEventListener('click', () => handleTeacherSwitchClick('sandbox'));
    }

    // 📅 소급 작성용 캘린더 날짜 변경 이벤트
    if (recordDatePicker) {
      recordDatePicker.addEventListener('change', (e) => {
        const newDate = e.target.value;
        if (newDate) {
          updateRecordDate(newDate);
          const todayStr = new Date().toISOString().split('T')[0];
          showToast(`📅 작성 날짜가 [${newDate}]로 설정되었습니다.${newDate !== todayStr ? ' (소급 작성)' : ''}`);
        }
      });
    }

    // ❓ 선생님 맞춤 사용 가이드 모달 열기/닫기
    if (headerGuideBtn && teacherGuideModal) {
      headerGuideBtn.addEventListener('click', () => {
        teacherGuideModal.style.display = 'flex';
      });
    }
    if (btnCloseGuideModal && teacherGuideModal) {
      btnCloseGuideModal.addEventListener('click', () => {
        teacherGuideModal.style.display = 'none';
      });
    }
    if (btnConfirmGuideModal && teacherGuideModal) {
      btnConfirmGuideModal.addEventListener('click', () => {
        teacherGuideModal.style.display = 'none';
      });
    }
    if (teacherGuideModal) {
      teacherGuideModal.addEventListener('click', (e) => {
        if (e.target === teacherGuideModal) {
          teacherGuideModal.style.display = 'none';
        }
      });
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
        
        // 5대 서식 + 공문서 카드 전체 숨김 후 선택된 탭만 노출
        if (classDailyReportCard) classDailyReportCard.style.display = 'none';
        kidsnoteCard.style.display = 'none';
        observationCard.style.display = 'none';
        if (dailyCareCard) dailyCareCard.style.display = 'none';
        if (counselingCard) counselingCard.style.display = 'none';
        if (playSupportCard) playSupportCard.style.display = 'none';

        if (tab === 'class_daily_report' && classDailyReportCard) classDailyReportCard.style.display = 'block';
        else if (tab === 'kidsnote') kidsnoteCard.style.display = 'flex';
        else if (tab === 'observation') observationCard.style.display = 'block';
        else if (tab === 'daily_care' && dailyCareCard) dailyCareCard.style.display = 'flex';
        else if (tab === 'counseling' && counselingCard) counselingCard.style.display = 'flex';
        else if (tab === 'play_support' && playSupportCard) playSupportCard.style.display = 'flex';
      });
    });

    // 0. 처형분 실무 공문서 버튼 (한글 표 복사, A4 인쇄, 노션 저장)
    if (copyHwpTableBtn) copyHwpTableBtn.addEventListener('click', handleCopyHwpTable);
    if (printReportBtn) printReportBtn.addEventListener('click', () => window.print());
    if (copyFullReportTextBtn) copyFullReportTextBtn.addEventListener('click', handleCopyFullReportText);
    if (saveClassReportNotionBtn) saveClassReportNotionBtn.addEventListener('click', handleSaveClassReportNotion);

    // 0-A. 🧩 감지된 원아별 놀이 요약 분할 저장 버튼
    if (btnSaveIndividualObs) btnSaveIndividualObs.addEventListener('click', handleSaveIndividualObs);

    // 0-B. 🧸 평가제 월간 연속 관찰기록부 버튼 (한글 표 복사, A4 인쇄)
    if (copyMonthlyObsHwpBtn) copyMonthlyObsHwpBtn.addEventListener('click', handleCopyMonthlyObsHwp);
    if (printMonthlyObsBtn) printMonthlyObsBtn.addEventListener('click', () => window.print());

    // 1. 키즈노트 알림장 복사 및 공유
    copyKidsnoteBtn.addEventListener('click', handleCopyKidsnote);
    shareKidsnoteBtn.addEventListener('click', handleShareKidsnote);

    // 2. 평가제 관찰일지 복사
    if (copyObservationBtn) {
      copyObservationBtn.addEventListener('click', () => {
        const text = `[관찰일지 - ${obsStandardArea.textContent} / ${obsActivityName.textContent}]\n\n[행동 관찰]\n${obsBehaviorContent.value}\n\n[지원 및 평가]\n${obsEvaluationContent.value}`;
        copyTextToClipboard(text, '📋 평가제 관찰일지가 복사되었습니다.');
      });
    }

    // 3. 일일 보육일지 복사
    if (copyDailyCareBtn) {
      copyDailyCareBtn.addEventListener('click', () => {
        const text = `[일일 보육일지 - 놀이 평가 및 지원 계획]\n\n1. 놀이 흐름 요약:\n${dailyPlaySummary.value}\n\n2. 교사 종합 평가:\n${dailyPlayEval.value}\n\n3. 내일 놀이 연계 및 지원 계획:\n${dailyNextPlan.value}`;
        copyTextToClipboard(text, '📋 보육일지 놀이평가 및 지원계획이 복사되었습니다.');
      });
    }

    // 4. 학부모 상담 면담일지 복사
    if (copyCounselingBtn) {
      copyCounselingBtn.addEventListener('click', () => {
        const text = `[학부모 상담 면담일지 요약 - ${state.selectedChild?.name || '원아'}]\n\n1. 기본생활습관: ${counselRoutine.value}\n2. 대인관계 및 사회성: ${counselSocial.value}\n3. 발달 특성: ${counselDev.value}\n4. 종합 상담 의견: ${counselOpinion.value}`;
        copyTextToClipboard(text, '📋 학부모 상담 일지가 복사되었습니다.');
      });
    }

    // 5. 놀이 지원안 복사
    if (copyPlaySupportBtn) {
      copyPlaySupportBtn.addEventListener('click', () => {
        const text = `[놀이 지원 & 환경구성안]\n\n1. 확장 놀이 아이디어:\n${playExtension.value}\n\n2. 추천 준비 교구:\n${playMaterials.value}\n\n3. 교사 추천 발문 팁:\n${playTips.value}`;
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

    // 노션 저장
    saveNotionBtn.addEventListener('click', handleSaveNotion);

    // 페르소나 및 설정 모달 열기
    if (headerClassNameBtn) {
      headerClassNameBtn.addEventListener('click', () => {
        updatePersonaUI();
        if (settingsModal) settingsModal.style.display = 'flex';
        if (settingClassNameInput) {
          setTimeout(() => {
            settingClassNameInput.focus();
            settingClassNameInput.select();
          }, 100);
        }
      });
    }
    if (headerPersonaBtn) {
      headerPersonaBtn.addEventListener('click', () => {
        updatePersonaUI();
        settingsModal.style.display = 'flex';
      });
    }
    settingsBtn.addEventListener('click', () => {
      updatePersonaUI();
      settingsModal.style.display = 'flex';
    });
    closeSettingsBtn.addEventListener('click', () => {
      settingsModal.style.display = 'none';
    });

    // 🔐 보안 세션 배너 관련 이벤트 리스너
    if (dismissSessionBannerBtn) {
      dismissSessionBannerBtn.addEventListener('click', () => {
        if (currentSessionData && currentSessionData.exp) {
          localStorage.setItem('daycare_dismissed_session_exp', currentSessionData.exp.toString());
        } else {
          localStorage.setItem('daycare_dismissed_session_exp', 'test_dismissed');
        }
        hideSessionBanner();
        showToast('✅ 보안 세션 알림을 확인 완료했습니다. 이번 만료 시점까지 다시 표시되지 않아요.');
      });
    }

    if (closeSessionBannerBtn) {
      closeSessionBannerBtn.addEventListener('click', () => {
        hideSessionBanner();
      });
    }

    if (testBannerToggleBtn) {
      testBannerToggleBtn.addEventListener('click', () => {
        if (sessionExpiryBanner && sessionExpiryBanner.style.display === 'none') {
          showSessionBanner(6, Math.floor(Date.now() / 1000) + 6 * 86400);
          showToast('🧪 만료 D-6 사전 안내 배너를 화면에 표시했습니다.');
        } else {
          hideSessionBanner();
          showToast('테스트 배너를 닫았습니다.');
        }
      });
    }

    // 👶 원아 관리 (등록/수정) 모달 이벤트
    if (addChildBtn) {
      addChildBtn.addEventListener('click', () => openChildModal('add'));
    }
    if (editChildBtn) {
      editChildBtn.addEventListener('click', () => {
        if (state.selectedChild) {
          openChildModal('edit', state.selectedChild);
        } else {
          showToast('수정할 원아를 먼저 선택해주세요.');
        }
      });
    }
    if (closeChildModalBtn) {
      closeChildModalBtn.addEventListener('click', () => {
        childManageModal.style.display = 'none';
      });
    }
    if (childManageForm) {
      childManageForm.addEventListener('submit', handleChildFormSubmit);
    }

    // 🌱 우리 반만 보기 ↔ 전체 원아 보기 토글 이벤트
    if (classFilterToggleBtn) {
      classFilterToggleBtn.addEventListener('click', () => {
        state.filterOnlyMyClass = !state.filterOnlyMyClass;
        renderChildrenChips();
        showToast(state.filterOnlyMyClass ? `🌱 '${state.className}' 원아들만 표시합니다.` : '🌐 전체 원아를 표시합니다.');
      });
    }

    // 👪 원아 모달: 학부모 4대 프리셋 클릭 시 자동 입력
    if (parentPresetGrid) {
      parentPresetGrid.querySelectorAll('.parent-preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          parentPresetGrid.querySelectorAll('.parent-preset-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const presetKey = btn.dataset.preset;
          const text = PARENT_PRESETS[presetKey];
          if (text && manageChildParentStyle) {
            manageChildParentStyle.value = text;
            manageChildParentStyle.focus();
          }
        });
      });
    }

    // ☁️ 설정 모달: 노션에서 내 교사 프로필 불러오기 동기화 버튼
    if (syncTeacherFromNotionBtn) {
      syncTeacherFromNotionBtn.addEventListener('click', handleSyncTeacherProfile);
    }

    // 프리셋 칩 클릭 시 해당 프리셋 데이터 폼에 자동 주입
    if (personaPresetGrid) {
      personaPresetGrid.querySelectorAll('.persona-preset-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          const presetKey = chip.dataset.preset;
          const presetData = PERSONA_PRESETS[presetKey];
          if (presetData) {
            state.persona = { ...presetData };
            setTeacherPersona(state.activeTeacherKey, state.persona);
            setTeacherStyle(state.activeTeacherKey, presetData.name);
            updatePersonaUI();
            showToast(`🎭 '${presetData.name}' 프리셋이 적용되었습니다.`);
          }
        });
      });
    }

    // 페르소나 및 우리 반 설정 저장
    saveSettingsBtn.addEventListener('click', () => {
      // 1. 담당 반 및 선생님 호칭 저장
      const newClassName = settingClassNameInput ? settingClassNameInput.value.trim() || state.className : state.className;
      const newTeacherName = settingTeacherNameInput ? settingTeacherNameInput.value.trim() || state.teacherName : state.teacherName;
      const classChanged = state.className !== newClassName;
      state.className = newClassName;
      state.teacherName = newTeacherName;
      localStorage.setItem('daycare_class_name', newClassName);
      localStorage.setItem('daycare_teacher_name', newTeacherName);

      // 2. 페르소나 문체 저장 (교사별 독립 저장소)
      state.persona = {
        preset: state.persona.preset || 'custom',
        name: state.persona.name || '맞춤 페르소나',
        sampleNote: personaSampleNote ? personaSampleNote.value.trim() : '',
        callStyle: personaCallStyle ? personaCallStyle.value : '우리 [아동A]',
        emojiLevel: personaEmojiLevel ? personaEmojiLevel.value : 'moderate',
        closingGreeting: personaClosingGreeting ? personaClosingGreeting.value.trim() : ''
      };

      setTeacherPersona(state.activeTeacherKey, state.persona);
      setTeacherStyle(state.activeTeacherKey, state.persona.name);
      updatePersonaUI();
      if (classChanged) {
        loadChildren();
      }
      settingsModal.style.display = 'none';
      showToast(`🌱 '${newClassName}' (${newTeacherName}) 맞춤 설정이 성공적으로 저장되었습니다!`);
    });

    // 📝 관찰 메모 실시간 자동 저장 (Autosave on typing)
    if (rawMemoInput) {
      rawMemoInput.addEventListener('input', () => {
        try {
          localStorage.setItem('daycare_draft_memo', rawMemoInput.value);
        } catch (e) {}
      });
    }

    // 🗑️ 작성 중인 메모 2-Tap 안전 비우기 (PWA 모바일 confirm 차단 버그 완전 해결)
    if (btnClearMemoBtn && rawMemoInput) {
      let clearConfirmTimeout = null;
      let isWaitingClearConfirm = false;

      function resetClearBtn() {
        isWaitingClearConfirm = false;
        if (clearConfirmTimeout) {
          clearTimeout(clearConfirmTimeout);
          clearConfirmTimeout = null;
        }
        btnClearMemoBtn.innerHTML = '<span>🗑️</span> <span>비우기</span>';
        btnClearMemoBtn.style.background = '#F1F5F9';
        btnClearMemoBtn.style.color = '#64748B';
        btnClearMemoBtn.style.borderColor = '#CBD5E1';
      }

      btnClearMemoBtn.addEventListener('click', () => {
        const hasMemo = rawMemoInput.value.trim().length > 0;
        const hasPhotos = state.photos && state.photos.length > 0;
        if (!hasMemo && !hasPhotos) {
          showToast('비울 메모나 사진이 없습니다.');
          resetClearBtn();
          return;
        }

        if (!isWaitingClearConfirm) {
          // 1단계 터치: 붉은색 경고 버튼으로 전환 및 안내
          isWaitingClearConfirm = true;
          btnClearMemoBtn.innerHTML = '<span>⚠️</span> <span>정말 비울까요?</span>';
          btnClearMemoBtn.style.background = '#FEE2E2';
          btnClearMemoBtn.style.color = '#DC2626';
          btnClearMemoBtn.style.borderColor = '#FCA5A5';
          showToast('🗑️ 3초 안에 한 번 더 누르면 메모와 사진이 완전히 비워집니다.');

          clearConfirmTimeout = setTimeout(() => {
            resetClearBtn();
          }, 3000);
        } else {
          // 2단계 터치: 실제 초기화 실행
          resetClearBtn();
          rawMemoInput.value = '';
          state.photos = [];
          const photoPreviews = document.getElementById('photoPreviews');
          if (photoPreviews) photoPreviews.innerHTML = '';
          const photoFileInput = document.getElementById('photoFileInput');
          if (photoFileInput) photoFileInput.value = '';
          try {
            localStorage.removeItem('daycare_draft_memo');
          } catch (e) {}
          showToast('🗑️ 메모와 첨부 사진이 모두 깨끗하게 비워졌습니다.');
          rawMemoInput.focus();
        }
      });
    }

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
  // 8. Web Speech API (STT 한국어 음성 메모)
  // ============================================================================
  function setupSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      voiceMicBtn.style.opacity = '0.5';
      voiceMicBtn.title = '이 브라우저는 음성 인식을 지원하지 않습니다.';
      voiceMicBtn.addEventListener('click', () => {
        showToast('이 브라우저는 음성 인식을 지원하지 않습니다.');
      });
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'ko-KR';
    recognition.continuous = true;
    recognition.interimResults = false;

    recognition.onstart = () => {
      state.isRecording = true;
      voiceMicBtn.classList.add('recording');
      micIcon.textContent = '⏹️';
      micStatusText.textContent = '듣고 있어요...';
      showToast('마이크가 켜졌습니다. 말씀하세요!');
    };

    recognition.onresult = (event) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          transcript += event.results[i][0].transcript + ' ';
        }
      }
      if (transcript.trim()) {
        const currentVal = rawMemoInput.value.trim();
        rawMemoInput.value = currentVal ? `${currentVal}\n${transcript.trim()}` : transcript.trim();
        localStorage.setItem('daycare_draft_memo', rawMemoInput.value);
        rawMemoInput.focus();
        showToast('🎙️ 음성 메모가 텍스트에 누적 저장되었습니다.');
      }
    };

    recognition.onerror = (event) => {
      console.warn('Speech recognition error:', event.error);
      stopRecording();
      showToast(`음성 인식 오류: ${event.error}`);
    };

    recognition.onend = () => {
      stopRecording();
    };

    state.recognition = recognition;

    voiceMicBtn.addEventListener('click', () => {
      if (state.isRecording) {
        stopRecording();
      } else {
        try {
          recognition.start();
        } catch (e) {
          console.warn('Recognition start failed:', e);
        }
      }
    });
  }

  function stopRecording() {
    state.isRecording = false;
    voiceMicBtn.classList.remove('recording');
    micIcon.textContent = '🎙️';
    micStatusText.textContent = '음성 메모';
    if (state.recognition) {
      try {
        state.recognition.stop();
      } catch (e) {}
    }
  }

  // ============================================================================
  // 9. 사진 업로드 및 Base64 인코딩
  // ============================================================================
  function handlePhotoUpload(e) {
    const files = Array.from(e.target.files);
    if (!files || files.length === 0) return;

    if (state.photos.length + files.length > 6) {
      showToast('사진은 최대 6장까지만 첨부할 수 있습니다.');
      return;
    }

    files.forEach(file => {
      if (!file.type.startsWith('image/')) {
        showToast('이미지 파일만 첨부 가능합니다.');
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        state.photos.push(event.target.result);
        renderPhotoPreviews();
      };
      reader.readAsDataURL(file);
    });

    e.target.value = ''; // 재선택 가능하도록 리셋
  }

  function renderPhotoPreviews() {
    photoPreviews.innerHTML = '';
    state.photos.forEach((base64, index) => {
      const item = document.createElement('div');
      item.className = 'photo-preview-item';
      item.innerHTML = `
        <img src="${base64}" alt="첨부 사진 ${index + 1}">
        <button type="button" class="photo-delete-btn" title="삭제">&times;</button>
      `;
      item.querySelector('.photo-delete-btn').addEventListener('click', () => {
        state.photos.splice(index, 1);
        renderPhotoPreviews();
      });
      photoPreviews.appendChild(item);
    });
  }

  // ============================================================================
  // 9-B. 원아의 노션 실제 과거 관찰 기록 스캔 (시계열 팩트 기반 검증)
  // ============================================================================
  async function fetchChildPastLogs(childId, childName) {
    if (!childId && !childName) return [];

    let targetChildId = childId;
    if (!targetChildId || targetChildId.startsWith('mock-') || targetChildId.startsWith('sandbox_')) {
      const matched = state.children.find(c => c.name === childName && !c.id.startsWith('mock-') && !c.id.startsWith('sandbox_'));
      if (matched) targetChildId = matched.id;
    }

    try {
      let filter = null;
      if (targetChildId && !targetChildId.startsWith('mock-') && !targetChildId.startsWith('sandbox_')) {
        filter = {
          property: '원아',
          relation: { contains: targetChildId }
        };
      } else if (childName) {
        filter = {
          property: '기록명/식별자',
          title: { contains: childName }
        };
      }

      if (!filter) return [];

      const queryRes = await directNotionCall(`/databases/${NOTION_CONFIG.DAILY_LOG_DB_ID}/query`, 'POST', {
        filter,
        page_size: 10,
        sorts: [{ property: '작성일자', direction: 'descending' }]
      });

      const pages = queryRes.results || [];
      const pastLogs = pages.map(p => {
        const props = p.properties || {};
        const date = props['작성일자']?.date?.start || (p.created_time ? p.created_time.split('T')[0] : '');
        const area = props['활동 구분']?.select?.name || (props['표준보육 영역']?.multi_select?.[0]?.name || '자유놀이');
        const summary = props['관찰 요약']?.rich_text?.[0]?.plain_text ||
                        props['원시 메모/키워드']?.rich_text?.[0]?.plain_text ||
                        props['알림장 최종본']?.rich_text?.[0]?.plain_text?.slice(0, 120) || '';
        return { date, activity: area, behavior: summary };
      }).filter(log => log.date && log.behavior);

      return pastLogs;
    } catch (err) {
      console.warn('원아 과거 관찰 기록 조회 실패:', err);
      return [];
    }
  }

  // ============================================================================
  // 10. AI 생성 핸들러 (Gemini 3.8 Flash)
  // ============================================================================
  async function handleGenerate() {
    if (!state.selectedChild) {
      showToast('원아를 먼저 선택해주세요.');
      return;
    }

    const memoText = rawMemoInput.value.trim();
    if (!memoText && state.photos.length === 0) {
      showToast('관찰 메모를 입력하거나 활동 사진을 첨부해주세요.');
      rawMemoInput.focus();
      return;
    }

    // 로딩 시작
    generateBtn.disabled = true;
    loadingBox.style.display = 'block';
    resultsSection.style.display = 'none';

    // ⏹️ AbortController 초기화 (언제든 안전 중단 가능)
    const abortController = new AbortController();
    state.currentAbortController = abortController;
    state.isGenerationAborted = false;

    // 단계별 메시지 애니메이션
    const steps = [
      '🛡️ 원아 실명 마스킹 가드 적용 중...',
      '🤖 Gemini 3.8 Flash 멀티모달 보육 맥락 분석 중...',
      '📌 과거 관찰일지 연계 및 성장점 추출 중...',
      '✨ 실명 안전 복원 및 알림장/일지 조립 중...'
    ];
    let stepIndex = 0;
    loadingStepText.textContent = steps[0];
    const stepInterval = setInterval(() => {
      stepIndex = (stepIndex + 1) % steps.length;
      loadingStepText.textContent = steps[stepIndex];
    }, 1200);

    try {
      // 원아의 과거 실제 관찰 기록 스캔 (노션 DAILY_LOG_DB)
      let pastLogs = [];
      try {
        pastLogs = await fetchChildPastLogs(state.selectedChild.id, state.selectedChild.name);
      } catch (pastErr) {
        console.warn('과거 기록 스캔 실패:', pastErr);
      }

      const payload = {
        childId: state.selectedChild.id,
        childName: state.selectedChild.name,
        childAge: state.selectedChild.age,
        childTraits: state.selectedChild.traits,
        parentStyle: state.selectedChild.parentStyle || '',
        allergies: state.selectedChild.allergies,
        rawMemo: memoText,
        images: state.photos,
        mode: state.mode,
        activityArea: state.activityArea,
        teacherStyle: state.teacherStyle,
        className: state.className || '햇살반',
        teacherName: state.teacherName || '김선생님',
        persona: state.persona,
        pastLogs: pastLogs
      };

      if (monthlyObsTargetMonth) {
        payload.monthlyObsOptions = {
          targetMonth: monthlyObsTargetMonth.value || '2026-09',
          date1: monthlyObsDate1 ? monthlyObsDate1.value : '',
          area1: monthlyObsArea1 ? monthlyObsArea1.value : '의사소통',
          date2: monthlyObsDate2 ? monthlyObsDate2.value : '',
          area2: monthlyObsArea2 ? monthlyObsArea2.value : '사회관계'
        };
      }

      let resultData = null;

      // 1. 한국 브라우저 IP 직통 호출 시도 (Cloudflare 유럽 노드 지역 제한 400 원천 회피)
      if (window.GeminiClient && typeof window.GeminiClient.generate === 'function') {
        try {
          const clientRes = await window.GeminiClient.generate(payload, { signal: abortController.signal });
          if (clientRes && clientRes.success) {
            resultData = clientRes.data;
          }
        } catch (clientErr) {
          if (clientErr.name === 'AbortError' || state.isGenerationAborted) {
            throw clientErr;
          }
          console.warn('클라이언트 직통 호출 실패, 서버 엔드포인트로 폴백:', clientErr);
        }
      }

      // 2. 서버 폴백 (/api/generate)
      if (!resultData && !state.isGenerationAborted) {
        const res = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: abortController.signal,
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || '생성 중 오류가 발생했습니다.');
        }

        const json = await res.json();
        resultData = json.data;
      }

      state.lastResult = resultData;
      state.originalResult = JSON.parse(JSON.stringify(resultData)); // ↺ 최초 생성 원본 백업 (원래대로 복원용)
      renderResults(resultData);
      showToast('🎉 맞춤 보육 기록이 완성되었습니다!');
    } catch (err) {
      if (err.name === 'AbortError' || state.isGenerationAborted) {
        console.log('AI 작성이 교사에 의해 안전하게 취소되었습니다.');
        showToast('⏹️ AI 생성이 안전하게 중단되었습니다. 메모를 수정해보세요.');
        if (rawMemoInput) rawMemoInput.focus();
      } else {
        console.error('Generate Error:', err);
        showToast(`오류: ${err.message}`);
      }
    } finally {
      clearInterval(stepInterval);
      generateBtn.disabled = false;
      loadingBox.style.display = 'none';
      state.currentAbortController = null;
      state.isGenerationAborted = false;
    }
  }

  // ============================================================================
  // 10-B. AI 실시간 알림장 다듬기 (Quick Refine)
  // ============================================================================
  async function handleRefine(instruction) {
    if (!instruction || !instruction.trim()) return;
    if (!kidsnoteContent.value.trim()) {
      showToast('다듬을 알림장 내용이 없습니다.');
      return;
    }

    const currentTitle = kidsnoteTitle.textContent;
    const currentContent = kidsnoteContent.value;
    const childName = state.selectedChild ? state.selectedChild.name : '김민서';

    if (refiningSpinner) refiningSpinner.style.display = 'inline';
    const chips = kidsnoteRefineBox ? kidsnoteRefineBox.querySelectorAll('.refine-chip, .refine-custom-btn') : [];
    chips.forEach(b => b.disabled = true);

    try {
      if (window.GeminiClient && typeof window.GeminiClient.refine === 'function') {
        const refined = await window.GeminiClient.refine({
          currentTitle,
          currentContent,
          instruction,
          childName,
          persona: state.persona
        });
        kidsnoteTitle.textContent = refined.title;
        kidsnoteContent.value = refined.content;
        showToast('✨ 요청하신 내용으로 자연스럽게 다듬어졌습니다!');
      } else {
        throw new Error('다듬기 엔진이 준비되지 않았습니다.');
      }
    } catch (err) {
      console.error('Refine Error:', err);
      showToast(`다듬기 오류: ${err.message}`);
    } finally {
      if (refiningSpinner) refiningSpinner.style.display = 'none';
      chips.forEach(b => b.disabled = false);
    }
  }

  // ↺ 원래대로 복원
  function handleResetOriginal() {
    if (!state.originalResult || !state.originalResult.kidsnote) {
      showToast('복원할 최초 생성본이 없습니다.');
      return;
    }
    kidsnoteTitle.textContent = state.originalResult.kidsnote.title || '오늘의 알림장';
    kidsnoteContent.value = state.originalResult.kidsnote.content || '';
    showToast('↺ 처음 생성된 원본 초안으로 복원되었습니다.');
  }

  // ============================================================================
  // 11. 생성 결과 렌더링
  // ============================================================================
  function renderResults(data) {
    if (!data) return;

    // 0. 처형분 정규 놀이중심 보육일지 공문서 채우기
    const rep = data.class_daily_report;
    const kn = data.kidsnote || {};
    const obs = data.observation_log || {};
    const dc = data.daily_care_log || {};

    if (rep || state.mode === 'class_report') {
      if (tabClassDailyReport) tabClassDailyReport.style.display = 'inline-flex';

      const ageText = state.selectedChild?.age || (state.className && state.className.includes('사랑') ? '만 0세' : '만 2세');
      const targetDateObj = state.selectedDate ? new Date(state.selectedDate + 'T00:00:00') : new Date();
      const todayFormatted = targetDateObj.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });

      if (repDocTitle) repDocTitle.textContent = rep?.title || `1. ${ageText} 놀이중심 보육일지`;
      if (repHdrClass) repHdrClass.textContent = `${state.className} (${ageText})`;
      if (repHdrDate) repHdrDate.textContent = rep?.date || todayFormatted;
      if (repHdrTheme) repHdrTheme.textContent = rep?.play_theme || `${state.activityArea} & 놀이 활동`;

      if (reportCurriculumTbody) {
        reportCurriculumTbody.innerHTML = '';
        const activities = (rep && Array.isArray(rep.activities) && rep.activities.length > 0)
          ? rep.activities
          : [
              {
                photo_ref: '[사진 1, 2 참조]',
                activity_title: state.activityArea || '놀이 활동',
                observation: `[관찰 내용] ${kn.content ? kn.content.slice(0, 180) + '...' : '유아들은 놀잇감을 탐색하며 즐겁게 몰입한다.'}`,
                learning_content: `[배움 읽기: ${obs.standard_area || '신체운동'}] - ${obs.evaluation || '놀이를 통해 기본 운동 능력을 기른다.'}`
              }
            ];

        activities.forEach(act => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td class="rep-td">
              <div style="font-weight: 700; color: #1E293B; margin-bottom: 4px;">${act.photo_ref || '[사진 참조]'} ${act.activity_title || ''}</div>
              <div style="font-size: 12px; line-height: 1.5; color: #334155;">${act.observation || ''}</div>
            </td>
            <td class="rep-td">
              <div style="font-size: 12px; line-height: 1.5; color: #1E293B;">${act.learning_content || ''}</div>
            </td>
          `;
          reportCurriculumTbody.appendChild(tr);
        });
      }

      if (repReflectionText) {
        repReflectionText.textContent = rep?.reflection ? rep.reflection.replace(/^●\s*성찰:\s*/, '') : (dc.play_evaluation || '유아들의 흥미를 반영한 놀이 연계로 높은 몰입도를 보였다.');
      }
      if (repSupportEnvText) {
        repSupportEnvText.textContent = rep?.support?.environment ? rep.support.environment.replace(/^○\s*환경\s*지원:\s*/, '') : (dc.next_support_plan || '안전한 공간 확보 및 충분한 놀이 교구 배치 지원.');
      }
      if (repSupportSafetyText) {
        repSupportSafetyText.textContent = rep?.support?.safety ? rep.support.safety.replace(/^○\s*바깥놀이\s*안전\s*관리:\s*/, '').replace(/^○\s*상호작용\s*지원:\s*/, '') : '짧은 산책 시 보행 안전선을 지키고 상호작용 간 안전거리를 유지하도록 지도함.';
      }
    }

    // 0-B. 🧩 감지된 원아별 놀이 요약 (Human-in-the-Loop 교사 1초 눈 검수 목록) 채우기
    const indivObs = data.individual_observations;
    if (individualObsCard && individualObsList) {
      if (Array.isArray(indivObs) && indivObs.length > 0) {
        individualObsCard.style.display = 'block';
        if (individualObsCountBadge) {
          individualObsCountBadge.textContent = `${indivObs.length}명 감지됨`;
        }
        individualObsList.innerHTML = '';

        indivObs.forEach((item, idx) => {
          const itemEl = document.createElement('div');
          itemEl.className = 'individual-obs-item active';
          itemEl.id = `indiv-obs-item-${idx}`;

          const childName = item.child_name || `원아 ${idx + 1}`;
          const standardArea = item.standard_area || '신체운동';
          const activityName = item.activity_name || state.activityArea || '놀이 활동';
          const summary = item.observation_summary || '';

          itemEl.innerHTML = `
            <div class="indiv-obs-top-row">
              <div class="indiv-obs-meta">
                <label class="indiv-obs-check-label">
                  <input type="checkbox" class="indiv-obs-checkbox" checked data-idx="${idx}" data-child-name="${childName}">
                  <span class="indiv-obs-name">👶 ${childName}</span>
                </label>
                <div class="indiv-obs-badges">
                  <span class="indiv-obs-badge-area">${standardArea}</span>
                  <span class="indiv-obs-badge-activity">${activityName}</span>
                </div>
              </div>
              <span class="indiv-obs-status-tag" id="indiv-obs-status-${idx}" style="display: none;">
                ✓ 저장됨
              </span>
            </div>
            <div class="indiv-obs-input-row">
              <input type="text" class="indiv-obs-input" id="indiv-obs-input-${idx}" value="${summary.replace(/"/g, '&quot;')}" placeholder="원아의 관찰 요약 (1초 수정 가능)" data-original="${summary.replace(/"/g, '&quot;')}">
            </div>
          `;

          // 체크박스 토글 시 스타일 및 버튼 텍스트 카운트 갱신
          const chk = itemEl.querySelector('.indiv-obs-checkbox');
          if (chk) {
            chk.addEventListener('change', (e) => {
              itemEl.classList.toggle('active', e.target.checked);
              updateSelectedIndivObsCount();
            });
          }

          individualObsList.appendChild(itemEl);
        });

        updateSelectedIndivObsCount();
      } else {
        individualObsCard.style.display = 'none';
      }
    }

    // 1. 키즈노트 알림장 채우기
    kidsnoteTitle.textContent = kn.title || '오늘의 알림장';
    kidsnoteContent.value = kn.content || '';

    kidsnoteTags.innerHTML = '';
    (kn.tags || []).forEach(tag => {
      const span = document.createElement('span');
      span.className = 'tag-badge';
      span.textContent = tag.startsWith('#') ? tag : `#${tag}`;
      kidsnoteTags.appendChild(span);
    });

    // 2. 🧸 평가제 영유아 월간 발달 관찰기록부 (A4 정규 양식) 채우기
    const mob = data.monthly_observation;
    const targetMonthStr = mob?.target_month || (monthlyObsTargetMonth?.value ? `${monthlyObsTargetMonth.value.split('-')[0]}년 ${parseInt(monthlyObsTargetMonth.value.split('-')[1])}월` : '2026년 9월');
    const childDisplayName = state.selectedChild ? `${state.selectedChild.name} (${state.selectedChild.age || '만 2세'})` : '원아 (만 2세)';
    const teacherDisplayName = `${state.className || '소망반'} / ${state.teacherName || '공가희 주임교사'}`;

    if (monthlyObsDocTitle) monthlyObsDocTitle.textContent = mob?.title || `[${targetMonthStr}] 영유아 발달 관찰기록부`;
    if (monthlyObsChildName) monthlyObsChildName.textContent = childDisplayName;
    if (monthlyObsTeacherName) monthlyObsTeacherName.textContent = teacherDisplayName;
    if (monthlyObsPeriod) monthlyObsPeriod.textContent = `${targetMonthStr} (상순 1회 + 하순 1회 연속 관찰)`;

    // 1차 관찰 바인딩
    const obs1Date = mob?.obs_1?.date || (monthlyObsDate1?.value || '2026-09-08');
    const obs1Area = mob?.obs_1?.area || (monthlyObsArea1?.value || obs.standard_area || '의사소통');
    if (obs1DateMeta) obs1DateMeta.textContent = `${obs1Date} (${getDayOfWeekName(obs1Date)})`;
    if (obs1AreaBadge) obs1AreaBadge.textContent = obs1Area;
    if (obs1ActivityTitle) obs1ActivityTitle.textContent = mob?.obs_1?.activity_title || obs.activity_name || state.activityArea;
    if (obs1BehaviorText) obs1BehaviorText.textContent = mob?.obs_1?.behavior || obs.behavior || '';
    if (obs1SupportText) obs1SupportText.textContent = mob?.obs_1?.teacher_support || obs.evaluation || '';

    // 2차 관찰 바인딩 (연속성)
    const obs2Date = mob?.obs_2?.date || (monthlyObsDate2?.value || '2026-09-22');
    const obs2Area = mob?.obs_2?.area || (monthlyObsArea2?.value || '사회관계');
    if (obs2DateMeta) obs2DateMeta.textContent = `${obs2Date} (${getDayOfWeekName(obs2Date)})`;
    if (obs2AreaBadge) obs2AreaBadge.textContent = obs2Area;
    if (obs2ActivityTitle) obs2ActivityTitle.textContent = mob?.obs_2?.activity_title || state.activityArea;
    if (obs2BehaviorText) obs2BehaviorText.textContent = mob?.obs_2?.behavior || (obs.behavior ? `1차 지도 이후 ${obs.behavior}` : '');
    if (obs2SupportText) obs2SupportText.textContent = mob?.obs_2?.teacher_support || (obs.evaluation || '');
    if (obs2GrowthText) obs2GrowthText.textContent = mob?.obs_2?.growth_continuity || '1차 상호작용 지원 이후 상황을 수용하고 긍정적으로 반응하는 발전적 행동 변화를 보임.';

    // 월말 종합 총평 바인딩
    if (monthlySummaryDevText) {
      monthlySummaryDevText.textContent = mob?.monthly_summary?.development_summary || `${obs1Area} 및 ${obs2Area} 영역에서 또래 및 교사와의 상호작용에 적극적으로 참여하며 전반적인 발달 과업을 원활히 수행함.`;
    }
    if (monthlySummaryPlanText) {
      monthlySummaryPlanText.textContent = mob?.monthly_summary?.next_month_plan || '다음 달에는 유아의 자율적 탐색을 격려하고 성공 경험을 누적할 수 있도록 칭찬과 비계를 지속 지원할 계획임.';
    }

    // 기존 단일 폼 필드 채우기 (하위 호환)
    if (obsStandardArea) obsStandardArea.textContent = `표준보육 영역: ${obs1Area}`;
    if (obsActivityName) obsActivityName.textContent = `활동: ${mob?.obs_1?.activity_title || obs.activity_name || state.activityArea}`;
    if (obsBehaviorContent) obsBehaviorContent.value = mob?.obs_1?.behavior || obs.behavior || '';
    if (obsEvaluationContent) obsEvaluationContent.value = mob?.obs_1?.teacher_support || obs.evaluation || '';

    // 3. 일일 보육일지 (놀이 평가 및 내일 지원) 채우기
    if (dailyPlaySummary) dailyPlaySummary.value = dc.play_summary || '';
    if (dailyPlayEval) dailyPlayEval.value = dc.play_evaluation || '';
    if (dailyNextPlan) dailyNextPlan.value = dc.next_support_plan || '';

    // 4. 학부모 상담 면담일지 채우기
    const pc = data.parent_counseling || {};
    if (counselRoutine) counselRoutine.value = pc.daily_routine || '';
    if (counselSocial) counselSocial.value = pc.social_relations || '';
    if (counselDev) counselDev.value = pc.development_feature || '';
    if (counselOpinion) counselOpinion.value = pc.counseling_opinion || '';

    // 5. 놀이 지원 & 환경구성안 채우기
    const ps = data.play_support_plan || {};
    if (playExtension) playExtension.value = ps.extension_idea || '';
    if (playMaterials) playMaterials.value = ps.recommended_materials || '';
    if (playTips) playTips.value = ps.interaction_tips || '';

    // 6. 과거 기록 출처 (Citation) 표기
    const cit = data.citation || {};
    if (citationBox) {
      if (cit.has_citation && cit.summary) {
        citationBox.style.display = 'flex';
        if (citationSummaryText) citationSummaryText.textContent = cit.summary;
      } else {
        citationBox.style.display = 'none';
      }
    }

    // 7. 선택된 대상에 맞추어 스마트 기본 탭 전환
    // 학급 전체('소망반 전체' 등)를 선택한 경우에만 'class_daily_report'가 1순위,
    // 개별 원아를 선택한 경우 선생님이 가장 먼저 확인 및 발송할 'kidsnote'(알림장)가 무조건 1순위 기본 활성화!
    let targetTab = 'kidsnote';
    const isClassAll = state.selectedChild && (
      state.selectedChild.id === 'class-all' ||
      state.selectedChild.name?.includes('학급') ||
      state.selectedChild.name?.includes('전체') ||
      state.selectedChild.name?.includes('우리 반')
    );

    if (isClassAll) {
      targetTab = 'class_daily_report';
    } else {
      targetTab = 'kidsnote';
    }

    resultTabBtns.forEach(b => {
      b.classList.toggle('active', b.dataset.tab === targetTab);
    });
    if (classDailyReportCard) classDailyReportCard.style.display = targetTab === 'class_daily_report' ? 'block' : 'none';
    if (kidsnoteCard) kidsnoteCard.style.display = targetTab === 'kidsnote' ? 'flex' : 'none';
    if (observationCard) observationCard.style.display = targetTab === 'observation' ? 'block' : 'none';
    if (dailyCareCard) dailyCareCard.style.display = targetTab === 'daily_care' ? 'flex' : 'none';
    if (counselingCard) counselingCard.style.display = targetTab === 'counseling' ? 'flex' : 'none';
    if (playSupportCard) playSupportCard.style.display = targetTab === 'play_support' ? 'flex' : 'none';

    // 결과 섹션 노출 및 스크롤
    resultsSection.style.display = 'flex';
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ============================================================================
  // 11-B. 처형분 실무 공문서 버튼 핸들러 (한글 HWP 표 복사, 텍스트 복사, 노션 저장)
  // ============================================================================
  async function handleCopyHwpTable() {
    const sheetEl = document.getElementById('officialReportSheet');
    if (!sheetEl) {
      showToast('복사할 보육일지 내용이 없습니다.');
      return;
    }
    try {
      const htmlContent = sheetEl.outerHTML;
      const textContent = sheetEl.innerText;
      if (navigator.clipboard && window.ClipboardItem) {
        const blobHtml = new Blob([htmlContent], { type: 'text/html' });
        const blobText = new Blob([textContent], { type: 'text/plain' });
        await navigator.clipboard.write([new ClipboardItem({ 'text/html': blobHtml, 'text/plain': blobText })]);
        showToast('🎉 한글(HWP) 표 복사 완료! 한글 문서에 Ctrl+V 하시면 표 그대로 붙여넣기됩니다.');
      } else {
        await copyTextToClipboard(textContent, '📋 텍스트가 복사되었습니다.');
      }
    } catch (err) {
      console.warn('ClipboardItem HTML 복사 실패, 텍스트 폴백:', err);
      await copyTextToClipboard(sheetEl.innerText, '📋 텍스트가 복사되었습니다.');
    }
  }

  function handleCopyFullReportText() {
    const sheetEl = document.getElementById('officialReportSheet');
    if (!sheetEl) return;
    copyTextToClipboard(sheetEl.innerText, '📋 보육일지 전체 텍스트가 복사되었습니다.');
  }

  // 🧸 평가제 월간 발달 관찰기록부 한글(HWP) 표 복사
  async function handleCopyMonthlyObsHwp() {
    const sheetEl = document.getElementById('officialObsSheet');
    if (!sheetEl) {
      showToast('복사할 관찰기록부 내용이 없습니다.');
      return;
    }
    try {
      const htmlContent = sheetEl.outerHTML;
      const textContent = sheetEl.innerText;
      if (navigator.clipboard && window.ClipboardItem) {
        const blobHtml = new Blob([htmlContent], { type: 'text/html' });
        const blobText = new Blob([textContent], { type: 'text/plain' });
        await navigator.clipboard.write([new ClipboardItem({ 'text/html': blobHtml, 'text/plain': blobText })]);
        showToast('🎉 한글(HWP) 표 복사 완료! 한글 문서에 Ctrl+V 하시면 관찰기록부 표 그대로 붙여넣기됩니다.');
      } else {
        await copyTextToClipboard(textContent, '📋 텍스트가 복사되었습니다.');
      }
    } catch (err) {
      console.warn('ClipboardItem HTML 복사 실패, 텍스트 폴백:', err);
      await copyTextToClipboard(sheetEl.innerText, '📋 텍스트가 복사되었습니다.');
    }
  }

  // ============================================================================
  // 9 & 10. 노션 DB 저장 & 지난 기록 보관함 (notion-bridge.js & history-viewer.js 연동)
  // ============================================================================

  // 기록 보관함 이벤트 리스너 등록
  if (headerHistoryBtn) {
    headerHistoryBtn.addEventListener('click', openHistoryModal);
    headerHistoryBtn.onclick = openHistoryModal;
  }
  if (btnCloseHistoryModal) {
    btnCloseHistoryModal.addEventListener('click', closeHistoryModal);
    btnCloseHistoryModal.onclick = closeHistoryModal;
  }
  if (btnRefreshHistory) {
    btnRefreshHistory.addEventListener('click', () => fetchHistoryLogs(true));
    btnRefreshHistory.onclick = () => fetchHistoryLogs(true);
  }

  if (historyClassSelect) {
    historyClassSelect.onchange = () => {
      populateHistoryChildOptions();
      renderHistoryList();
    };
  }
  if (historyChildSelect) historyChildSelect.onchange = () => renderHistoryList();
  if (historyTypeSelect) historyTypeSelect.onchange = () => renderHistoryList();
  if (historySearchInput) historySearchInput.oninput = () => renderHistoryList();

  if (btnCloseHistoryDetailModal) btnCloseHistoryDetailModal.onclick = closeHistoryDetailModal;
  if (btnCopyHistoryText) btnCopyHistoryText.onclick = copyCurrentHistoryText;
  if (btnCopyHistoryHwp) btnCopyHistoryHwp.onclick = copyCurrentHistoryHwp;
  if (btnPrintHistory) btnPrintHistory.onclick = () => window.print();

  // 모달 바깥 배경 클릭 시 닫기
  window.addEventListener('click', (e) => {
    if (e.target === historyModal) closeHistoryModal();
    if (e.target === historyDetailModal) closeHistoryDetailModal();
  });

  // 애플리케이션 시작
  init();
});

