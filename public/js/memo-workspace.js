/** 기존 편집란을 유지하며 큰 팝업의 입력을 같은 저장·검수 흐름으로 전달한다. */
(() => {
  const el = id => document.getElementById(id);
  const state = () => window.state || {};
  const key = () => [state().teacherId, state().selectedDate, state().selectedChild?.id || 'class-all'].join('/');
  const formats = [
    ['classDailyReportCard', 'class_daily_report', '한그루 보육일지'], ['kidsnoteCard', 'kidsnote', '키즈노트 알림장'],
    ['observationCard', 'monthly_observation', '월간 관찰일지'], ['hangrooEvalCard', 'hangroo_eval', '발달평가'],
    ['dailyCareCard', 'daily_care_log', '일일 보육일지'], ['counselingCard', 'parent_counseling', '학부모 상담'],
    ['playSupportCard', 'play_support', '놀이 지원안']
  ];
  const names = {
    rawMemoInput: '놀이 관찰 메모 / 키워드', childLinkExcerpt: '이 아이의 원문 근거', childLinkSummary: '관찰 요약 (선택)',
    photoMemoText: '사진 행동 메모 · 확인 전 초안', kidsnoteContent: '알림장 본문',
    repReflectionText: '교사 성찰', repSupportEnvText: '환경 지원', repSupportSafetyText: '안전 / 바깥놀이 지원',
    obs1BehaviorText: '놀이 관찰 · 행동', obs1SupportText: '놀이 관찰 · 교사 지원',
    obs2BehaviorText: '일상생활 관찰 · 행동', obs2SupportText: '일상생활 관찰 · 교사 지원',
    monthlySummaryDevText: '월간 발달 총평', monthlySummaryPlanText: '다음 달 지원 계획',
    hangrooEvalSummaryText: '발달 종합 평가', hangrooEvalSupportText: '종합 지원 계획',
    dailyPlaySummary: '놀이 관찰 요약', dailyPlayEval: '놀이 평가', dailyNextPlan: '다음 지원 계획',
    counselRoutine: '생활 습관', counselSocial: '사회 관계', counselDev: '발달 특성', counselOpinion: '상담 의견',
    playExtension: '놀이 주제 / 확장', playMaterials: '흥미 단서 / 자료', playTips: '교사 지원'
  };
  let dialog, list, filter, openedKey, opener, timer, pairs = [], decorating = false, composing = false;
  const text = node => node.tagName === 'TEXTAREA' ? node.value : node.innerText ?? node.textContent;
  const active = () => state().authenticated && document.body.dataset.locked !== 'true';
  const busy = () => state().pendingDraft || state().savingNotion || state().savingIndividual || !!state().currentAbortController;
  function label(node) {
    return names[node.id] || node.getAttribute('aria-label') ||
      node.closest('label')?.firstChild?.textContent?.trim() || '관찰 문장';
  }
  function fields() {
    const rows = [];
    const add = (node, group, title, readOnly = false) => {
      if (node && !rows.some(row => row.node === node)) rows.push({ node, group, title, readOnly, label: label(node) });
    };
    add(el('rawMemoInput'), 'memo', '메모 / 키워드');
    for (const id of ['childLinkExcerpt', 'childLinkSummary']) add(el(id), 'memo', '원아 연결 근거');
    if (el('photoMemoPanel') && !el('photoMemoPanel').hidden) add(el('photoMemoText'), 'memo', '사진 행동 메모');
    for (const node of document.querySelectorAll('#memoChildList textarea')) {
      const child = node.closest('article')?.querySelector('select');
      add(node, 'memo', '원아별 원문 · ' + (child?.selectedOptions[0]?.textContent || '원아 확인 필요'));
    }
    const result = state().lastResult;
    if (result) {
      for (const [id, property, title] of formats) if (result[property]) {
        for (const node of el(id)?.querySelectorAll('textarea, [contenteditable="true"]') || []) {
          if (!node.closest('#individualObsList')) add(node, 'ai', title);
        }
      }
      for (const node of document.querySelectorAll('#individualObsList textarea')) {
        const child = node.closest('.indiv-obs-item')?.querySelector('select') || node.parentElement.parentElement.querySelector('select');
        add(node, 'ai', '원아별 관찰 · ' + (child?.selectedOptions[0]?.textContent || '원아 확인 필요'));
      }
    }
    for (const node of document.querySelectorAll('#evidenceList .evidence-row span')) add(node, 'evidence', '과거 관찰 기록 · 조회 원문', true);
    return rows;
  }
  function valid(pair) {
    return active() && key() === openedKey && pair.node.isConnected && fields().some(row => row.node === pair.node);
  }
  function blocked(pair) {
    return pair.readOnly || pair.node.readOnly || pair.node.disabled || pair.node.getAttribute('contenteditable') === 'false' || busy();
  }
  function updateStatus() {
    const memo = el('memoSyncStatus')?.textContent || '';
    const result = el('notionSaveStatus')?.textContent || '';
    el('memoWorkspaceStatus').textContent = [memo, state().lastResult ? result : ''].filter(Boolean).join(' · ') || '입력은 원래 화면에 반영됩니다. 저장 상태는 원래 화면에서 확인하세요.';
  }
  function render(focusNode) {
    const focused = pairs.find(pair => pair.input === document.activeElement);
    const caret = focused ? [focused.input.selectionStart, focused.input.selectionEnd] : null;
    focusNode ||= focused?.node;
    list.replaceChildren(); pairs = [];
    const rows = fields().filter(row => filter.value === 'all' || row.group === filter.value);
    for (const row of rows) {
      const card = document.createElement('article'); card.className = 'memo-workspace-card';
      const heading = document.createElement('h3'); heading.textContent = row.title;
      const caption = document.createElement('label'); caption.textContent = row.readOnly ? '조회 원문 (읽기 전용)' : row.label;
      const input = document.createElement('textarea'); input.id = 'workspace-field-' + pairs.length;
      caption.htmlFor = input.id; input.value = text(row.node); input.rows = row.node.id === 'rawMemoInput' ? 10 : 7;
      if (row.node.maxLength > 0) input.maxLength = row.node.maxLength;
      input.placeholder = row.node.placeholder || '내용을 입력하세요.';
      const pair = { ...row, input, last: input.value }; pairs.push(pair); input.readOnly = !!blocked(pair);
      input.addEventListener('compositionstart', () => { composing = true; });
      input.addEventListener('compositionend', () => { composing = false; refresh(); });
      input.addEventListener('input', event => {
        if (!valid(pair)) { close(false); return; }
        // 외부 조회·복원으로 바뀐 원문에 오래된 팝업 입력을 덮어쓰지 않는다.
        if (blocked(pair) || text(pair.node) !== pair.last) {
          input.value = pair.last = text(pair.node);
          window.showToast?.('원래 내용이나 저장 상태가 바뀌었습니다. 최신 내용을 확인해 주세요.'); return;
        }
        if (pair.node.tagName === 'TEXTAREA') pair.node.value = input.value;
        else pair.node.textContent = input.value;
        pair.last = input.value;
        pair.node.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        if (!event.isComposing) updateStatus();
      });
      card.append(heading, caption, input); list.append(card);
      if (row.node === focusNode) queueMicrotask(() => {
        if (!dialog.open) return;
        input.focus(); if (caret) input.setSelectionRange(...caret);
        card.scrollIntoView({ block: 'nearest' });
      });
    }
    if (!rows.length) list.textContent = '이 구역에는 아직 작성된 내용이 없습니다.';
    updateStatus();
  }
  function refresh() {
    if (!dialog.open) return;
    if (!active() || key() !== openedKey) { close(false); return; }
    if (composing) return;
    const rows = fields().filter(row => filter.value === 'all' || row.group === filter.value);
    if (rows.length !== pairs.length || rows.some((row, i) => row.node !== pairs[i]?.node)) { render(); return; }
    for (const pair of pairs) {
      const value = text(pair.node);
      if (pair.last !== value) pair.input.value = pair.last = value;
      pair.input.readOnly = !!blocked(pair);
    }
    updateStatus();
  }
  function close(restoreFocus = true) {
    if (!dialog?.open) return;
    clearInterval(timer); dialog.close(); pairs = []; composing = false; list.replaceChildren();
    // 닫힌 팝업에 교사 기록의 복사본을 남기지 않는다.
    el('memoWorkspaceContext').textContent = ''; el('memoWorkspaceStatus').textContent = '';
    if (restoreFocus && active() && opener?.isConnected) opener.focus();
  }
  function open(node, button) {
    if (!active() || !dialog) return;
    opener = button || document.activeElement; openedKey = key();
    filter.value = 'all';
    const s = state(); el('memoWorkspaceContext').textContent = [s.selectedDate, s.className, s.selectedChild?.name || '반 전체'].filter(Boolean).join(' · ');
    render(node); dialog.showModal();
    if (!node) el('memoWorkspaceClose').focus();
    clearInterval(timer); timer = setInterval(refresh, 350);
  }
  function decorate() {
    if (decorating) return; decorating = true;
    const rows = fields();
    for (const row of rows) {
      if (row.readOnly || row.node.matches('td, th') || row.node.previousElementSibling?.classList.contains('memo-expand')) continue;
      const button = document.createElement('button'); button.type = 'button'; button.className = 'memo-expand';
      button.textContent = '↗ 크게 보기'; button.setAttribute('aria-label', row.label + ' 크게 보기');
      button.addEventListener('click', () => open(row.node, button)); row.node.before(button);
    }
    decorating = false;
  }
  document.addEventListener('DOMContentLoaded', () => {
    dialog = el('memoWorkspace'); list = el('memoWorkspaceList'); filter = el('memoWorkspaceFilter');
    if (!dialog) return;
    for (const id of ['openMemoWorkspace', 'openResultWorkspace']) el(id)?.addEventListener('click', event => open(null, event.currentTarget));
    el('memoWorkspaceClose').addEventListener('click', () => close());
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    dialog.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      const controls = [...dialog.querySelectorAll('button, select, textarea')].filter(node => !node.disabled);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    });
    filter.addEventListener('change', () => render());
    // 새 후보·서식에만 진입점을 추가하고 입력 중인 편집란을 다시 만들지 않는다.
    const observer = new MutationObserver(changes => {
      if (document.body.dataset.locked === 'true') close(false);
      if (changes.some(change => !dialog.contains(change.target) &&
          [...change.addedNodes].some(node => node.nodeType === 1 && !node.classList.contains('memo-expand')))) decorate();
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-locked'] });
    decorate();
  });
  window.DaycareMemoWorkspace = { open, close, refresh };
})();
