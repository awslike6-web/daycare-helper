/** 첫 접속 확인과 사진 외부 AI 전송 설정. 값은 서버의 교사 계정에만 저장하고 브라우저에는 두지 않는다. */
(() => {
  const el = id => document.getElementById(id);
  const OFF = { acknowledged: false, photoAi: false };
  let current = { ...OFF }, saving = false;
  function render() {
    if (el('settingPhotoAi')) { el('settingPhotoAi').checked = current.photoAi; el('settingPhotoAi').disabled = saving; }
    if (el('photoAiStatus')) el('photoAiStatus').textContent = current.photoAi
      ? '사진 외부 AI 전송 켜짐 · 얼굴·이름표는 사진에서 직접 가려 주세요.'
      : '사진 외부 AI 전송 꺼짐 · 켜야 사진으로 메모·서식을 만들 수 있습니다.';
    if (el('photoAiEnable')) { el('photoAiEnable').hidden = current.photoAi; el('photoAiEnable').disabled = saving; }
  }
  function apply(consent) {
    current = { acknowledged: consent?.acknowledged === true, photoAi: consent?.acknowledged === true && consent.photoAi === true };
    render();
  }
  function reset() { current = { ...OFF }; saving = false; render(); }
  async function save(photoAi) {
    if (saving) return false;
    saving = true; render();
    try {
      const data = await window.DaycareRecords.requestJson('/api/consent', { method: 'POST', body: { acknowledge: true, photoAi: photoAi === true } });
      apply(data.consent); return true;
    } catch (e) {
      window.showToast?.('설정을 저장하지 못했습니다 · ' + e.message); return false;
    } finally { saving = false; render(); }
  }
  function open() {
    const modal = el('consentModal'); if (!modal) return;
    if (el('consentPhotoAi')) el('consentPhotoAi').checked = false;
    if (el('consentStatus')) el('consentStatus').textContent = '';
    modal.style.display = 'flex';
    el('consentAcceptBtn')?.focus?.();
  }
  async function accept() {
    const ok = await save(!!el('consentPhotoAi')?.checked);
    if (ok) { if (el('consentModal')) el('consentModal').style.display = 'none'; }
    else if (el('consentStatus')) el('consentStatus').textContent = '저장하지 못했습니다. 연결을 확인하고 다시 눌러 주세요.';
  }
  async function toggleFromSettings() {
    const wanted = !!el('settingPhotoAi')?.checked;
    if (!await save(wanted)) render();
  }
  function init() {
    el('consentAcceptBtn')?.addEventListener('click', accept);
    el('settingPhotoAi')?.addEventListener('change', toggleFromSettings);
    el('photoAiEnable')?.addEventListener('click', () => save(true));
    render();
  }
  window.DaycareConsent = { apply, reset, open, save, photoAi: () => current.photoAi, acknowledged: () => current.acknowledged };
  document.addEventListener('DOMContentLoaded', init);
})();
