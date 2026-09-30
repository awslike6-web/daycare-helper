/**
 * 🏰 daycare-helper notion-bridge.js (2026 초경량 리팩토링 버전)
 * 
 * 주요 역할:
 *  - 브라우저 <-> Notion REST API 직접 통신 (CORS 허용 시)
 *  - 실패 시 Cloudflare Worker (/api/logs/save) 자동 2중 폴백
 *  - 단일 공통 전송 디스패처(sendDailyLogToNotion)를 통한 중복 상용구 70% 슬림화
 */

// 🌐 1. 노션 REST API 직접 호출 헬퍼 (minmin-notion 프록시 또는 공식 API)
async function directNotionCall(endpoint, method = 'GET', body = null) {
  const notionConfig = window.NOTION_CONFIG || {};
  const proxyUrl = (notionConfig.PROXY_URL || '').replace(/\/$/, '');
  const token = notionConfig.INTERNAL_TOKEN;

  if (!proxyUrl && !token) {
    throw new Error('노션 프록시 URL 또는 인테그레이션 토큰이 설정되지 않았습니다.');
  }

  const targetUrl = proxyUrl ? `${proxyUrl}/v1${endpoint}` : `https://api.notion.com/v1${endpoint}`;

  const headers = {
    'Notion-Version': notionConfig.NOTION_VERSION || '2022-06-28',
    'Content-Type': 'application/json'
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const options = { method, headers };
  if (body) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(targetUrl, options);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || `Notion API Error: ${res.status}`);
  }
  return await res.json();
}

// 🩺 2. 헬스체크 및 원아 목록 초기 로드
async function checkHealth() {
  const statusEl = document.getElementById('connectionStatus');
  const toastMessage = document.getElementById('toastMessage');

  try {
    const res = await fetch('/health');
    if (!res.ok) throw new Error('Worker Healthcheck Failed');
    const data = await res.json();
    
    if (data.status === 'ok') {
      if (statusEl) {
        statusEl.className = 'status-badge status-online';
        statusEl.innerHTML = '<span class="status-dot"></span><span>시스템 정상</span>';
      }
      if (window.ChildrenStore && typeof window.ChildrenStore.loadChildren === 'function') {
        await window.ChildrenStore.loadChildren();
      }
    }
  } catch (err) {
    console.warn('Backend Health Check Failed, direct mode fallback active:', err);
    if (statusEl) {
      statusEl.className = 'status-badge status-offline';
      statusEl.innerHTML = '<span class="status-dot"></span><span>오프라인 (로컬 모드)</span>';
    }
    if (window.ChildrenStore && typeof window.ChildrenStore.loadChildren === 'function') {
      await window.ChildrenStore.loadChildren();
    }
  }
}

// 🆔 2-B. 노션 페이지 UUID 유효성 검증 헬퍼 (class-all, mock, 가상 문자열로 인한 400 에러 원천 방어)
function isValidNotionId(id) {
  if (!id || typeof id !== 'string') return false;
  if (id === 'class-all' || id.startsWith('mock-') || id.startsWith('sandbox_')) return false;
  const cleanId = id.replace(/-/g, '');
  return /^[0-9a-fA-F]{32}$/.test(cleanId);
}

