/**
 * 🧸 daycare-helper History Viewer Module (history-viewer.js)
 * 2026 Modern Vanilla JS (ES2024+)
 * 
 * - 지난 보육 기록 보관함 모달 & 필터링 (학급/원아/서식/검색)
 * - 보관함 상세 보기 팝업 & 원시 메모/알림장/일지 분리 열람
 * - 원클릭 클립보드 복사 & 한글(HWP) 표 복사 지원
 */

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function populateHistoryChildOptions() {
  const historyChildSelect = document.getElementById('historyChildSelect');
  const historyClassSelect = document.getElementById('historyClassSelect');
  const state = window.state || {};
  if (!historyChildSelect) return;
  const currentVal = historyChildSelect.value;
  historyChildSelect.innerHTML = '<option value="all">전체 원아</option>';

  const targetClass = historyClassSelect ? historyClassSelect.value : 'all';
  const filtered = (state.children || []).filter(c => {
    if (targetClass === 'all') return true;
    return (c.childClass || '').includes(targetClass);
  });

  filtered.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.name;
    opt.textContent = `${c.name} (${c.childClass || state.className})`;
    historyChildSelect.appendChild(opt);
  });

  if (currentVal && Array.from(historyChildSelect.options).some(o => o.value === currentVal)) {
    historyChildSelect.value = currentVal;
  }
}

async function openHistoryModal(e) {
  if (e && e.preventDefault) e.preventDefault();
  const historyModal = document.getElementById('historyModal');
  const historyClassSelect = document.getElementById('historyClassSelect');
  const state = window.state || {};
  if (!historyModal) {
    console.error('#historyModal element not found');
    return;
  }

  historyModal.style.display = 'flex';

  try {
    if (historyClassSelect) {
      const clsName = state.className || '사랑반';
      historyClassSelect.innerHTML = `<option value="${clsName}" selected>🔒 ${clsName} (${state.teacherName}) 전용</option>`;
      historyClassSelect.disabled = true;
    }

    populateHistoryChildOptions();

    if (!state.isHistoryLoaded || (state.historyLogs || []).length === 0) {
      await fetchHistoryLogs();
    } else {
      renderHistoryList();
    }
  } catch (err) {
    console.error('Error in openHistoryModal:', err);
  }
}

function closeHistoryModal() {
  const historyModal = document.getElementById('historyModal');
  if (historyModal) historyModal.style.display = 'none';
}

