/** 관리자 사용 현황 화면: 요청 형식·표 변환·오류 안내와 비밀값 미저장 계약. */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../public/js/admin-usage.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../public/admin-usage.html', import.meta.url), 'utf8');
const index = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
function load() {
  const window = {};
  vm.runInNewContext(source, { window, document: { readyState: 'complete', getElementById: () => null }, Intl, Date, JSON, Map, String, Error });
  return window.DaycareAdminUsage;
}
const report = { from: '2026-10-22', to: '2026-10-28', retentionDays: 90, teachers: [
  { teacherId: 't1', name: '<b>가상 교사</b>', className: '연구반', visits: 2, logins: 1, resumes: 1, activeDays: 1, minutes: 35,
    generates: 2, saves: 1, devices: 1, firstAt: '2026-10-28 09:00', lastAt: '2026-10-28 09:40' }],
  visits: [{ teacherId: 't1', device: 'abcdef123456', kind: 'resume', startedAt: '2026-10-28 09:31', lastAt: '2026-10-28 09:40', minutes: 9, generates: 2, saves: 1 }] };

test('같은 출처 POST·no-store·쿠키 미전송으로 관리자 비밀값과 기간만 보낸다', () => {
  const [url, options] = load().request('가상-관리자-값', { from: '2026-10-22', to: '2026-10-28', includeVisits: true });
  assert.equal(url, '/api/admin/usage');
  assert.equal(options.method, 'POST'); assert.equal(options.cache, 'no-store'); assert.equal(options.credentials, 'omit');
  assert.equal(options.headers.Authorization, 'Bearer 가상-관리자-값');
  assert.deepEqual(JSON.parse(options.body), { from: '2026-10-22', to: '2026-10-28', includeVisits: true });
  assert.deepEqual(JSON.parse(load().request('x', {})[1].body), { includeVisits: false });
});

test('틀린 비밀값·기간 초과는 서버 안내를 그대로 보여 주고 빈 비밀값은 요청하지 않는다', async () => {
  const usage = load();
  let calls = 0;
  await assert.rejects(() => usage.query('', {}, () => { calls++; }), /비밀값을 입력/);
  assert.equal(calls, 0);
  const deny = async () => ({ ok: false, status: 403, json: async () => ({ error: '관리자 인증이 필요합니다.' }) });
  await assert.rejects(() => usage.query('틀림', {}, deny), /관리자 인증이 필요합니다/);
  const range = async () => ({ ok: false, status: 400, json: async () => ({ error: '조회 기간은 1~92일로 지정해 주세요.' }) });
  await assert.rejects(() => usage.query('값', {}, range), /1~92일/);
  const broken = async () => ({ ok: false, status: 502, json: async () => { throw new Error('html'); } });
  await assert.rejects(() => usage.query('값', {}, broken), /\(502\)/);
});

test('요약·접속 목록을 문자열 칸으로 바꾸고 이름은 표시 문자로만 다룬다', () => {
  const usage = load();
  assert.deepEqual([...usage.teacherRows(report)[0]], ['<b>가상 교사</b>', '연구반', '2', '1', '1', '1', '35', '2', '1', '1', '2026-10-28 09:00', '2026-10-28 09:40']);
  assert.deepEqual([...usage.visitRows(report)[0]], ['<b>가상 교사</b>', '2026-10-28 09:31', '2026-10-28 09:40', '재개', '9', '2', '1', 'abcdef123456']);
  assert.equal(usage.summary(report), '2026-10-22 ~ 2026-10-28 · 선생님 1명 · 접속 2회');
  assert.match(usage.summary({ ...report, teachers: [], namesUnavailable: true }), /선생님 0명 · 접속 0회 · 노션 교사 이름을/);
  assert.equal(usage.teacherRows({ teachers: [{ ...report.teachers[0], name: null, className: null }] })[0][0], '(이름 확인 불가)');
  assert.equal(usage.shift('2026-10-28', -6), '2026-10-22');
  assert.equal(usage.shift('2026-03-01', -1), '2026-02-28');
  assert.doesNotMatch(source, /innerHTML|insertAdjacentHTML/);
});

test('비밀값을 저장소·주소·쿠키에 남기지 않고 선생님 화면에서 링크하지 않는다', () => {
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|document\.cookie|location\.(hash|search|href)\s*=|history\.(push|replace)State/);
  assert.match(source, /pagehide[\s\S]{0,80}adminSecret'\)\.value = ''/);
  assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
  assert.match(html, /id="adminSecret" type="password" autocomplete="off"/);
  assert.doesNotMatch(html, /<script>(?!<\/script>)|on(click|submit)=/, '인라인 스크립트 없이 CSP를 따른다');
  assert.doesNotMatch(index, /admin-usage/);
});