// ⚡ 3. [공통 전송 디스패처] 모든 서식의 노션 DAILY_LOG_DB 2중화 전송을 단일화
async function sendDailyLogToNotion({
  btn = null,
  loadingHtml = '<span>⏳</span> <span>노션에 저장 중...</span>',
  defaultHtml = '<span>💾</span> <span>노션에 저장</span>',
  pageTitle = '',
  activityArea = '자유놀이',
  standardAreas = ['기본생활'],
  rawMemo = '',
  kidsnoteText = '',
  obsText = '',
  citationSummary = '',
  obsSummary = '',
  childId = null,
  childName = '원아',
  successToast = '노션에 안전하게 저장되었습니다!'
}) {
  const state = window.state || {};
  const notionConfig = window.NOTION_CONFIG || {};

  if (btn) {
    btn.disabled = true;
    if (loadingHtml) btn.innerHTML = loadingHtml;
  }

  const today = state.selectedDate || new Date().toISOString().split('T')[0];

  try {
    // 1. 대상 원아 ID 확정 (학급 전체일 경우 relation 제외, 개별 원아일 경우 실제 노션 UUID 자동 매칭)
    const isClassAll = (childId === 'class-all') || 
      (!childId && (state.selectedChild?.id === 'class-all' || state.selectedChild?.name?.includes('우리 반') || childName?.includes('전체') || childName?.includes('우리 반')));

    let targetChildId = null;
    if (!isClassAll) {
      if (isValidNotionId(childId)) {
        targetChildId = childId;
      } else if (isValidNotionId(state.selectedChild?.id)) {
        targetChildId = state.selectedChild.id;
      }
      
      // ID가 비어있거나 유효하지 않은 경우 원아 이름으로 풀에서 탐색
      if (!targetChildId && childName) {
        const pool = (state.allChildren && state.allChildren.length > 0) ? state.allChildren : (state.children || []);
        const matched = pool.find(c => c.name === childName && isValidNotionId(c.id));
        if (matched) targetChildId = matched.id;
      }
    }

    // 2. 작성교사 관계형 매핑
    const teacherMap = window.TEACHER_PAGE_MAP || {};
    const currentTeacherKey = localStorage.getItem('daycare_active_teacher') || 
      (state.className === '소망반' ? 'sister_in_law' : (state.className === '연구반' ? 'sandbox' : 'wife'));
    const teacherPageId = teacherMap[currentTeacherKey];

    // 3. 표준보육 영역 multi_select 형식 변환
    const areas = Array.isArray(standardAreas) ? standardAreas : [standardAreas];
    const standardAreaProps = areas.filter(Boolean).map(a => ({ name: a }));

    // 4. 노션 페이지 프로퍼티 조립
    const props = {
      '기록명/식별자': { title: [{ text: { content: pageTitle } }] },
      '작성일자': { date: { start: today } },
      '활동 구분': { select: { name: activityArea } },
      '표준보육 영역': { multi_select: standardAreaProps.length ? standardAreaProps : [{ name: '기본생활' }] },
      '원시 메모/키워드': { rich_text: [{ text: { content: (rawMemo || '').slice(0, 1900) } }] },
      '알림장 최종본': { rich_text: [{ text: { content: (kidsnoteText || '').slice(0, 1900) } }] },
      '관찰일지 최종본': { rich_text: [{ text: { content: (obsText || '').slice(0, 1900) } }] },
      '참조 출처 요약': { rich_text: [{ text: { content: (citationSummary || '').slice(0, 1900) } }] },
      '관찰 요약': { rich_text: [{ text: { content: (obsSummary || '').slice(0, 80) } }] }
    };

    // 🌟 핵심: 유효한 32/36자리 노션 페이지 UUID일 때만 원아 relation을 연결 (학급 전체일 때는 제외하여 400 에러 원천 방지)
    if (isValidNotionId(targetChildId)) {
      props['원아'] = { relation: [{ id: targetChildId }] };
    }
    if (teacherPageId && isValidNotionId(teacherPageId)) {
      props['작성교사'] = { relation: [{ id: teacherPageId }] };
    }

    // 5. 1차 시도: Direct Notion Call (브라우저 직접 연결)
    try {
      await directNotionCall('/pages', 'POST', {
        parent: { database_id: notionConfig.DAILY_LOG_DB_ID },
        properties: props
      });
      state.isHistoryLoaded = false;
      if (typeof showToast === 'function') showToast(successToast);
      return true;
    } catch (directErr) {
      console.warn('Direct Notion Call failed, falling back to worker endpoint:', directErr);
    }

    // 6. 2차 시도: Worker /api/logs/save 폴백
    const fallbackRes = await fetch('/api/logs/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: today,
        childId: isValidNotionId(targetChildId) ? targetChildId : null,
        childName,
        activityArea,
        standardArea: areas[0] || '기본생활',
        rawMemo,
        kidsnoteText,
        observationText: obsText,
        citationSummary,
        obsSummary: (obsSummary || '').slice(0, 80)
      })
    });

    if (!fallbackRes.ok) {
      const errJson = await fallbackRes.json().catch(() => ({}));
      throw new Error(errJson.error || '노션 저장에 실패했습니다.');
    }

    state.isHistoryLoaded = false;
    if (typeof showToast === 'function') showToast(successToast);
    return true;

  } catch (err) {
    console.error('sendDailyLogToNotion Error:', err);
    if (typeof showToast === 'function') showToast(`노션 저장 오류: ${err.message}`);
    return false;
  } finally {
    if (btn) {
      btn.disabled = false;
      if (defaultHtml) btn.innerHTML = defaultHtml;
    }
  }
}

