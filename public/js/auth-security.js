/** 서버 인증 파사드. 브라우저에 PIN·인증 토큰을 저장하지 않는다. */
(() => {
  const PERSONA_PRESETS = {
    warm_detailed: { name: '다정하고 꼼꼼한 선생님', desc: '관찰된 사실을 따뜻한 말투로 전달합니다.', tone: '~했어요, ~보았답니다', keywords: [], sampleNote: '' },
    speedy_practical: { name: '스피디 실속형 선생님', desc: '관찰된 핵심을 짧게 정리합니다.', tone: '~했습니다', keywords: [], sampleNote: '' },
    cheer_bright: { name: '밝고 활기찬 비타민 선생님', desc: '밝은 말투와 적당한 이모지를 사용합니다.', tone: '~했지요!', keywords: [], sampleNote: '' },
    growth_centered: { name: '성장 관찰 중심 전문가형 선생님', desc: '실제 누적 기록에 근거하여 작성합니다.', tone: '~관찰됨', keywords: [], sampleNote: '' }
  };
  const PARENT_PRESETS = { anxious: '확인된 생활 모습을 구체적으로 안내', busy: '관찰된 핵심을 짧게 안내', growth_focused: '실제 관찰 근거와 지원 계획 안내', friendly: '친근하고 밝은 말투' };
  const TEACHER_PROFILES = {};
  let selected = null, digits = '', firstPin = '', invitation = null, busy = false;
  let ready = false, refreshTimer;
  let deviceInvite = null, inviteRequest = null, inviteTimer, inviteGeneration = 0;
  const el = id => document.getElementById(id);
  function setBusy(value) {
    busy = value;
    document.querySelectorAll('.keypad-btn').forEach(button => { button.disabled = value; });
    if (el('retryAuthBtn')) el('retryAuthBtn').disabled = value;
  }
  async function api(path, body) {
    return window.DaycareRecords.requestJson(path, body ? { method: 'POST', body } : {});
  }
  function error(message = '') { if (el('pinErrorMsg')) el('pinErrorMsg').textContent = message; }
  function dots() { el('pinDotsContainer')?.querySelectorAll('.pin-dot').forEach((dot, i) => dot.classList.toggle('filled', i < digits.length)); }
  function getTeacherPersona(key) {
    const profile = TEACHER_PROFILES[key] || {};
    const style = localStorage.getItem('daycare_persona_preset_' + key);
    const preset = PERSONA_PRESETS[style] || PERSONA_PRESETS.warm_detailed;
    return { ...preset, sampleNote: profile.sampleNote || '', closingGreeting: profile.closing || '', emojiLevel: 'moderate' };
  }
  function getTeacherStyle(key) { return TEACHER_PROFILES[key]?.style || getTeacherPersona(key).name; }
  function setTeacherPersona(key, persona) {
    if (window.state) window.state.persona = persona;
    const preset = Object.entries(PERSONA_PRESETS).find(([, p]) => p.name === persona.name);
    if (preset) localStorage.setItem('daycare_persona_preset_' + key, preset[0]);
    window.DaycareRecords?.save();
  }
  function setTeacherStyle(key, name) { if (window.state) window.state.teacherStyle = name; }
  async function saveProfile(persona) {
    await api('/api/profile', persona);
    setTeacherPersona(window.state.activeTeacherKey, persona);
  }
  async function syncProfile() {
    try { const data = await api('/api/session'); TEACHER_PROFILES[data.profile.key] = data.profile;
      window.state.persona = getTeacherPersona(data.profile.key); updatePersonaUI(); window.showToast?.('노션의 교사 문체를 가져왔습니다.');
    } catch (e) { window.showToast?.(e.message); }
  }
  function syncTeacherSwitcherUI() {
    const state = window.state || {};
    [['btnSwitchWife', 'wife'], ['btnSwitchSisterInLaw', 'sister_in_law']].forEach(([id, key]) => {
      const button = el(id); if (button) { button.hidden = !TEACHER_PROFILES[key]; button.classList.toggle('active', key === state.activeTeacherKey); }
      if (button && TEACHER_PROFILES[key]) button.textContent = `${TEACHER_PROFILES[key].className} · ${TEACHER_PROFILES[key].name}`;
    });
    if (el('btnSwitchSandbox')) el('btnSwitchSandbox').hidden = true;
    if (el('headerClassNameText')) el('headerClassNameText').textContent = state.className || '담당반';
  }
  function updatePersonaUI() {
    const state = window.state || {};
    if (el('headerPersonaText')) el('headerPersonaText').textContent = state.persona?.name || '맞춤 문체';
    if (el('personaSampleNote')) el('personaSampleNote').value = state.persona?.sampleNote || '';
    ['settingClassNameInput', 'settingTeacherNameInput'].forEach((id, index) => {
      const input = el(id); if (input) { input.value = index ? state.teacherName || '' : state.className || ''; input.readOnly = true; }
    });
  }
  function showGate() {
    window.DaycarePhotoMemo?.pause();
    window.DaycareMemo?.pause();
    window.DaycareChildLinks?.pause();
    clearDeviceInvite();
    window.DaycareRecords?.cancelSave();
    document.body.dataset.locked = 'true'; ready = false;
    clearInterval(refreshTimer);
    if (el('authGateModal')) el('authGateModal').style.display = 'flex';
    if (el('pinAuthModal')) el('pinAuthModal').style.display = 'none';
    digits = ''; firstPin = ''; dots();
    const state = window.state;
    if (state) {
      state.currentAbortController?.abort();
      Object.assign(state, { authenticated: false, children: [], selectedChild: null, lastResult: null, originalResult: null, historyLogs: [], draftKey: null, photos: [], persona: null, pendingDraft: false });
    }
    if (el('rawMemoInput')) el('rawMemoInput').value = '';
    if (el('rawMemoInput')) el('rawMemoInput').readOnly = false;
    if (el('generateBtn')) el('generateBtn').disabled = false;
    if (el('resultsSection')) el('resultsSection').style.display = 'none';
    window.DaycareRecords?.generationStatus(''); window.DaycareRecords?.saveStatus('');
    for (const id of ['childScrollContainer', 'historyDetailBody', 'historyListContainer', 'photoPreviews']) if (el(id)) el(id).replaceChildren();
    document.querySelectorAll('.modal-overlay').forEach(modal => { if (modal.id !== 'authGateModal') modal.style.display = 'none'; });
  }
  async function unlock() {
    const session = await api('/api/session'); const profile = session.profile;
    TEACHER_PROFILES[profile.key] = profile;
    const state = window.state || {};
    Object.assign(state, { authenticated: true, teacherId: profile.id, activeTeacherKey: profile.key,
      className: profile.className, teacherName: profile.name, draftKey: session.draftKey,
      selectedChild: null, filterOnlyMyClass: true, persona: getTeacherPersona(profile.key), teacherStyle: getTeacherStyle(profile.key) });
    localStorage.setItem('daycare_active_teacher', profile.key);
    selected = profile;
    syncTeacherSwitcherUI(); updatePersonaUI();
    try { await window.ChildrenStore?.loadChildren(); await window.DaycareRecords?.restore(); }
    catch (e) { showGate(); throw e; }
    ready = true; error();
    document.body.dataset.locked = 'false';
    if (el('authGateModal')) el('authGateModal').style.display = 'none';
    if (el('sessionUserEmailText')) el('sessionUserEmailText').textContent = profile.name;
    if (el('sessionDaysLeftText')) el('sessionDaysLeftText').textContent = 'PIN 인증 시 기기 등록 30일 연장 · 1시간 미사용 시 잠금';
    if (el('sessionExpiryDateText')) el('sessionExpiryDateText').textContent = new Date(session.expiresAt).toLocaleDateString('ko-KR');
    // 편집 중에는 세션을 확인하고, 활동이 없으면 최대 1시간 뒤 잠근다.
    refreshTimer = setInterval(() => {
      if (Date.now() - lastActivity > 60 * 60000) lock();
      else if (Date.now() - lastActivity < 5 * 60000) checkSecuritySession();
    }, 5 * 60000);
    window.DaycareRecords?.initEvidence();
    window.DaycareNotion?.checkHealth();
    window.DaycareMemo?.start();
  }
  let lastActivity = Date.now();
  ['pointerdown', 'keydown', 'input'].forEach(type => document.addEventListener(type, () => { lastActivity = Date.now(); }));
  async function lock(forget = false) {
    await window.DaycareRecords?.save();
    await window.DaycareMemo?.persist();
    setBusy(true); showGate();
    try { await api('/api/auth/logout', { forget }); } catch (e) { error('서버 로그아웃 확인이 필요합니다. 연결 후 다시 잠가 주세요.'); }
    finally { setBusy(false); }
    if (forget) window.DaycareRecords?.forget();
  }
  async function submitPin() {
    if (busy || !selected || digits.length !== 4) return;
    const pin = digits; digits = ''; dots(); error();
    if (invitation?.initial && !firstPin) { firstPin = pin; error('새 PIN을 한 번 더 입력해 주세요.'); return; }
    setBusy(true); error('PIN과 학급 정보를 확인하는 중입니다…');
    try {
      await api(invitation ? '/api/auth/register' : '/api/auth/login', invitation ? {
        invite: invitation.token, pin: invitation.initial ? firstPin : pin, confirmPin: pin,
        remember: !!el('rememberAuthCheck')?.checked
      } : { teacherId: selected.id, pin, remember: !!el('rememberAuthCheck')?.checked });
      if (invitation) history.replaceState(null, '', location.pathname + location.search);
      invitation = null; firstPin = ''; lastActivity = Date.now(); await unlock();
    } catch (e) { firstPin = ''; error(e.message); } finally { setBusy(false); }
  }
  async function handleTeacherSwitchClick(key) {
    if (ready && window.state?.activeTeacherKey === key) return;
    await lock(); selected = TEACHER_PROFILES[key] || selected; renderSelection();
  }
  function renderSelection() {
    const list = el('authTeacherSelector'); if (!list) return; list.replaceChildren();
    Object.values(TEACHER_PROFILES).forEach(profile => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'auth-teacher-chip';
      button.classList.toggle('active', selected?.id === profile.id);
      const icon = document.createElement('span'); icon.className = 'auth-chip-icon';
      icon.textContent = profile.key === 'wife' ? '🌸' : profile.key === 'sister_in_law' ? '🌿' : '🧪';
      const info = document.createElement('div'); info.className = 'auth-chip-info';
      const name = document.createElement('div'); name.className = 'auth-chip-name'; name.textContent = profile.name;
      const className = document.createElement('div'); className.className = 'auth-chip-class'; className.textContent = profile.className;
      info.append(name, className); button.append(icon, info);
      button.disabled = !!invitation && invitation.teacherId !== profile.id;
      button.onclick = () => { selected = profile; digits = ''; firstPin = ''; dots(); error(); renderSelection(); };
      list.appendChild(button);
    });
    if (el('pinTargetTeacherName')) el('pinTargetTeacherName').textContent = selected?.name || '선생님';
    if (el('authRegistrationHint')) el('authRegistrationHint').textContent = invitation ?
      (invitation.initial ? '처음 등록합니다. 사용할 새 PIN을 두 번 입력해 주세요.' : '등록할 휴대폰입니다. 기존 PIN을 입력해 주세요.') : '처음 사용하는 휴대폰은 관리자에게 기기 등록 링크를 받아 주세요.';
  }
  async function consumeInvitation() {
    const token = new URLSearchParams(location.hash.slice(1)).get('register');
    if (!token) return false;
    let status;
    try { status = await api('/api/auth/invite-status', { invite: token }); }
    catch (e) {
      invitation = null;
      if (e.status === 403 || e.status === 400) history.replaceState(null, '', location.pathname + location.search);
      renderSelection();
      throw new Error(e.status === 403 ? '등록 링크가 만료되었거나 사용됐습니다. 등록된 기기는 기존 PIN으로, 새 기기는 새 등록 링크로 접속해 주세요.' : e.message);
    }
    if (ready) await lock();
    invitation = { ...status, token };
    selected = Object.values(TEACHER_PROFILES).find(p => p.id === invitation.teacherId);
    renderSelection(); return true;
  }
  async function initAuthGate() {
    showGate();
    if (el('openDeviceInviteBtn')) el('openDeviceInviteBtn').onclick = () => {
      if (!ready) return;
      clearDeviceInvite(); el('deviceInviteBox').hidden = false; el('deviceInvitePinInput').focus();
    };
    if (el('deviceInviteForm')) el('deviceInviteForm').onsubmit = event => { event.preventDefault(); createDeviceInvite(); };
    if (el('closeDeviceInviteBtn')) el('closeDeviceInviteBtn').onclick = clearDeviceInvite;
    if (el('copyDeviceInviteBtn')) el('copyDeviceInviteBtn').onclick = copyDeviceInvite;
    if (el('shareDeviceInviteBtn')) el('shareDeviceInviteBtn').onclick = shareDeviceInvite;
    document.querySelectorAll('.keypad-btn[data-num]').forEach(button => { button.onclick = () => { if (busy) return; if (digits.length < 4) digits += button.dataset.num; dots(); if (digits.length === 4) submitPin(); }; });
    if (el('keypadClearBtn')) el('keypadClearBtn').onclick = () => { digits = ''; dots(); };
    if (el('keypadBackspaceBtn')) el('keypadBackspaceBtn').onclick = () => { digits = digits.slice(0, -1); dots(); };
    document.addEventListener('keydown', event => {
      if (ready || busy || event.target instanceof HTMLInputElement) return;
      if (/^\d$/.test(event.key)) { digits += event.key; dots(); if (digits.length === 4) submitPin(); }
      else if (event.key === 'Backspace') { digits = digits.slice(0, -1); dots(); }
    });
    if (el('headerLogoutBtn')) el('headerLogoutBtn').onclick = () => lock();
    if (el('forgetDeviceBtn')) el('forgetDeviceBtn').onclick = () => lock(true);
    if (el('retryAuthBtn')) el('retryAuthBtn').onclick = loadGate;
    await loadGate();
    window.addEventListener('hashchange', () => consumeInvitation().catch(e => error(e.message)));
  }
  async function loadGate() {
    if (busy) return;
    setBusy(true); error('기기와 학급 정보를 불러오는 중입니다…');
    if (el('retryAuthBtn')) el('retryAuthBtn').hidden = true;
    try {
      const profiles = await api('/api/auth/profiles');
      profiles.profiles.forEach(p => { TEACHER_PROFILES[p.key] = p; });
      selected = Object.values(TEACHER_PROFILES).find(p => p.id === profiles.teacherId) || Object.values(TEACHER_PROFILES)[0];
      let inviteError = '';
      try { await consumeInvitation(); } catch (e) { inviteError = e.message; }
      renderSelection();
      error();
      if (!invitation) try { await unlock(); } catch (e) { if (e.status !== 401) error(e.message); }
      if (inviteError && !ready) error(inviteError);
      if (!ready && !inviteError && invitation) error();
    } catch (e) { error(e.message); }
    finally { setBusy(false); if (el('retryAuthBtn')) el('retryAuthBtn').hidden = ready; }
  }
  async function changePin() {
    try {
      await api('/api/auth/change-pin', { currentPin: el('currentPinInput')?.value, pin: el('newPinInput')?.value, confirmPin: el('confirmPinInput')?.value });
      ['currentPinInput', 'newPinInput', 'confirmPinInput'].forEach(id => { if (el(id)) el(id).value = ''; });
      await lock(); error('PIN을 변경했습니다. 새 PIN으로 들어가 주세요.');
    } catch (e) { window.showToast?.(e.message); }
  }
  function inviteStatus(message) { if (el('deviceInviteStatus')) el('deviceInviteStatus').textContent = message; }
  function clearDeviceInvite() {
    inviteGeneration++; inviteRequest?.abort(); inviteRequest = null; deviceInvite = null; clearInterval(inviteTimer);
    for (const id of ['deviceInvitePinInput', 'deviceInviteUrl']) if (el(id)) el(id).value = '';
    for (const id of ['deviceInviteBox', 'deviceInviteResult']) if (el(id)) el(id).hidden = true;
    if (el('createDeviceInviteBtn')) el('createDeviceInviteBtn').disabled = false;
    inviteStatus('');
  }
  function inviteIsValid() {
    if (!deviceInvite || !ready) return false;
    if (deviceInvite.expiresAt > Date.now()) return true;
    deviceInvite = null; clearInterval(inviteTimer);
    if (el('deviceInviteUrl')) el('deviceInviteUrl').value = '';
    if (el('deviceInviteResult')) el('deviceInviteResult').hidden = true;
    inviteStatus('링크가 만료되었습니다. 현재 PIN으로 다시 발급해 주세요.'); return false;
  }
  async function createDeviceInvite() {
    if (!ready || inviteRequest) return;
    const currentPin = el('deviceInvitePinInput')?.value || '';
    if (el('deviceInvitePinInput')) el('deviceInvitePinInput').value = '';
    if (!/^\d{4}$/.test(currentPin)) { inviteStatus('현재 PIN 숫자 4자리를 입력해 주세요.'); return; }
    const generation = ++inviteGeneration, teacherId = window.state?.teacherId;
    const controller = new AbortController(); inviteRequest = controller;
    clearInterval(inviteTimer); deviceInvite = null;
    el('deviceInviteResult').hidden = true; el('deviceInviteUrl').value = '';
    el('createDeviceInviteBtn').disabled = true; inviteStatus('현재 PIN을 확인하고 링크를 발급하는 중입니다…');
    try {
      const data = await window.DaycareRecords.requestJson('/api/auth/device-invite', {
        method: 'POST', body: { currentPin }, signal: controller.signal
      });
      if (generation !== inviteGeneration || !ready || teacherId !== window.state?.teacherId) return;
      const link = new URL(data.url);
      if (link.origin !== location.origin || link.pathname !== '/' || !/^#register=[a-f0-9]{64}$/.test(link.hash) ||
          !Number.isFinite(data.expiresAt) || data.expiresAt <= Date.now()) throw new Error('발급한 링크를 확인할 수 없습니다. 다시 시도해 주세요.');
      deviceInvite = { url: link.href, expiresAt: data.expiresAt };
      el('deviceInviteUrl').value = deviceInvite.url; el('deviceInviteResult').hidden = false;
      el('shareDeviceInviteBtn').hidden = typeof navigator.share !== 'function';
      inviteStatus(`링크가 준비됐습니다. ${new Date(data.expiresAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}까지 새 기기에서 열어 주세요.`);
      inviteTimer = setInterval(inviteIsValid, 1000);
    } catch (e) {
      if (generation === inviteGeneration && e.name !== 'AbortError') inviteStatus(e.message);
    } finally {
      if (generation === inviteGeneration) { inviteRequest = null; el('createDeviceInviteBtn').disabled = false; }
    }
  }
  async function copyDeviceInvite() {
    if (!inviteIsValid()) return;
    const generation = inviteGeneration;
    try {
      await navigator.clipboard.writeText(deviceInvite.url);
      if (generation === inviteGeneration) inviteStatus('링크를 복사했습니다. 새 기기에 전달하고 기존 PIN으로 등록하세요.');
    } catch {
      if (generation !== inviteGeneration) return;
      el('deviceInviteUrl').focus(); el('deviceInviteUrl').select();
      inviteStatus('자동 복사를 사용할 수 없습니다. 선택된 링크를 길게 눌러 복사해 주세요.');
    }
  }
  async function shareDeviceInvite() {
    if (!inviteIsValid() || typeof navigator.share !== 'function') return;
    const generation = inviteGeneration;
    try { await navigator.share({ title: '보육비서 새 기기 등록', url: deviceInvite.url }); }
    catch (e) { if (generation === inviteGeneration && e.name !== 'AbortError') inviteStatus('공유할 수 없습니다. 링크 복사를 이용해 주세요.'); }
  }
  const checkSecuritySession = async () => { if (ready) try { await api('/api/session'); } catch (e) { if (e.status === 401 || e.status === 403) await lock(); } };
  window.DaycareConfig = { PERSONA_PRESETS, PARENT_PRESETS, TEACHER_PROFILES };
  window.DaycareAuth = { initAuthGate, handleTeacherSwitchClick, executeTeacherSwitch: handleTeacherSwitchClick,
    switchTeacherProfile: handleTeacherSwitchClick, syncTeacherSwitcherUI, updatePersonaUI, getTeacherPersona, getTeacherStyle,
    setTeacherPersona, setTeacherStyle, checkSecuritySession, changePin, lock, saveProfile, syncProfile,
    clearDeviceInvite, createDeviceInvite, showSessionBanner() {}, hideSessionBanner() {} };
})();
