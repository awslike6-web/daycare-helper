/**
 * 🧸 daycare-helper Auth & Profile Switcher Module (auth-gate.js)
 * 2026 Modern Vanilla JS (ES2024+)
 * 
 * - 선생님별 개별 4자리 PIN 관리 및 격리 저장소
 * - 2-Way 보안 잠금 게이트 (PIN + 비상 이메일)
 * - 3대 교사 1초 원터치 스위처 및 학급 완전 격리
 * - Cloudflare Access D-7 보안 세션 체크
 */

// 🔐 교사별 격리 저장소 접근 헬퍼
function getTeacherPin(teacherKey) {
  return localStorage.getItem(`daycare_custom_pin_${teacherKey}`) || '0000';
}

function setTeacherPin(teacherKey, pin) {
  localStorage.setItem(`daycare_custom_pin_${teacherKey}`, pin);
}

function getTeacherPersona(teacherKey) {
  const saved = localStorage.getItem(`daycare_persona_${teacherKey}`);
  if (saved) {
    try { return JSON.parse(saved); } catch (e) {}
  }
  const profiles = window.TEACHER_PROFILES || {};
  const presets = window.PERSONA_PRESETS || {};
  return profiles[teacherKey]?.defaultPersona || presets.play_friendly;
}

function setTeacherPersona(teacherKey, persona) {
  localStorage.setItem(`daycare_persona_${teacherKey}`, JSON.stringify(persona));
}

function getTeacherStyle(teacherKey) {
  return localStorage.getItem(`daycare_teacher_style_${teacherKey}`) || getTeacherPersona(teacherKey).name;
}

function setTeacherStyle(teacherKey, style) {
  localStorage.setItem(`daycare_teacher_style_${teacherKey}`, style);
}

// ============================================================================
// 🧸 2-Way 보안 잠금 게이트 (선생님별 PIN & 학급 완전 격리)
// ============================================================================
const AUTH_KEY_SESSION = 'daycare_local_auth_session';
const DEFAULT_PIN = '0000';
const AUTH_30_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

let authTargetTeacherKey = 'wife';
let pinBuffer = '';
let currentSessionData = null;

function updateAuthTeacherUI() {
  const chips = document.querySelectorAll('.auth-teacher-chip');
  chips.forEach(chip => {
    chip.classList.toggle('active', chip.dataset.teacherKey === authTargetTeacherKey);
  });
  const profiles = window.TEACHER_PROFILES || {};
  const targetProfile = profiles[authTargetTeacherKey] || profiles.wife;
  const nameEl = document.getElementById('pinTargetTeacherName');
  if (nameEl && targetProfile) nameEl.textContent = targetProfile.name;
}