// 📄 4. 한그루 ERP 보육일지 공문서 노션 저장
async function handleSaveClassReportNotion() {
  const state = window.state || {};
  const saveClassReportNotionBtn = document.getElementById('saveClassReportNotionBtn');
  const repReflectionText = document.getElementById('repReflectionText');
  const repSupportEnvText = document.getElementById('repSupportEnvText');
  const repSupportSafetyText = document.getElementById('repSupportSafetyText');
  const rawMemoInput = document.getElementById('rawMemoInput');

  if (!state.lastResult || (!state.lastResult.class_daily_report && !repReflectionText?.textContent && !repReflectionText?.value)) {
    if (typeof showToast === 'function') showToast('저장할 보육일지 내용이 없습니다. 먼저 생성해주세요.');
    return;
  }

  const rep = state.lastResult.class_daily_report || {};
  const todayStr = state.selectedDate || new Date().toISOString().split('T')[0];
  const pageTitle = `[보육일지] ${todayStr} ${state.className} 놀이중심 보육일지 (한그루 ERP)`;

  // 놀이 활동 및 배움 내용 텍스트 조립
  let actText = '';
  if (Array.isArray(rep.activities) && rep.activities.length > 0) {
    actText = rep.activities.map((a, i) => {
      const actTitle = a.activity_title || `${i + 1}. 놀이 활동`;
      const obs = a.observation || '';
      const lrn = a.learning_content || '';
      return `<${actTitle}>\n[배움] ${lrn}\n[관찰] ${obs}`;
    }).join('\n\n');
  } else if (rep.play_activity) {
    actText = `<${rep.play_theme || '놀이 활동'}>\n[배움] ${rep.learning || ''}\n[관찰] ${rep.play_activity}`;
  }

  const reflection = repReflectionText?.value || repReflectionText?.textContent || rep.reflection || rep.weekly_evaluation || '';
  const envSupport = repSupportEnvText?.value || repSupportEnvText?.textContent || rep.support?.environment || '';
  const safety = repSupportSafetyText?.value || repSupportSafetyText?.textContent || rep.outdoor_play || rep.support?.safety || '';

  const fullReportText = `[한그루 ERP 놀이중심 보육일지 - ${state.className}]\n` +
    `일시: ${todayStr} / 담임: ${state.teacherName}\n` +
    `놀이 주제: ${rep.play_theme || '자유놀이'}\n\n` +
    `========================================\n` +
    `■ 놀이 실행 및 배움\n` +
    `========================================\n` +
    `${actText}\n\n` +
    `========================================\n` +
    `■ 일상생활 및 바깥놀이/안전 지도\n` +
    `========================================\n` +
    `${safety}\n\n` +
    `========================================\n` +
    `■ 교사의 성찰 및 평가\n` +
    `========================================\n` +
    `${reflection}\n\n` +
    `========================================\n` +
    `■ 환경구성 및 차기 지원 계획\n` +
    `========================================\n` +
    `${envSupport}`;

  await sendDailyLogToNotion({
    btn: saveClassReportNotionBtn,
    loadingHtml: '<span>⏳</span> <span>노션에 보육일지 저장 중...</span>',
    defaultHtml: '<span>💾</span> <span>노션 보육일지 DB 저장</span>',
    pageTitle,
    activityArea: '보육일지',
    standardAreas: ['기본생활', '신체운동', '의사소통', '사회관계', '예술경험', '자연탐구'],
    rawMemo: (rawMemoInput ? rawMemoInput.value.trim() : '') || `${state.className} ${todayStr} 일일 보육일지`,
    kidsnoteText: '',
    obsText: fullReportText,
    citationSummary: '한그루 ERP 정규 결재 보육일지 전문 (A4 출력본 연계)',
    obsSummary: `${state.className} 놀이중심 보육일지 및 일일 성찰/평가`.slice(0, 80),
    childId: 'class-all',
    childName: `${state.className} 우리 반 전체`,
    successToast: `🎉 노션 DAILY_LOG_DB에 ${state.className} 보육일지가 성공적으로 저장되었습니다!`
  });
}

