import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';

test('실제 화면의 인증·검수·중복 저장 요소와 상대 경로 모듈이 빠짐없이 존재한다', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, '중복 DOM ID');
  for (const id of ['authGateModal', 'rawMemoInput', 'reviewConfirmed', 'saveAllUnifiedNotionBtn', 'repReflectionText', 'repSupportEnvText', 'repSupportSafetyText', 'duplicateModalDesc', 'btnDupCancel', 'btnDupAppend', 'btnDupOverwrite', 'btnDupNew', 'btnCloseHistoryModal', 'historyDetailBody', 'counselOpinion', 'hangrooEvalSummaryText']) assert.ok(ids.includes(id), id);
  for (const match of html.matchAll(/<script\s+src="\.\/([^"?]+)/g)) await access(new URL('../public/' + match[1], import.meta.url));
  for (const id of ['repReflectionText', 'repSupportEnvText', 'repSupportSafetyText']) {
    assert.match(html, new RegExp('<span id="' + id + '" contenteditable="true"[^>]*><\/span>'));
  }
  assert.ok(html.indexOf('id="currentPinInput"') < html.indexOf('id="newPinInput"'));
  assert.ok(html.indexOf('id="newPinInput"') < html.indexOf('id="confirmPinInput"'));
});

test('프론트 코어는 800줄 상한을 지키고 AI 키를 요청하지 않는다', async () => {
  for (const file of ['app.js', 'gemini-client.js', 'js/auth-security.js', 'js/records-flow.js', 'js/notion-store.js', 'js/ai-engine.js']) {
    const source = await readFile(new URL('../public/' + file, import.meta.url), 'utf8');
    assert.ok(source.split(/\r?\n/).length < 800, file);
    assert.equal(source.includes('generativelanguage.googleapis.com'), false, file);
    assert.equal(source.includes('/api/gemini-key'), false, file);
  }
});
