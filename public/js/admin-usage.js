/** 관리자 사용 현황 조회. 비밀값은 입력칸과 메모리에서만 쓰고 저장하지 않는다. */
(() => {
  const KST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' });
  const today = () => KST.format(new Date());
  const shift = (date, days) => KST.format(new Date(Date.parse(date + 'T12:00:00+09:00') + days * 86400000));
  const KIND = { login: 'PIN 로그인', register: '기기 등록', resume: '재개' };
  const TEACHER_COLUMNS = ['이름', '반', '접속', '로그인', '재개', '사용한 날', '대략 분', '생성', '저장', '기기', '처음 접속', '마지막 접속'];
  const VISIT_COLUMNS = ['이름', '시작', '마지막 활동', '종류', '대략 분', '생성', '저장', '기기'];

  // 같은 출처 POST로만 부르고 선생님 쿠키는 보내지 않는다.
  function request(secret, options = {}) {
    return ['/api/admin/usage', { method: 'POST', cache: 'no-store', credentials: 'omit',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + secret },
      body: JSON.stringify({ from: options.from || undefined, to: options.to || undefined, includeVisits: options.includeVisits === true }) }];
  }
  async function query(secret, options, fetchImpl = fetch) {
    if (!secret) throw new Error('관리자 비밀값을 입력해 주세요.');
    const response = await fetchImpl(...request(secret, options));
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `조회에 실패했습니다. (${response.status})`);
    return data;
  }
  function teacherRows(report) {
    return (report.teachers || []).map(t => [t.name || '(이름 확인 불가)', t.className || '-', t.visits, t.logins, t.resumes,
      t.activeDays, t.minutes, t.generates, t.saves, t.devices, t.firstAt, t.lastAt].map(String));
  }
  function visitRows(report) {
    const names = new Map((report.teachers || []).map(t => [t.teacherId, t.name || '(이름 확인 불가)']));
    return (report.visits || []).map(v => [names.get(v.teacherId) || '(이름 확인 불가)', v.startedAt, v.lastAt,
      KIND[v.kind] || v.kind, v.minutes, v.generates, v.saves, v.device].map(String));
  }
  function summary(report) {
    const visits = (report.teachers || []).reduce((sum, t) => sum + t.visits, 0);
    return `${report.from} ~ ${report.to} · 선생님 ${(report.teachers || []).length}명 · 접속 ${visits}회` +
      (report.namesUnavailable ? ' · 노션 교사 이름을 불러오지 못했습니다' : '');
  }
  // 노션에서 온 이름도 textContent로만 넣는다.
  function fill(table, columns, rows, empty) {
    table.replaceChildren();
    const head = table.createTHead().insertRow();
    for (const column of columns) { const th = document.createElement('th'); th.scope = 'col'; th.textContent = column; head.append(th); }
    const body = table.createTBody();
    if (!rows.length) { const cell = body.insertRow().insertCell(); cell.colSpan = columns.length; cell.textContent = empty; return; }
    for (const row of rows) { const tr = body.insertRow(); for (const value of row) tr.insertCell().textContent = value; }
  }

  function start() {
    const el = id => document.getElementById(id);
    if (!el('usageForm')) return;
    el('toDate').value = today(); el('fromDate').value = shift(today(), -6);
    let generation = 0;
    const status = (message, error = false) => { el('usageStatus').textContent = message; el('usageStatus').dataset.error = String(error); };
    const clearResult = () => { el('usageResult').hidden = true; el('teacherTable').replaceChildren(); el('visitTable').replaceChildren(); };
    el('usageForm').addEventListener('submit', async event => {
      event.preventDefault();
      const run = ++generation, includeVisits = el('includeVisits').checked;
      el('queryBtn').disabled = true; status('조회 중입니다…');
      try {
        const report = await query(el('adminSecret').value, { from: el('fromDate').value, to: el('toDate').value, includeVisits });
        if (run !== generation) return;
        fill(el('teacherTable'), TEACHER_COLUMNS, teacherRows(report), '이 기간의 기록 없음');
        fill(el('visitTable'), VISIT_COLUMNS, visitRows(report), '이 기간의 기록 없음');
        el('visitSection').hidden = !includeVisits; el('usageResult').hidden = false;
        status(summary(report));
      } catch (error) {
        if (run !== generation) return;
        clearResult(); status(error.message, true);
      } finally {
        if (run === generation) el('queryBtn').disabled = false;
      }
    });
    el('clearBtn').addEventListener('click', () => {
      generation++; el('adminSecret').value = ''; el('queryBtn').disabled = false;
      clearResult(); status('비밀값과 결과를 지웠습니다.');
    });
    // 뒤로 가기 캐시로 돌아와도 비밀값이 남지 않게 한다.
    window.addEventListener('pagehide', () => { el('adminSecret').value = ''; clearResult(); });
  }
  window.DaycareAdminUsage = { request, query, teacherRows, visitRows, summary, shift };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