// 🧩 5. 감지된 원아별 놀이 요약 (선택된 원아 개별 저장)
function updateSelectedIndivObsCount() {
  const checkboxes = document.querySelectorAll('.indiv-obs-checkbox:checked, .indiv-obs-check:checked');
  const countBadge = document.getElementById('individualObsCountBadge');
  const btnText = document.getElementById('btnSaveIndividualObsText');
  const count = checkboxes.length;
  if (countBadge) countBadge.textContent = `${count}명 선택됨`;
  if (btnText) btnText.textContent = `선택한 ${count}명 개별 관찰일지 DB에 반영`;
}

async function handleSaveIndividualObs() {
  const state = window.state || {};
  const btnSaveIndividualObs = document.getElementById('btnSaveIndividualObs');
  const btnSaveIndividualObsText = document.getElementById('btnSaveIndividualObsText');
  const checkedBoxes = Array.from(document.querySelectorAll('.indiv-obs-checkbox:checked, .indiv-obs-check:checked'));

  if (checkedBoxes.length === 0) {
    if (typeof showToast === 'function') showToast('반영할 원아를 1명 이상 선택해 주세요.');
    return;
  }

  const originalBtnHtml = btnSaveIndividualObs ? btnSaveIndividualObs.innerHTML : '';
  if (btnSaveIndividualObs) {
    btnSaveIndividualObs.disabled = true;
    if (btnSaveIndividualObsText) btnSaveIndividualObsText.textContent = '노션 개별 관찰일지 적재 중... (0/' + checkedBoxes.length + ')';
  }

  const todayStr = state.selectedDate || new Date().toISOString().split('T')[0];
  let successCount = 0;

  try {
    for (let i = 0; i < checkedBoxes.length; i++) {
      const chk = checkedBoxes[i];
      const idx = chk.dataset.idx;
      const childName = chk.dataset.childName || '원아';
      const area = chk.dataset.area || '자유놀이';
      const standardArea = chk.dataset.standardArea || '사회관계';
      
      // 교사가 수정한 input 필드 내용 최우선 반영
      const inputEl = document.getElementById(`indiv-obs-input-${idx}`);
      const summaryText = inputEl ? inputEl.value.trim() : (chk.dataset.playText || '');

      if (btnSaveIndividualObsText) {
        btnSaveIndividualObsText.textContent = `노션 적재 중... (${i + 1}/${checkedBoxes.length} - ${childName})`;
      }

      // 원아의 실제 노션 UUID 찾기
      const pool = (state.allChildren && state.allChildren.length > 0) ? state.allChildren : (state.children || []);
      const matchedChild = pool.find(c => c.name === childName && isValidNotionId(c.id));
      const targetChildId = matchedChild ? matchedChild.id : null;

      const pageTitle = `[개별관찰] ${todayStr} ${childName} - ${area} (${standardArea})`;
      const obsContent = `[원아별 관찰 요약]\n${summaryText}\n\n[학급 놀이 맥락]\n${state.lastResult?.class_daily_report?.play_theme || state.activityArea || '자유놀이'}`;

      const ok = await sendDailyLogToNotion({
        pageTitle,
        activityArea: area,
        standardAreas: [standardArea],
        rawMemo: summaryText,
        kidsnoteText: '',
        obsText: obsContent,
        citationSummary: `한그루 보육일지 내 ${childName} 놀이 팩트 자동 추출`,
        obsSummary: `${childName} - ${summaryText}`.slice(0, 80),
        childId: targetChildId,
        childName,
        successToast: '' // 개별 토스트는 생략하고 최종 일괄 토스트
      });

      if (ok) {
        successCount++;
        // 성공 시 해당 원아 아이템에 '✓ 저장됨' 상태 뱃지 표시
        const statusTag = document.getElementById(`indiv-obs-status-${idx}`);
        if (statusTag) statusTag.style.display = 'inline-block';
        const itemEl = document.getElementById(`indiv-obs-item-${idx}`);
        if (itemEl) itemEl.style.background = '#ECFDF5';
      }
    }

    if (typeof showToast === 'function') {
      showToast(`🎉 총 ${successCount}명의 원아 개별 관찰일지가 노션에 안전하게 분할 저장되었습니다!`);
    }
  } catch (err) {
    console.error('Batch Save Error:', err);
    if (typeof showToast === 'function') showToast(`저장 중 오류: ${err.message}`);
  } finally {
    if (btnSaveIndividualObs) {
      btnSaveIndividualObs.disabled = false;
      btnSaveIndividualObs.innerHTML = originalBtnHtml;
      updateSelectedIndivObsCount();
    }
  }
}

