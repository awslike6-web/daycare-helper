/**
 * ⚙️ daycare-helper Settings & Modals Controller Module (settings-controller.js)
 * 2026 Modern Vanilla JS (ES2024+)
 * 
 * 주요 역할:
 *  - 👩‍🏫 교사 프로필 스위처 및 사용 가이드 모달 제어
 *  - 🎭 페르소나 문체 프리셋 적용 및 우리 반 환경 설정 모달 제어
 *  - 👶 원아 추가/수정 모달 및 학부모 4대 프리셋 자동 입력 제어
 *  - 🔐 보안 세션 배너 제어
 *  - 🗑️ 관찰 메모 실시간 저장 및 2-Tap 안전 비우기 제어
 *  - 📅 소급 작성 날짜 갱신 헬퍼
 */

(function () {
  /**
   * 📅 소급 작성 날짜 변경 및 헤더 배너 갱신
   */
  function updateRecordDate(dateStr) {
    if (!dateStr) return;
    const state = window.state || {};
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

  /**
   * ⚙️ 설정 관련 이벤트 리스너 일괄 등록
   */
  function setupSettingsListeners(context = {}) {
    const state = window.state || {};
    const { PERSONA_PRESETS, PARENT_PRESETS } = window.DaycareConfig || window;
    const showToast = context.showToast || window.showToast || console.log;

    // 1. 👩‍🏫 교사 프로필 1초 원터치 스위처 (보안 PIN 인증 게이트 거침)
    const btnSwitchWife = document.getElementById('btnSwitchWife');
    const btnSwitchSisterInLaw = document.getElementById('btnSwitchSisterInLaw');
    const btnSwitchSandbox = document.getElementById('btnSwitchSandbox');

    const handleTeacherSwitch = (key) => {
      if (typeof window.handleTeacherSwitchClick === 'function') {
        window.handleTeacherSwitchClick(key);
      } else if (window.DaycareAuth && typeof window.DaycareAuth.handleTeacherSwitchClick === 'function') {
        window.DaycareAuth.handleTeacherSwitchClick(key);
      }
    };

    if (btnSwitchWife) btnSwitchWife.addEventListener('click', () => handleTeacherSwitch('wife'));
    if (btnSwitchSisterInLaw) btnSwitchSisterInLaw.addEventListener('click', () => handleTeacherSwitch('sister_in_law'));
    if (btnSwitchSandbox) btnSwitchSandbox.addEventListener('click', () => handleTeacherSwitch('sandbox'));

    // 2. 📅 소급 작성용 캘린더 날짜 변경
    const recordDatePicker = document.getElementById('recordDatePicker');
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

    // 3. ❓ 선생님 맞춤 사용 가이드 모달
    const headerGuideBtn = document.getElementById('headerGuideBtn');
    const teacherGuideModal = document.getElementById('teacherGuideModal');
    const btnCloseGuideModal = document.getElementById('btnCloseGuideModal');
    const btnConfirmGuideModal = document.getElementById('btnConfirmGuideModal');

    if (headerGuideBtn && teacherGuideModal) {
      headerGuideBtn.addEventListener('click', () => { teacherGuideModal.style.display = 'flex'; });
    }
    if (btnCloseGuideModal && teacherGuideModal) {
      btnCloseGuideModal.addEventListener('click', () => { teacherGuideModal.style.display = 'none'; });
    }
    if (btnConfirmGuideModal && teacherGuideModal) {
      btnConfirmGuideModal.addEventListener('click', () => { teacherGuideModal.style.display = 'none'; });
    }
    if (teacherGuideModal) {
      teacherGuideModal.addEventListener('click', (e) => {
        if (e.target === teacherGuideModal) teacherGuideModal.style.display = 'none';
      });
    }

    // 4. 🎭 페르소나 및 설정 모달 제어
    const headerClassNameBtn = document.getElementById('headerClassNameBtn');
    const headerPersonaBtn = document.getElementById('headerPersonaBtn');
    const settingsBtn = document.getElementById('settingsBtn');
    const closeSettingsBtn = document.getElementById('closeSettingsBtn');
    const settingsModal = document.getElementById('settingsModal');
    const settingClassNameInput = document.getElementById('settingClassNameInput');
    const settingTeacherNameInput = document.getElementById('settingTeacherNameInput');
    const personaPresetGrid = document.getElementById('personaPresetGrid');
    const personaSampleNote = document.getElementById('personaSampleNote');
    const personaCallStyle = document.getElementById('personaCallStyle');
    const personaEmojiLevel = document.getElementById('personaEmojiLevel');
    const personaClosingGreeting = document.getElementById('personaClosingGreeting');
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    const syncTeacherFromNotionBtn = document.getElementById('syncTeacherFromNotionBtn');

    const openSettings = (focusClass = false) => {
      if (typeof window.updatePersonaUI === 'function') window.updatePersonaUI();
      if (settingsModal) settingsModal.style.display = 'flex';
      if (focusClass && settingClassNameInput) {
        setTimeout(() => {
          settingClassNameInput.focus();
          settingClassNameInput.select();
        }, 100);
      }
    };

    if (headerClassNameBtn) headerClassNameBtn.addEventListener('click', () => openSettings(true));
    if (headerPersonaBtn) headerPersonaBtn.addEventListener('click', () => openSettings(false));
    if (settingsBtn) settingsBtn.addEventListener('click', () => openSettings(false));
    if (closeSettingsBtn && settingsModal) {
      closeSettingsBtn.addEventListener('click', () => { settingsModal.style.display = 'none'; });
    }

    // 페르소나 프리셋 칩 클릭
    if (personaPresetGrid && PERSONA_PRESETS) {
      personaPresetGrid.querySelectorAll('.persona-preset-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          const presetKey = chip.dataset.preset;
          const presetData = PERSONA_PRESETS[presetKey];
          if (presetData) {
            state.persona = { ...presetData };
            if (typeof window.setTeacherPersona === 'function') window.setTeacherPersona(state.activeTeacherKey, state.persona);
            if (typeof window.setTeacherStyle === 'function') window.setTeacherStyle(state.activeTeacherKey, presetData.name);
            if (typeof window.updatePersonaUI === 'function') window.updatePersonaUI();
            showToast(`🎭 '${presetData.name}' 프리셋이 적용되었습니다.`);
          }
        });
      });
    }

    // 설정 모달 저장 버튼
    if (saveSettingsBtn) {
      saveSettingsBtn.addEventListener('click', () => {
        const newClassName = settingClassNameInput ? settingClassNameInput.value.trim() || state.className : state.className;
        const newTeacherName = settingTeacherNameInput ? settingTeacherNameInput.value.trim() || state.teacherName : state.teacherName;
        const classChanged = state.className !== newClassName;
        state.className = newClassName;
        state.teacherName = newTeacherName;
        localStorage.setItem('daycare_class_name', newClassName);
        localStorage.setItem('daycare_teacher_name', newTeacherName);

        state.persona = {
          preset: state.persona?.preset || 'custom',
          name: state.persona?.name || '맞춤 페르소나',
          sampleNote: personaSampleNote ? personaSampleNote.value.trim() : '',
          callStyle: personaCallStyle ? personaCallStyle.value : '우리 [아동A]',
          emojiLevel: personaEmojiLevel ? personaEmojiLevel.value : 'moderate',
          closingGreeting: personaClosingGreeting ? personaClosingGreeting.value.trim() : ''
        };

        if (typeof window.setTeacherPersona === 'function') window.setTeacherPersona(state.activeTeacherKey, state.persona);
        if (typeof window.setTeacherStyle === 'function') window.setTeacherStyle(state.activeTeacherKey, state.persona.name);
        if (typeof window.updatePersonaUI === 'function') window.updatePersonaUI();
        if (classChanged && typeof window.loadChildren === 'function') {
          window.loadChildren();
        }
        if (settingsModal) settingsModal.style.display = 'none';
        showToast(`🌱 '${newClassName}' (${newTeacherName}) 맞춤 설정이 성공적으로 저장되었습니다!`);
      });
    }

    // 노션 프로필 동기화
    if (syncTeacherFromNotionBtn) {
      syncTeacherFromNotionBtn.addEventListener('click', () => {
        if (typeof window.handleSyncTeacherProfile === 'function') {
          window.handleSyncTeacherProfile();
        }
      });
    }

    // 5. 👶 원아 관리 모달
    const addChildBtn = document.getElementById('addChildBtn');
    const editChildBtn = document.getElementById('editChildBtn');
    const childManageModal = document.getElementById('childManageModal');
    const closeChildModalBtn = document.getElementById('closeChildModalBtn');
    const childManageForm = document.getElementById('childManageForm');
    const parentPresetGrid = document.getElementById('parentPresetGrid');
    const manageChildParentStyle = document.getElementById('manageChildParentStyle');
    const classFilterToggleBtn = document.getElementById('classFilterToggleBtn');

    if (addChildBtn) {
      addChildBtn.addEventListener('click', () => {
        if (typeof window.openChildModal === 'function') window.openChildModal('add');
      });
    }
    if (editChildBtn) {
      editChildBtn.addEventListener('click', () => {
        if (state.selectedChild) {
          if (typeof window.openChildModal === 'function') window.openChildModal('edit', state.selectedChild);
        } else {
          showToast('수정할 원아를 먼저 선택해주세요.');
        }
      });
    }
    if (closeChildModalBtn && childManageModal) {
      closeChildModalBtn.addEventListener('click', () => {
        childManageModal.style.display = 'none';
      });
    }
    if (childManageForm) {
      childManageForm.addEventListener('submit', (e) => {
        if (typeof window.handleChildFormSubmit === 'function') {
          window.handleChildFormSubmit(e);
        }
      });
    }

    // 원아 학부모 프리셋 자동 주입
    if (parentPresetGrid && PARENT_PRESETS) {
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

    // 우리 반 원아 필터 토글
    if (classFilterToggleBtn) {
      classFilterToggleBtn.addEventListener('click', () => {
        state.filterOnlyMyClass = !state.filterOnlyMyClass;
        if (typeof window.renderChildrenChips === 'function') {
          window.renderChildrenChips();
        }
        showToast(state.filterOnlyMyClass ? `🌱 '${state.className}' 원아들만 표시합니다.` : '🌐 전체 원아를 표시합니다.');
      });
    }

    // 6. 🔐 보안 세션 배너
    const dismissSessionBannerBtn = document.getElementById('dismissSessionBannerBtn');
    const closeSessionBannerBtn = document.getElementById('closeSessionBannerBtn');
    const testBannerToggleBtn = document.getElementById('testBannerToggleBtn');
    const sessionExpiryBanner = document.getElementById('sessionExpiryBanner');

    const hideSessionBanner = () => {
      if (typeof window.hideSessionBanner === 'function') {
        window.hideSessionBanner();
      } else if (sessionExpiryBanner) {
        sessionExpiryBanner.style.display = 'none';
      }
    };

    if (dismissSessionBannerBtn) {
      dismissSessionBannerBtn.addEventListener('click', () => {
        const currentSession = window.currentSessionData || null;
        if (currentSession && currentSession.exp) {
          localStorage.setItem('daycare_dismissed_session_exp', currentSession.exp.toString());
        } else {
          localStorage.setItem('daycare_dismissed_session_exp', 'test_dismissed');
        }
        hideSessionBanner();
        showToast('✅ 보안 세션 알림을 확인 완료했습니다. 이번 만료 시점까지 다시 표시되지 않아요.');
      });
    }
    if (closeSessionBannerBtn) {
      closeSessionBannerBtn.addEventListener('click', () => hideSessionBanner());
    }
    if (testBannerToggleBtn) {
      testBannerToggleBtn.addEventListener('click', () => {
        if (sessionExpiryBanner && sessionExpiryBanner.style.display === 'none') {
          if (typeof window.showSessionBanner === 'function') {
            window.showSessionBanner(6, Math.floor(Date.now() / 1000) + 6 * 86400);
          }
          showToast('🧪 만료 D-6 사전 안내 배너를 화면에 표시했습니다.');
        } else {
          hideSessionBanner();
          showToast('테스트 배너를 닫았습니다.');
        }
      });
    }

    // 7. 📝 관찰 메모 실시간 자동 저장 및 2-Tap 비우기
    const rawMemoInput = document.getElementById('rawMemoInput');
    const btnClearMemoBtn = document.getElementById('btnClearMemoBtn');

    if (rawMemoInput) {
      rawMemoInput.addEventListener('input', () => {
        try {
          localStorage.setItem('daycare_draft_memo', rawMemoInput.value);
          if (typeof window.saveAutoDraft === 'function') {
            window.saveAutoDraft();
          } else if (window.AutoDraft && typeof window.AutoDraft.save === 'function') {
            window.AutoDraft.save();
          }
        } catch (e) {}
      });
    }

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
  }

  // 🌐 전역 노출 및 파사드 유지
  window.SettingsController = {
    updateRecordDate,
    setupSettingsListeners
  };
  window.updateRecordDate = updateRecordDate;
  window.setupSettingsListeners = setupSettingsListeners;
})();
