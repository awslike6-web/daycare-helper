/** 원시 메모의 노션 자동 저장·대상별 암호화 대기본·기기 간 충돌 처리. */
(() => {
  const el = id => document.getElementById(id);
  let current = null, generation = 0, idleTimer, maximumTimer, pollTimer;
  const owners = new Map();
  const value = () => el('rawMemoInput')?.value || '';
  const topic = c => [c.teacherId, c.date, c.childId || 'class-all'].join('_');
  const storage = c => 'daycare_memo_pending_' + topic(c);
  const bytes = text => Uint8Array.from(atob(text), ch => ch.charCodeAt(0));
  function encoded(data) { let text = ''; for (let i = 0; i < data.length; i += 8192) text += String.fromCharCode(...data.subarray(i, i + 8192)); return btoa(text); }
  const key = c => crypto.subtle.importKey('raw', Uint8Array.from(c.key.match(/../g), s => parseInt(s, 16)), 'AES-GCM', false, ['encrypt', 'decrypt']);
  function live(c) { return current === c && window.state?.authenticated && !window.state.pendingDraft; }
  function status(text, kind = 'info', c = current) {
    if (c && !live(c)) return;
    const node = el('memoSyncStatus'); if (node) { node.textContent = text; node.dataset.kind = kind; }
  }
  function resetTimers() { clearTimeout(idleTimer); clearTimeout(maximumTimer); idleTimer = maximumTimer = null; }
  function hideConflict() { if (el('memoConflict')) el('memoConflict').hidden = true; if (el('memoRemoteText')) el('memoRemoteText').value = ''; }
  function context() {
    const state = window.state;
    if (!state?.authenticated || !state.draftKey || !state.selectedChild || state.pendingDraft) return null;
    return { teacherId: state.teacherId, childId: state.selectedChild.id, date: state.selectedDate, key: state.draftKey,
      text: value(), baseText: '', version: null, dirty: !!value().trim(), ready: false, detached: false,
      restoredAt: state.memoRestoredAt || 0,
      saving: null, reading: null, remote: null, localQueue: Promise.resolve(), localRevision: 0 };
  }
  function persist(c = current) {
    if (!c) return Promise.resolve();
    if (owners.get(topic(c)) !== c) return c.localQueue;
    const snapshot = { rawMemo: c.text, baseVersion: c.version, baseText: c.baseText, timestamp: Date.now() };
    const revision = ++c.localRevision;
    const dirty = c.dirty;
    c.localQueue = c.localQueue.catch(() => {}).then(async () => {
      if (revision !== c.localRevision || owners.get(topic(c)) !== c) return;
      if (!snapshot.rawMemo.trim() || !dirty) { localStorage.removeItem(storage(c)); return; }
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(c), new TextEncoder().encode(JSON.stringify(snapshot))));
      if (revision === c.localRevision && owners.get(topic(c)) === c) localStorage.setItem(storage(c), JSON.stringify({ iv: encoded(iv), data: encoded(cipher) }));
    }).catch(() => { if (live(c)) status('기기 임시보관 공간을 확인해 주세요. 메모를 따로 복사하고 노션 저장 상태를 확인하세요.', 'error', c); });
    return c.localQueue;
  }
  async function local(c) {
    try {
      const saved = JSON.parse(localStorage.getItem(storage(c)) || 'null');
      if (!saved) return null;
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(saved.iv) }, await key(c), bytes(saved.data));
      return JSON.parse(new TextDecoder().decode(plain));
    } catch { status('기기 대기 메모를 읽을 수 없습니다. 원본을 보존하고 노션 메모를 확인합니다.', 'error', c); return null; }
  }
  async function request(c, method = 'GET', keepalive = false, snapshot = c.text) {
    const payload = JSON.stringify({ childId: c.childId, date: c.date, rawMemo: snapshot, baseVersion: c.version });
    const path = method === 'GET' ? '/api/memo?' + new URLSearchParams({ childId: c.childId, date: c.date }) : '/api/memo';
    const response = await fetch(path, { method, credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(55000),
      ...(method !== 'GET' ? { headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: keepalive && new TextEncoder().encode(payload).length < 60000 } : {}) });
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error(data.error || '노션 메모 연결을 확인해 주세요.'), { status: response.status, current: data.current });
    if (data.source !== 'notion') throw new Error('노션 저장 응답을 확인하지 못했습니다.');
    return data;
  }
  function showConflict(c, remote) {
    c.remote = remote; resetTimers();
    if (!live(c)) return;
    const panel = el('memoConflict'); if (panel) panel.hidden = false;
    if (el('memoRemoteText')) el('memoRemoteText').value = remote.rawMemo;
    status('다른 기기의 메모와 내용이 다릅니다. 현재 입력창과 아래 메모를 확인해 주세요. 자동 덮어쓰기는 멈췄습니다.', 'error', c);
    persist(c);
    window.DaycareRecords?.save();
  }
  function acknowledged(c, remote) {
    c.version = remote.version; c.baseText = remote.rawMemo; c.ready = true;
    c.dirty = c.text !== remote.rawMemo; c.remote = null;
    if (!live(c)) { persist(c); return; }
    hideConflict();
    const time = remote.updatedAt ? new Date(remote.updatedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '';
    status(remote.pageId ? `원시 메모 노션 저장 완료${time ? ' · ' + time : ''} · 같은 원아·날짜를 선택하면 다른 기기에서도 확인합니다.` : '메모를 입력하면 5초 뒤 노션에 자동 저장합니다.', remote.pageId ? 'success' : 'info', c);
    persist(c);
    window.DaycareRecords?.save();
  }
  async function read(c = current) {
    if (!c || !live(c) || c.saving || c.reading || c.detached || document.visibilityState === 'hidden') return;
    const run = (async () => {
      try {
        const remote = await request(c);
        if (!live(c) || c.detached) return;
        if (c.text === remote.rawMemo) acknowledged(c, remote);
        else if (c.dirty) {
          if ((c.version && c.version === remote.version) || (!c.version && !remote.rawMemo)) {
            c.version = remote.version; c.baseText = remote.rawMemo; c.ready = true; schedule(c);
          } else showConflict(c, remote);
        } else if (window.state?.lastResult && remote.rawMemo !== c.text) showConflict(c, remote);
        else { c.text = remote.rawMemo; if (el('rawMemoInput')) el('rawMemoInput').value = c.text; acknowledged(c, remote); }
      } catch (error) {
        if (live(c)) status('노션 메모 연결 대기 · ' + error.message + ' 입력 내용은 이 기기에 보관합니다.', 'error', c);
      }
    })();
    c.reading = run; try { await run; } finally { c.reading = null; }
  }
  function schedule(c = current) {
    if (!c || !live(c) || c.remote || !c.text.trim()) return;
    clearTimeout(idleTimer); idleTimer = setTimeout(() => flush(), 5000);
    if (!maximumTimer) maximumTimer = setTimeout(() => flush(), 30000);
  }
  function changed() {
    const c = current; if (!c || !live(c) || c.text === value()) return;
    c.text = value(); c.dirty = c.text !== c.baseText;
    if (c.detached) { c.detached = false; c.ready = false; c.version = null; }
    persist(c);
    if (!c.text.trim()) { resetTimers(); status('입력창이 비어 있습니다. 노션에 저장된 메모는 삭제하지 않습니다. 다시 조회하여 불러올 수 있습니다.'); return; }
    status(c.remote ? '다른 기기 메모를 확인한 뒤 두 내용 중 사용할 메모를 선택해 주세요.' : '이 기기에 임시보관 중 · 입력을 멈추면 노션에 저장합니다.');
    schedule(c);
  }
  async function flush({ keepalive = false, target = current } = {}) {
    const c = target; if (!c || !c.dirty || !c.text.trim() || c.remote || c.detached) return;
    if (c.saving) return c.saving;
    if (c.reading) { await c.reading; if (c.remote || !c.dirty) return; }
    if (!c.ready || !c.version) { await read(c); if (!c.ready || c.remote) return; }
    if (current === c) resetTimers();
    const snapshot = c.text;
    status('원시 메모를 노션에 저장하는 중입니다.', 'info', c);
    const run = (async () => {
      try {
        const remote = await request(c, 'PUT', keepalive, snapshot);
        c.version = remote.version; c.baseText = remote.rawMemo; c.dirty = c.text !== remote.rawMemo;
        await persist(c);
        if (!live(c)) return;
        window.state.isHistoryLoaded = false;
        if (c.dirty) { status('이전 메모 저장 완료 · 추가 입력을 저장 대기 중입니다.', 'info', c); schedule(c); }
        else acknowledged(c, remote);
      } catch (error) {
        if (error.status === 409 && error.current) showConflict(c, error.current);
        else if (live(c)) status('노션 저장 대기 · ' + error.message + ' 이 기기의 메모는 보관하고 연결 후 다시 확인합니다.', 'error', c);
        await persist(c);
      }
    })();
    c.saving = run; try { await run; } finally { c.saving = null; }
  }
  async function start() {
    const next = context(); if (!next) return;
    window.state.memoRestoredAt = 0;
    if (current && topic(current) === topic(next)) return;
    resetTimers(); hideConflict();
    const previousOwner = owners.get(topic(next));
    current = next; owners.set(topic(next), next); const token = ++generation;
    const initialText = next.text;
    status('노션의 원시 메모를 확인하는 중입니다. 입력은 이 기기에 먼저 보관합니다.');
    const pending = previousOwner?.dirty && previousOwner.text.trim() ? { rawMemo: previousOwner.text, baseVersion: previousOwner.version, baseText: previousOwner.baseText, timestamp: Date.now() } : await local(next);
    if (!live(next) || token !== generation) return;
    if (pending?.rawMemo && next.text === initialText && (!next.text || (next.restoredAt && pending.timestamp >= next.restoredAt))) {
      next.text = pending.rawMemo; next.version = pending.baseVersion; next.baseText = pending.baseText || ''; next.dirty = true;
      el('rawMemoInput').value = next.text;
    }
    if (pending?.rawMemo === next.text) { next.version = pending.baseVersion; next.baseText = pending.baseText || ''; }
    await read(next);
  }
  function beforeContextChange() {
    if (!current) return;
    changed(); persist(current); flush({ target: current, keepalive: true });
    current = null; generation++; resetTimers(); hideConflict();
    if (el('rawMemoInput')) el('rawMemoInput').value = '';
    queueMicrotask(() => start());
  }
  function pause() {
    if (current) { changed(); persist(current); flush({ target: current, keepalive: true }); }
    current = null; generation++; resetTimers(); hideConflict();
    status('로그인한 교사의 원시 메모를 자동 저장합니다.');
  }
  function clearEditor() {
    const c = current; if (!c) return;
    changed(); persist(c); flush({ target: c, keepalive: true });
    // 노션 삭제나 빈 메모 전송 대신 편집창만 비운다. 다음 입력은 저장본과 비교한다.
    c.detached = true; resetTimers(); hideConflict();
    c.text = ''; c.dirty = false;
    status('이 기기의 입력창만 비웠습니다. 노션 메모는 다시 조회할 수 있습니다.');
  }
  function restoredText() {
    const c = current; if (!c) return;
    c.text = value(); c.version = null; c.ready = false; c.dirty = !!c.text.trim(); c.remote = null;
    persist(c); read(c);
  }
  async function resolve(merge) {
    const c = current; if (!c?.remote || !live(c)) return;
    const remote = c.remote; const localText = value();
    // 다른 기기 내용 선택 전에도 이 기기 수정본을 암호화 백업한다.
    await persist(c);
    const saved = localStorage.getItem(storage(c)); if (saved) localStorage.setItem(storage(c) + '_backup', saved);
    if (!live(c)) return;
    window.DaycareRecords?.invalidateResult();
    c.text = merge ? [remote.rawMemo, localText].filter(Boolean).join('\n\n[이 기기에서 추가한 메모]\n') : remote.rawMemo;
    c.version = remote.version; c.baseText = remote.rawMemo; c.ready = true; c.remote = null; c.dirty = c.text !== remote.rawMemo;
    el('rawMemoInput').value = c.text; hideConflict(); await persist(c); window.DaycareRecords?.save();
    if (merge) { status('두 메모를 합쳤습니다. 중복 문장을 정리하세요. 5초 뒤 노션에 저장합니다.'); schedule(c); }
    else acknowledged(c, remote);
  }
  function forget() {
    const teacherId = window.state?.teacherId;
    pause();
    if (teacherId) for (const name of Object.keys(localStorage)) if (name.startsWith('daycare_memo_pending_' + teacherId + '_')) localStorage.removeItem(name);
  }
  function snapshot() {
    const c = current;
    return c ? { date: c.date, childId: c.childId, rawMemo: c.text, baseText: c.baseText, baseVersion: c.version, dirty: c.dirty } : null;
  }
  function init() {
    el('memoSaveNow')?.addEventListener('click', () => { changed(); flush(); });
    el('memoReload')?.addEventListener('click', () => { if (current) { current.detached = false; read(); } });
    el('memoUseRemote')?.addEventListener('click', () => resolve(false));
    el('memoMerge')?.addEventListener('click', () => resolve(true));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') { changed(); persist(); flush({ keepalive: true }); }
      else { if (current) { read().then(() => flush()); } else start(); }
    });
    window.addEventListener('pagehide', () => { changed(); persist(); flush({ keepalive: true }); });
    window.addEventListener('online', () => read().then(() => flush()));
    window.addEventListener('offline', () => { persist(); status('인터넷 연결이 없습니다. 이 기기에 보관하고 연결 후 노션에 저장합니다.', 'error'); });
    pollTimer = setInterval(() => { if (document.visibilityState !== 'hidden') read().then(() => flush()); }, 30000);
  }
  window.DaycareMemo = { start, changed, persist, flush, pause, beforeContextChange, clearEditor, restoredText, forget, snapshot };
  document.addEventListener('DOMContentLoaded', init);
})();
