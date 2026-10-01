/**
 * 📋 daycare-helper Export & Clipboard Formatters Module (export-formatters.js)
 * 2026 Modern Vanilla JS (ES2024+)
 * 
 * - 공통 클립보드 텍스트 복사기 (Modern Clipboard API + execCommand 폴백)
 * - 공통 한글(HWP) 표 클립보드 복사 엔진 (text/html Blob 통합)
 * - 처형분 정규 놀이중심 보육일지 HWP 표 복사 및 전체 텍스트 복사
 * - 평가제 영유아 월간 발달 관찰기록부 HWP 표 복사
 * - 한그루 ERP 3대 서식(보육일지, 월간 관찰일지, 발달평가서) 전용 텍스트/HWP 복사
 * - 키즈노트 알림장 원터치 복사 및 모바일 Web Share 공유 연동
 */

// ============================================================================
// 1. 공통 클립보드 텍스트 복사 엔진 (폴백 내장)
// ============================================================================
async function copyTextToClipboard(text, successMsg = '📋 복사되었습니다.') {
  if (!text) {
    if (typeof showToast === 'function') showToast('복사할 내용이 없습니다.');
    return false;
  }
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      if (typeof showToast === 'function') showToast(successMsg);
      return true;
    }
  } catch (err) {
    console.warn('navigator.clipboard.writeText failed, fallback to execCommand:', err);
  }

  // 폴백: textarea 이용
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textarea);
    if (successful) {
      if (typeof showToast === 'function') showToast(successMsg);
      return true;
    }
  } catch (fallbackErr) {
    console.error('execCommand copy failed:', fallbackErr);
  }

  if (typeof showToast === 'function') showToast('클립보드 복사에 실패했습니다.');
  return false;
}

// ============================================================================
// 2. 공통 한글(HWP) 표 클립보드 복사 엔진 (text/html Blob 통합)
// ============================================================================
async function copyHwpTableToClipboard({ tableEl, emptyMsg = '복사할 내용이 없습니다.', successMsg = '🎉 한글(HWP) 표 복사 완료! 한글 문서에 Ctrl+V 하시면 표 그대로 붙여넣기됩니다.' }) {
  if (!tableEl) {
    if (typeof showToast === 'function') showToast(emptyMsg);
    return false;
  }

  const htmlContent = tableEl.outerHTML;
  const textContent = tableEl.innerText;

  try {
    if (navigator.clipboard && window.ClipboardItem) {
      const blobHtml = new Blob([htmlContent], { type: 'text/html' });
      const blobText = new Blob([textContent], { type: 'text/plain' });
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': blobHtml, 'text/plain': blobText })]);
      if (typeof showToast === 'function') showToast(successMsg);
      return true;
    } else {
      return await copyTextToClipboard(textContent, '📋 텍스트가 복사되었습니다.');
    }
  } catch (err) {
    console.warn('ClipboardItem HTML 복사 실패, 텍스트 폴백:', err);
    return await copyTextToClipboard(textContent, '📋 텍스트가 복사되었습니다.');
  }
}

// ============================================================================
// 3. 처형분 정규 보육일지 HWP 표 & 전체 텍스트 복사 핸들러
// ============================================================================
async function handleCopyHwpTable() {
  const sheetEl = document.getElementById('officialReportSheet');
  return copyHwpTableToClipboard({
    tableEl: sheetEl,
    emptyMsg: '복사할 보육일지 내용이 없습니다.',
    successMsg: '🎉 한글(HWP) 표 복사 완료! 한글 문서에 Ctrl+V 하시면 표 그대로 붙여넣기됩니다.'
  });
}

function handleCopyFullReportText() {
  const sheetEl = document.getElementById('officialReportSheet');
  if (!sheetEl) {
    if (typeof showToast === 'function') showToast('복사할 보육일지 내용이 없습니다.');
    return;
  }
  copyTextToClipboard(sheetEl.innerText, '📋 보육일지 전체 텍스트가 복사되었습니다.');
}

// ============================================================================
// 4. 평가제 영유아 월간 발달 관찰기록부 HWP 표 복사 핸들러
// ============================================================================
async function handleCopyMonthlyObsHwp() {
  const sheetEl = document.getElementById('officialObsSheet');
  return copyHwpTableToClipboard({
    tableEl: sheetEl,
    emptyMsg: '복사할 관찰기록부 내용이 없습니다.',
    successMsg: '🎉 한글(HWP) 표 복사 완료! 한글 문서에 Ctrl+V 하시면 관찰기록부 표 그대로 붙여넣기됩니다.'
  });
}