// 🧸 6. 평가제 월간 발달 관찰기록부 노션 저장
async function handleSaveNotion() {
  const state = window.state || {};
  const saveNotionBtn = document.getElementById('saveNotionBtn');
  const kidsnoteContent = document.getElementById('kidsnoteContent');
  const obsBehaviorContent = document.getElementById('obsBehaviorContent');
  const obsEvaluationContent = document.getElementById('obsEvaluationContent');
  const citationSummaryText = document.getElementById('citationSummaryText');
  const rawMemoInput = document.getElementById('rawMemoInput');

  if (!state.lastResult) {
    if (typeof showToast === 'function') showToast('저장할 일지 데이터가 없습니다. 먼저 생성해주세요.');
    return;
  }

  const today = state.selectedDate || new Date().toISOString().split('T')[0];
  const childName = state.selectedChild?.name || '원아';
  const activityArea = state.activityArea || '자유놀이';
  const standardArea = state.lastResult.observation_log?.standard_area || '신체운동';

  const rawMemo = rawMemoInput ? rawMemoInput.value.trim() : '';
  const kidsnote = kidsnoteContent ? kidsnoteContent.value : (state.lastResult.kidsnote?.content || '');
  const obsBehavior = obsBehaviorContent ? obsBehaviorContent.value : (state.lastResult.observation_log?.behavior || '');
  const obsEval = obsEvaluationContent ? obsEvaluationContent.value : (state.lastResult.observation_log?.evaluation_and_support || '');
  const citationSummary = citationSummaryText ? citationSummaryText.textContent : '신규 관찰';
  const obsSummaryText = state.lastResult.observation_log?.summary || rawMemo.slice(0, 50) || '관찰 기록';

  const obsContent = `[행동 관찰]\n${obsBehavior}\n\n[지원 및 평가]\n${obsEval}`;
  const pageTitle = `[관찰일지] ${today} ${childName} - ${standardArea}`;

  await sendDailyLogToNotion({
    btn: saveNotionBtn,
    loadingHtml: '<span>⏳</span> <span>노션에 저장 중...</span>',
    defaultHtml: '<span>💾</span> <span>노션 DAILY_LOG_DB 안전 저장</span>',
    pageTitle,
    activityArea,
    standardAreas: [standardArea],
    rawMemo,
    kidsnoteText: kidsnote,
    obsText: obsContent,
    citationSummary,
    obsSummary: obsSummaryText,
    childName,
    successToast: `🎉 ${childName}의 3대 DB 연동 관찰일지가 노션에 안전하게 저장되었습니다!`
  });
}