function initAuthGate() {
  const authGateModal = document.getElementById('authGateModal');
  const sessionUserEmailText = document.getElementById('sessionUserEmailText');
  if (!authGateModal) return;

  // 1. 기존 세션 검사 (30일 유지 여부)
  const savedSession = localStorage.getItem(AUTH_KEY_SESSION);
  if (savedSession) {
    try {
      const sessionObj = JSON.parse(savedSession);
      if (sessionObj.expiresAt && sessionObj.expiresAt > Date.now()) {
        const sessionTeacherKey = sessionObj.teacherKey || window.state?.activeTeacherKey || 'wife';
        applyTeacherProfile(sessionTeacherKey, false);

        authGateModal.style.display = 'none';
        if (sessionUserEmailText) {
          sessionUserEmailText.textContent = sessionObj.user || `${window.state?.teacherName} (인증됨)`;
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
  authTargetTeacherKey = window.state?.activeTeacherKey || 'wife';
  updateAuthTeacherUI();
  resetPinDisplay();
  setupAuthEventListeners();
}

function setupAuthEventListeners() {
  const authGateModal = document.getElementById('authGateModal');
  const tabPinBtn = document.getElementById('tabPinBtn');
  const tabEmailBtn = document.getElementById('tabEmailBtn');
  const pinPanel = document.getElementById('pinPanel');
  const emailPanel = document.getElementById('emailPanel');
  const authEmailInput = document.getElementById('authEmailInput');
  const emailLoginForm = document.getElementById('emailLoginForm');
  const emailErrorMsg = document.getElementById('emailErrorMsg');
  const keypadButtons = document.querySelectorAll('.keypad-btn[data-num]');
  const keypadClearBtn = document.getElementById('keypadClearBtn');
  const keypadBackspaceBtn = document.getElementById('keypadBackspaceBtn');
  const headerLogoutBtn = document.getElementById('headerLogoutBtn');
  const modalLogoutBtn = document.getElementById('modalLogoutBtn');
  const settingsModal = document.getElementById('settingsModal');
  const openChangePinBtn = document.getElementById('openChangePinBtn');
  const pinChangeBox = document.getElementById('pinChangeBox');
  const newPinInput = document.getElementById('newPinInput');
  const saveNewPinBtn = document.getElementById('saveNewPinBtn');
  const cancelNewPinBtn = document.getElementById('cancelNewPinBtn');

  // 👩‍🏫 잠금 화면 교사 프로필 칩 선택
  const chips = document.querySelectorAll('.auth-teacher-chip');
  chips.forEach(chip => {
    chip.onclick = () => {
      authTargetTeacherKey = chip.dataset.teacherKey;
      updateAuthTeacherUI();
      resetPinDisplay();
    };
  });

  // 탭 전환 (PIN vs 이메일)
  if (tabPinBtn && tabEmailBtn) {
    tabPinBtn.onclick = () => {
      tabPinBtn.classList.add('active');
      tabEmailBtn.classList.remove('active');
      if (pinPanel) pinPanel.style.display = 'block';
      if (emailPanel) emailPanel.style.display = 'none';
      resetPinDisplay();
    };
    tabEmailBtn.onclick = () => {
      tabEmailBtn.classList.add('active');
      tabPinBtn.classList.remove('active');
      if (emailPanel) emailPanel.style.display = 'block';
      if (pinPanel) pinPanel.style.display = 'none';
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

  // 이메일 로그인 폼 (비상용)
  if (emailLoginForm) {
    emailLoginForm.onsubmit = (e) => {
      e.preventDefault();
      const emailVal = authEmailInput ? authEmailInput.value.trim() : '';
      if (!emailVal || !emailVal.includes('@')) {
        if (emailErrorMsg) emailErrorMsg.textContent = '올바른 이메일 주소를 입력해 주세요.';
        return;
      }
      loginSuccess(authTargetTeacherKey, emailVal);
    };
  }

  // 헤더 및 모달 로그아웃 (잠금)
  const handleLogout = () => {
    localStorage.removeItem(AUTH_KEY_SESSION);
    if (settingsModal) settingsModal.style.display = 'none';
    if (authGateModal) authGateModal.style.display = 'flex';
    authTargetTeacherKey = window.state?.activeTeacherKey || 'wife';
    updateAuthTeacherUI();
    resetPinDisplay();
    if (typeof showToast === 'function') showToast('🔒 보안 잠금 상태로 전환되었습니다.');
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
        newPinInput.placeholder = `${window.state?.teacherName || '선생님'} 새 PIN (4자리)`;
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
      setTeacherPin(window.state?.activeTeacherKey || 'wife', newPin);
      pinChangeBox.style.display = 'none';
      if (typeof showToast === 'function') {
        showToast(`✅ ${window.state?.teacherName}의 새 4자리 PIN(${newPin})으로 안전하게 변경되었습니다.`);
      }
    };
  }
}

function handlePinInput(digit) {
  if (pinBuffer.length >= 4) return;
  pinBuffer += digit;
  updatePinDots();

  if (pinBuffer.length === 4) {
    const correctPin = getTeacherPin(authTargetTeacherKey);
    const pinErrorMsg = document.getElementById('pinErrorMsg');
    const pinDotsContainer = document.getElementById('pinDotsContainer');

    if (pinBuffer === correctPin) {
      if (pinErrorMsg) {
        pinErrorMsg.textContent = '✨ 확인되었습니다. 잠시만 기다려주세요...';
        pinErrorMsg.style.color = '#059669';
      }
      if (navigator.vibrate) navigator.vibrate([40, 40, 40]);
      setTimeout(() => {
        loginSuccess(authTargetTeacherKey);
      }, 200);
    } else {
      if (pinDotsContainer) {
        pinDotsContainer.classList.add('pin-shake');
        setTimeout(() => pinDotsContainer.classList.remove('pin-shake'), 400);
      }
      if (pinErrorMsg) {
        const profiles = window.TEACHER_PROFILES || {};
        const targetProfile = profiles[authTargetTeacherKey] || profiles.wife;
        pinErrorMsg.textContent = `${targetProfile.name}의 비밀번호가 일치하지 않아요. (초기: 0000)`;
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
    const pinErrorMsg = document.getElementById('pinErrorMsg');
    if (pinErrorMsg) pinErrorMsg.textContent = '';
  }
}

function resetPinDisplay() {
  pinBuffer = '';
  updatePinDots();
  const pinErrorMsg = document.getElementById('pinErrorMsg');
  if (pinErrorMsg) {
    pinErrorMsg.textContent = '';
    pinErrorMsg.style.color = '#EF4444';
  }
}

function updatePinDots() {
  const pinDots = document.querySelectorAll('.pin-dot');
  if (!pinDots || pinDots.length === 0) return;
  pinDots.forEach((dot, idx) => {
    if (idx < pinBuffer.length) {
      dot.classList.add('filled');
    } else {
      dot.classList.remove('filled');
    }
  });
}

function loginSuccess(teacherKey, customName = null) {
  const rememberAuthCheck = document.getElementById('rememberAuthCheck');
  const sessionUserEmailText = document.getElementById('sessionUserEmailText');
  const authGateModal = document.getElementById('authGateModal');
  const isRemember = rememberAuthCheck ? rememberAuthCheck.checked : true;
  const profiles = window.TEACHER_PROFILES || {};
  const profile = profiles[teacherKey] || profiles.wife;
  const displayName = customName || `${profile.className} ${profile.name}`;

  const sessionData = {
    teacherKey: profile.key,
    user: displayName,
    loggedInAt: Date.now(),
    expiresAt: isRemember ? Date.now() + AUTH_30_DAYS_MS : Date.now() + (24 * 60 * 60 * 1000)
  };
  localStorage.setItem(AUTH_KEY_SESSION, JSON.stringify(sessionData));

  if (sessionUserEmailText) {
    sessionUserEmailText.textContent = `${profile.name} (인증됨)`;
  }

  // 해당 교사 프로필 적용 및 원아 목록 격리 로드
  applyTeacherProfile(profile.key, true);

  if (authGateModal) {
    authGateModal.style.display = 'none';
  }
  if (typeof showToast === 'function') {
    showToast(`🧸 ${displayName}님, 환영합니다!`);
  }
}

function applyTeacherProfile(teacherKey, showWelcomeToast = false) {
  const profiles = window.TEACHER_PROFILES || {};
  const profile = profiles[teacherKey] || profiles.wife;
  const state = window.state;
  if (!state) return;

  state.activeTeacherKey = profile.key;
  state.className = profile.className;
  state.teacherName = profile.name;
  state.persona = getTeacherPersona(profile.key);
  state.teacherStyle = getTeacherStyle(profile.key);
  state.mode = profile.key === 'sister_in_law' ? 'class_report' : 'all_suite';

  localStorage.setItem('daycare_active_teacher', profile.key);
  localStorage.setItem('daycare_class_name', profile.className);
  localStorage.setItem('daycare_teacher_name', profile.name);

  // 헤더 및 스위처 UI 갱신
  const headerClassNameText = document.getElementById('headerClassNameText');
  const headerClassNameBtn = document.getElementById('headerClassNameBtn');
  if (headerClassNameText) headerClassNameText.textContent = `${profile.className} (${profile.ageText})`;
  if (headerClassNameBtn) headerClassNameBtn.title = `${profile.name} (${profile.className})`;
  syncTeacherSwitcherUI(profile.key);

  // 상단 격리 뱃지 갱신
  const classFilterText = document.getElementById('classFilterText');
  if (classFilterText) classFilterText.textContent = `${profile.className} 전용`;

  // 페르소나 UI 갱신
  updatePersonaUI();

  // 현재 교사 반 원아만 100% 격리 로드
  if (typeof loadChildren === 'function') {
    loadChildren();
  }

  // 보관함 캐시 무효화
  state.isHistoryLoaded = false;

  if (showWelcomeToast && typeof showToast === 'function') {
    showToast(`👩‍🏫 ${profile.name} (${profile.className}) 모드가 안전하게 활성화되었습니다.`);
  }
}

function handleTeacherSwitchClick(targetKey) {
  const state = window.state;
  if (targetKey === state?.activeTeacherKey) {
    if (typeof showToast === 'function') showToast(`현재 ${state.teacherName} (${state.className}) 모드입니다.`);
    return;
  }

  // 🔒 다른 교사 교실로 이동 시 PIN 보안 잠금 화면 호출!
  openAuthGateForTeacher(targetKey);
}

function openAuthGateForTeacher(targetKey) {
  authTargetTeacherKey = targetKey;
  const authGateModal = document.getElementById('authGateModal');
  if (authGateModal) {
    authGateModal.style.display = 'flex';
    updateAuthTeacherUI();
    resetPinDisplay();
    const profiles = window.TEACHER_PROFILES || {};
    const targetProfile = profiles[targetKey] || profiles.wife;
    if (typeof showToast === 'function') {
      showToast(`🔒 ${targetProfile.name} 교실 진입을 위해 4자리 PIN을 입력하세요.`);
    }
  }
}

function syncTeacherSwitcherUI(targetKey = null) {
  const activeTeacher = targetKey || window.state?.activeTeacherKey || 'wife';
  const btnSwitchWife = document.getElementById('btnSwitchWife');
  const btnSwitchSisterInLaw = document.getElementById('btnSwitchSisterInLaw');
  const btnSwitchSandbox = document.getElementById('btnSwitchSandbox');
  if (btnSwitchWife) btnSwitchWife.classList.toggle('active', activeTeacher === 'wife');
  if (btnSwitchSisterInLaw) btnSwitchSisterInLaw.classList.toggle('active', activeTeacher === 'sister_in_law');
  if (btnSwitchSandbox) btnSwitchSandbox.classList.toggle('active', activeTeacher === 'sandbox');
}

function updatePersonaUI() {
  const state = window.state;
  if (!state) return;
  const p = state.persona || {};
  const headerPersonaText = document.getElementById('headerPersonaText');
  const headerClassNameText = document.getElementById('headerClassNameText');
  const settingClassNameInput = document.getElementById('settingClassNameInput');
  const settingTeacherNameInput = document.getElementById('settingTeacherNameInput');
  const personaSampleNote = document.getElementById('personaSampleNote');
  const personaCallStyle = document.getElementById('personaCallStyle');
  const personaEmojiLevel = document.getElementById('personaEmojiLevel');
  const personaClosingGreeting = document.getElementById('personaClosingGreeting');
  const personaPresetGrid = document.getElementById('personaPresetGrid');

  if (headerPersonaText) {
    headerPersonaText.textContent = p.name ? p.name.split('(')[0].trim() : '스피디 실속형';
  }
  
  if (headerClassNameText) {
    headerClassNameText.textContent = state.className || '햇살반';
  }
  if (settingClassNameInput) {
    settingClassNameInput.value = state.className || '햇살반';
  }
  if (settingTeacherNameInput) {
    settingTeacherNameInput.value = state.teacherName || '김선생님';
  }

  if (personaSampleNote) personaSampleNote.value = p.sampleNote || '';
  if (personaCallStyle) personaCallStyle.value = p.callStyle || '우리 [아동A]';
  if (personaEmojiLevel) personaEmojiLevel.value = p.emojiLevel || 'moderate';
  if (personaClosingGreeting) personaClosingGreeting.value = p.closingGreeting || '';

  if (personaPresetGrid) {
    personaPresetGrid.querySelectorAll('.persona-preset-chip').forEach(chip => {
      chip.classList.toggle('active', chip.dataset.preset === p.preset);
    });
  }
}

// Cloudflare Access 보안 세션 확인
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
  const sessionUserEmailText = document.getElementById('sessionUserEmailText');
  const sessionStatusTag = document.getElementById('sessionStatusTag');
  const sessionExpiryDateText = document.getElementById('sessionExpiryDateText');
  const sessionDaysLeftText = document.getElementById('sessionDaysLeftText');

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
  const sessionExpiryBanner = document.getElementById('sessionExpiryBanner');
  const sessionDdayBadge = document.getElementById('sessionDdayBadge');
  const sessionDescText = document.getElementById('sessionDescText');
  if (!sessionExpiryBanner) return;
  if (sessionDdayBadge) sessionDdayBadge.textContent = `D-${daysLeft}`;
  if (sessionDescText) {
    sessionDescText.textContent = `약 ${daysLeft}일 후 보안 세션이 만료되어 접속 시 이메일 6자리 인증이 다시 요청될 수 있어요.`;
  }
  sessionExpiryBanner.style.display = 'flex';
}

function hideSessionBanner() {
  const sessionExpiryBanner = document.getElementById('sessionExpiryBanner');
  if (sessionExpiryBanner) sessionExpiryBanner.style.display = 'none';
}

// 🌐 전역 네임스페이스 및 하위 호환성 등록
window.getTeacherPin = getTeacherPin;
window.setTeacherPin = setTeacherPin;
window.getTeacherPersona = getTeacherPersona;
window.setTeacherPersona = setTeacherPersona;
window.getTeacherStyle = getTeacherStyle;
window.setTeacherStyle = setTeacherStyle;
window.initAuthGate = initAuthGate;
window.applyTeacherProfile = applyTeacherProfile;
window.handleTeacherSwitchClick = handleTeacherSwitchClick;
window.syncTeacherSwitcherUI = syncTeacherSwitcherUI;
window.updatePersonaUI = updatePersonaUI;
window.checkSecuritySession = checkSecuritySession;

window.DaycareAuth = {
  getTeacherPin,
  setTeacherPin,
  getTeacherPersona,
  setTeacherPersona,
  getTeacherStyle,
  setTeacherStyle,
  initAuthGate,
  applyTeacherProfile,
  handleTeacherSwitchClick,
  syncTeacherSwitcherUI,
  updatePersonaUI,
  checkSecuritySession
};
