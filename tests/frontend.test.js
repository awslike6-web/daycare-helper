import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';

test('실제 화면의 인증·검수·중복 저장 요소와 상대 경로 모듈이 빠짐없이 존재한다', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, '중복 DOM ID');
  for (const id of ['authGateModal', 'rawMemoInput', 'reviewConfirmed', 'saveAllUnifiedNotionBtn', 'repReflectionText', 'repSupportEnvText', 'repSupportSafetyText', 'duplicateModalDesc', 'btnDupCancel', 'btnDupAppend', 'btnDupOverwrite', 'btnDupNew', 'btnCloseHistoryModal', 'historyDetailBody', 'counselOpinion', 'hangrooEvalSummaryText', 'childLinkPanel', 'childLinkChild', 'childLinkExcerpt', 'childLinkConfirmed', 'childLinkSave', 'childLinkStatus']) assert.ok(ids.includes(id), id);
  for (const match of html.matchAll(/<script\s+src="\.\/([^"?]+)/g)) await access(new URL('../public/' + match[1], import.meta.url));
  for (const id of ['repReflectionText', 'repSupportEnvText', 'repSupportSafetyText']) {
    assert.match(html, new RegExp('<span id="' + id + '" contenteditable="true"[^>]*><\/span>'));
  }
  assert.ok(html.indexOf('id="currentPinInput"') < html.indexOf('id="newPinInput"'));
  assert.ok(html.indexOf('id="newPinInput"') < html.indexOf('id="confirmPinInput"'));
  for (const id of ['memoChildSuggestions', 'memoChildList', 'memoChildSave', 'memoChildStatus', 'memoChildUnassignedList']) assert.ok(ids.includes(id), id);
  for (const id of ['openDeviceInviteBtn', 'deviceInviteForm', 'deviceInvitePinInput', 'deviceInviteUrl', 'deviceInviteStatus', 'copyDeviceInviteBtn']) assert.ok(ids.includes(id), id);
});

test('프론트 코어는 800줄 상한을 지키고 AI 키를 요청하지 않는다', async () => {
  for (const file of ['app.js', 'gemini-client.js', 'js/auth-security.js', 'js/records-flow.js', 'js/notion-store.js', 'js/ai-engine.js', 'js/memo-sync.js', 'js/child-links.js', 'js/photo-memo.js']) {
    const source = await readFile(new URL('../public/' + file, import.meta.url), 'utf8');
    assert.ok(source.split(/\r?\n/).length < 800, file);
    assert.equal(source.includes('generativelanguage.googleapis.com'), false, file);
    assert.equal(source.includes('/api/gemini-key'), false, file);
  }
});

test('일상 작성 화면은 가끔 쓰는 칸을 접거나 조건부로 둔다', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const at = s => { const i = html.indexOf(s); assert.ok(i >= 0, s); return i; };
  const block = (start, end) => html.slice(at(start), html.indexOf(end, at(start)));
  assert.match(html, /<details class="evidence-picker" id="evidencePicker" hidden>/);
  assert.ok(at('id="formatSelectCard"') < at('id="evidencePicker"') && at('id="evidencePicker"') < at('id="generateBtn"'), '과거 기록은 서식과 생성 버튼 사이');
  assert.match(html, /<div id="photoAttachedTools" class="photo-attached-tools" hidden>/);
  const tools = block('id="photoAttachedTools"', 'id="photoMemoPanel"');
  for (const id of ['photoAiStatus', 'photoAiEnable', 'photoMemoCreate', 'photoMemoStatus']) assert.ok(tools.includes(`id="${id}"`), id);
  assert.ok(!html.includes('photoConsentCheck'), '사진 동의 체크박스는 계정 설정으로 대체');
  const more = block('id="formatMoreBox"', '</details>');
  for (const f of ['observation', 'hangroo_eval', 'daily_care', 'counseling', 'play_support']) assert.ok(more.includes(`data-format="${f}"`), f);
  for (const f of ['class_daily_report', 'kidsnote']) assert.ok(!more.includes(`data-format="${f}"`), f);
  assert.ok(at('id="formatChipsGrid"') < at('id="formatMoreBox"'), '다른 서식은 같은 그리드 안');
  const sync = block('id="memoSyncMore"', '</details>');
  for (const id of ['memoSaveNow', 'memoReload']) assert.ok(sync.includes(`id="${id}"`), id);
  assert.ok(!sync.includes('id="memoConflict"'), '충돌 안내는 접힘 밖');
  assert.ok(at('id="photoMemoPanel"') < at('id="childLinkPanel"') && at('id="childLinkPanel"') < at('id="formatSelectCard"'), '원아 연결은 메모 카드 맨 아래');
});