// 📊 7. 한그루 ERP 영유아 발달평가서 노션 저장
async function handleSaveHangrooEvalNotion() {
  const state = window.state || {};
  const saveHangrooEvalNotionBtn = document.getElementById('saveHangrooEvalNotionBtn');
  const hangrooEvalSummaryText = document.getElementById('hangrooEvalSummaryText');
  const hangrooEvalSupportText = document.getElementById('hangrooEvalSupportText');
  const rawMemoInput = document.getElementById('rawMemoInput');

  if (!state.lastResult || (!state.lastResult.hangroo_eval && !hangrooEvalSummaryText?.value)) {
    if (typeof showToast === 'function') showToast('저장할 발달평가 내용이 없습니다. 먼저 생성해주세요.');
    return;
  }

  const todayStr = state.selectedDate || new Date().toISOString().split('T')[0];
  const childName = state.selectedChild?.name || '원아';
  const evalData = state.lastResult.hangroo_eval || {};
  const summaryVal = hangrooEvalSummaryText ? hangrooEvalSummaryText.value.trim() : (evalData.development_summary || '');
  const supportVal = hangrooEvalSupportText ? hangrooEvalSupportText.value.trim() : (evalData.support_plan || '');

  const pageTitle = `[발달평가] 2026년 1학기 ${childName} 영유아 발달평가서 (한그루 ERP)`;
  const fullEvalText = `[한그루 ERP 영유아 발달평가서 - ${childName}]\n` +
    `반명: ${state.className} / 담임: ${state.teacherName}\n` +
    `평가 학기: 2026학년도 1학기 (3월 ~ 8월 누적 관찰 종합)\n\n` +
    `■ 아동발달종합평가 (3개 문단)\n${summaryVal}\n\n` +
    `■ 다음 학기 지원계획 (2개 문단)\n${supportVal}`;

  await sendDailyLogToNotion({
    btn: saveHangrooEvalNotionBtn,
    loadingHtml: '<span>⏳</span> <span>노션에 발달평가 저장 중...</span>',
    defaultHtml: '<span>💾</span> <span>노션 DAILY_LOG_DB에 발달평가 저장</span>',
    pageTitle,
    activityArea: '발달평가',
    standardAreas: ['신체운동', '기본생활', '의사소통', '사회관계', '자연탐구', '예술경험'],
    rawMemo: (rawMemoInput ? rawMemoInput.value.trim() : '') || `${childName} 1학기 발달평가 종합`,
    kidsnoteText: '',
    obsText: fullEvalText,
    citationSummary: '한그루 ERP 1학기 영유아 발달평가서 (누적 관찰 종합)',
    obsSummary: `${childName} 1학기 종합발달 및 차기학기 지원계획`.slice(0, 80),
    childName,
    successToast: `🎉 노션 DAILY_LOG_DB에 ${childName} 발달평가가 안전하게 저장되었습니다!`
  });
}

// 💌 8. 키즈노트 알림장 노션 발달 타임라인 저장
async function handleSaveKidsnoteNotion() {
  const state = window.state || {};
  const saveKidsnoteNotionBtn = document.getElementById('saveKidsnoteNotionBtn');
  const kidsnoteContent = document.getElementById('kidsnoteContent');
  const rawMemoInput = document.getElementById('rawMemoInput');

  if (!kidsnoteContent || !kidsnoteContent.value.trim()) {
    if (typeof showToast === 'function') showToast('저장할 알림장 내용이 없습니다. 먼저 생성해주세요.');
    return;
  }

  const today = state.selectedDate || new Date().toISOString().split('T')[0];
  const childName = state.selectedChild?.name || '원아';
  const activityArea = state.activityArea || '자유놀이';
  const pageTitle = `[알림장] ${today} ${childName} - ${activityArea}`;
  const noteText = kidsnoteContent.value.trim();
  const rawMemo = rawMemoInput ? rawMemoInput.value.trim() : '';
  const firstSentence = noteText.split(/[.!\n]/)[0].trim();
  const obsSummaryText = (firstSentence ? firstSentence : (rawMemo || '일일 알림장')).slice(0, 80);

  await sendDailyLogToNotion({
    btn: saveKidsnoteNotionBtn,
    loadingHtml: '<span>⏳</span> <span>노션에 저장 중...</span>',
    defaultHtml: '<span>💾</span> <span>노션에 일과·알림장 저장</span>',
    pageTitle,
    activityArea: '알림장',
    standardAreas: ['기본생활'],
    rawMemo,
    kidsnoteText: noteText,
    obsText: noteText,
    citationSummary: `키즈노트 발송 알림장 (${state.className})`,
    obsSummary: obsSummaryText,
    childName,
    successToast: `🎉 ${childName} 알림장이 노션 발달 타임라인에 안전하게 누적되었습니다!`
  });
}

