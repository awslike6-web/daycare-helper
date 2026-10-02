/**
 * 🔐 daycare-helper Authentication & Security Core (auth-security.js)
 * 2026 Modern Vanilla JS (ES2024+)
 * 
 * 통합 구성:
 *  - 환경 설정 및 교사 프로필/프리셋 (구 config.js)
 *  - 2-Way PIN 보안 잠금 게이트 및 Cloudflare Access 세션 감시 (구 auth-gate.js)
 *  - 교사 프로필 원터치 스위칭 및 페르소나 스타일 관리
 */

(function () {
  // ============================================================================
  // 1. 전역 토스트 헬퍼 폴백 (모든 모듈에서 안전하게 호출 가능하도록 보장)
  // ============================================================================
  if (typeof window.showToast !== 'function') {
    window.showToast = function (message) {
      const toastMessage = document.getElementById('toastMessage');
      if (toastMessage) {
        toastMessage.textContent = message;
        toastMessage.classList.add('show');
        setTimeout(() => toastMessage.classList.remove('show'), 2400);
      } else {
        console.log('[Toast]', message);
      }
    };
  }

  // ============================================================================
  // 2. 환경 설정 및 프로필 프리셋 (Config)
  // ============================================================================
  const PERSONA_PRESETS = {
    warm_detailed: {
      name: '다정하고 꼼꼼한 선생님',
      desc: '아이의 작은 표정과 감정 변화까지 놓치지 않고 따뜻한 언어로 상세하게 담아내는 선생님입니다.',
      tone: '다정하고 따뜻하며 감성적인 어조 (~했어요, ~보았답니다)',
      keywords: ['눈맞춤', '도닥임', '반짝이는 눈망울', '스스로 시도', '따뜻한 격려'],
      sampleNote: '오늘 민서가 블록을 높이 쌓다가 무너졌을 때, 울먹이지 않고 심호흡을 한 번 하더니 "다시 해볼래!" 하고 씩씩하게 웃어 보였어요. 옆에서 가만히 지켜보며 응원해 주었더니 끝내 세 층을 더 높게 완성하며 뿌듯해했답니다. 작은 실패에도 의연하게 다시 도전하는 모습이 참 대견한 하루였습니다.'
    },
    speedy_practical: {
      name: '스피디 실속형 선생님',
      desc: '학부모가 바쁜 일상 속에서도 핵심 놀이와 생활 습관을 10초 만에 파악할 수 있도록 명료하게 정리합니다.',
      tone: '명료하고 핵심 위주의 담백한 어조 (~함, ~했습니다)',
      keywords: ['핵심 놀이', '식습관 칭찬', '원활한 상호작용', '안정적인 일과'],
      sampleNote: '오늘 민서는 친구들과 동물 블록을 활용한 우리 만들기 놀이에 30분 이상 몰입했습니다. 원하는 블록을 "빌려줄래?" 하고 차분히 요청하여 함께 놀이 규칙을 만들어갔습니다. 점심 식사 시에도 나물 반찬을 스스로 다 먹으며 건강한 식습관을 실천했습니다.'
    },
    cheer_bright: {
      name: '밝고 활기찬 비타민 선생님',
      desc: '아이의 귀여운 말과 행동을 생생한 이모지와 함께 경쾌하고 밝은 에너지로 전달하는 선생님입니다.',
      tone: '밝고 경쾌하며 사랑스러운 어조 (~했지요! 😊, ~너무 기특해요!)',
      keywords: ['까르르', '함박웃음', '방방 뛰며', '칭찬 듬뿍', '사랑스러운'],
      sampleNote: '오늘 민서의 웃음소리가 교실 가득 울려 퍼졌어요! 🎵 비눗방울을 하늘 높이 날려주자 "선생님, 무지개 별 같아요!" 하며 두 손을 번쩍 들고 까르르 뛰는 모습이 정말 사랑스러웠답니다. 친구들에게도 비눗방울 채를 양보하며 활짝 웃는 의젓한 비타민 왕자님이었어요. 🌟'
    },
    growth_centered: {
      name: '성장 관찰 중심 전문가형 선생님',
      desc: '놀이 속 소근육 조작, 언어 표현, 사회성 발달 지표를 표준보육과정 관점에서 분석적으로 기술합니다.',
      tone: '발달 과업 중심의 전문적이고 신뢰감 있는 어조 (~발달을 보임, ~확장 관찰됨)',
      keywords: ['조작 능력 확장', '어휘 구사', '또래 협동', '자기조절력', '비계 설정'],
      sampleNote: '민서는 오늘 기차 레일 블록을 곡선으로 연결하는 과정에서 정교한 양손 협응력을 발휘했습니다. 원하는 레일 조각이 부족하자 "내가 저쪽을 이어볼게"라며 또래에게 역할을 제안하는 등 언어적 문제해결 능력이 한 단계 도약한 모습을 관찰할 수 있었습니다.'
    }
  };

  const PARENT_PRESETS = {
    anxious: '아이가 밥은 잘 먹었는지, 친구와 다투진 않았는지 늘 염려하시는 따뜻한 부모님 (구체적인 안심 멘트와 식사/낮잠 상세 서술 필요)',
    busy: '퇴근이 늦고 바쁘셔서 모바일로 핵심만 빠르게 확인하길 원하시는 맞벌이 부모님 (3줄 요약 및 오늘 가장 잘한 행동 1가지 위주)',
    growth_focused: '아이의 언어 발달과 사회성, 또래 관계 형성에 깊은 관심이 있으신 학구파 부모님 (발달 관찰 포인트와 가정 연계 팁 포함)',
    friendly: '선생님과 스스럼없이 소통하며 아이의 일상 소소한 유머나 밝은 모습을 좋아하시는 친근한 부모님 (밝은 이모지와 재미있었던 에피소드 위주)'
  };

  const TEACHER_PROFILES = {
    wife: {
      key: 'wife',
      name: '공가영 선생님',
      className: '사랑반',
      role: '담임교사',
      ageGroup: '만 0세 영아반',
      avatar: '👩‍🍼',
      pin: '1234',
      badge: '사랑반 담임 (만 0세)',
      defaultPersona: 'warm_detailed',
      notionPageId: '320a27115b688005b630dc65bfeb014c',
      desc: '사랑반 (만 0세 영아 2명: 김민서, 박지호)'
    },
    sister_in_law: {
      key: 'sister_in_law',
      name: '공가희 주임님',
      className: '소망반',
      role: '주임교사',
      ageGroup: '만 2세 유아반',
      avatar: '👩‍🏫',
      pin: '0000',
      badge: '소망반 주임 (만 2세) ⭐',
      defaultPersona: 'speedy_practical',
      notionPageId: '320a27115b6880299f2dfbe0c8c0816b',
      desc: '소망반 (만 2세 유아 7명: 이서준, 김하은, 박도윤, 최유진, 정시우, 윤서아, 한지민)'
    },
    sandbox: {
      key: 'sandbox',
      name: '체험 · 연구반',
      className: '연구반',
      role: '게스트 / 테스트',
      ageGroup: '자유 테스트 구역',
      avatar: '👨‍💻',
      pin: '9999',
      badge: '체험 · 연구반 (테스트)',
      defaultPersona: 'cheer_bright',
      notionPageId: '',
      desc: '자유 테스트 구역 (모든 원아 및 데이터 열람/실험 가능)'
    }
  };

  const NOTION_CONFIG = {
    DAILY_LOG_DB_ID: '320a2711-5b68-809e-ba62-f2fefaa0bc9c',
    CHILDREN_DB_ID: '320a2711-5b68-8051-9f20-c637a7fefc65',
    TEACHER_PAGE_MAP: {
      '공가영': '320a27115b688005b630dc65bfeb014c',
      '공가희': '320a27115b6880299f2dfbe0c8c0816b'
    }
  };

  // ============================================================================
  // 3. 교사 스타일 및 페르소나 헬퍼
  // ============================================================================
  function getTeacherPersona(teacherKey) {
    try {
      const saved = localStorage.getItem(`daycare_teacher_persona_${teacherKey}`);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    const profile = TEACHER_PROFILES[teacherKey] || TEACHER_PROFILES.wife;
    return PERSONA_PRESETS[profile.defaultPersona] || PERSONA_PRESETS.warm_detailed;
  }

  function getTeacherStyle(teacherKey) {
    return localStorage.getItem(`daycare_teacher_style_${teacherKey}`) || getTeacherPersona(teacherKey).name;
  }

  function setTeacherPersona(teacherKey, personaObj) {
    try {
      localStorage.setItem(`daycare_teacher_persona_${teacherKey}`, JSON.stringify(personaObj));
    } catch (e) {}
  }

  function setTeacherStyle(teacherKey, styleName) {
    try {
      localStorage.setItem(`daycare_teacher_style_${teacherKey}`, styleName);
    } catch (e) {}
  }

  // ============================================================================
  // 4. 2-Way PIN 보안 잠금 게이트 (Auth Gate)
  // ============================================================================
  let pendingTeacherKey = null;

  function initAuthGate() {
    const activeTeacherKey = localStorage.getItem('daycare_active_teacher') || 'wife';
    const profile = TEACHER_PROFILES[activeTeacherKey] || TEACHER_PROFILES.wife;
    const isUnlocked = sessionStorage.getItem(`daycare_unlocked_${profile.key}`) === 'true';

    if (!isUnlocked) {
      showPinModal(profile.key, false);
    }

    const headerLogoutBtn = document.getElementById('headerLogoutBtn');
    if (headerLogoutBtn) {
      headerLogoutBtn.addEventListener('click', () => {
        sessionStorage.removeItem(`daycare_unlocked_${activeTeacherKey}`);
        window.showToast('🔒 안전하게 잠금 처리되었습니다. PIN을 다시 입력해주세요.');
        showPinModal(activeTeacherKey, false);
      });
    }

    setupPinModalListeners();
  }

  function showPinModal(targetKey, canCancel = true) {
    const targetProfile = TEACHER_PROFILES[targetKey] || TEACHER_PROFILES.wife;
    pendingTeacherKey = targetKey;

    const modal = document.getElementById('pinAuthModal');
    const titleEl = document.getElementById('pinModalTitle');
    const descEl = document.getElementById('pinModalDesc');
    const avatarEl = document.getElementById('pinModalAvatar');
    const cancelBtn = document.getElementById('btnPinCancel');
    const inputEl = document.getElementById('pinInput');
    const errorEl = document.getElementById('pinErrorText');

    if (!modal) return;

    if (titleEl) titleEl.textContent = `${targetProfile.name} PIN 인증`;
    if (descEl) descEl.textContent = `${targetProfile.className} (${targetProfile.ageGroup}) 보안 접근을 위해 4자리 PIN을 입력하세요.`;
    if (avatarEl) avatarEl.textContent = targetProfile.avatar;
    if (errorEl) errorEl.style.display = 'none';

    if (cancelBtn) {
      cancelBtn.style.display = canCancel ? 'inline-block' : 'none';
    }

    if (inputEl) {
      inputEl.value = '';
      setTimeout(() => inputEl.focus(), 150);
    }

    modal.style.display = 'flex';
  }

  function hidePinModal() {
    const modal = document.getElementById('pinAuthModal');
    if (modal) modal.style.display = 'none';
    pendingTeacherKey = null;
  }

  function setupPinModalListeners() {
    const inputEl = document.getElementById('pinInput');
    const submitBtn = document.getElementById('btnPinSubmit');
    const cancelBtn = document.getElementById('btnPinCancel');
    const keypadBtns = document.querySelectorAll('.pin-keypad-btn');
    const errorEl = document.getElementById('pinErrorText');

    if (!inputEl) return;

    keypadBtns.forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        const digit = btn.dataset.digit;
        if (digit === 'clear') {
          inputEl.value = '';
        } else if (digit === 'back') {
          inputEl.value = inputEl.value.slice(0, -1);
        } else if (digit && inputEl.value.length < 4) {
          inputEl.value += digit;
          if (inputEl.value.length === 4) {
            verifyPin(inputEl.value);
          }
        }
      };
    });

    if (submitBtn) {
      submitBtn.onclick = (e) => {
        e.preventDefault();
        verifyPin(inputEl.value);
      };
    }

    if (cancelBtn) {
      cancelBtn.onclick = (e) => {
        e.preventDefault();
        hidePinModal();
      };
    }

    inputEl.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        verifyPin(inputEl.value);
      }
    };
  }

  function verifyPin(inputPin) {
    const targetKey = pendingTeacherKey || localStorage.getItem('daycare_active_teacher') || 'wife';
    const profile = TEACHER_PROFILES[targetKey] || TEACHER_PROFILES.wife;
    const errorEl = document.getElementById('pinErrorText');
    const inputEl = document.getElementById('pinInput');

    if (inputPin === profile.pin) {
      sessionStorage.setItem(`daycare_unlocked_${profile.key}`, 'true');
      hidePinModal();
      executeTeacherSwitch(profile.key);
      window.showToast(`🔓 [${profile.name}] 인증 성공! 환영합니다.`);
    } else {
      if (errorEl) {
        errorEl.textContent = '❌ PIN 번호가 일치하지 않습니다. 다시 입력해주세요.';
        errorEl.style.display = 'block';
      }
      if (inputEl) {
        inputEl.value = '';
        inputEl.focus();
      }
    }
  }

  // ============================================================================
  // 5. 교사 프로필 스위처 및 화면 동기화
  // ============================================================================
  function handleTeacherSwitchClick(targetKey) {
    const currentKey = localStorage.getItem('daycare_active_teacher') || 'wife';
    if (currentKey === targetKey) {
      window.showToast(`현재 이미 [${TEACHER_PROFILES[targetKey]?.name}] 프로필입니다.`);
      return;
    }

    const isUnlocked = sessionStorage.getItem(`daycare_unlocked_${targetKey}`) === 'true';
    if (isUnlocked) {
      executeTeacherSwitch(targetKey);
    } else {
      showPinModal(targetKey, true);
    }
  }

  function executeTeacherSwitch(targetKey) {
    const profile = TEACHER_PROFILES[targetKey] || TEACHER_PROFILES.wife;
    localStorage.setItem('daycare_active_teacher', profile.key);
    localStorage.setItem('daycare_class_name', profile.className);
    localStorage.setItem('daycare_teacher_name', profile.name);

    const state = window.state || {};
    state.activeTeacherKey = profile.key;
    state.className = profile.className;
    state.teacherName = profile.name;
    state.filterOnlyMyClass = true; // 🔒 항상 담당 학급만 100% 철통 격리
    state.selectedChild = null;
    state.mode = profile.key === 'sister_in_law' ? 'class_report' : 'all_suite';
    state.persona = getTeacherPersona(profile.key);
    state.teacherStyle = getTeacherStyle(profile.key);

    syncTeacherSwitcherUI(profile.key);
    updatePersonaUI();

    if (window.ChildrenStore && typeof window.ChildrenStore.loadChildren === 'function') {
      window.ChildrenStore.loadChildren();
    } else if (typeof window.loadChildren === 'function') {
      window.loadChildren();
    }

    window.showToast(`👩‍🏫 [${profile.name}] 프로필로 전환되었습니다. (${profile.className})`);
  }

  function syncTeacherSwitcherUI(targetKey = null) {
    const key = targetKey || localStorage.getItem('daycare_active_teacher') || 'wife';
    const profile = TEACHER_PROFILES[key] || TEACHER_PROFILES.wife;

    const btnWife = document.getElementById('btnSwitchWife');
    const btnSister = document.getElementById('btnSwitchSisterInLaw');
    const btnSandbox = document.getElementById('btnSwitchSandbox');
    const headerClassNameText = document.getElementById('headerClassNameText');

    if (btnWife) btnWife.classList.toggle('active', key === 'wife');
    if (btnSister) btnSister.classList.toggle('active', key === 'sister_in_law');
    if (btnSandbox) btnSandbox.classList.toggle('active', key === 'sandbox');
    if (headerClassNameText) headerClassNameText.textContent = profile.className;
  }

  function updatePersonaUI() {
    const state = window.state || {};
    const key = state.activeTeacherKey || localStorage.getItem('daycare_active_teacher') || 'wife';
    const persona = state.persona || getTeacherPersona(key);

    const headerPersonaText = document.getElementById('headerPersonaText');
    const personaSampleNote = document.getElementById('personaSampleNote');
    const settingClassNameInput = document.getElementById('settingClassNameInput');
    const settingTeacherNameInput = document.getElementById('settingTeacherNameInput');

    if (headerPersonaText) headerPersonaText.textContent = persona.name || '맞춤 페르소나';
    if (personaSampleNote && !personaSampleNote.value) personaSampleNote.value = persona.sampleNote || '';
    if (settingClassNameInput) settingClassNameInput.value = state.className || '사랑반';
    if (settingTeacherNameInput) settingTeacherNameInput.value = state.teacherName || '공가영 선생님';
  }

  // ============================================================================
  // 6. Cloudflare Access 보안 세션 만료 모니터 (D-7 사전 경고)
  // ============================================================================
  async function checkSecuritySession() {
    try {
      const res = await fetch('/cdn-cgi/access/get-identity', { method: 'GET' });
      if (!res.ok) return;
      const data = await res.json();
      if (!data || !data.exp) return;

      const now = Math.floor(Date.now() / 1000);
      const remainingSeconds = data.exp - now;
      const remainingDays = Math.ceil(remainingSeconds / 86400);

      if (remainingDays <= 7 && remainingDays > 0) {
        showSessionBanner(remainingDays, data.exp);
      }
    } catch (e) {
      // 로컬 환경이나 비Access 환경에서는 조용히 넘어감
    }
  }

  function showSessionBanner(dDay, expTimestamp) {
    const banner = document.getElementById('sessionExpiryBanner');
    const badge = document.getElementById('sessionDdayBadge');
    const desc = document.getElementById('sessionDescText');
    if (!banner) return;

    const dismissedExp = localStorage.getItem('daycare_dismissed_session_exp');
    if (dismissedExp && String(dismissedExp) === String(expTimestamp)) return;

    if (badge) badge.textContent = `D-${dDay}`;
    if (desc) desc.textContent = `보안 인증 만료가 ${dDay}일 남았습니다. 만료 전 재인증을 권장합니다.`;
    banner.style.display = 'flex';
  }

  function hideSessionBanner() {
    const banner = document.getElementById('sessionExpiryBanner');
    if (banner) banner.style.display = 'none';
  }

  // ============================================================================
  // 7. 글로벌 노출 및 하위 호환 파사드 (Facade)
  // ============================================================================
  window.DaycareConfig = {
    PERSONA_PRESETS,
    PARENT_PRESETS,
    TEACHER_PROFILES,
    TEACHER_PAGE_MAP: NOTION_CONFIG.TEACHER_PAGE_MAP,
    NOTION_CONFIG
  };

  window.DaycareAuth = {
    initAuthGate,
    handleTeacherSwitchClick,
    executeTeacherSwitch,
    switchTeacherProfile: executeTeacherSwitch, // 🌟 누락 식별자 안전 브리지
    syncTeacherSwitcherUI,
    updatePersonaUI,
    getTeacherPersona,
    getTeacherStyle,
    setTeacherPersona,
    setTeacherStyle,
    checkSecuritySession,
    showSessionBanner,
    hideSessionBanner
  };

  // 하위 호환 단독 전역 함수 바인딩
  window.PERSONA_PRESETS = PERSONA_PRESETS;
  window.PARENT_PRESETS = PARENT_PRESETS;
  window.TEACHER_PROFILES = TEACHER_PROFILES;
  window.NOTION_CONFIG = NOTION_CONFIG;
  window.initAuthGate = initAuthGate;
  window.handleTeacherSwitchClick = handleTeacherSwitchClick;
  window.executeTeacherSwitch = executeTeacherSwitch;
  window.switchTeacherProfile = executeTeacherSwitch; // 🌟 완벽 보존
  window.syncTeacherSwitcherUI = syncTeacherSwitcherUI;
  window.updatePersonaUI = updatePersonaUI;
  window.getTeacherPersona = getTeacherPersona;
  window.getTeacherStyle = getTeacherStyle;
  window.setTeacherPersona = setTeacherPersona;
  window.setTeacherStyle = setTeacherStyle;
  window.checkSecuritySession = checkSecuritySession;
  window.showSessionBanner = showSessionBanner;
  window.hideSessionBanner = hideSessionBanner;
})();