async function fetchHistoryLogs(forceRefresh = false) {
  const historyListContainer = document.getElementById('historyListContainer');
  const state = window.state || {};
  const notionConfig = window.NOTION_CONFIG || {};

  if (!historyListContainer) return;
  historyListContainer.innerHTML = `
    <div class="history-empty-state">
      <span style="font-size: 32px;">⏳</span>
      <div style="margin-top: 8px; font-weight: 600;">노션에서 지난 기록을 불러오는 중...</div>
    </div>
  `;

  try {
    let rawResults = [];

    // 1. 브라우저에서 directNotionCall 시도 (Cloudflare 1042 회피 1순위)
    try {
      if (typeof directNotionCall === 'function' && notionConfig.DAILY_LOG_DB_ID) {
        const queryRes = await directNotionCall(`/databases/${notionConfig.DAILY_LOG_DB_ID}/query`, 'POST', {
          page_size: 100,
          sorts: [{ property: '작성일자', direction: 'descending' }]
        });
        rawResults = queryRes.results || [];
      }
    } catch (directErr) {
      console.warn('Direct notion history query failed, trying worker endpoint:', directErr);
      const workerResp = await fetch('/api/logs');
      if (workerResp.ok) {
        const workerData = await workerResp.json();
        rawResults = workerData.results || workerData.logs || [];
      } else {
        throw directErr;
      }
    }

    state.historyLogs = rawResults.map(p => {
      const props = p.properties || {};
      const title = props['기록명/식별자']?.title?.[0]?.plain_text || '제목 없음';
      const date = props['작성일자']?.date?.start || (p.created_time ? p.created_time.split('T')[0] : '날짜 미상');
      const area = props['활동 구분']?.select?.name || '자유놀이';
      const subAreas = (props['표준보육 영역']?.multi_select || []).map(s => s.name).join(', ');
      const memo = props['원시 메모/키워드']?.rich_text?.[0]?.plain_text || '';
      const kidsnote = props['알림장 최종본']?.rich_text?.[0]?.plain_text || '';
      const reportOrObs = props['관찰일지 최종본']?.rich_text?.[0]?.plain_text || '';
      const refSummary = props['참조 출처 요약']?.rich_text?.[0]?.plain_text || '';

      let cls = '기타';
      if (title.includes('소망') || refSummary.includes('소망') || memo.includes('소망')) cls = '소망반';
      else if (title.includes('사랑') || refSummary.includes('사랑') || memo.includes('사랑')) cls = '사랑반';
      else if (title.includes('햇살')) cls = '햇살반';
      else if (title.includes('바다')) cls = '바다반';

      let type = 'kidsnote';
      if (title.includes('보육일지') || reportOrObs.includes('보육과정') || reportOrObs.includes('일과 및')) {
        type = 'report';
      } else if (title.includes('관찰일지') || reportOrObs.includes('관찰')) {
        type = 'obs';
      }

      const contentPreview = kidsnote || reportOrObs || memo || '내용이 없습니다.';

      return {
        id: p.id,
        title,
        date,
        area,
        subAreas,
        memo,
        kidsnote,
        reportOrObs,
        refSummary,
        cls,
        type,
        contentPreview
      };
    });

    state.isHistoryLoaded = true;
    renderHistoryList();
  } catch (err) {
    console.error('Failed to fetch history logs:', err);
    historyListContainer.innerHTML = `
      <div class="history-empty-state">
        <span style="font-size: 32px;">⚠️</span>
        <div style="margin-top: 8px; font-weight: 600; color: #EF4444;">기록을 불러오지 못했습니다.</div>
        <div style="font-size: 11px; color: #94A3B8; margin-top: 4px;">${err.message || '네트워크 상태를 확인해주세요.'}</div>
        <button type="button" class="history-btn-sm history-btn-primary" style="margin-top: 12px;" id="retryFetchHistoryBtn">다시 시도</button>
      </div>
    `;
    const retryBtn = document.getElementById('retryFetchHistoryBtn');
    if (retryBtn) retryBtn.onclick = () => fetchHistoryLogs(true);
  }
}