// ============================================================================
// 5. 한그루 ERP 3대 서식 전용 복사 핸들러 (v3.4.0)
// ============================================================================

// 5-A. 📄 한그루 ERP 보육일지 텍스트 복사
async function handleCopyHangrooReport() {
  const state = window.state || {};
  const rep = state.lastResult?.class_daily_report;
  if (!rep) {
    if (typeof showToast === 'function') showToast('복사할 보육일지 내용이 없습니다. 먼저 생성해주세요.');
    return;
  }

  const ageText = state.selectedChild?.age || (state.className && state.className.includes('사랑') ? '만 0세' : '만 2세');
  const targetDateObj = state.selectedDate ? new Date(state.selectedDate + 'T00:00:00') : new Date();
  const dateStr = rep.date || targetDateObj.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });

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

  const fullHangrooReport = `[한그루 ERP 보육일지 - ${state.className} (${ageText})]\n` +
    `작성일: ${dateStr} | 담임: ${state.teacherName}\n` +
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

  await copyTextToClipboard(fullHangrooReport, '📋 한그루 ERP 보육일지 규격으로 복사되었습니다! ERP에 붙여넣으세요.');
}

// 5-B. 🧸 한그루 ERP 월간 관찰일지(월 2회: 놀이 1건 + 일상생활 1건) 텍스트 복사
async function handleCopyHangrooObs() {
  const state = window.state || {};
  const mob = state.lastResult?.monthly_observation;
  const obs = state.lastResult?.observation_log;
  if (!mob && !obs) {
    if (typeof showToast === 'function') showToast('복사할 관찰일지 내용이 없습니다. 먼저 생성해주세요.');
    return;
  }

  const monthlyObsTargetMonth = document.getElementById('monthlyObsTargetMonth');
  const monthlyObsDate1 = document.getElementById('monthlyObsDate1');
  const monthlyObsDate2 = document.getElementById('monthlyObsDate2');

  const childName = state.selectedChild?.name || '원아';
  const ageText = state.selectedChild?.age || '만 2세';
  const targetMonthStr = mob?.target_month || (monthlyObsTargetMonth?.value ? `${monthlyObsTargetMonth.value.split('-')[0]}년 ${parseInt(monthlyObsTargetMonth.value.split('-')[1])}월` : '2026년 9월');

  const playData = mob?.play_obs || mob?.obs_1 || {};
  const playDate = playData.date || (monthlyObsDate1?.value || '2026-09-08');
  const playArea = playData.area || '놀이 (신체·탐구)';
  const playTitle = playData.activity_title || obs?.activity_name || '놀이 활동';
  const playBehavior = playData.behavior || obs?.behavior || '';
  const playSupport = playData.teacher_support || obs?.evaluation || '';

  const dailyData = mob?.daily_obs || mob?.obs_2 || {};
  const dailyDate = dailyData.date || (monthlyObsDate2?.value || '2026-09-22');
  const dailyArea = dailyData.area || '일상생활 (식사·낮잠·배변·위생)';
  const dailyTitle = dailyData.activity_title || '일상생활 습관';
  const dailyBehavior = dailyData.behavior || '';
  const dailySupport = dailyData.teacher_support || '';
  const growthText = dailyData.growth_continuity || mob?.obs_2?.growth_continuity || '';

  const fullHangrooObs = `[한그루 ERP 월간 관찰일지 (월 2회) - ${childName} (${ageText})]\n` +
    `반명: ${state.className} | 담임: ${state.teacherName} | 관찰월: ${targetMonthStr}\n\n` +
    `========================================\n` +
    `■ 1회차: [놀이] 관찰 (${playDate})\n` +
    `========================================\n` +
    `영역: ${playArea}\n` +
    `활동명: ${playTitle}\n\n` +
    `[관찰 내용]\n` +
    `${playBehavior}\n\n` +
    `[교사 지원 및 평가]\n` +
    `${playSupport}\n\n` +
    `========================================\n` +
    `■ 2회차: [일상생활] 관찰 (${dailyDate})\n` +
    `========================================\n` +
    `영역: ${dailyArea}\n` +
    `구분: ${dailyTitle}\n\n` +
    `[관찰 내용]\n` +
    `${dailyBehavior}\n\n` +
    `[교사 지원 및 평가]\n` +
    `${dailySupport}` +
    (growthText ? `\n\n[발달 연속성 및 성장 변화]\n${growthText}` : '') +
    (mob?.monthly_summary?.development_summary ? `\n\n========================================\n■ 월말 발달 종합 총평\n========================================\n${mob.monthly_summary.development_summary}` : '');

  await copyTextToClipboard(fullHangrooObs, '📋 한그루 ERP 관찰일지(놀이 1건 + 일상생활 1건)가 복사되었습니다!');
}

