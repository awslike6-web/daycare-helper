/**
 * 🧸 daycare-helper Frontend Application Logic (app.js)
 * 2026 Modern Vanilla JS (ES2024+)
 */

document.addEventListener('DOMContentLoaded', () => {
  // ============================================================================
  // 0. 4대 대표 페르소나 프리셋 (Presets)
  // ============================================================================
  const PERSONA_PRESETS = {
    play_friendly: {
      preset: 'play_friendly',
      name: '놀이 중심 다정체',
      icon: '🌿',
      sampleNote: '오늘 우리 민서는 블록 영역에서 친구들과 커다란 동물원 울타리를 만들며 신나게 놀이했답니다. 기린 인형을 울타리 안에 넣고 나뭇잎 먹이를 주는 흉내를 내며 활짝 웃는 모습이 참 사랑스러웠어요. 쌓던 블록이 와르르 쓰러져도 속상해하지 않고 씩씩하게 다시 세우는 모습에서 기특한 성장을 느꼈답니다. 가정에서도 오늘 즐거웠던 동물원 놀이에 대해 많은 칭찬 부탁드립니다.^^',
      callStyle: '우리 [아동A]',
      emojiLevel: 'moderate',
      closingGreeting: '가정에서도 편안하고 따뜻한 저녁 되세요^^'
    },
    growth_detail: {
      preset: 'growth_detail',
      name: '발달 관찰 서술체',
      icon: '📖',
      sampleNote: '오늘 민서는 오전 자유놀이 시간에 조작 영역에 스스로 다가가 블록 놀이에 깊이 몰입하였습니다. 이전보다 손가락 힘과 양손 협응력이 향상되어 10단 이상의 탑을 안정적으로 쌓았으며, 블록이 흔들릴 때 조심스럽게 받쳐 균형을 유지하는 문제해결력을 보였습니다. 또래 친구에게 블록을 나누어주며 긍정적인 사회적 상호작용을 나누는 모습이 무척 인상 깊었습니다. 가정에서도 오늘의 성취에 대해 따뜻한 격려 부탁드립니다.',
      callStyle: '[아동A]',
      emojiLevel: 'none',
      closingGreeting: '가정에서도 오늘의 성취에 대해 따뜻한 격려 부탁드립니다.'
    },
    warm_parent: {
      preset: 'warm_parent',
      name: '따뜻한 공감형',
      icon: '🌸',
      sampleNote: '어머님 안녕하세요~^^ 오늘 우리 민서가 원에 들어올 때부터 환한 미소로 인사를 건네주어 교실이 온통 환해졌답니다! 블록 놀이를 하면서 "선생님 이것 보세요!" 하며 자랑스럽게 보여주는데 어찌나 사랑스럽던지요. 친구를 배려하는 따뜻한 마음씨에 가슴이 뭉클했답니다. 오늘 밤 가정에서도 민서 많이 안아주세요💕',
      callStyle: '우리 [아동A]',
      emojiLevel: 'rich',
      closingGreeting: '오늘 밤 가정에서도 우리 민서 꼭 안아주세요💕'
    },
    lively_vivid: {
      preset: 'lively_vivid',
      name: '밝고 생동감 있는 문체',
      icon: '✨',
      sampleNote: '오늘 우리 민서의 하루는 에너지 만점! 🌟 친구들과 함께 블록으로 거대한 우주선을 만들었답니다! 🚀 뚝딱뚝딱 손끝이 야무진 우리 민서, 친구들과 "출발!"을 외치며 신나게 웃는 모습이 교실을 환하게 밝혔어요. 🥰 내일도 신나게 놀자 민서야~!',
      callStyle: '우리 [아동A]',
      emojiLevel: 'rich',
      closingGreeting: '내일도 즐겁게 만나요! 🥰'
    }
  };

  // ============================================================================
  // 1. 애플리케이션 상태 (State) 및 학부모 프리셋
  // ============================================================================
  const savedPersona = localStorage.getItem('daycare_persona');
  const initialPersona = savedPersona ? JSON.parse(savedPersona) : PERSONA_PRESETS.play_friendly;

  const PARENT_PRESETS = {
    safe_detail: '안심 서술형 (식사량, 낮잠, 작은 상처, 정서적 안정감 세심 안내 선호)',
    speedy_summary: '스피디 요약형 (바쁜 맞벌이 부모님, 퇴근 후 3줄 핵심 요약 선호)',
    social_care: '인성·교우관계형 (또래 배려, 양보, 따뜻한 사회성 일화 중심 선호)',
    growth_praise: '성장 성취형 (조작력과 문제해결력, 발달 성취 칭찬 중심 선호)'
  };

  const state = {
    className: localStorage.getItem('daycare_class_name') || '햇살반',
    teacherName: localStorage.getItem('daycare_teacher_name') || '김선생님',
    filterOnlyMyClass: true, // 🌱 우리 반 아이들만 우선 필터링 (아내 ↔ 처형 반 분리)
    children: [],
    selectedChild: null,
    mode: 'play_story', // 'play_story' (놀이 알림장 집중) | 'observation' | 'all_suite'
    activityArea: '자유놀이',
    photos: [], // base64 strings
    teacherStyle: localStorage.getItem('daycare_teacher_style') || '놀이 중심 다정체',
    persona: initialPersona,
    isRecording: false,
    recognition: null,
    lastResult: null,
    originalResult: null // ↺ 최초 생성본 (원래대로 복원용)
  };

  // ============================================================================
  // 2. DOM 요소 참조
  // ============================================================================
  const headerDateText = document.getElementById('headerDateText');
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

  const modeSwitcher = document.getElementById('modeSwitcher');
  const areaSection = document.getElementById('areaSection');
  const areaGrid = document.getElementById('areaGrid');
  const voiceMicBtn = document.getElementById('voiceMicBtn');
  const micIcon = document.getElementById('micIcon');
  const micStatusText = document.getElementById('micStatusText');
  const rawMemoInput = document.getElementById('rawMemoInput');
  const photoFileInput = document.getElementById('photoFileInput');
  const photoPreviews = document.getElementById('photoPreviews');
  const generateBtn = document.getElementById('generateBtn');
  const loadingBox = document.getElementById('loadingBox');
  const loadingStepText = document.getElementById('loadingStepText');

  // 결과 영역 요소들
  const resultsSection = document.getElementById('resultsSection');
  const resultTabs = document.getElementById('resultTabs');
  const resultTabBtns = document.querySelectorAll('.result-tab-btn');
  const kidsnoteCard = document.getElementById('kidsnoteCard');
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

  const obsStandardArea = document.getElementById('obsStandardArea');
  const obsActivityName = document.getElementById('obsActivityName');
  const obsBehaviorContent = document.getElementById('obsBehaviorContent');
  const obsEvaluationContent = document.getElementById('obsEvaluationContent');
  const citationBox = document.getElementById('citationBox');
  const citationSummaryText = document.getElementById('citationSummaryText');
  const copyObservationBtn = document.getElementById('copyObservationBtn');
  const saveNotionBtn = document.getElementById('saveNotionBtn');

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
  // 3-A. 🧸 2-Way 보안 잠금 게이트 (4자리 PIN & 이메일 선택) 로직
  // ============================================================================
  const AUTH_KEY_SESSION = 'daycare_local_auth_session';
  const AUTH_KEY_PIN = 'daycare_custom_pin_code';
  const DEFAULT_PIN = '0000';
  const AUTH_30_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

  function getActivePin() {
    return localStorage.getItem(AUTH_KEY_PIN) || DEFAULT_PIN;
  }

  function initAuthGate() {
    if (!authGateModal) return;

    // 1. 기존 세션 검사 (30일 유지 여부)
    const savedSession = localStorage.getItem(AUTH_KEY_SESSION);
    if (savedSession) {
      try {
        const sessionObj = JSON.parse(savedSession);
        if (sessionObj.expiresAt && sessionObj.expiresAt > Date.now()) {
          // 유효한 세션 존재 -> 잠금 해제 통과!
          authGateModal.style.display = 'none';
          if (sessionUserEmailText) {
            sessionUserEmailText.textContent = sessionObj.user || '선생님 (간편 인증)';
          }
          setupAuthEventListeners();
          return;
        }
      } catch (e) {
        localStorage.removeItem(AUTH_KEY_SESSION);
      }
    }

    // 세션 없거나 만료됨 -> 잠금 화면 표시!
    authGateModal.style.display = 'flex';
    resetPinDisplay();
    setupAuthEventListeners();
  }

  function setupAuthEventListeners() {
    // 탭 전환 (PIN vs 이메일)
    if (tabPinBtn && tabEmailBtn) {
      tabPinBtn.onclick = () => {
        tabPinBtn.classList.add('active');
        tabEmailBtn.classList.remove('active');
        pinPanel.style.display = 'block';
        emailPanel.style.display = 'none';
        resetPinDisplay();
      };
      tabEmailBtn.onclick = () => {
        tabEmailBtn.classList.add('active');
        tabPinBtn.classList.remove('active');
        emailPanel.style.display = 'block';
        pinPanel.style.display = 'none';
        if (authEmailInput) authEmailInput.focus();
      };
    }

    // 3x4 키패드 클릭
    keypadButtons.forEach(btn => {
      btn.onclick = () => {
        const num = btn.getAttribute('data-num');
        if (num !== null) {
          handlePinInput(num);
        }
      };
    });

    if (keypadClearBtn) {
      keypadClearBtn.onclick = () => resetPinDisplay();
    }

    if (keypadBackspaceBtn) {
      keypadBackspaceBtn.onclick = () => handlePinBackspace();
    }

    // 물리 키보드 숫자 입력 지원
    window.addEventListener('keydown', (e) => {
      if (authGateModal && authGateModal.style.display === 'flex' && pinPanel && pinPanel.style.display !== 'none') {
        if (e.key >= '0' && e.key <= '9') {
          handlePinInput(e.key);
        } else if (e.key === 'Backspace') {
          handlePinBackspace();
        } else if (e.key === 'Escape') {
          resetPinDisplay();
        }
      }
    });

    // 이메일 로그인 폼
    if (emailLoginForm) {
      emailLoginForm.onsubmit = (e) => {
        e.preventDefault();
        const emailVal = authEmailInput.value.trim();
        if (!emailVal || !emailVal.includes('@')) {
          if (emailErrorMsg) emailErrorMsg.textContent = '올바른 이메일 주소를 입력해 주세요.';
          return;
        }
        // 이메일 로그인 성공
        loginSuccess(emailVal);
      };
    }

    // 헤더 및 모달 로그아웃 (잠금)
    const handleLogout = () => {
      localStorage.removeItem(AUTH_KEY_SESSION);
      if (settingsModal) settingsModal.style.display = 'none';
      if (authGateModal) authGateModal.style.display = 'flex';
      resetPinDisplay();
      showToast('🔒 보안 잠금 상태로 전환되었습니다.');
    };

    if (headerLogoutBtn) headerLogoutBtn.onclick = handleLogout;
    if (modalLogoutBtn) modalLogoutBtn.onclick = handleLogout;

    // PIN 변경 UI 핸들러
    if (openChangePinBtn && pinChangeBox) {
      openChangePinBtn.onclick = () => {
        const isHidden = pinChangeBox.style.display === 'none';
        pinChangeBox.style.display = isHidden ? 'block' : 'none';
        if (isHidden && newPinInput) {
          newPinInput.value = '';
          newPinInput.focus();
        }
      };
    }

    if (cancelNewPinBtn && pinChangeBox) {
      cancelNewPinBtn.onclick = () => {
        pinChangeBox.style.display = 'none';
      };
    }

    if (saveNewPinBtn && newPinInput) {
      saveNewPinBtn.onclick = () => {
        const newPin = newPinInput.value.trim();
        if (!/^\d{4}$/.test(newPin)) {
          alert('비밀번호는 반드시 4자리 숫자여야 합니다.');
          newPinInput.focus();
          return;
        }
        localStorage.setItem(AUTH_KEY_PIN, newPin);
        pinChangeBox.style.display = 'none';
        showToast(`✅ 새 4자리 PIN(${newPin})으로 성공적으로 변경되었습니다.`);
      };
    }
  }

  function handlePinInput(digit) {
    if (pinBuffer.length >= 4) return;
    pinBuffer += digit;
    updatePinDots();

    if (pinBuffer.length === 4) {
      // 4자리 채워짐 -> 검증!
      const activePin = getActivePin();
      if (pinBuffer === activePin) {
        // 성공!
        if (pinErrorMsg) {
          pinErrorMsg.textContent = '✨ 확인되었습니다. 잠시만 기다려주세요...';
          pinErrorMsg.style.color = '#059669';
        }
        if (navigator.vibrate) navigator.vibrate([40, 40, 40]);
        setTimeout(() => {
          const currentClass = state.className || '햇살반';
          const currentTeacher = state.teacherName || '김선생님';
          loginSuccess(`${currentClass} ${currentTeacher} (PIN 인증)`);
        }, 200);
      } else {
        // 실패!
        if (pinDotsContainer) {
          pinDotsContainer.classList.add('pin-shake');
          setTimeout(() => pinDotsContainer.classList.remove('pin-shake'), 400);
        }
        if (pinErrorMsg) {
          pinErrorMsg.textContent = '비밀번호가 일치하지 않아요. (초기: 0000)';
          pinErrorMsg.style.color = '#EF4444';
        }
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
        setTimeout(() => {
          resetPinDisplay();
        }, 450);
      }
    }
  }

  function handlePinBackspace() {
    if (pinBuffer.length > 0) {
      pinBuffer = pinBuffer.slice(0, -1);
      updatePinDots();
      if (pinErrorMsg) pinErrorMsg.textContent = '';
    }
  }

  function resetPinDisplay() {
    pinBuffer = '';
    updatePinDots();
    if (pinErrorMsg) {
      pinErrorMsg.textContent = '';
      pinErrorMsg.style.color = '#EF4444';
    }
  }

  function updatePinDots() {
    if (!pinDots || pinDots.length === 0) return;
    pinDots.forEach((dot, idx) => {
      if (idx < pinBuffer.length) {
        dot.classList.add('filled');
      } else {
        dot.classList.remove('filled');
      }
    });
  }

  function loginSuccess(userName) {
    const isRemember = rememberAuthCheck ? rememberAuthCheck.checked : true;
    const sessionData = {
      user: userName,
      loggedInAt: Date.now(),
      expiresAt: isRemember ? Date.now() + AUTH_30_DAYS_MS : Date.now() + (24 * 60 * 60 * 1000)
    };
    localStorage.setItem(AUTH_KEY_SESSION, JSON.stringify(sessionData));

    if (sessionUserEmailText) {
      sessionUserEmailText.textContent = userName;
    }

    if (authGateModal) {
      authGateModal.style.display = 'none';
    }
    showToast(`🧸 ${userName}님, 환영합니다!`);
  }

  // ============================================================================
  // 3. 초기화 (Init)
  // ============================================================================
  function init() {
    // 🔐 2-Way 보안 게이트 초기화
    initAuthGate();

    // 오늘 날짜 셋업
    const now = new Date();
    const options = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' };
    headerDateText.textContent = now.toLocaleDateString('ko-KR', options);

    updatePersonaUI();

    // 🔐 보안 세션 확인 (Cloudflare Access D-7 체크)
    checkSecuritySession();

    // Web Speech API 초기화
    setupSpeechRecognition();

    // 헬스체크 및 원아 목록 로드
    checkHealth();
    loadChildren();

    // 이벤트 리스너 등록
    setupEventListeners();
  }

  // ============================================================================
  // 3-B. Cloudflare Access 보안 세션 및 D-7 만료 사전 알림 로직
  // ============================================================================
  async function checkSecuritySession() {
    try {
      const res = await fetch('/api/session');
      if (!res.ok) return;
      const data = await res.json();
      currentSessionData = data;
      updateSessionUI(data);
    } catch (err) {
      console.warn('보안 세션 확인 실패:', err);
    }
  }

  function updateSessionUI(data) {
    if (!data) return;

    if (sessionUserEmailText) {
      sessionUserEmailText.textContent = data.email || '인증 사용자';
    }

    if (data.protected) {
      if (sessionStatusTag) {
        sessionStatusTag.textContent = '보안 인증됨';
        sessionStatusTag.style.background = '#ECFDF5';
        sessionStatusTag.style.color = '#047857';
      }

      if (sessionExpiryDateText && data.exp) {
        const expDate = new Date(data.exp * 1000);
        sessionExpiryDateText.textContent = expDate.toLocaleDateString('ko-KR', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      }

      if (sessionDaysLeftText && data.remainingDays !== null) {
        sessionDaysLeftText.textContent = `${data.remainingDays}일 남음`;
      }

      // 만료 7일 전(D-7) 사전 안내 배너 판정
      if (data.isExpiringSoon && data.remainingDays <= 7) {
        const dismissedExp = localStorage.getItem('daycare_dismissed_session_exp');
        const isDismissed = dismissedExp && Number(dismissedExp) === data.exp;

        if (!isDismissed) {
          showSessionBanner(data.remainingDays, data.exp);
        } else {
          hideSessionBanner();
        }
      } else {
        hideSessionBanner();
      }
    } else {
      if (sessionStatusTag) {
        sessionStatusTag.textContent = '로컬/미보호';
        sessionStatusTag.style.background = '#F3F4F6';
        sessionStatusTag.style.color = '#4B5563';
      }
      if (sessionExpiryDateText) sessionExpiryDateText.textContent = '세션 제한 없음';
      if (sessionDaysLeftText) sessionDaysLeftText.textContent = '로컬 개발 환경';
      hideSessionBanner();
    }
  }

  function showSessionBanner(daysLeft, exp) {
    if (!sessionExpiryBanner) return;
    if (sessionDdayBadge) {
      sessionDdayBadge.textContent = `D-${daysLeft}`;
    }
    if (sessionDescText) {
      sessionDescText.textContent = `약 ${daysLeft}일 후 보안 세션이 만료되어 접속 시 이메일 6자리 인증이 다시 요청될 수 있어요.`;
    }
    sessionExpiryBanner.style.display = 'flex';
  }

  function hideSessionBanner() {
    if (sessionExpiryBanner) {
      sessionExpiryBanner.style.display = 'none';
    }
  }

  function updatePersonaUI() {
    const p = state.persona;
    headerPersonaText.textContent = p.name ? p.name.split('(')[0].trim() : '스피디 실속형';
    
    // 🌱 담당 반 및 선생님 호칭 UI 동기화
    if (headerClassNameText) {
      headerClassNameText.textContent = state.className || '햇살반';
    }
    if (settingClassNameInput) {
      settingClassNameInput.value = state.className || '햇살반';
    }
    if (settingTeacherNameInput) {
      settingTeacherNameInput.value = state.teacherName || '김선생님';
    }

    // 모달 폼 채우기
    if (personaSampleNote) personaSampleNote.value = p.sampleNote || '';
    if (personaCallStyle) personaCallStyle.value = p.callStyle || '우리 [아동A]';
    if (personaEmojiLevel) personaEmojiLevel.value = p.emojiLevel || 'moderate';
    if (personaClosingGreeting) personaClosingGreeting.value = p.closingGreeting || '';

    // 칩 활성화 상태 표시
    if (personaPresetGrid) {
      personaPresetGrid.querySelectorAll('.persona-preset-chip').forEach(chip => {
        if (chip.dataset.preset === p.preset) {
          chip.classList.add('active');
        } else {
          chip.classList.remove('active');
        }
      });
    }
  }

  // ============================================================================
  // 4. 이벤트 리스너 등록
  // ============================================================================
  function setupEventListeners() {
    // 모드 스위처 클릭
    modeSwitcher.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        modeSwitcher.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.mode = btn.dataset.mode;
        
        // 놀이 알림장 또는 관찰일지 모드일 때 활동 영역 선택 표시
        if (state.mode === 'play_story' || state.mode === 'partial' || state.mode === 'observation') {
          areaSection.style.display = 'flex';
        } else {
          areaSection.style.display = 'none';
        }
      });
    });

    // 활동 영역 칩 클릭
    areaGrid.querySelectorAll('.area-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        areaGrid.querySelectorAll('.area-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        state.activityArea = chip.dataset.area;
      });
    });

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
        
        // 5대 서식 카드 전체 숨김 후 선택된 탭만 노출
        kidsnoteCard.style.display = 'none';
        observationCard.style.display = 'none';
        if (dailyCareCard) dailyCareCard.style.display = 'none';
        if (counselingCard) counselingCard.style.display = 'none';
        if (playSupportCard) playSupportCard.style.display = 'none';

        if (tab === 'kidsnote') kidsnoteCard.style.display = 'flex';
        else if (tab === 'observation') observationCard.style.display = 'flex';
        else if (tab === 'daily_care' && dailyCareCard) dailyCareCard.style.display = 'flex';
        else if (tab === 'counseling' && counselingCard) counselingCard.style.display = 'flex';
        else if (tab === 'play_support' && playSupportCard) playSupportCard.style.display = 'flex';
      });
    });

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
            updatePersonaUI();
            showToast(`🎭 '${presetData.name}' 프리셋이 적용되었습니다.`);
          }
        });
      });
    }

    // 페르소나 및 우리 반 설정 저장
    saveSettingsBtn.addEventListener('click', () => {
      // 1. 담당 반 및 선생님 호칭 저장
      const newClassName = settingClassNameInput ? settingClassNameInput.value.trim() || '햇살반' : '햇살반';
      const newTeacherName = settingTeacherNameInput ? settingTeacherNameInput.value.trim() || '김선생님' : '김선생님';
      const classChanged = state.className !== newClassName;
      state.className = newClassName;
      state.teacherName = newTeacherName;
      localStorage.setItem('daycare_class_name', newClassName);
      localStorage.setItem('daycare_teacher_name', newTeacherName);

      // 2. 페르소나 문체 저장
      state.persona = {
        preset: state.persona.preset || 'custom',
        name: state.persona.name || '맞춤 페르소나',
        sampleNote: personaSampleNote ? personaSampleNote.value.trim() : '',
        callStyle: personaCallStyle ? personaCallStyle.value : '우리 [아동A]',
        emojiLevel: personaEmojiLevel ? personaEmojiLevel.value : 'moderate',
        closingGreeting: personaClosingGreeting ? personaClosingGreeting.value.trim() : ''
      };

      localStorage.setItem('daycare_persona', JSON.stringify(state.persona));
      updatePersonaUI();
      if (classChanged) {
        renderChildrenChips();
      }
      settingsModal.style.display = 'none';
      showToast(`🌱 '${newClassName}' (${newTeacherName}) 설정이 성공적으로 저장되었습니다!`);
    });
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
  // 6. 서버 헬스체크 및 노션 상태 표시
  // ============================================================================
  async function checkHealth() {
    try {
      const res = await fetch('/health');
      if (res.ok) {
        const data = await res.json();
        if (data.env_configured?.has_notion_token && data.env_configured?.has_daily_log_db) {
          notionStatusBadge.className = 'badge badge-connected';
          notionStatusText.textContent = '노션 연동 완료';
        } else {
          notionStatusBadge.className = 'badge badge-mock';
          notionStatusText.textContent = '모크 테스트 모드';
        }
      }
    } catch (e) {
      console.warn('Health check failed (standalone front mode):', e);
      notionStatusBadge.className = 'badge badge-mock';
      notionStatusText.textContent = '모크 모드';
    }
  }

  // ============================================================================
  // 6-B. 노션 클라이언트 직결 브릿지 (Cloudflare Error 1042 차단 100% 회피 SSOT)
  // ============================================================================
  const NOTION_CONFIG = {
    PROXY_URL: 'https://minmin-notion.awslike6.workers.dev',
    TEACHER_DB_ID: '3e0a2711-5b68-8186-ad30-cbaea7687006',
    CHILD_DB_ID: '3e0a2711-5b68-8182-955e-f116e4174e3a',
    DAILY_LOG_DB_ID: '3e0a2711-5b68-8122-9eea-dd49bf8a625c',
    VERSION: '2022-06-28'
  };

  async function directNotionCall(endpoint, method = 'GET', body = null) {
    const url = `${NOTION_CONFIG.PROXY_URL}/v1${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      'Notion-Version': NOTION_CONFIG.VERSION
    };
    const options = { method, headers };
    if (body) {
      options.body = typeof body === 'string' ? body : JSON.stringify(body);
    }
    const resp = await fetch(url, options);
    if (!resp.ok) {
      const errorText = await resp.text();
      throw new Error(`Notion Direct Error (${resp.status}): ${errorText}`);
    }
    return await resp.json();
  }

  // ============================================================================
  // 7. 원아 목록 불러오기 (/api/children)
  // ============================================================================
  async function loadChildren(selectedId = null) {
    // 1. 브라우저에서 minmin-notion 직접 쿼리 (Cloudflare 1042 회피 1순위)
    try {
      const data = await directNotionCall(`/databases/${NOTION_CONFIG.CHILD_DB_ID}/query`, 'POST', {
        page_size: 100,
        sorts: [{ property: '아동명', direction: 'ascending' }]
      });

      const children = (data.results || []).map(page => {
        const props = page.properties;
        const name = props['아동명']?.title?.[0]?.plain_text || '이름 없음';
        const rawAge = props['생년월일/연령']?.rich_text?.[0]?.plain_text || '만 4세';
        const traits = props['성향 및 특이사항']?.rich_text?.[0]?.plain_text || '';
        const parentStyle = props['학부모 성향 & 알림장 스타일']?.rich_text?.[0]?.plain_text || '';
        const allergies = props['알레르기/주의사항']?.rich_text?.[0]?.plain_text || '';
        
        // 반 정보: 전용 프로퍼티 우선, 없으면 연령 괄호 파싱
        let childClass = props['소속 반']?.select?.name || '';
        if (!childClass && rawAge.includes('(')) {
          const match = rawAge.match(/\((.*?)\)/);
          if (match && match[1]) childClass = match[1].trim();
        }

        return { id: page.id, name, age: rawAge, traits, allergies, childClass, parentStyle };
      });

      state.children = children;
      notionStatusBadge.className = 'badge badge-connected';
      notionStatusText.textContent = '노션 연동됨';
      renderChildrenChips(selectedId);
      return;
    } catch (directErr) {
      console.warn('Direct notion query failed, trying worker endpoint:', directErr);
    }

    // 2. 워커 /api/children 폴백
    try {
      const res = await fetch('/api/children');
      const data = await res.json();
      state.children = data.children || [];

      // 노션 연동 여부 뱃지 업데이트
      if (data.source === 'notion') {
        notionStatusBadge.className = 'badge badge-connected';
        notionStatusText.textContent = '노션 연동됨';
      }

      renderChildrenChips(selectedId);
    } catch (err) {
      console.warn('원아 목록 불러오기 실패, 기본 샘플 사용:', err);
      // 오프라인 폴백 샘플
      state.children = [
        { id: 'mock-child-1', name: '김민서', age: '만 4세', childClass: '햇살반', traits: '블록 및 조작 놀이 즐김, 소근육 발달 중', parentStyle: '안심 서술형 (식사량, 낮잠 세심 안내 선호)', allergies: '우유 주의' },
        { id: 'mock-child-2', name: '이민수', age: '만 4세', childClass: '바다반', traits: '또래 협동 놀이, 언어 표현력 우수', parentStyle: '스피디 요약형 (바쁜 맞벌이 부모님, 3줄 핵심 요약 선호)', allergies: '' }
      ];
      renderChildrenChips(selectedId);
    }
  }

  function renderChildrenChips(selectedId = null) {
    childScrollContainer.innerHTML = '';

    // 1. 반 필터 토글 UI 업데이트
    if (classFilterToggleBtn) {
      if (state.filterOnlyMyClass) {
        classFilterToggleBtn.classList.remove('show-all');
        if (classFilterIcon) classFilterIcon.textContent = '🌱';
        if (classFilterText) classFilterText.textContent = `${state.className}만`;
      } else {
        classFilterToggleBtn.classList.add('show-all');
        if (classFilterIcon) classFilterIcon.textContent = '🌐';
        if (classFilterText) classFilterText.textContent = '전체 보기';
      }
    }

    if (state.children.length === 0) {
      const emptyChip = document.createElement('div');
      emptyChip.className = 'child-chip child-chip-add';
      emptyChip.innerHTML = '<span>➕ 첫 원아 등록하기</span>';
      emptyChip.addEventListener('click', () => openChildModal('add'));
      childScrollContainer.appendChild(emptyChip);
      
      state.selectedChild = null;
      selectedChildAge.textContent = '-';
      childTraitsText.textContent = '💡 아직 등록된 원아가 없습니다. [+ 원아 등록] 버튼을 눌러 아이를 추가해 주세요!';
      if (childParentText) childParentText.style.display = 'none';
      childAlertText.style.display = 'none';
      return;
    }

    // 2. 현재 선택된 필터에 따라 노출할 원아 목록 계산
    const currentClass = state.className || '햇살반';
    let displayList = state.children;
    if (state.filterOnlyMyClass) {
      displayList = state.children.filter(c => !c.childClass || c.childClass === currentClass);
    }

    // 만약 현재 반에 원아가 한 명도 없으면
    if (displayList.length === 0) {
      const noticeChip = document.createElement('div');
      noticeChip.className = 'child-chip';
      noticeChip.style.background = '#FEF3C7';
      noticeChip.style.borderColor = '#F59E0B';
      noticeChip.style.color = '#92400E';
      noticeChip.innerHTML = `<span>🌱 ${currentClass} 원아가 없습니다</span>`;
      noticeChip.addEventListener('click', () => {
        state.filterOnlyMyClass = false;
        renderChildrenChips();
      });
      childScrollContainer.appendChild(noticeChip);

      const addChip = document.createElement('div');
      addChip.className = 'child-chip child-chip-add';
      addChip.innerHTML = `<span>➕ ${currentClass} 원아 등록</span>`;
      addChip.addEventListener('click', () => openChildModal('add'));
      childScrollContainer.appendChild(addChip);

      state.selectedChild = null;
      selectedChildAge.textContent = '-';
      childTraitsText.textContent = `💡 현재 '${currentClass}'으로 등록된 원아가 없습니다. [+ 원아 등록]으로 추가하거나 [전체 보기]를 눌러주세요.`;
      if (childParentText) childParentText.style.display = 'none';
      childAlertText.style.display = 'none';
      return;
    }

    let targetChild = null;

    displayList.forEach((child, index) => {
      const isSelected = selectedId ? child.id === selectedId : index === 0;
      if (isSelected) targetChild = child;

      const chip = document.createElement('div');
      chip.className = `child-chip ${isSelected ? 'active' : ''}`;
      const classBadge = (!state.filterOnlyMyClass && child.childClass) ? `<small style="font-size: 10px; opacity: 0.8; margin-left: 2px;">(${child.childClass})</small>` : '';
      chip.innerHTML = `
        <span class="child-avatar">${getAvatarEmoji(child.name)}</span>
        <span>${child.name}${classBadge}</span>
      `;
      chip.addEventListener('click', () => {
        childScrollContainer.querySelectorAll('.child-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        selectChild(child);
      });
      childScrollContainer.appendChild(chip);
    });

    // 맨 끝에 [+ 추가] 칩 항상 배치
    const addChip = document.createElement('div');
    addChip.className = 'child-chip child-chip-add';
    addChip.innerHTML = '<span>➕ 추가</span>';
    addChip.addEventListener('click', () => openChildModal('add'));
    childScrollContainer.appendChild(addChip);

    if (targetChild) {
      selectChild(targetChild);
    } else if (displayList.length > 0) {
      selectChild(displayList[0]);
    }
  }

  function getAvatarEmoji(name) {
    const emojis = ['👧', '👦', '🧒', '👶', '🐣'];
    const charCode = (name || '').charCodeAt(0) || 0;
    return emojis[charCode % emojis.length];
  }

  function selectChild(child) {
    state.selectedChild = child;
    selectedChildAge.textContent = child.age || '만 4세';
    childTraitsText.textContent = `💡 성향: ${child.traits || '특이사항 없음'}`;
    
    // 👪 학부모 성향 & 알림장 스타일 표시
    if (childParentText) {
      if (child.parentStyle) {
        childParentText.style.display = 'block';
        childParentText.textContent = `👪 학부모 선호: ${child.parentStyle}`;
      } else {
        childParentText.style.display = 'none';
      }
    }

    if (child.allergies) {
      childAlertText.style.display = 'block';
      childAlertText.textContent = `⚠️ 주의: ${child.allergies}`;
    } else {
      childAlertText.style.display = 'none';
    }
  }

  // ============================================================================
  // 7-B. 원아 등록 및 수정 모달 제어
  // ============================================================================
  function openChildModal(mode = 'add', child = null) {
    if (!childManageModal) return;

    if (parentPresetGrid) {
      parentPresetGrid.querySelectorAll('.parent-preset-btn').forEach(b => b.classList.remove('active'));
    }

    if (mode === 'edit' && child) {
      childModalTitle.textContent = `👶 ${child.name} 정보 및 성향 수정`;
      manageChildId.value = child.id || '';
      manageChildName.value = child.name || '';
      
      // 만약 '만 4세 (햇살반)' 형태면 분리
      let rawAge = child.age || '만 4세';
      let extractedClass = child.childClass || state.className || '햇살반';
      if (rawAge.includes('(')) {
        const parts = rawAge.split('(');
        rawAge = parts[0].trim();
        if (!child.childClass) extractedClass = parts[1].replace(')', '').trim();
      }
      manageChildAge.value = rawAge;
      if (manageChildClass) manageChildClass.value = extractedClass;

      manageChildTraits.value = child.traits || '';
      if (manageChildParentStyle) manageChildParentStyle.value = child.parentStyle || '';
      manageChildAllergies.value = child.allergies || '';
      saveChildBtn.innerHTML = '<span>💾</span> <span>원아 정보 수정 저장</span>';
    } else {
      childModalTitle.textContent = '👶 새 원아 등록 (노션 자동 연동)';
      manageChildId.value = '';
      manageChildName.value = '';
      manageChildAge.value = '만 4세';
      if (manageChildClass) manageChildClass.value = state.className || '햇살반';
      manageChildTraits.value = '';
      if (manageChildParentStyle) manageChildParentStyle.value = '';
      manageChildAllergies.value = '';
      saveChildBtn.innerHTML = '<span>💾</span> <span>노션에 원아 등록하기</span>';
    }

    childManageModal.style.display = 'flex';
    manageChildName.focus();
  }

  async function handleChildFormSubmit(e) {
    e.preventDefault();
    const name = manageChildName.value.trim();
    if (!name) {
      showToast('원아 이름을 입력해주세요.');
      return;
    }

    const id = manageChildId.value;
    const baseAge = manageChildAge.value;
    const childClass = manageChildClass ? manageChildClass.value.trim() || state.className : state.className;
    const age = childClass ? `${baseAge} (${childClass})` : baseAge;
    const traits = manageChildTraits.value.trim();
    const parentStyle = manageChildParentStyle ? manageChildParentStyle.value.trim() : '';
    const allergies = manageChildAllergies.value.trim();

    saveChildBtn.disabled = true;
    saveChildBtn.innerHTML = '<span>⏳</span> <span>노션에 저장 중...</span>';

    try {
      let savedChildId = id;
      let isCreated = false;

      // 1. 브라우저에서 minmin-notion 직접 저장/수정 (Error 1042 원천 회피 1순위)
      try {
        if (id && !id.startsWith('mock-')) {
          // 수정 시도
          try {
            const updateProps = {
              '아동명': { title: [{ text: { content: name } }] },
              '생년월일/연령': { rich_text: [{ text: { content: age } }] },
              '소속 반': { select: { name: childClass } },
              '성향 및 특이사항': { rich_text: [{ text: { content: traits } }] },
              '학부모 성향 & 알림장 스타일': { rich_text: [{ text: { content: parentStyle } }] },
              '알레르기/주의사항': { rich_text: [{ text: { content: allergies } }] }
            };
            const updateRes = await directNotionCall(`/pages/${id}`, 'PATCH', { properties: updateProps });
            savedChildId = updateRes.id;
          } catch (patchErr) {
            // 404 발생 시 자가 치유(신규 생성으로 자동 전환)
            if (patchErr.message && patchErr.message.includes('404')) {
              console.warn('[Self-Healing] 기존 페이지 404 -> 신규 원아로 자동 생성 전환');
              const createPayload = {
                parent: { database_id: NOTION_CONFIG.CHILD_DB_ID },
                properties: {
                  '아동명': { title: [{ text: { content: name } }] },
                  '생년월일/연령': { rich_text: [{ text: { content: age } }] },
                  '소속 반': { select: { name: childClass } },
                  '성향 및 특이사항': { rich_text: [{ text: { content: traits } }] },
                  '학부모 성향 & 알림장 스타일': { rich_text: [{ text: { content: parentStyle } }] },
                  '알레르기/주의사항': { rich_text: [{ text: { content: allergies } }] }
                }
              };
              const createRes = await directNotionCall('/pages', 'POST', createPayload);
              savedChildId = createRes.id;
              isCreated = true;
            } else {
              throw patchErr;
            }
          }
        } else {
          // 신규 등록
          const createPayload = {
            parent: { database_id: NOTION_CONFIG.CHILD_DB_ID },
            properties: {
              '아동명': { title: [{ text: { content: name } }] },
              '생년월일/연령': { rich_text: [{ text: { content: age } }] },
              '소속 반': { select: { name: childClass } },
              '성향 및 특이사항': { rich_text: [{ text: { content: traits } }] },
              '학부모 성향 & 알림장 스타일': { rich_text: [{ text: { content: parentStyle } }] },
              '알레르기/주의사항': { rich_text: [{ text: { content: allergies } }] }
            }
          };
          const createRes = await directNotionCall('/pages', 'POST', createPayload);
          savedChildId = createRes.id;
          isCreated = true;
        }

        childManageModal.style.display = 'none';
        showToast(isCreated ? `🎉 ${name} 원아가 노션 마스터 DB에 안전하게 등록되었습니다!` : `✅ ${name} 정보가 수정되었습니다.`);
        await loadChildren(savedChildId);
        return;
      } catch (directFailErr) {
        console.warn('Direct notion save failed, trying worker endpoint:', directFailErr);
      }

      // 2. 워커 /api/children 폴백
      let res;
      if (id && !id.startsWith('mock-')) {
        res = await fetch(`/api/children/${encodeURIComponent(id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, age, childClass, traits, parentStyle, allergies })
        });
      } else {
        res = await fetch('/api/children', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, age, childClass, traits, parentStyle, allergies })
        });
      }

      if (!res.ok) {
        throw new Error('원아 저장 중 오류가 발생했습니다.');
      }

      const json = await res.json();
      childManageModal.style.display = 'none';
      showToast(`🎉 ${name} 원아가 안전하게 저장되었습니다!`);
      await loadChildren(json.child?.id || null);
    } catch (err) {
      console.error('원아 저장 실패:', err);
      showToast(`저장 실패: ${err.message || '네트워크 오류'}`);
    } finally {
      saveChildBtn.disabled = false;
      saveChildBtn.innerHTML = '<span>💾</span> <span>노션에 원아 저장하기</span>';
    }
  }

  // ============================================================================
  // 7-C. 노션 TEACHER_DB에서 교사 프로필 동기화
  // ============================================================================
  async function handleSyncTeacherProfile() {
    if (!syncTeacherFromNotionBtn) return;
    syncTeacherFromNotionBtn.disabled = true;
    syncTeacherFromNotionBtn.innerHTML = '<span>⏳</span> <span>프로필 조회 중...</span>';

    try {
      const data = await directNotionCall(`/databases/${NOTION_CONFIG.TEACHER_DB_ID}/query`, 'POST', {
        page_size: 20
      });

      const records = data.results || [];
      if (records.length === 0) {
        showToast('노션 TEACHER_DB에 등록된 교사 프로필이 없습니다.');
        return;
      }

      const currentClass = (settingClassNameInput ? settingClassNameInput.value.trim() : state.className) || '햇살반';
      const currentTeacher = (settingTeacherNameInput ? settingTeacherNameInput.value.trim() : state.teacherName) || '김선생님';

      let matched = records.find(p => {
        const cls = p.properties['담당반']?.select?.name;
        const tch = p.properties['교사명']?.title?.[0]?.plain_text;
        return (cls && cls === currentClass) || (tch && tch === currentTeacher);
      });

      if (!matched && records.length > 0) {
        matched = records[0];
      }

      const pProps = matched.properties;
      const tName = pProps['교사명']?.title?.[0]?.plain_text || currentTeacher;
      const cClass = pProps['담당반']?.select?.name || currentClass;
      const presetName = pProps['문체 프리셋']?.select?.name || '놀이 중심 다정체';
      const sampleNote = pProps['평소 알림장 예시문']?.rich_text?.[0]?.plain_text || '';
      const closing = pProps['기본 마무리 멘트']?.rich_text?.[0]?.plain_text || '';
      const callStyle = pProps['원아 호칭']?.rich_text?.[0]?.plain_text || '우리 [아동A]';

      if (settingClassNameInput) settingClassNameInput.value = cClass;
      if (settingTeacherNameInput) settingTeacherNameInput.value = tName;
      if (personaSampleNote) personaSampleNote.value = sampleNote;
      if (personaClosingGreeting) personaClosingGreeting.value = closing;
      if (personaCallStyle) personaCallStyle.value = callStyle;

      let foundPresetKey = 'play_friendly';
      if (presetName.includes('발달') || presetName.includes('서술')) foundPresetKey = 'growth_detail';
      else if (presetName.includes('공감') || presetName.includes('따뜻')) foundPresetKey = 'warm_parent';
      else if (presetName.includes('생동') || presetName.includes('밝')) foundPresetKey = 'lively_vivid';

      if (personaPresetGrid) {
        personaPresetGrid.querySelectorAll('.persona-preset-chip').forEach(chip => {
          if (chip.dataset.preset === foundPresetKey) chip.classList.add('active');
          else chip.classList.remove('active');
        });
      }

      showToast(`☁️ 노션에서 '${tName} (${cClass})' 프로필을 불러왔습니다!`);
    } catch (err) {
      console.error('교사 프로필 동기화 실패:', err);
      showToast('교사 프로필 불러오기에 실패했습니다.');
    } finally {
      syncTeacherFromNotionBtn.disabled = false;
      syncTeacherFromNotionBtn.innerHTML = '<span>☁️</span> <span>노션 프로필 불러오기</span>';
    }
  }
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, age, traits, allergies })
        });
      }

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || '원아 저장에 실패했습니다.');
      }

      const result = await res.json();
      childManageModal.style.display = 'none';
      if (result.mode === 'notion_created_fallback') {
        showToast(`🎉 ${name} 원아가 노션 마스터 DB에 안전하게 등록되었습니다!`);
      } else {
        showToast(id && !id.startsWith('mock-') ? `✅ ${name} 정보가 수정되었습니다.` : `🎉 ${name} 원아가 노션에 등록되었습니다!`);
      }
      
      const newChildId = result.child?.id || id;
      await loadChildren(newChildId);
    } catch (err) {
      console.error('Child save error:', err);
      showToast(`저장 오류: ${err.message}`);
    } finally {
      saveChildBtn.disabled = false;
      saveChildBtn.innerHTML = '<span>💾</span> <span>노션에 원아 저장하기</span>';
    }
  }

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
      if (transcript) {
        const currentVal = rawMemoInput.value.trim();
        rawMemoInput.value = currentVal ? `${currentVal} ${transcript}` : transcript;
        rawMemoInput.focus();
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
        persona: state.persona
      };

      let resultData = null;

      // 1. 한국 브라우저 IP 직통 호출 시도 (Cloudflare 유럽 노드 지역 제한 400 원천 회피)
      if (window.GeminiClient && typeof window.GeminiClient.generate === 'function') {
        try {
          const clientRes = await window.GeminiClient.generate(payload);
          if (clientRes && clientRes.success) {
            resultData = clientRes.data;
          }
        } catch (clientErr) {
          console.warn('클라이언트 직통 호출 실패, 서버 엔드포인트로 폴백:', clientErr);
        }
      }

      // 2. 서버 폴백 (/api/generate)
      if (!resultData) {
        const res = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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
      console.error('Generate Error:', err);
      showToast(`오류: ${err.message}`);
    } finally {
      clearInterval(stepInterval);
      generateBtn.disabled = false;
      loadingBox.style.display = 'none';
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

    // 1. 키즈노트 알림장 채우기
    const kn = data.kidsnote || {};
    kidsnoteTitle.textContent = kn.title || '오늘의 알림장';
    kidsnoteContent.value = kn.content || '';

    kidsnoteTags.innerHTML = '';
    (kn.tags || []).forEach(tag => {
      const span = document.createElement('span');
      span.className = 'tag-badge';
      span.textContent = tag.startsWith('#') ? tag : `#${tag}`;
      kidsnoteTags.appendChild(span);
    });

    // 2. 평가제 관찰일지 채우기
    const obs = data.observation_log || {};
    obsStandardArea.textContent = `표준보육 영역: ${obs.standard_area || '의사소통'}`;
    obsActivityName.textContent = `활동: ${obs.activity_name || state.activityArea}`;
    obsBehaviorContent.value = obs.behavior || '';
    obsEvaluationContent.value = obs.evaluation || '';

    // 3. 일일 보육일지 (놀이 평가 및 내일 지원) 채우기
    const dc = data.daily_care_log || {};
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
    if (cit.has_citation && cit.summary) {
      citationBox.style.display = 'flex';
      citationSummaryText.textContent = cit.summary;
    } else {
      citationBox.style.display = 'none';
    }

    // 선택된 모드에 맞추어 메인 탭 전환
    const targetTab = state.mode === 'observation' ? 'observation' : 'kidsnote';
    resultTabBtns.forEach(b => {
      b.classList.toggle('active', b.dataset.tab === targetTab);
    });
    kidsnoteCard.style.display = targetTab === 'kidsnote' ? 'flex' : 'none';
    observationCard.style.display = targetTab === 'observation' ? 'flex' : 'none';
    if (dailyCareCard) dailyCareCard.style.display = 'none';
    if (counselingCard) counselingCard.style.display = 'none';
    if (playSupportCard) playSupportCard.style.display = 'none';

    // 결과 섹션 노출 및 스크롤
    resultsSection.style.display = 'flex';
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ============================================================================
  // 12. 공통 클립보드 복사 헬퍼
  // ============================================================================
  async function copyTextToClipboard(text, successMsg = '📋 클립보드에 복사되었습니다.') {
    if (!text) {
      showToast('복사할 내용이 없습니다.');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      showToast(successMsg);
    } catch (e) {
      const tempArea = document.createElement('textarea');
      tempArea.value = text;
      document.body.appendChild(tempArea);
      tempArea.select();
      document.execCommand('copy');
      document.body.removeChild(tempArea);
      showToast(successMsg);
    }
  }

  // ============================================================================
  // 13. 알림장 복사 및 키즈노트 공유
  // ============================================================================
  async function handleCopyKidsnote() {
    const textToCopy = kidsnoteContent.value;
    if (!textToCopy) {
      showToast('복사할 알림장 내용이 없습니다.');
      return;
    }

    try {
      await navigator.clipboard.writeText(textToCopy);
      showToast('📋 알림장이 클립보드에 복사되었습니다! 키즈노트에 붙여넣으세요.');
    } catch (e) {
      kidsnoteContent.select();
      document.execCommand('copy');
      showToast('📋 복사되었습니다.');
    }
  }

  async function handleShareKidsnote() {
    const textToShare = kidsnoteContent.value;
    const titleToShare = kidsnoteTitle.textContent;

    if (!textToShare) {
      showToast('공유할 알림장 내용이 없습니다.');
      return;
    }

    // 1. 클립보드에 우선 복사 (안전 보장)
    try {
      await navigator.clipboard.writeText(textToShare);
    } catch (e) {}

    // 2. 모바일 Web Share API 지원 시 공유 다이얼로그 호출
    if (navigator.share) {
      try {
        await navigator.share({
          title: titleToShare,
          text: textToShare
        });
        showToast('공유 완료! 키즈노트 앱에 바로 붙여넣으세요.');
        return;
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.warn('Web Share failed:', err);
        }
      }
    }

    // 3. 미지원 환경일 때 안내 팝업 및 복사 완료 안내
    showToast('📋 알림장이 복사되었습니다. 키즈노트 앱을 열어 붙여넣기 하세요!');
  }

  // ============================================================================
  // 13. 노션 3대 DB 저장 핸들러
  // ============================================================================
  async function handleSaveNotion() {
    if (!state.lastResult) {
      showToast('저장할 일지 데이터가 없습니다.');
      return;
    }

    saveNotionBtn.disabled = true;
    saveNotionBtn.innerHTML = '<span>⏳</span> <span>노션에 저장 중...</span>';

    const today = new Date().toISOString().split('T')[0];
    const childName = state.selectedChild?.name || '원아';
    const activityArea = state.activityArea || '자유놀이';
    const pageTitle = `[${today}] ${childName} - ${activityArea}`;
    const obsFullText = `${obsBehaviorContent.value}\n\n[지원 및 평가]\n${obsEvaluationContent.value}`;

    try {
      // 1. 브라우저에서 minmin-notion 직접 일지 저장 (Error 1042 회피 1순위)
      try {
        const props = {
          '기록명/식별자': { title: [{ text: { content: pageTitle } }] },
          '작성일자': { date: { start: today } },
          '활동 구분': { select: { name: activityArea } },
          '표준보육 영역': { multi_select: [{ name: state.lastResult.observation_log?.standard_area || '의사소통' }] },
          '원시 메모/키워드': { rich_text: [{ text: { content: rawMemoInput.value.trim() || '' } }] },
          '알림장 최종본': { rich_text: [{ text: { content: kidsnoteContent.value || '' } }] },
          '관찰일지 최종본': { rich_text: [{ text: { content: obsFullText } }] },
          '참조 출처 요약': { rich_text: [{ text: { content: citationSummaryText.textContent || '' } }] }
        };

        if (state.selectedChild?.id && !state.selectedChild.id.startsWith('mock-')) {
          props['원아'] = { relation: [{ id: state.selectedChild.id }] };
        }

        const createPayload = {
          parent: { database_id: NOTION_CONFIG.DAILY_LOG_DB_ID },
          properties: props
        };

        await directNotionCall('/pages', 'POST', createPayload);
        showToast(`💾 노션 저장 완료: ${pageTitle}`);
        return;
      } catch (directSaveErr) {
        console.warn('Direct notion log save failed, trying worker endpoint:', directSaveErr);
      }

      // 2. 워커 /api/logs/save 폴백
      const payload = {
        date: today,
        childId: state.selectedChild?.id,
        childName,
        activityArea,
        standardArea: state.lastResult.observation_log?.standard_area,
        rawMemo: rawMemoInput.value.trim(),
        kidsnoteText: kidsnoteContent.value,
        observationText: obsFullText,
        citationSummary: citationSummaryText.textContent || '',
        referencedLogId: null
      };

      const res = await fetch('/api/logs/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const json = await res.json();
      if (json.success) {
        showToast(`💾 노션 저장 완료: ${json.title}`);
      } else {
        throw new Error(json.error || '저장에 실패했습니다.');
      }
    } catch (err) {
      console.error('Notion save error:', err);
      showToast(`저장 오류: ${err.message}`);
    } finally {
      saveNotionBtn.disabled = false;
      saveNotionBtn.innerHTML = '<span>💾</span> <span>노션 3대 DB에 안전 저장</span>';
    }
  }

  // 애플리케이션 시작
  init();
});