// 🗣️ 9. 학부모 상담 면담일지 요약 노션 저장
async function handleSaveCounselingNotion() {
  const state = window.state || {};
  const saveCounselingNotionBtn = document.getElementById('saveCounselingNotionBtn');
  const counselRoutine = document.getElementById('counselRoutine');
  const counselSocial = document.getElementById('counselSocial');
  const counselDev = document.getElementById('counselDev');
  const counselOpinion = document.getElementById('counselOpinion');
  const rawMemoInput = document.getElementById('rawMemoInput');

  const fullText = `[학부모 상담 면담일지 요약 - ${state.selectedChild?.name || '원아'}]\n\n` +
    `1. 기본생활습관: ${counselRoutine ? counselRoutine.value : ''}\n` +
    `2. 대인관계 및 사회성: ${counselSocial ? counselSocial.value : ''}\n` +
    `3. 발달 특성 및 놀이 몰입도: ${counselDev ? counselDev.value : ''}\n` +
    `4. 교사 종합 상담 의견: ${counselOpinion ? counselOpinion.value : ''}`;

  if (!counselOpinion || !counselOpinion.value.trim()) {
    if (typeof showToast === 'function') showToast('저장할 상담일지 내용이 없습니다. 먼저 생성해주세요.');
    return;
  }

  const today = state.selectedDate || new Date().toISOString().split('T')[0];
  const childName = state.selectedChild?.name || '원아';
  const pageTitle = `[상담일지] ${today} ${childName} - 학부모 상담 면담일지 요약`;
  const obsSummary = (counselOpinion.value.trim().split(/[.!\n]/)[0] || '학부모 상담').slice(0, 80);

  await sendDailyLogToNotion({
    btn: saveCounselingNotionBtn,
    loadingHtml: '<span>⏳</span> <span>노션에 저장 중...</span>',
    defaultHtml: '<span>💾</span> <span>노션에 상담일지 저장</span>',
    pageTitle,
    activityArea: '상담일지',
    standardAreas: ['사회관계'],
    rawMemo: rawMemoInput ? rawMemoInput.value.trim() : '',
    kidsnoteText: '',
    obsText: fullText,
    citationSummary: `학부모 상담 면담일지 요약 (${state.className})`,
    obsSummary,
    childName,
    successToast: `🎉 ${childName} 상담일지가 노션에 안전하게 저장되었습니다!`
  });
}

// 🎯 10. 놀이 지원 & 환경구성안 노션 저장
async function handleSavePlaySupportNotion() {
  const state = window.state || {};
  const savePlaySupportNotionBtn = document.getElementById('savePlaySupportNotionBtn');
  const playExtension = document.getElementById('playExtension');
  const playMaterials = document.getElementById('playMaterials');
  const playTips = document.getElementById('playTips');
  const rawMemoInput = document.getElementById('rawMemoInput');

  const fullText = `[놀이 지원 & 환경구성안]\n\n` +
    `1. 유아 흥미 기반 확장 놀이 아이디어:\n${playExtension ? playExtension.value : ''}\n\n` +
    `2. 추천 준비 교구 및 환경구성 자료:\n${playMaterials ? playMaterials.value : ''}\n\n` +
    `3. 교사 추천 발문 팁:\n${playTips ? playTips.value : ''}`;

  if (!playExtension || !playExtension.value.trim()) {
    if (typeof showToast === 'function') showToast('저장할 놀이지원안 내용이 없습니다. 먼저 생성해주세요.');
    return;
  }

  const today = state.selectedDate || new Date().toISOString().split('T')[0];
  const childName = state.selectedChild?.name || '원아';
  const pageTitle = `[놀이지원] ${today} ${childName} - 놀이 지원 & 환경구성안`;
  const obsSummary = (playExtension.value.trim().split(/[.!\n]/)[0] || '놀이 지원 계획').slice(0, 80);

  await sendDailyLogToNotion({
    btn: savePlaySupportNotionBtn,
    loadingHtml: '<span>⏳</span> <span>노션에 저장 중...</span>',
    defaultHtml: '<span>💾</span> <span>노션에 놀이지원안 저장</span>',
    pageTitle,
    activityArea: '놀이지원',
    standardAreas: ['자연탐구'],
    rawMemo: rawMemoInput ? rawMemoInput.value.trim() : '',
    kidsnoteText: '',
    obsText: fullText,
    citationSummary: `놀이 지원 및 환경구성안 (${state.className})`,
    obsSummary,
    childName,
    successToast: `🎉 ${childName} 놀이지원안이 노션에 안전하게 저장되었습니다!`
  });
}