// 5-C. 📊 한그루 ERP 발달평가서(종합평가 + 지원계획) 텍스트 복사
async function handleCopyHangrooEval() {
  const state = window.state || {};
  const evalData = state.lastResult?.hangroo_eval;
  const hangrooEvalSummaryText = document.getElementById('hangrooEvalSummaryText');
  const hangrooEvalSupportText = document.getElementById('hangrooEvalSupportText');

  const summaryVal = hangrooEvalSummaryText ? hangrooEvalSummaryText.value.trim() : (evalData?.development_summary || '');
  const supportVal = hangrooEvalSupportText ? hangrooEvalSupportText.value.trim() : (evalData?.support_plan || '');

  if (!summaryVal && !supportVal) {
    if (typeof showToast === 'function') showToast('복사할 발달평가 내용이 없습니다. 먼저 생성해주세요.');
    return;
  }

  const childName = state.selectedChild?.name || '원아';
  const ageText = state.selectedChild?.age || '만 2세';

  const fullHangrooEval = `[한그루 ERP 영유아 발달평가서 - ${childName} (${ageText})]\n` +
    `반명: ${state.className} | 담임: ${state.teacherName}\n` +
    `평가 주기: 2026학년도 1학기 (3월 ~ 8월 누적 관찰 종합)\n\n` +
    `■ 아동발달종합평가 (3개 문단)\n` +
    `${summaryVal}\n\n` +
    `■ 다음 학기 지원계획 (2개 문단)\n` +
    `${supportVal}`;

  await copyTextToClipboard(fullHangrooEval, '📋 한그루 ERP 발달평가서가 복사되었습니다! ERP에 붙여넣으세요.');
}

// 5-D. 📊 한그루 ERP 발달평가서 한글(HWP) 표 복사
async function handleCopyHangrooEvalHwp() {
  const sheetEl = document.getElementById('officialHangrooEvalSheet');
  return copyHwpTableToClipboard({
    tableEl: sheetEl,
    emptyMsg: '복사할 발달평가 내용이 없습니다.',
    successMsg: '🎉 한글(HWP) 표 복사 완료! 한글 문서에 Ctrl+V 하시면 발달평가서가 표 그대로 붙여넣기됩니다.'
  });
}

// ============================================================================
// 6. 키즈노트 알림장 복사 및 모바일 Web Share 연동 핸들러
// ============================================================================
async function handleCopyKidsnote() {
  const kidsnoteContent = document.getElementById('kidsnoteContent');
  const textToCopy = kidsnoteContent ? kidsnoteContent.value : '';
  if (!textToCopy) {
    if (typeof showToast === 'function') showToast('복사할 알림장 내용이 없습니다.');
    return;
  }

  try {
    await navigator.clipboard.writeText(textToCopy);
    if (typeof showToast === 'function') showToast('📋 알림장이 클립보드에 복사되었습니다! 키즈노트에 붙여넣으세요.');
  } catch (e) {
    if (kidsnoteContent) kidsnoteContent.select();
    document.execCommand('copy');
    if (typeof showToast === 'function') showToast('📋 복사되었습니다.');
  }
}

async function handleShareKidsnote() {
  const kidsnoteContent = document.getElementById('kidsnoteContent');
  const kidsnoteTitle = document.getElementById('kidsnoteTitle');
  const textToShare = kidsnoteContent ? kidsnoteContent.value : '';
  const titleToShare = kidsnoteTitle ? kidsnoteTitle.textContent : '오늘의 알림장';

  if (!textToShare) {
    if (typeof showToast === 'function') showToast('공유할 알림장 내용이 없습니다.');
    return;
  }

  // 1. 클립보드에 우선 복사 (안전 보장)
  try {
    await navigator.clipboard.writeText(textToShare);
  } catch (e) {}

  // 2. 모바일 Web Share API 지원 시 공유 다이얼로그 호출
  if (navigator.share) {
    try {
      await navigator.share({
        title: titleToShare,
        text: textToShare
      });
      if (typeof showToast === 'function') showToast('공유 완료! 키즈노트 앱에 바로 붙여넣으세요.');
      return;
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.warn('Web Share failed:', err);
      }
    }
  }

  // 3. 미지원 환경일 때 안내 팝업 및 복사 완료 안내
  if (typeof showToast === 'function') showToast('📋 알림장이 복사되었습니다. 키즈노트 앱을 열어 붙여넣기 하세요!');
}

