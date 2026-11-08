/** 첫 접속 확인 화면과 사진 전송 설정을 실제 consent.js로 실행한다. 값은 서버 응답만 따른다. */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../public/js/consent.js', import.meta.url), 'utf8');
function browser(reply = body => ({ consent: { acknowledged: true, photoAi: body.photoAi } })) {
  const nodes = new Map(), events = new Map(), calls = [], toasts = [];
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { id, checked: false, disabled: false, hidden: false, textContent: '', style: {}, handlers: {},
      addEventListener(type, fn) { this.handlers[type] = fn; }, focus() {} });
    return nodes.get(id);
  };
  const window = { showToast: text => toasts.push(text), DaycareRecords: { async requestJson(path, options) {
    calls.push({ path, body: options.body });
    const data = reply(options.body); if (data instanceof Error) throw data; return data;
  } } };
  const document = { getElementById: node, addEventListener(type, fn) { events.set(type, fn); } };
  vm.runInContext(source, vm.createContext({ window, document }));
  events.get('DOMContentLoaded')();
  return { consent: window.DaycareConsent, node, calls, toasts };
}
test('첫 확인은 사진 전송 꺼짐이 기본이며 한 번 확인하면 닫힌다', async () => {
  const b = browser();
  assert.equal(b.consent.photoAi(), false, '서버 응답 전에는 꺼짐');
  b.consent.apply({ acknowledged: false, photoAi: true });
  assert.equal(b.consent.photoAi(), false, '현재 안내를 확인하지 않았으면 사진 전송도 꺼짐');
  b.consent.open();
  assert.equal(b.node('consentModal').style.display, 'flex'); assert.equal(b.node('consentPhotoAi').checked, false);
  await b.node('consentAcceptBtn').handlers.click();
  assert.equal(JSON.stringify(b.calls), JSON.stringify([{ path: '/api/consent', body: { acknowledge: true, photoAi: false } }]));
  assert.equal(b.node('consentModal').style.display, 'none');
  assert.equal(b.consent.acknowledged(), true); assert.equal(b.node('photoAiEnable').hidden, false);
  assert.match(b.node('photoAiStatus').textContent, /꺼짐/);
});
test('사진 아래 [켜기]와 설정 스위치는 서버에 저장하고 실패하면 이전 값으로 돌린다', async () => {
  let fail = false;
  const b = browser(body => fail ? new Error('연결 끊김') : { consent: { acknowledged: true, photoAi: body.photoAi } });
  b.consent.apply({ acknowledged: true, photoAi: false });
  await b.node('photoAiEnable').handlers.click();
  assert.equal(b.consent.photoAi(), true); assert.equal(b.node('settingPhotoAi').checked, true); assert.equal(b.node('photoAiEnable').hidden, true);
  fail = true; b.node('settingPhotoAi').checked = false;
  await b.node('settingPhotoAi').handlers.change();
  assert.equal(b.consent.photoAi(), true); assert.equal(b.node('settingPhotoAi').checked, true, '저장 실패 시 화면도 켜짐 유지');
  assert.match(b.toasts.at(-1), /저장하지 못했습니다/);
  b.consent.reset(); assert.equal(b.consent.photoAi(), false, '잠금 후에는 꺼짐');
});
test('확인 저장이 실패하면 확인 화면을 닫지 않고 안내한다', async () => {
  const b = browser(() => new Error('연결 끊김'));
  b.consent.open(); await b.node('consentAcceptBtn').handlers.click();
  assert.equal(b.node('consentModal').style.display, 'flex'); assert.match(b.node('consentStatus').textContent, /다시 눌러/);
});
