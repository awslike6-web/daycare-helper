/**
 * 🧸 daycare-helper Notion Bridge Module (notion-bridge.js)
 * 2026 Modern Vanilla JS (ES2024+)
 * 
 * - minmin-notion 클라이언트 직결 브릿지 (Cloudflare Error 1042 회피 SSOT)
 * - 학급 전체 정규 보육일지 노션 DAILY_LOG_DB 저장 (소급 날짜 연동)
 * - 감지된 원아별 놀이 요약 분할 저장 (원아 UUID 매칭)
 * - 개별 알림장 & 관찰일지 노션 저장 및 워커 폴백
 */

// 🌐 노션 프록시 직접 호출 함수
async function directNotionCall(endpoint, method = 'GET', body = null) {
  const notionConfig = window.NOTION_CONFIG || {};
  const url = `${notionConfig.PROXY_URL}/v1${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    'Notion-Version': notionConfig.VERSION || '2022-06-28'
  };
  const options = { method, headers };
  if (body) {
    options.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  const resp = await fetch(url, options);
  if (!resp.ok) {
    const errorText = await resp.text();
    throw new Error(`Notion Direct Error (${resp.status}): ${errorText}`);
  }
  return await resp.json();
}

// 🏥 노션 서버 헬스체크
async function checkHealth() {
  const notionStatusBadge = document.getElementById('notionStatusBadge');
  const notionStatusText = document.getElementById('notionStatusText');
  try {
    const res = await fetch('/health');
    if (res.ok) {
      const data = await res.json();
      if (data.env_configured?.has_notion_token && data.env_configured?.has_daily_log_db) {
        if (notionStatusBadge) notionStatusBadge.className = 'badge badge-connected';
        if (notionStatusText) notionStatusText.textContent = '노션 연동 완료';
      } else {
        if (notionStatusBadge) notionStatusBadge.className = 'badge badge-mock';
        if (notionStatusText) notionStatusText.textContent = '모크 테스트 모드';
      }
    }
  } catch (e) {
    console.warn('Health check failed (standalone front mode):', e);
    if (notionStatusBadge) notionStatusBadge.className = 'badge badge-mock';
    if (notionStatusText) notionStatusText.textContent = '모크 모드';
  }
}

// 📄 학급 정규 보육일지 노션 DAILY_LOG_DB 저장
async function handleSaveClassReportNotion() {
  const state = window.state || {};
  const notionConfig = window.NOTION_CONFIG || {};
  const saveClassReportNotionBtn = document.getElementById('saveClassReportNotionBtn');
  const rawMemoInput = document.getElementById('rawMemoInput');

  if (!state.lastResult) {
    if (typeof showToast === 'function') showToast('저장할 보육일지가 없습니다. 먼저 생성해주세요.');
    return;
  }
  if (saveClassReportNotionBtn) {
    saveClassReportNotionBtn.disabled = true;
    saveClassReportNotionBtn.innerHTML = '<span>⏳</span> <span>노션에 저장 중...</span>';
  }

  try {
    const todayStr = state.selectedDate || new Date().toISOString().split('T')[0];
    const rep = state.lastResult.class_daily_report || {};
    const ageText = state.selectedChild?.age || (state.className && state.className.includes('사랑') ? '만 0세' : '만 2세');
    
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

    const outdoorCheck = rep.outdoor_check || '진행(O)';
    const outdoorText = rep.outdoor_play || rep.support?.safety || '미세먼지 보통으로 안전 수칙을 지키며 야외 바깥놀이 진행.';
    const outdoorNote = rep.outdoor_note ? ` (사유: ${rep.outdoor_note})` : '';
    const safetyText = rep.safety_nutrition || '식사 전 손 씻기 및 실내외 보행 안전 지도를 실시함.';
    const reflection = rep.reflection || rep.weekly_evaluation || '유아들의 흥미를 반영한 확장 놀이로 높은 몰입과 자발적 탐색을 관찰함.';
    const envSupport = rep.support?.environment || '놀이 공간 확보 및 조작 교구 추가 배치 지원.';

    let childObsSummary = '';
    const indivObs = state.lastResult?.individual_observations;
    if (Array.isArray(indivObs) && indivObs.length > 0) {
      childObsSummary = '\n\n========================================\n[원아별 놀이 관찰 연동]\n========================================\n' + indivObs.map(item => {
        const name = item.child_name || '원아';
        const sum = item.summary || item.observation_summary || '';
        return `- ${name}: ${sum}`;
      }).join('\n');
    }

    const fullDailyLog = `[한그루 ERP 보육일지 - ${state.className} (${ageText})]\n` +
      `작성일: ${todayStr} | 담임: ${state.teacherName}\n` +
      `놀이 주제: ${rep.play_theme || '자유놀이'}\n\n` +
      `========================================\n` +
      `■ 놀이 실행 및 배움\n` +
      `========================================\n` +
      `${actText}\n\n` +
      `========================================\n` +
      `■ 바깥놀이 / 대체놀이\n` +
      `========================================\n` +
      `진행 여부: ${outdoorCheck}${outdoorNote}\n` +
      `활동 내용: ${outdoorText}\n\n` +
      `========================================\n` +
      `■ 안전 및 영양 교육\n` +
      `========================================\n` +
      `${safetyText}\n\n` +
      `========================================\n` +
      `■ 놀이 평가 및 지원 계획\n` +
      `========================================\n` +
      `[성찰 및 평가] ${reflection}\n` +
      `[환경 및 교사 지원] ${envSupport}` +
      childObsSummary;

    // 1. 노션 직결 브릿지 시도
    try {
      const pageTitle = `[${todayStr}] ${state.className} 놀이중심 보육일지`;
      const createPayload = {
        parent: { database_id: notionConfig.DAILY_LOG_DB_ID },
        properties: {
          '기록명/식별자': { title: [{ text: { content: pageTitle } }] },
          '작성일자': { date: { start: todayStr } },
          '활동 구분': { select: { name: state.activityArea || '자유놀이' } },
          '표준보육 영역': { multi_select: [{ name: '신체운동' }, { name: '자연탐구' }, { name: '예술경험' }] },
          '원시 메모/키워드': { rich_text: [{ text: { content: (rawMemoInput ? rawMemoInput.value.trim() : '') || '학급 놀이 활동' } }] },
          '알림장 최종본': { rich_text: [{ text: { content: (state.lastResult.kidsnote?.content || '').slice(0, 1900) } }] },
          '관찰일지 최종본': { rich_text: [{ text: { content: fullDailyLog.slice(0, 1900) } }] },
          '참조 출처 요약': { rich_text: [{ text: { content: `학급 전체 놀이 보육일지 (${state.className})` } }] },
          '관찰 요약': { rich_text: [{ text: { content: (rep.play_theme || (rawMemoInput ? rawMemoInput.value.trim() : '') || '학급 전체 놀이 보육활동').slice(0, 80) } }] }
        }
      };
      await directNotionCall('/pages', 'POST', createPayload);
      if (typeof showToast === 'function') showToast('🎉 노션 DAILY_LOG_DB에 정규 보육일지가 안전하게 저장되었습니다!');
      return;
    } catch (directErr) {
      console.warn('Direct notion save failed, trying worker endpoint:', directErr);
    }

    // 2. 워커 엔드포인트 폴백
    const res = await fetch('/api/logs/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: todayStr,
        childId: null,
        childName: `${state.className} 우리 반`,
        activityArea: state.activityArea || '자유놀이',
        standardArea: '신체운동',
        rawMemo: rawMemoInput ? rawMemoInput.value.trim() : '',
        kidsnoteText: state.lastResult.kidsnote?.content || '',
        observationText: fullDailyLog,
        citationSummary: '학급 전체 놀이 보육일지',
        obsSummary: (rep.play_theme || (rawMemoInput ? rawMemoInput.value.trim() : '') || '학급 전체 놀이 보육활동').slice(0, 80)
      })
    });

    if (!res.ok) throw new Error('노션 저장에 실패했습니다.');
    if (typeof showToast === 'function') showToast('🎉 노션에 보육일지가 성공적으로 저장되었습니다!');
  } catch (err) {
    console.error('Save Class Report Error:', err);
    if (typeof showToast === 'function') showToast(`저장 오류: ${err.message}`);
  } finally {
    if (saveClassReportNotionBtn) {
      saveClassReportNotionBtn.disabled = false;
      saveClassReportNotionBtn.innerHTML = '<span>💾</span> <span>노션 보육일지 DB 저장</span>';
    }
  }
}

// 🧩 감지된 원아별 체크박스 카운트 업데이트 헬퍼
function updateSelectedIndivObsCount() {
  const individualObsList = document.getElementById('individualObsList');
  const btnSaveIndividualObsText = document.getElementById('btnSaveIndividualObsText');
  if (!individualObsList || !btnSaveIndividualObsText) return;
  const checkedBoxes = individualObsList.querySelectorAll('.indiv-obs-checkbox:checked');
  const count = checkedBoxes.length;
  btnSaveIndividualObsText.textContent = count > 0
    ? `선택한 원아 (${count}명) 개별 관찰일지 DB에 반영`
    : '선택한 원아 관찰일지 DB에 반영';
}

// 🧩 감지된 원아별 놀이 관찰 분할 저장
async function handleSaveIndividualObs() {
  const state = window.state || {};
  const notionConfig = window.NOTION_CONFIG || {};
  const individualObsList = document.getElementById('individualObsList');
  const btnSaveIndividualObs = document.getElementById('btnSaveIndividualObs');
  const btnSaveIndividualObsText = document.getElementById('btnSaveIndividualObsText');
  const rawMemoInput = document.getElementById('rawMemoInput');

  if (!state.lastResult || !state.lastResult.individual_observations) {
    if (typeof showToast === 'function') showToast('저장할 개별 관찰 데이터가 없습니다.');
    return;
  }

  const checkedBoxes = individualObsList ? individualObsList.querySelectorAll('.indiv-obs-checkbox:checked') : [];
  if (!checkedBoxes || checkedBoxes.length === 0) {
    if (typeof showToast === 'function') showToast('선택된 원아가 없습니다. 저장할 원아를 체크해주세요.');
    return;
  }

  if (btnSaveIndividualObs) {
    btnSaveIndividualObs.disabled = true;
    if (btnSaveIndividualObsText) {
      btnSaveIndividualObsText.textContent = `⏳ 노션 DB에 분할 저장 중 (0/${checkedBoxes.length})...`;
    }
  }

  const todayStr = state.selectedDate || new Date().toISOString().split('T')[0];
  const teacherMap = window.TEACHER_PAGE_MAP || {};
  const currentTeacherKey = localStorage.getItem('daycare_active_teacher') || (state.className === '소망반' ? 'sister_in_law' : (state.className === '연구반' ? 'sandbox' : 'wife'));
  const teacherPageId = teacherMap[currentTeacherKey];

  let savedCount = 0;
  let failCount = 0;

  for (let i = 0; i < checkedBoxes.length; i++) {
    const chk = checkedBoxes[i];
    const idx = parseInt(chk.dataset.idx, 10);
    const childName = chk.dataset.childName;
    const itemData = (state.lastResult.individual_observations && state.lastResult.individual_observations[idx]) || {};

    const inputEl = document.getElementById(`indiv-obs-input-${idx}`);
    const summaryText = inputEl ? inputEl.value.trim() : (itemData.summary || itemData.observation_summary || '');
    const standardArea = itemData.standard_area || '신체운동';
    const activityName = itemData.activity || itemData.activity_name || state.activityArea || '놀이 활동';

    if (btnSaveIndividualObsText) {
      btnSaveIndividualObsText.textContent = `⏳ 노션 DB에 저장 중 (${savedCount + 1}/${checkedBoxes.length}) - ${childName}...`;
    }

    let targetChildId = null;
    if (Array.isArray(state.children) && state.children.length > 0) {
      let matched = state.children.find(c => c.name === childName && !c.id.startsWith('mock-') && !c.id.startsWith('sandbox_'));
      if (!matched) {
        matched = state.children.find(c => (c.name.includes(childName) || childName.includes(c.name)) && !c.id.startsWith('mock-') && !c.id.startsWith('sandbox_'));
      }
      if (!matched) {
        matched = state.children.find(c => c.name === childName || c.name.includes(childName) || childName.includes(c.name));
      }
      if (matched) targetChildId = matched.id;
    }

    const pageTitle = `[관찰일지] ${todayStr} ${childName} - ${activityName}`;
    const fullObsText = `[${todayStr} 개별 놀이 관찰일지 - ${childName}]\n` +
      `반명: ${state.className} / 담당: ${state.teacherName}\n` +
      `표준보육 영역: ${standardArea} / 활동명: ${activityName}\n\n` +
      `■ 행동 관찰 내용\n${summaryText}\n\n` +
      `■ 우리 반 전체 놀이 연계 맥락\n${(rawMemoInput ? rawMemoInput.value.trim() : '') || '우리 반 놀이 활동 중 개별 발췌 관찰'}`;

    const props = {
      '기록명/식별자': { title: [{ text: { content: pageTitle } }] },
      '작성일자': { date: { start: todayStr } },
      '활동 구분': { select: { name: '관찰일지' } },
      '표준보육 영역': { multi_select: [{ name: standardArea }] },
      '원시 메모/키워드': { rich_text: [{ text: { content: (rawMemoInput ? rawMemoInput.value.trim() : '') || `${childName} 놀이 관찰` } }] },
      '알림장 최종본': { rich_text: [{ text: { content: (state.lastResult.kidsnote?.content || '').slice(0, 1900) } }] },
      '관찰일지 최종본': { rich_text: [{ text: { content: fullObsText.slice(0, 1900) } }] },
      '참조 출처 요약': { rich_text: [{ text: { content: `우리 반 놀이 발췌 관찰 (${state.className})` } }] },
      '관찰 요약': { rich_text: [{ text: { content: summaryText.slice(0, 80) } }] }
    };

    if (targetChildId && !targetChildId.startsWith('mock-') && !targetChildId.startsWith('sandbox_')) {
      props['원아'] = { relation: [{ id: targetChildId }] };
    }
    if (teacherPageId) {
      props['작성교사'] = { relation: [{ id: teacherPageId }] };
    }

    try {
      await directNotionCall('/pages', 'POST', {
        parent: { database_id: notionConfig.DAILY_LOG_DB_ID },
        properties: props
      });
      savedCount++;
    } catch (saveErr) {
      console.warn(`Direct save failed for ${childName}, trying worker fallback:`, saveErr);
      try {
        const payload = {
          date: todayStr,
          childId: targetChildId,
          childName,
          activityArea: '관찰일지',
          standardArea,
          rawMemo: rawMemoInput ? rawMemoInput.value.trim() : '',
          kidsnoteText: state.lastResult.kidsnote?.content || '',
          observationText: fullObsText,
          citationSummary: `우리 반 놀이 발췌 관찰 (${state.className})`,
          obsSummary: summaryText.slice(0, 80)
        };
        const fbRes = await fetch('/api/logs/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (fbRes.ok) savedCount++;
        else failCount++;
      } catch (fbErr) {
        console.error(`Fallback failed for ${childName}:`, fbErr);
        failCount++;
      }
    }
  }

  state.isHistoryLoaded = false;

  if (btnSaveIndividualObs) btnSaveIndividualObs.disabled = false;
  if (btnSaveIndividualObsText) updateSelectedIndivObsCount();

  if (savedCount > 0) {
    if (typeof showToast === 'function') {
      showToast(`🎉 원아 ${savedCount}명의 개별 관찰일지가 노션 DB에 안전하게 분할 저장되었습니다!${failCount > 0 ? ` (실패 ${failCount}건)` : ''}`);
    }
  } else {
    if (typeof showToast === 'function') showToast(`저장에 실패했습니다. 네트워크 상태를 확인해주세요.`);
  }
}

// 💾 개별 알림장 & 관찰일지 노션 DAILY_LOG_DB 저장
async function handleSaveNotion() {
  const state = window.state || {};
  const notionConfig = window.NOTION_CONFIG || {};
  const saveNotionBtn = document.getElementById('saveNotionBtn');
  const monthlyObsTargetMonth = document.getElementById('monthlyObsTargetMonth');
  const obsBehaviorContent = document.getElementById('obsBehaviorContent');
  const obsEvaluationContent = document.getElementById('obsEvaluationContent');
  const rawMemoInput = document.getElementById('rawMemoInput');
  const kidsnoteContent = document.getElementById('kidsnoteContent');
  const citationSummaryText = document.getElementById('citationSummaryText');

  if (!state.lastResult) {
    if (typeof showToast === 'function') showToast('저장할 일지 데이터가 없습니다.');
    return;
  }

  if (saveNotionBtn) {
    saveNotionBtn.disabled = true;
    saveNotionBtn.innerHTML = '<span>⏳</span> <span>노션에 저장 중...</span>';
  }

  const today = state.selectedDate || new Date().toISOString().split('T')[0];
  const childName = state.selectedChild?.name || '원아';
  const activityArea = state.activityArea || '자유놀이';

  const isObsMode = state.mode === 'observation' || !!state.lastResult.monthly_observation;
  const mob = state.lastResult.monthly_observation;
  const targetMonthStr = mob?.target_month || (monthlyObsTargetMonth?.value ? `${monthlyObsTargetMonth.value.split('-')[0]}년 ${parseInt(monthlyObsTargetMonth.value.split('-')[1])}월` : '2026년 9월');

  let pageTitle = `[${today}] ${childName} - ${activityArea}`;
  let obsFullText = `${obsBehaviorContent ? obsBehaviorContent.value : ''}\n\n[지원 및 평가]\n${obsEvaluationContent ? obsEvaluationContent.value : ''}`;
  let standardAreaName = state.lastResult.observation_log?.standard_area || '의사소통';

  if (isObsMode && mob) {
    const playData = mob.play_obs || mob.obs_1 || {};
    const dailyData = mob.daily_obs || mob.obs_2 || {};
    pageTitle = `[관찰일지] ${targetMonthStr} ${childName} 발달 관찰기록부 (월 2회)`;
    standardAreaName = playData.area || '신체운동';
    obsFullText = `[${targetMonthStr} 한그루 ERP 월간 관찰일지 (월 2회) - ${childName}]\n반명: ${state.className} / 담임: ${state.teacherName}\n\n` +
      `■ 1회차: [놀이] 관찰 (${playData.date || ''} / ${playData.area || '놀이'})\n` +
      `- 활동명: ${playData.activity_title || playData.activity || ''}\n` +
      `- 행동 관찰: ${playData.behavior || playData.content || ''}\n` +
      `- 교사 지원: ${playData.teacher_support || ''}\n\n` +
      `■ 2회차: [일상생활] 관찰 (${dailyData.date || ''} / ${dailyData.area || '일상생활'} - 발전적 변화 연계)\n` +
      `- 활동명: ${dailyData.activity_title || dailyData.activity || ''}\n` +
      `- 행동 관찰: ${dailyData.behavior || dailyData.content || ''}\n` +
      `- 교사 지원: ${dailyData.teacher_support || ''}\n` +
      `- 발달 성장점: ${dailyData.growth_continuity || ''}\n\n` +
      `■ 월말 발달 종합 총평\n` +
      `- 종합 발달: ${mob.monthly_summary?.development_summary || ''}\n` +
      `- 다음 달 지원 계획: ${mob.monthly_summary?.next_month_plan || ''}`;
  }

  try {
    let obsSummaryText = '';
    if (isObsMode && mob) {
      const playData = mob.play_obs || mob.obs_1 || {};
      const dailyData = mob.daily_obs || mob.obs_2 || {};
      obsSummaryText = `${playData.area || '놀이'}: ${dailyData.growth_continuity || dailyData.behavior || playData.behavior || ''}`.trim().substring(0, 100);
    } else if (state.lastResult?.observation_summary) {
      obsSummaryText = state.lastResult.observation_summary.trim().substring(0, 100);
    } else if (obsBehaviorContent && obsBehaviorContent.value) {
      const firstSentence = obsBehaviorContent.value.split('.')[0].trim();
      obsSummaryText = firstSentence.substring(0, 80);
    } else if (rawMemoInput && rawMemoInput.value) {
      obsSummaryText = rawMemoInput.value.trim().substring(0, 80);
    }

    // 1. 브라우저에서 minmin-notion 직접 일지 저장
    try {
      const props = {
        '기록명/식별자': { title: [{ text: { content: pageTitle } }] },
        '작성일자': { date: { start: today } },
        '활동 구분': { select: { name: isObsMode ? '관찰일지' : activityArea } },
        '표준보육 영역': { multi_select: [{ name: standardAreaName }] },
        '원시 메모/키워드': { rich_text: [{ text: { content: (rawMemoInput ? rawMemoInput.value.trim() : '') || (isObsMode ? `${childName} 월간 관찰일지` : '') } }] },
        '알림장 최종본': { rich_text: [{ text: { content: (kidsnoteContent ? kidsnoteContent.value : '') || '' } }] },
        '관찰일지 최종본': { rich_text: [{ text: { content: obsFullText } }] },
        '참조 출처 요약': { rich_text: [{ text: { content: isObsMode ? `월 2회 연속 관찰기록부 (${targetMonthStr})` : ((citationSummaryText ? citationSummaryText.textContent : '') || '') } }] },
        '관찰 요약': { rich_text: [{ text: { content: obsSummaryText || '일일 관찰 활동' } }] }
      };

      let targetChildId = state.selectedChild?.id;
      if (!targetChildId || targetChildId.startsWith('mock-') || targetChildId.startsWith('sandbox_')) {
        const matched = state.children?.find(c => c.name === childName && !c.id.startsWith('mock-') && !c.id.startsWith('sandbox_'));
        if (matched) targetChildId = matched.id;
      }
      if (targetChildId && !targetChildId.startsWith('mock-') && !targetChildId.startsWith('sandbox_')) {
        props['원아'] = { relation: [{ id: targetChildId }] };
      }

      const teacherMap = window.TEACHER_PAGE_MAP || {};
      const currentTeacherKey = localStorage.getItem('daycare_active_teacher') || (state.className === '소망반' ? 'sister_in_law' : (state.className === '연구반' ? 'sandbox' : 'wife'));
      const teacherPageId = teacherMap[currentTeacherKey];
      if (teacherPageId) {
        props['작성교사'] = { relation: [{ id: teacherPageId }] };
      }

      const createPayload = {
        parent: { database_id: notionConfig.DAILY_LOG_DB_ID },
        properties: props
      };

      await directNotionCall('/pages', 'POST', createPayload);
      state.isHistoryLoaded = false;
      if (typeof showToast === 'function') showToast(`💾 노션 저장 완료: ${pageTitle}`);
      return;
    } catch (directSaveErr) {
      console.warn('Direct notion log save failed, trying worker endpoint:', directSaveErr);
    }

    // 2. 워커 /api/logs/save 폴백
    let fallbackChildId = state.selectedChild?.id;
    if (!fallbackChildId || fallbackChildId.startsWith('mock-') || fallbackChildId.startsWith('sandbox_')) {
      const matched = state.children?.find(c => c.name === childName && !c.id.startsWith('mock-') && !c.id.startsWith('sandbox_'));
      if (matched) fallbackChildId = matched.id;
    }

    const payload = {
      date: today,
      childId: fallbackChildId,
      childName,
      activityArea: isObsMode ? '관찰일지' : activityArea,
      standardArea: standardAreaName,
      rawMemo: rawMemoInput ? rawMemoInput.value.trim() : '',
      kidsnoteText: kidsnoteContent ? kidsnoteContent.value : '',
      observationText: obsFullText,
      citationSummary: isObsMode ? `월 2회 연속 관찰기록부 (${targetMonthStr})` : ((citationSummaryText ? citationSummaryText.textContent : '') || ''),
      obsSummary: obsSummaryText,
      referencedLogId: null
    };

    const res = await fetch('/api/logs/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const json = await res.json();
    if (json.success) {
      state.isHistoryLoaded = false;
      if (typeof showToast === 'function') showToast(`💾 노션 저장 완료: ${pageTitle}`);
    } else {
      throw new Error(json.error || '저장 실패');
    }
  } catch (err) {
    console.error('Save Notion Error:', err);
    if (typeof showToast === 'function') showToast(`저장 오류: ${err.message}`);
  } finally {
    if (saveNotionBtn) {
      saveNotionBtn.disabled = false;
      saveNotionBtn.innerHTML = '<span>💾</span> <span>노션 3대 DB에 즉시 저장</span>';
    }
  }
}

// 📊 한그루 ERP 영유아 발달평가서 노션 DAILY_LOG_DB 저장
async function handleSaveHangrooEvalNotion() {
  const state = window.state || {};
  const notionConfig = window.NOTION_CONFIG || {};
  const saveHangrooEvalNotionBtn = document.getElementById('saveHangrooEvalNotionBtn');
  const hangrooEvalSummaryText = document.getElementById('hangrooEvalSummaryText');
  const hangrooEvalSupportText = document.getElementById('hangrooEvalSupportText');
  const rawMemoInput = document.getElementById('rawMemoInput');

  if (!state.lastResult || (!state.lastResult.hangroo_eval && !hangrooEvalSummaryText?.value)) {
    if (typeof showToast === 'function') showToast('저장할 발달평가 내용이 없습니다. 먼저 생성해주세요.');
    return;
  }

  if (saveHangrooEvalNotionBtn) {
    saveHangrooEvalNotionBtn.disabled = true;
    saveHangrooEvalNotionBtn.innerHTML = '<span>⏳</span> <span>노션에 발달평가 저장 중...</span>';
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

  try {
    // 1. 노션 직결 브릿지 시도
    try {
      let targetChildId = state.selectedChild?.id;
      if (!targetChildId || targetChildId.startsWith('mock-') || targetChildId.startsWith('sandbox_')) {
        const matched = state.children?.find(c => c.name === childName && !c.id.startsWith('mock-') && !c.id.startsWith('sandbox_'));
        if (matched) targetChildId = matched.id;
      }

      const teacherMap = window.TEACHER_PAGE_MAP || {};
      const currentTeacherKey = localStorage.getItem('daycare_active_teacher') || (state.className === '소망반' ? 'sister_in_law' : (state.className === '연구반' ? 'sandbox' : 'wife'));
      const teacherPageId = teacherMap[currentTeacherKey];

      const props = {
        '기록명/식별자': { title: [{ text: { content: pageTitle } }] },
        '작성일자': { date: { start: todayStr } },
        '활동 구분': { select: { name: '발달평가' } },
        '표준보육 영역': { multi_select: [{ name: '신체운동' }, { name: '기본생활' }, { name: '의사소통' }, { name: '사회관계' }, { name: '자연탐구' }, { name: '예술경험' }] },
        '원시 메모/키워드': { rich_text: [{ text: { content: (rawMemoInput ? rawMemoInput.value.trim() : '') || `${childName} 1학기 발달평가 종합` } }] },
        '관찰일지 최종본': { rich_text: [{ text: { content: fullEvalText.slice(0, 1900) } }] },
        '참조 출처 요약': { rich_text: [{ text: { content: '한그루 ERP 1학기 영유아 발달평가서 (누적 관찰 종합)' } }] },
        '관찰 요약': { rich_text: [{ text: { content: `${childName} 1학기 종합발달 및 다음 학기 지원계획`.slice(0, 80) } }] }
      };

      if (targetChildId && !targetChildId.startsWith('mock-') && !targetChildId.startsWith('sandbox_')) {
        props['원아'] = { relation: [{ id: targetChildId }] };
      }
      if (teacherPageId) {
        props['작성교사'] = { relation: [{ id: teacherPageId }] };
      }

      await directNotionCall('/pages', 'POST', {
        parent: { database_id: notionConfig.DAILY_LOG_DB_ID },
        properties: props
      });

      state.isHistoryLoaded = false;
      if (typeof showToast === 'function') showToast(`🎉 노션 DAILY_LOG_DB에 ${childName} 발달평가가 안전하게 저장되었습니다!`);
      return;
    } catch (directErr) {
      console.warn('Direct notion eval save failed, trying worker endpoint:', directErr);
    }

    // 2. 워커 /api/logs/save 폴백
    let fallbackChildId = state.selectedChild?.id;
    if (!fallbackChildId || fallbackChildId.startsWith('mock-') || fallbackChildId.startsWith('sandbox_')) {
      const matched = state.children?.find(c => c.name === childName && !c.id.startsWith('mock-') && !c.id.startsWith('sandbox_'));
      if (matched) fallbackChildId = matched.id;
    }

    const payload = {
      date: todayStr,
      childId: fallbackChildId,
      childName,
      activityArea: '발달평가',
      standardArea: '종합발달',
      rawMemo: rawMemoInput ? rawMemoInput.value.trim() : '',
      kidsnoteText: '',
      observationText: fullEvalText,
      citationSummary: '한그루 ERP 1학기 영유아 발달평가서 (누적 관찰 종합)',
      obsSummary: `${childName} 1학기 종합발달 및 차기학기 지원계획`.slice(0, 80),
      referencedLogId: null
    };

    const res = await fetch('/api/logs/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const json = await res.json();
    if (json.success) {
      state.isHistoryLoaded = false;
      if (typeof showToast === 'function') showToast(`🎉 노션에 ${childName} 발달평가가 성공적으로 저장되었습니다!`);
    } else {
      throw new Error(json.error || '저장 실패');
    }
  } catch (err) {
    console.error('Save Hangroo Eval Notion Error:', err);
    if (typeof showToast === 'function') showToast(`발달평가 노션 저장 오류: ${err.message}`);
  } finally {
    if (saveHangrooEvalNotionBtn) {
      saveHangrooEvalNotionBtn.disabled = false;
      saveHangrooEvalNotionBtn.innerHTML = '<span>💾</span> <span>노션 DAILY_LOG_DB에 발달평가 저장</span>';
    }
  }
}

// 🌐 전역 네임스페이스 및 하위 호환성 등록
window.directNotionCall = directNotionCall;
window.checkHealth = checkHealth;
window.handleSaveClassReportNotion = handleSaveClassReportNotion;
window.updateSelectedIndivObsCount = updateSelectedIndivObsCount;
window.handleSaveIndividualObs = handleSaveIndividualObs;
window.handleSaveNotion = handleSaveNotion;
window.handleSaveHangrooEvalNotion = handleSaveHangrooEvalNotion;

window.DaycareNotion = {
  directNotionCall,
  checkHealth,
  handleSaveClassReportNotion,
  updateSelectedIndivObsCount,
  handleSaveIndividualObs,
  handleSaveNotion,
  handleSaveHangrooEvalNotion
};