// ============================================================================
// 6-B. 내보내기 및 복사/저장 이벤트 리스너 일괄 바인딩
// ============================================================================
function setupExportListeners() {
  const copyHangrooReportBtn = document.getElementById('copyHangrooReportBtn');
  const copyHwpTableBtn = document.getElementById('copyHwpTableBtn');
  const printReportBtn = document.getElementById('printReportBtn');
  const copyFullReportTextBtn = document.getElementById('copyFullReportTextBtn');
  const saveClassReportNotionBtn = document.getElementById('saveClassReportNotionBtn');
  const btnSaveIndividualObs = document.getElementById('btnSaveIndividualObs');
  const copyHangrooObsBtn = document.getElementById('copyHangrooObsBtn');
  const copyMonthlyObsHwpBtn = document.getElementById('copyMonthlyObsHwpBtn');
  const printMonthlyObsBtn = document.getElementById('printMonthlyObsBtn');
  const copyHangrooEvalBtn = document.getElementById('copyHangrooEvalBtn');
  const copyHangrooEvalHwpBtn = document.getElementById('copyHangrooEvalHwpBtn');
  const saveHangrooEvalNotionBtn = document.getElementById('saveHangrooEvalNotionBtn');
  const copyKidsnoteBtn = document.getElementById('copyKidsnoteBtn');
  const shareKidsnoteBtn = document.getElementById('shareKidsnoteBtn');

  const copyObservationBtn = document.getElementById('copyObservationBtn');
  const obsStandardArea = document.getElementById('obsStandardArea');
  const obsActivityName = document.getElementById('obsActivityName');
  const obsBehaviorContent = document.getElementById('obsBehaviorContent');
  const obsEvaluationContent = document.getElementById('obsEvaluationContent');

  const copyDailyCareBtn = document.getElementById('copyDailyCareBtn');
  const dailyPlaySummary = document.getElementById('dailyPlaySummary');
  const dailyPlayEval = document.getElementById('dailyPlayEval');
  const dailyNextPlan = document.getElementById('dailyNextPlan');

  const copyCounselingBtn = document.getElementById('copyCounselingBtn');
  const counselRoutine = document.getElementById('counselRoutine');
  const counselSocial = document.getElementById('counselSocial');
  const counselDev = document.getElementById('counselDev');
  const counselOpinion = document.getElementById('counselOpinion');

  const copyPlaySupportBtn = document.getElementById('copyPlaySupportBtn');
  const playExtension = document.getElementById('playExtension');
  const playMaterials = document.getElementById('playMaterials');
  const playTips = document.getElementById('playTips');

  const saveNotionBtn = document.getElementById('saveNotionBtn');
  const saveKidsnoteNotionBtn = document.getElementById('saveKidsnoteNotionBtn');
  const saveCounselingNotionBtn = document.getElementById('saveCounselingNotionBtn');
  const savePlaySupportNotionBtn = document.getElementById('savePlaySupportNotionBtn');
  const saveAllUnifiedNotionBtn = document.getElementById('saveAllUnifiedNotionBtn');

  if (copyHangrooReportBtn) copyHangrooReportBtn.onclick = handleCopyHangrooReport;
  if (copyHwpTableBtn) copyHwpTableBtn.onclick = handleCopyHwpTable;
  if (printReportBtn) printReportBtn.onclick = () => window.print();
  if (copyFullReportTextBtn) copyFullReportTextBtn.onclick = handleCopyFullReportText;
  if (saveClassReportNotionBtn) saveClassReportNotionBtn.onclick = () => window.handleSaveClassReportNotion?.();
  if (btnSaveIndividualObs) btnSaveIndividualObs.onclick = () => window.handleSaveIndividualObs?.();
  if (copyHangrooObsBtn) copyHangrooObsBtn.onclick = handleCopyHangrooObs;
  if (copyMonthlyObsHwpBtn) copyMonthlyObsHwpBtn.onclick = handleCopyMonthlyObsHwp;
  if (printMonthlyObsBtn) printMonthlyObsBtn.onclick = () => window.print();
  if (copyHangrooEvalBtn) copyHangrooEvalBtn.onclick = handleCopyHangrooEval;
  if (copyHangrooEvalHwpBtn) copyHangrooEvalHwpBtn.onclick = handleCopyHangrooEvalHwp;
  if (saveHangrooEvalNotionBtn) saveHangrooEvalNotionBtn.onclick = () => window.handleSaveHangrooEvalNotion?.();
  if (copyKidsnoteBtn) copyKidsnoteBtn.onclick = handleCopyKidsnote;
  if (shareKidsnoteBtn) shareKidsnoteBtn.onclick = handleShareKidsnote;

  if (copyObservationBtn) {
    copyObservationBtn.onclick = () => {
      const text = `[관찰일지 - ${obsStandardArea ? obsStandardArea.textContent : ''} / ${obsActivityName ? obsActivityName.textContent : ''}]\n\n[행동 관찰]\n${obsBehaviorContent ? obsBehaviorContent.value : ''}\n\n[지원 및 평가]\n${obsEvaluationContent ? obsEvaluationContent.value : ''}`;
      copyTextToClipboard(text, '📋 평가제 관찰일지가 복사되었습니다.');
    };
  }

  if (copyDailyCareBtn) {
    copyDailyCareBtn.onclick = () => {
      const text = `[일일 보육일지 - 놀이 평가 및 지원 계획]\n\n1. 놀이 흐름 요약:\n${dailyPlaySummary ? dailyPlaySummary.value : ''}\n\n2. 교사 종합 평가:\n${dailyPlayEval ? dailyPlayEval.value : ''}\n\n3. 내일 놀이 연계 및 지원 계획:\n${dailyNextPlan ? dailyNextPlan.value : ''}`;
      copyTextToClipboard(text, '📋 보육일지 놀이평가 및 지원계획이 복사되었습니다.');
    };
  }

  if (copyCounselingBtn) {
    copyCounselingBtn.onclick = () => {
      const state = window.state || {};
      const text = `[학부모 상담 면담일지 요약 - ${state.selectedChild?.name || '원아'}]\n\n1. 기본생활습관: ${counselRoutine ? counselRoutine.value : ''}\n2. 대인관계 및 사회성: ${counselSocial ? counselSocial.value : ''}\n3. 발달 특성: ${counselDev ? counselDev.value : ''}\n4. 종합 상담 의견: ${counselOpinion ? counselOpinion.value : ''}`;
      copyTextToClipboard(text, '📋 학부모 상담 일지가 복사되었습니다.');
    };
  }

  if (copyPlaySupportBtn) {
    copyPlaySupportBtn.onclick = () => {
      const text = `[놀이 지원 & 환경구성안]\n\n1. 확장 놀이 아이디어:\n${playExtension ? playExtension.value : ''}\n\n2. 추천 준비 교구:\n${playMaterials ? playMaterials.value : ''}\n\n3. 교사 추천 발문 팁:\n${playTips ? playTips.value : ''}`;
      copyTextToClipboard(text, '📋 놀이 지원 및 환경구성안이 복사되었습니다.');
    };
  }

  if (saveNotionBtn) saveNotionBtn.onclick = () => window.handleSaveNotion?.();
  if (saveKidsnoteNotionBtn) saveKidsnoteNotionBtn.onclick = () => window.handleSaveKidsnoteNotion?.();
  if (saveCounselingNotionBtn) saveCounselingNotionBtn.onclick = () => window.handleSaveCounselingNotion?.();
  if (savePlaySupportNotionBtn) savePlaySupportNotionBtn.onclick = () => window.handleSavePlaySupportNotion?.();
  if (saveAllUnifiedNotionBtn) saveAllUnifiedNotionBtn.onclick = () => window.handleSaveAllUnifiedNotion?.();
}