// ⚡ 11. 오늘의 원아 일과 & 관찰 전체 1초 일괄 누적 저장 (All-in-One Save)
async function handleSaveAllUnifiedNotion() {
  const state = window.state || {};
  const saveAllUnifiedNotionBtn = document.getElementById('saveAllUnifiedNotionBtn');
  const kidsnoteContent = document.getElementById('kidsnoteContent');
  const obsBehaviorContent = document.getElementById('obsBehaviorContent');
  const obsEvaluationContent = document.getElementById('obsEvaluationContent');
  const repReflectionText = document.getElementById('repReflectionText');
  const rawMemoInput = document.getElementById('rawMemoInput');

  if (!state.lastResult) {
    if (typeof showToast === 'function') showToast('저장할 일지 데이터가 없습니다. 먼저 생성해주세요.');
    return;
  }

  const isClassAll = state.selectedChild && (
    state.selectedChild.id === 'class-all' ||
    state.selectedChild.name?.includes('우리 반') ||
    state.selectedChild.name?.includes('학급') ||
    state.selectedChild.name?.includes('전체')
  );

  const today = state.selectedDate || new Date().toISOString().split('T')[0];
  const childName = isClassAll ? `${state.className} 우리 반` : (state.selectedChild?.name || '원아');
  const activityArea = isClassAll ? '보육일지' : (state.activityArea || '자유놀이');
  const pageTitle = isClassAll 
    ? `[학급일지] ${today} ${state.className} - 전체 놀이·일과 종합` 
    : `[통합일지] ${today} ${childName} - 일과·알림장 & 관찰 종합`;

  const rawMemo = rawMemoInput ? rawMemoInput.value.trim() : '';
  const noteText = kidsnoteContent ? kidsnoteContent.value.trim() : (state.lastResult.kidsnote?.content || '');
  
  let obsText = '';
  if (obsBehaviorContent && obsBehaviorContent.value) {
    obsText = `[행동 관찰]\n${obsBehaviorContent.value}\n\n[지원 및 평가]\n${obsEvaluationContent ? obsEvaluationContent.value : ''}`;
  } else if (state.lastResult.class_daily_report) {
    const rep = state.lastResult.class_daily_report;
    const refVal = repReflectionText?.value || repReflectionText?.textContent || rep.reflection || '';
    obsText = `[놀이 실행]\n${rep.play_activity || rep.play_theme || ''}\n\n` +
      `[성찰 및 지원]\n${refVal}`;
  }

  const firstSentence = noteText.split(/[.!\n]/)[0].trim();
  const obsSummaryText = (firstSentence ? firstSentence : (rawMemo || '일일 종합 일과')).slice(0, 80);

  await sendDailyLogToNotion({
    btn: saveAllUnifiedNotionBtn,
    loadingHtml: '<span>⏳</span> <span>노션 일괄 누적 중...</span>',
    defaultHtml: '<span>💾</span> <span>노션에 1초 일괄 누적</span>',
    pageTitle,
    activityArea,
    standardAreas: [state.lastResult.observation_log?.standard_area || '신체운동'],
    rawMemo,
    kidsnoteText: noteText,
    obsText: obsText || noteText,
    citationSummary: isClassAll ? `학급 보육 일과 종합 누적 (${state.className})` : `원아 일과 종합 누적 (${state.className})`,
    obsSummary: obsSummaryText,
    childId: isClassAll ? 'class-all' : state.selectedChild?.id,
    childName,
    successToast: `🎉 ${childName}의 오늘 일과와 관찰 기록 전체가 노션에 일괄 누적되었습니다!`
  });
}

// 🌐 12. 전역 네임스페이스 및 하위 호환성 등록 (Facade 유지)
window.directNotionCall = directNotionCall;
window.checkHealth = checkHealth;
window.sendDailyLogToNotion = sendDailyLogToNotion;
window.handleSaveClassReportNotion = handleSaveClassReportNotion;
window.updateSelectedIndivObsCount = updateSelectedIndivObsCount;
window.handleSaveIndividualObs = handleSaveIndividualObs;
window.handleSaveNotion = handleSaveNotion;
window.handleSaveHangrooEvalNotion = handleSaveHangrooEvalNotion;
window.handleSaveKidsnoteNotion = handleSaveKidsnoteNotion;
window.handleSaveCounselingNotion = handleSaveCounselingNotion;
window.handleSavePlaySupportNotion = handleSavePlaySupportNotion;
window.handleSaveAllUnifiedNotion = handleSaveAllUnifiedNotion;

window.DaycareNotion = {
  directNotionCall,
  checkHealth,
  sendDailyLogToNotion,
  handleSaveClassReportNotion,
  updateSelectedIndivObsCount,
  handleSaveIndividualObs,
  handleSaveNotion,
  handleSaveHangrooEvalNotion,
  handleSaveKidsnoteNotion,
  handleSaveCounselingNotion,
  handleSavePlaySupportNotion,
  handleSaveAllUnifiedNotion
};