function renderHistoryList() {
  const historyListContainer = document.getElementById('historyListContainer');
  const historyClassSelect = document.getElementById('historyClassSelect');
  const historyChildSelect = document.getElementById('historyChildSelect');
  const historyTypeSelect = document.getElementById('historyTypeSelect');
  const historySearchInput = document.getElementById('historySearchInput');
  const state = window.state || {};

  if (!historyListContainer) return;

  const classVal = historyClassSelect ? historyClassSelect.value : 'all';
  const childVal = historyChildSelect ? historyChildSelect.value : 'all';
  const typeVal = historyTypeSelect ? historyTypeSelect.value : 'all';
  const searchVal = historySearchInput ? historySearchInput.value.trim().toLowerCase() : '';

  const filtered = (state.historyLogs || []).filter(log => {
    if (classVal !== 'all' && log.cls !== classVal) return false;
    if (childVal !== 'all' && !log.title.includes(childVal) && !log.refSummary.includes(childVal) && !log.contentPreview.includes(childVal)) return false;
    if (typeVal !== 'all' && log.type !== typeVal) return false;
    if (searchVal) {
      const fullText = (log.title + ' ' + log.contentPreview + ' ' + log.memo + ' ' + log.refSummary).toLowerCase();
      if (!fullText.includes(searchVal)) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    historyListContainer.innerHTML = `
      <div class="history-empty-state">
        <span style="font-size: 32px;">📭</span>
        <div style="margin-top: 8px; font-weight: 600;">조건에 맞는 지난 기록이 없습니다.</div>
        <div style="font-size: 11px; color: #94A3B8; margin-top: 4px;">필터를 변경하시거나 새로운 알림장/일지를 작성해 보세요!</div>
      </div>
    `;
    return;
  }

  historyListContainer.innerHTML = filtered.map(log => {
    let badgeHtml = '';
    if (log.type === 'report') {
      badgeHtml = '<span class="history-badge history-badge-report">📄 보육일지</span>';
    } else if (log.type === 'obs') {
      badgeHtml = '<span class="history-badge history-badge-obs">🧸 관찰일지</span>';
    } else {
      badgeHtml = '<span class="history-badge history-badge-kidsnote">📸 놀이 알림장</span>';
    }

    return `
      <div class="history-card" data-id="${log.id}">
        <div class="history-card-header">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span class="history-card-date">${log.date}</span>
            <span style="font-size: 11px; font-weight: 600; color: #475569;">${log.cls}</span>
            ${badgeHtml}
          </div>
          <span style="font-size: 11px; color: #64748B;">${log.area}</span>
        </div>
        <div class="history-card-title">${escapeHtml(log.title)}</div>
        <div class="history-card-preview">${escapeHtml(log.contentPreview)}</div>
        <div class="history-card-footer">
          <span class="history-card-meta">${log.subAreas ? '🏷️ ' + escapeHtml(log.subAreas) : (log.refSummary ? escapeHtml(log.refSummary) : '')}</span>
          <div class="history-card-btns">
            <button type="button" class="history-btn-sm btn-view-history" data-id="${log.id}">🔍 상세</button>
            <button type="button" class="history-btn-sm history-btn-primary btn-copy-history" data-id="${log.id}">📋 복사</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  historyListContainer.querySelectorAll('.btn-view-history').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      openHistoryDetail(btn.getAttribute('data-id'));
    };
  });

  historyListContainer.querySelectorAll('.btn-copy-history').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      copyHistoryQuick(btn.getAttribute('data-id'));
    };
  });

  historyListContainer.querySelectorAll('.history-card').forEach(card => {
    card.onclick = () => {
      openHistoryDetail(card.getAttribute('data-id'));
    };
  });
}

function openHistoryDetail(logId) {
  const state = window.state || {};
  const historyDetailModal = document.getElementById('historyDetailModal');
  const historyDetailTitle = document.getElementById('historyDetailTitle');
  const historyDetailMeta = document.getElementById('historyDetailMeta');
  const historyDetailBody = document.getElementById('historyDetailBody');
  const btnCopyHistoryHwp = document.getElementById('btnCopyHistoryHwp');

  const log = (state.historyLogs || []).find(l => l.id === logId);
  if (!log || !historyDetailModal) return;

  state.selectedHistoryLog = log;
  if (historyDetailTitle) historyDetailTitle.textContent = log.title;
  if (historyDetailMeta) {
    historyDetailMeta.textContent = `📅 ${log.date} | 🏫 ${log.cls} | 🧩 ${log.area} ${log.subAreas ? '(' + log.subAreas + ')' : ''}`;
  }

  let bodyHtml = '';
  if (log.memo) {
    bodyHtml += `<div style="background: #F1F5F9; padding: 10px 12px; border-radius: 6px; margin-bottom: 12px; font-size: 12px; border-left: 3px solid #64748B;">
      <div style="font-weight: 700; color: #334155; margin-bottom: 3px;">📝 입력했던 원시 메모/키워드:</div>
      <div>${escapeHtml(log.memo)}</div>
    </div>`;
  }

  if (log.kidsnote) {
    bodyHtml += `<div style="margin-bottom: 14px;">
      <div style="font-weight: 700; color: #BE185D; margin-bottom: 6px;">📸 키즈노트 알림장 본문:</div>
      <div style="background: #FFF; padding: 12px; border-radius: 6px; border: 1px solid #FBCFE8; white-space: pre-wrap;">${escapeHtml(log.kidsnote)}</div>
    </div>`;
  }

  if (log.reportOrObs) {
    bodyHtml += `<div>
      <div style="font-weight: 700; color: #1D4ED8; margin-bottom: 6px;">📄 보육일지 / 관찰기록 전문:</div>
      <div style="background: #FFF; padding: 12px; border-radius: 6px; border: 1px solid #BFDBFE; white-space: pre-wrap;">${escapeHtml(log.reportOrObs)}</div>
    </div>`;
  }

  if (!log.kidsnote && !log.reportOrObs) {
    bodyHtml += `<div style="white-space: pre-wrap;">${escapeHtml(log.contentPreview)}</div>`;
  }

  if (historyDetailBody) historyDetailBody.innerHTML = bodyHtml;

  if (log.type === 'report' || (log.reportOrObs && log.reportOrObs.includes('보육과정'))) {
    if (btnCopyHistoryHwp) btnCopyHistoryHwp.style.display = 'inline-flex';
  } else {
    if (btnCopyHistoryHwp) btnCopyHistoryHwp.style.display = 'none';
  }

  historyDetailModal.style.display = 'flex';
}

function closeHistoryDetailModal() {
  const historyDetailModal = document.getElementById('historyDetailModal');
  if (historyDetailModal) historyDetailModal.style.display = 'none';
}

function copyHistoryQuick(logId) {
  const state = window.state || {};
  const log = (state.historyLogs || []).find(l => l.id === logId);
  if (!log) return;
  const textToCopy = log.kidsnote || log.reportOrObs || log.contentPreview;
  navigator.clipboard.writeText(textToCopy).then(() => {
    if (typeof showToast === 'function') showToast(`📋 '${log.title}' 내용이 복사되었습니다!`);
  }).catch(() => {
    if (typeof showToast === 'function') showToast('⚠️ 복사에 실패했습니다.');
  });
}

function copyCurrentHistoryText() {
  const state = window.state || {};
  if (!state.selectedHistoryLog) return;
  const log = state.selectedHistoryLog;
  const textToCopy = log.kidsnote || log.reportOrObs || log.contentPreview;
  navigator.clipboard.writeText(textToCopy).then(() => {
    if (typeof showToast === 'function') showToast('📋 본문 텍스트가 클립보드에 복사되었습니다.');
  });
}

async function copyCurrentHistoryHwp() {
  const state = window.state || {};
  if (!state.selectedHistoryLog) return;
  const log = state.selectedHistoryLog;
  const content = log.reportOrObs || log.kidsnote || '';

  const tableHtml = `
    <table border="1" style="border-collapse:collapse; width:100%; font-family:'맑은 고딕',sans-serif; font-size:10pt;">
      <thead>
        <tr style="background-color:#EEEEEE;">
          <th colspan="2" style="padding:8px; text-align:center; font-weight:bold;">${escapeHtml(log.title)}</th>
        </tr>
        <tr style="background-color:#F8FAFC;">
          <th style="padding:6px; width:40%; text-align:center;">구분 / 일과</th>
          <th style="padding:6px; width:60%; text-align:center;">보육활동 및 관찰·지원 내용</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="padding:8px; vertical-align:top; font-weight:bold;">기록 내용</td>
          <td style="padding:8px; vertical-align:top; white-space:pre-wrap;">${escapeHtml(content)}</td>
        </tr>
      </tbody>
    </table>
  `;

  try {
    if (navigator.clipboard && window.ClipboardItem) {
      const blobHtml = new Blob([tableHtml], { type: 'text/html' });
      const blobText = new Blob([content], { type: 'text/plain' });
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': blobHtml, 'text/plain': blobText })]);
      if (typeof showToast === 'function') showToast('📑 한글(HWP) 표 복사 완료! 한글 문서에 Ctrl+V 하시면 표로 붙여넣기됩니다.');
    } else {
      await navigator.clipboard.writeText(content);
      if (typeof showToast === 'function') showToast('📋 텍스트로 복사되었습니다.');
    }
  } catch (err) {
    console.warn('HWP copy fallback:', err);
    navigator.clipboard.writeText(content);
    if (typeof showToast === 'function') showToast('📋 텍스트로 복사되었습니다.');
  }
}

// 🌐 전역 네임스페이스 및 하위 호환성 등록
window.escapeHtml = escapeHtml;
window.populateHistoryChildOptions = populateHistoryChildOptions;
window.openHistoryModal = openHistoryModal;
window.closeHistoryModal = closeHistoryModal;
window.fetchHistoryLogs = fetchHistoryLogs;
window.renderHistoryList = renderHistoryList;
window.openHistoryDetail = openHistoryDetail;
window.closeHistoryDetailModal = closeHistoryDetailModal;
window.copyHistoryQuick = copyHistoryQuick;
window.copyCurrentHistoryText = copyCurrentHistoryText;
window.copyCurrentHistoryHwp = copyCurrentHistoryHwp;

window.DaycareHistory = {
  escapeHtml,
  populateHistoryChildOptions,
  openHistoryModal,
  closeHistoryModal,
  fetchHistoryLogs,
  renderHistoryList,
  openHistoryDetail,
  closeHistoryDetailModal,
  copyHistoryQuick,
  copyCurrentHistoryText,
  copyCurrentHistoryHwp
};