// ============================================================================
// 7. 글로벌 전역 등록 (Facade 패턴 및 하위 호환성 100% 보존)
// ============================================================================
window.copyTextToClipboard = copyTextToClipboard;
window.copyHwpTableToClipboard = copyHwpTableToClipboard;
window.handleCopyHwpTable = handleCopyHwpTable;
window.handleCopyFullReportText = handleCopyFullReportText;
window.handleCopyMonthlyObsHwp = handleCopyMonthlyObsHwp;
window.handleCopyHangrooReport = handleCopyHangrooReport;
window.handleCopyHangrooObs = handleCopyHangrooObs;
window.handleCopyHangrooEval = handleCopyHangrooEval;
window.handleCopyHangrooEvalHwp = handleCopyHangrooEvalHwp;
window.handleCopyKidsnote = handleCopyKidsnote;
window.handleShareKidsnote = handleShareKidsnote;
window.setupExportListeners = setupExportListeners;

window.ExportFormatters = {
  copyTextToClipboard,
  copyHwpTableToClipboard,
  handleCopyHwpTable,
  handleCopyFullReportText,
  handleCopyMonthlyObsHwp,
  handleCopyHangrooReport,
  handleCopyHangrooObs,
  handleCopyHangrooEval,
  handleCopyHangrooEvalHwp,
  handleCopyKidsnote,
  handleShareKidsnote,
  setupExportListeners
};
