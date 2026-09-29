/**
 * 📅 daycare-helper Date & Observation Distribute Utils Module (daycare-date-utils.js)
 * 2026 Modern Vanilla JS (ES2024+)
 * 
 * - 평일(월~금) 범위 계산 및 주말 제외
 * - 평가제 영유아 월간 관찰일지 1차/2차 평일 자동 분산 (상순/하순)
 * - 소급 작성 날짜 동기화 및 한국어 날짜 포맷팅
 */

function getWeekdaysInRange(year, month, startDay, endDay) {
  const weekdays = [];
  const daysInMonth = new Date(year, month, 0).getDate();
  const maxDay = Math.min(endDay, daysInMonth);
  for (let d = startDay; d <= maxDay; d++) {
    const dt = new Date(year, month - 1, d);
    const dayOfWeek = dt.getDay();
    if (dayOfWeek >= 1 && dayOfWeek <= 5) { // 월~금 평일만 필터링
      const padMonth = String(month).padStart(2, '0');
      const padDay = String(d).padStart(2, '0');
      weekdays.push(`${year}-${padMonth}-${padDay}`);
    }
  }
  return weekdays;
}

function getDayOfWeekName(dateStr) {
  if (!dateStr) return '';
  try {
    const dt = new Date(dateStr + 'T00:00:00');
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    return dayNames[dt.getDay()] || '';
  } catch (e) {
    return '';
  }
}

function autoDistributeObsDates() {
  const state = window.state || {};
  const monthlyObsTargetMonth = document.getElementById('monthlyObsTargetMonth');
  const monthlyObsDate1 = document.getElementById('monthlyObsDate1');
  const monthlyObsDate2 = document.getElementById('monthlyObsDate2');
  const monthlyObsArea1 = document.getElementById('monthlyObsArea1');
  const monthlyObsArea2 = document.getElementById('monthlyObsArea2');

  let ym = monthlyObsTargetMonth ? monthlyObsTargetMonth.value : '';
  if (!ym) {
    const now = new Date();
    ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (monthlyObsTargetMonth) monthlyObsTargetMonth.value = ym;
  }
  const [yearStr, monthStr] = ym.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  const phase1List = getWeekdaysInRange(year, month, 2, 10); // 상순 평일 (2일~10일)
  const phase2List = getWeekdaysInRange(year, month, 16, 25); // 하순 평일 (16일~25일)

  const date1 = phase1List.length > 0 ? phase1List[Math.floor(Math.random() * phase1List.length)] : `${ym}-08`;
  const date2 = phase2List.length > 0 ? phase2List[Math.floor(Math.random() * phase2List.length)] : `${ym}-22`;

  if (monthlyObsDate1) monthlyObsDate1.value = date1;
  if (monthlyObsDate2) monthlyObsDate2.value = date2;

  // 원아 성향/연령 맞춤 추천 영역 자동 매핑
  let defArea1 = '의사소통';
  let defArea2 = '사회관계';

  if (state.selectedChild) {
    const age = state.selectedChild.age || '';
    const traits = state.selectedChild.traits || '';
    if (age.includes('0세')) {
      defArea1 = '기본생활';
      defArea2 = '신체운동';
    } else if (traits.includes('발화') || traits.includes('말') || traits.includes('소통')) {
      defArea1 = '의사소통';
      defArea2 = '사회관계';
    } else if (traits.includes('신체') || traits.includes('대근육') || traits.includes('춤')) {
      defArea1 = '신체운동';
      defArea2 = '사회관계';
    }
  }

  if (monthlyObsArea1) monthlyObsArea1.value = defArea1;
  if (monthlyObsArea2) monthlyObsArea2.value = defArea2;

  if (typeof showToast === 'function') {
    showToast(`🎲 ${month}월 평일 관찰일(1차: ${date1.slice(5)}, 2차: ${date2.slice(5)})이 자동 분산되었습니다.`);
  }
}

function initMonthlyObsPanel() {
  const monthlyObsTargetMonth = document.getElementById('monthlyObsTargetMonth');
  const monthlyObsDate1 = document.getElementById('monthlyObsDate1');
  const monthlyObsDate2 = document.getElementById('monthlyObsDate2');

  if (!monthlyObsTargetMonth) return;
  if (!monthlyObsTargetMonth.value) {
    const now = new Date();
    monthlyObsTargetMonth.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
  if (!monthlyObsDate1 || !monthlyObsDate1.value || !monthlyObsDate2 || !monthlyObsDate2.value) {
    autoDistributeObsDates();
  }
}

function updateRecordDate(dateStr) {
  const state = window.state || {};
  const recordDatePicker = document.getElementById('recordDatePicker');
  const headerDateText = document.getElementById('headerDateText');
  const retroDateBadge = document.getElementById('retroDateBadge');
  const headerDateWrapper = document.getElementById('headerDateWrapper');

  if (!dateStr) return;
  state.selectedDate = dateStr;
  if (recordDatePicker) recordDatePicker.value = dateStr;
  const dt = new Date(dateStr + 'T00:00:00');
  const options = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' };
  if (headerDateText) headerDateText.textContent = dt.toLocaleDateString('ko-KR', options);

  const todayStr = new Date().toISOString().split('T')[0];
  const isRetro = (dateStr !== todayStr);
  if (retroDateBadge) {
    retroDateBadge.style.display = isRetro ? 'inline-block' : 'none';
  }
  if (headerDateWrapper) {
    if (isRetro) {
      headerDateWrapper.title = `소급 작성 모드 (${dateStr}) - 클릭하여 날짜 변경`;
      headerDateWrapper.style.borderColor = '#F59E0B';
    } else {
      headerDateWrapper.title = '작성 일자 (클릭하여 소급 날짜 선택)';
      headerDateWrapper.style.borderColor = 'var(--border)';
    }
  }
}

// 🌐 전역 네임스페이스 등록
window.getWeekdaysInRange = getWeekdaysInRange;
window.getDayOfWeekName = getDayOfWeekName;
window.autoDistributeObsDates = autoDistributeObsDates;
window.initMonthlyObsPanel = initMonthlyObsPanel;
window.updateRecordDate = updateRecordDate;

window.DaycareDateUtils = {
  getWeekdaysInRange,
  getDayOfWeekName,
  autoDistributeObsDates,
  initMonthlyObsPanel,
  updateRecordDate
};
