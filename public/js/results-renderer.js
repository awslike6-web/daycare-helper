/**
 * 🎨 daycare-helper Results Renderer Module (results-renderer.js)
 * 2026 Modern Vanilla JS (ES2024+)
 * 
 * 주요 역할:
 *  - AI 생성 결과물(보육일지, 알림장, 관찰일지, 발달평가, 상담일지, 지원안) A4 시트 및 폼 바인딩
 *  - 원아별 놀이 요약 체크박스 목록 조립 (Human-in-the-Loop 교사 1초 눈 검수)
 *  - 결과 탭 바 활성화 및 시인성 극대화 스마트 탭 스위칭
 *  - 생성 완료 즉시 로컬 임시보관(AutoDraft) 연계
 */

(function () {
  /**
   * 요일 이름 헬퍼
   */
  function getDayOfWeekName(dateStr) {
    if (typeof window.getDayOfWeekName === 'function') {
      return window.getDayOfWeekName(dateStr);
    }
    if (!dateStr) return '월';
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    const dt = new Date(dateStr + 'T00:00:00');
    return isNaN(dt.getDay()) ? '월' : days[dt.getDay()];
  }

  /**
   * 결과 탭 전환 처리
   */
  function switchResultTab(targetTab) {
    const resultTabBtns = document.querySelectorAll('.result-tab-btn');
    const classDailyReportCard = document.getElementById('classDailyReportCard');
    const kidsnoteCard = document.getElementById('kidsnoteCard');
    const observationCard = document.getElementById('observationCard');
    const hangrooEvalCard = document.getElementById('hangrooEvalCard');
    const dailyCareCard = document.getElementById('dailyCareCard');
    const counselingCard = document.getElementById('counselingCard');
    const playSupportCard = document.getElementById('playSupportCard');

    resultTabBtns.forEach(b => {
      b.classList.toggle('active', b.dataset.tab === targetTab);
    });

    if (classDailyReportCard) classDailyReportCard.style.display = targetTab === 'class_daily_report' ? 'block' : 'none';
    if (kidsnoteCard) kidsnoteCard.style.display = targetTab === 'kidsnote' ? 'flex' : 'none';
    if (observationCard) observationCard.style.display = targetTab === 'observation' ? 'block' : 'none';
    if (hangrooEvalCard) hangrooEvalCard.style.display = targetTab === 'hangroo_eval' ? 'block' : 'none';
    if (dailyCareCard) dailyCareCard.style.display = targetTab === 'daily_care' ? 'flex' : 'none';
    if (counselingCard) counselingCard.style.display = targetTab === 'counseling' ? 'flex' : 'none';
    if (playSupportCard) playSupportCard.style.display = targetTab === 'play_support' ? 'flex' : 'none';
  }

  /**
   * AI 생성 결과 렌더링 메인 함수
   */
  function renderResults(data) {
    if (!data) return;

    const state = window.state || {};

    // DOM 요소 조회
    const tabClassDailyReport = document.getElementById('tabClassDailyReport');
    const repDocTitle = document.getElementById('repDocTitle');
    const repHdrClass = document.getElementById('repHdrClass');
    const repHdrDate = document.getElementById('repHdrDate');
    const repHdrTheme = document.getElementById('repHdrTheme');
    const reportCurriculumTbody = document.getElementById('reportCurriculumTbody');
    const repReflectionText = document.getElementById('repReflectionText');
    const repSupportEnvText = document.getElementById('repSupportEnvText');
    const repSupportSafetyText = document.getElementById('repSupportSafetyText');

    const individualObsCard = document.getElementById('individualObsCard');
    const individualObsCountBadge = document.getElementById('individualObsCountBadge');
    const individualObsList = document.getElementById('individualObsList');

    const kidsnoteTitle = document.getElementById('kidsnoteTitle');
    const kidsnoteContent = document.getElementById('kidsnoteContent');
    const kidsnoteTags = document.getElementById('kidsnoteTags');

    const monthlyObsDocTitle = document.getElementById('monthlyObsDocTitle');
    const monthlyObsChildName = document.getElementById('monthlyObsChildName');
    const monthlyObsTeacherName = document.getElementById('monthlyObsTeacherName');
    const monthlyObsPeriod = document.getElementById('monthlyObsPeriod');
    const monthlyObsTargetMonth = document.getElementById('monthlyObsTargetMonth');
    const monthlyObsDate1 = document.getElementById('monthlyObsDate1');
    const monthlyObsArea1 = document.getElementById('monthlyObsArea1');
    const monthlyObsDate2 = document.getElementById('monthlyObsDate2');
    const monthlyObsArea2 = document.getElementById('monthlyObsArea2');

    const obs1DateMeta = document.getElementById('obs1DateMeta');
    const obs1AreaBadge = document.getElementById('obs1AreaBadge');
    const obs1ActivityTitle = document.getElementById('obs1ActivityTitle');
    const obs1BehaviorText = document.getElementById('obs1BehaviorText');
    const obs1SupportText = document.getElementById('obs1SupportText');

    const obs2DateMeta = document.getElementById('obs2DateMeta');
    const obs2AreaBadge = document.getElementById('obs2AreaBadge');
    const obs2ActivityTitle = document.getElementById('obs2ActivityTitle');
    const obs2BehaviorText = document.getElementById('obs2BehaviorText');
    const obs2SupportText = document.getElementById('obs2SupportText');
    const obs2GrowthText = document.getElementById('obs2GrowthText');

    const monthlySummaryDevText = document.getElementById('monthlySummaryDevText');
    const monthlySummaryPlanText = document.getElementById('monthlySummaryPlanText');

    const obsStandardArea = document.getElementById('obsStandardArea');
    const obsActivityName = document.getElementById('obsActivityName');
    const obsBehaviorContent = document.getElementById('obsBehaviorContent');
    const obsEvaluationContent = document.getElementById('obsEvaluationContent');

    const tabHangrooEval = document.getElementById('tabHangrooEval');
    const hangrooEvalDocTitle = document.getElementById('hangrooEvalDocTitle');
    const hangrooEvalSummaryText = document.getElementById('hangrooEvalSummaryText');
    const hangrooEvalSupportText = document.getElementById('hangrooEvalSupportText');

    const dailyPlaySummary = document.getElementById('dailyPlaySummary');
    const dailyPlayEval = document.getElementById('dailyPlayEval');
    const dailyNextPlan = document.getElementById('dailyNextPlan');

    const counselRoutine = document.getElementById('counselRoutine');
    const counselSocial = document.getElementById('counselSocial');
    const counselDev = document.getElementById('counselDev');
    const counselOpinion = document.getElementById('counselOpinion');

    const playExtension = document.getElementById('playExtension');
    const playMaterials = document.getElementById('playMaterials');
    const playTips = document.getElementById('playTips');

    const citationBox = document.getElementById('citationBox');
    const citationSummaryText = document.getElementById('citationSummaryText');

    const resultTabBtns = document.querySelectorAll('.result-tab-btn');
    const resultsSection = document.getElementById('resultsSection');

    // 0. 처형분 정규 놀이중심 보육일지 공문서 채우기
    const rep = data.class_daily_report;
    const kn = data.kidsnote || {};
    const obs = data.observation_log || {};
    const dc = data.daily_care_log || {};

    if (rep || state.mode === 'class_report') {
      if (tabClassDailyReport) tabClassDailyReport.style.display = 'inline-flex';

      const ageText = state.selectedChild?.age || (state.className && state.className.includes('사랑') ? '만 0세' : '만 2세');
      const targetDateObj = state.selectedDate ? new Date(state.selectedDate + 'T00:00:00') : new Date();
      const todayFormatted = targetDateObj.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });

      if (repDocTitle) repDocTitle.textContent = rep?.title || `1. ${ageText} 놀이중심 보육일지`;
      if (repHdrClass) repHdrClass.textContent = `${state.className} (${ageText})`;
      if (repHdrDate) repHdrDate.textContent = rep?.date || todayFormatted;
      if (repHdrTheme) repHdrTheme.textContent = rep?.play_theme || `${state.activityArea} & 놀이 활동`;

      if (reportCurriculumTbody) {
        reportCurriculumTbody.innerHTML = '';
        const activities = (rep && Array.isArray(rep.activities) && rep.activities.length > 0)
          ? rep.activities
          : [
              {
                photo_ref: '[사진 1, 2 참조]',
                activity_title: state.activityArea || '놀이 활동',
                observation: `[관찰 내용] ${kn.content ? kn.content.slice(0, 180) + '...' : '유아들은 놀잇감을 탐색하며 즐겁게 몰입한다.'}`,
                learning_content: `[배움 읽기: ${obs.standard_area || '신체운동'}] - ${obs.evaluation || '놀이를 통해 기본 운동 능력을 기른다.'}`
              }
            ];

        activities.forEach(act => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td class="rep-td">
              <div style="font-weight: 700; color: #1E293B; margin-bottom: 4px;">${act.photo_ref || '[사진 참조]'} ${act.activity_title || ''}</div>
              <div style="font-size: 12px; line-height: 1.5; color: #334155;">${act.observation || ''}</div>
            </td>
            <td class="rep-td">
              <div style="font-size: 12px; line-height: 1.5; color: #1E293B;">${act.learning_content || ''}</div>
            </td>
          `;
          reportCurriculumTbody.appendChild(tr);
        });
      }

      if (repReflectionText) {
        repReflectionText.textContent = rep?.reflection ? rep.reflection.replace(/^●\s*성찰:\s*/, '') : (rep?.weekly_evaluation || dc.play_evaluation || '유아들의 흥미를 반영한 놀이 연계로 높은 몰입도를 보였다.');
      }
      if (repSupportEnvText) {
        repSupportEnvText.textContent = rep?.support?.environment ? rep.support.environment.replace(/^○\s*환경\s*지원:\s*/, '') : (dc.next_support_plan || '안전한 공간 확보 및 충분한 놀이 교구 배치 지원.');
      }
      if (repSupportSafetyText) {
        if (rep?.outdoor_play) {
          const outdoorStatus = rep.outdoor_check || '진행(O)';
          const outdoorNote = rep.outdoor_note ? ` (사유: ${rep.outdoor_note})` : '';
          const safetyText = rep.safety_nutrition ? ` / [안전·영양교육] ${rep.safety_nutrition}` : '';
          repSupportSafetyText.textContent = `<바깥놀이: ${outdoorStatus}${outdoorNote}> ${rep.outdoor_play}${safetyText}`;
        } else {
          repSupportSafetyText.textContent = rep?.support?.safety ? rep.support.safety.replace(/^○\s*바깥놀이\s*안전\s*관리:\s*/, '').replace(/^○\s*상호작용\s*지원:\s*/, '') : '짧은 산책 시 보행 안전선을 지키고 상호작용 간 안전거리를 유지하도록 지도함.';
        }
      }
    }

    // 0-B. 🧩 감지된 원아별 놀이 요약 (Human-in-the-Loop 교사 1초 눈 검수 목록) 채우기
    const indivObs = data.individual_observations;
    if (individualObsCard && individualObsList) {
      if (Array.isArray(indivObs) && indivObs.length > 0) {
        individualObsCard.style.display = 'block';
        if (individualObsCountBadge) {
          individualObsCountBadge.textContent = `${indivObs.length}명 감지됨`;
        }
        individualObsList.innerHTML = '';

        indivObs.forEach((item, idx) => {
          const itemEl = document.createElement('div');
          itemEl.className = 'individual-obs-item active';
          itemEl.id = `indiv-obs-item-${idx}`;

          const childName = item.child_name || `원아 ${idx + 1}`;
          const standardArea = item.standard_area || '신체운동';
          const activityName = item.activity || item.activity_name || state.activityArea || '놀이 활동';
          const summary = item.summary || item.observation_summary || '';

          itemEl.innerHTML = `
            <div class="indiv-obs-top-row">
              <div class="indiv-obs-meta">
                <label class="indiv-obs-check-label">
                  <input type="checkbox" class="indiv-obs-checkbox indiv-obs-check" checked 
                         data-idx="${idx}" 
                         data-child-name="${childName}"
                         data-area="${standardArea}"
                         data-standard-area="${standardArea}"
                         data-activity="${activityName}"
                         data-play-text="${summary.replace(/"/g, '&quot;')}">
                  <span class="indiv-obs-name">👶 ${childName}</span>
                </label>
                <div class="indiv-obs-badges">
                  <span class="indiv-obs-badge-area">${standardArea}</span>
                  <span class="indiv-obs-badge-activity">${activityName}</span>
                </div>
              </div>
              <span class="indiv-obs-status-tag" id="indiv-obs-status-${idx}" style="display: none; background: #DEF7EC; color: #03543F; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 9999px;">
                ✓ 저장됨
              </span>
            </div>
            <div class="indiv-obs-input-row">
              <input type="text" class="indiv-obs-input" id="indiv-obs-input-${idx}" value="${summary.replace(/"/g, '&quot;')}" placeholder="원아의 관찰 요약 (1초 수정 가능)" data-original="${summary.replace(/"/g, '&quot;')}">
            </div>
          `;

          // 체크박스 토글 시 스타일 및 버튼 텍스트 카운트 갱신
          const chk = itemEl.querySelector('.indiv-obs-checkbox');
          if (chk) {
            chk.addEventListener('change', (e) => {
              itemEl.classList.toggle('active', e.target.checked);
              if (typeof window.updateSelectedIndivObsCount === 'function') {
                window.updateSelectedIndivObsCount();
              }
            });
          }

          individualObsList.appendChild(itemEl);
        });

        if (typeof window.updateSelectedIndivObsCount === 'function') {
          window.updateSelectedIndivObsCount();
        }
      } else {
        individualObsCard.style.display = 'none';
      }
    }

    // 1. 키즈노트 알림장 채우기
    if (kidsnoteTitle) kidsnoteTitle.textContent = kn.title || '오늘의 알림장';
    if (kidsnoteContent) kidsnoteContent.value = kn.content || '';

    if (kidsnoteTags) {
      kidsnoteTags.innerHTML = '';
      (kn.tags || []).forEach(tag => {
        const span = document.createElement('span');
        span.className = 'tag-badge';
        span.textContent = tag.startsWith('#') ? tag : `#${tag}`;
        kidsnoteTags.appendChild(span);
      });
    }

    // 2. 🧸 평가제 영유아 월간 발달 관찰기록부 (A4 정규 양식) 채우기
    const mob = data.monthly_observation;
    const targetMonthStr = mob?.target_month || (monthlyObsTargetMonth?.value ? `${monthlyObsTargetMonth.value.split('-')[0]}년 ${parseInt(monthlyObsTargetMonth.value.split('-')[1])}월` : '2026년 9월');
    const childDisplayName = state.selectedChild ? `${state.selectedChild.name} (${state.selectedChild.age || '만 2세'})` : '원아 (만 2세)';
    const teacherDisplayName = `${state.className || '소망반'} / ${state.teacherName || '공가희 주임교사'}`;

    if (monthlyObsDocTitle) monthlyObsDocTitle.textContent = mob?.title || `[${targetMonthStr}] 영유아 발달 관찰기록부`;
    if (monthlyObsChildName) monthlyObsChildName.textContent = childDisplayName;
    if (monthlyObsTeacherName) monthlyObsTeacherName.textContent = teacherDisplayName;
    if (monthlyObsPeriod) monthlyObsPeriod.textContent = `${targetMonthStr} (상순 1회 + 하순 1회 연속 관찰)`;

    // 1차 관찰 바인딩 (한그루 [놀이] 또는 obs_1)
    const playObs = mob?.play_obs || mob?.obs_1 || {};
    const obs1Date = playObs.date || (monthlyObsDate1?.value || '2026-09-08');
    const obs1Area = playObs.area || (mob?.play_obs ? '놀이' : (monthlyObsArea1?.value || obs.standard_area || '의사소통'));
    if (obs1DateMeta) obs1DateMeta.textContent = `${obs1Date} (${getDayOfWeekName(obs1Date)})`;
    if (obs1AreaBadge) obs1AreaBadge.textContent = obs1Area;
    if (obs1ActivityTitle) obs1ActivityTitle.textContent = playObs.activity_title || obs.activity_name || state.activityArea;
    if (obs1BehaviorText) obs1BehaviorText.textContent = playObs.behavior || obs.behavior || '';
    if (obs1SupportText) obs1SupportText.textContent = playObs.teacher_support || obs.evaluation || '';

    // 2차 관찰 바인딩 (한그루 [일상생활] 또는 obs_2)
    const dailyObs = mob?.daily_obs || mob?.obs_2 || {};
    const obs2Date = dailyObs.date || (monthlyObsDate2?.value || '2026-09-22');
    const obs2Area = dailyObs.area || (mob?.daily_obs ? '일상생활' : (monthlyObsArea2?.value || '사회관계'));
    if (obs2DateMeta) obs2DateMeta.textContent = `${obs2Date} (${getDayOfWeekName(obs2Date)})`;
    if (obs2AreaBadge) obs2AreaBadge.textContent = obs2Area;
    if (obs2ActivityTitle) obs2ActivityTitle.textContent = dailyObs.activity_title || state.activityArea;
    if (obs2BehaviorText) obs2BehaviorText.textContent = dailyObs.behavior || (obs.behavior ? `1차 지도 이후 ${obs.behavior}` : '');
    if (obs2SupportText) obs2SupportText.textContent = dailyObs.teacher_support || (obs.evaluation || '');
    if (obs2GrowthText) obs2GrowthText.textContent = dailyObs.growth_continuity || mob?.obs_2?.growth_continuity || '1차 상호작용 지원 이후 상황을 수용하고 긍정적으로 반응하는 발전적 행동 변화를 보임.';

    // 월말 종합 총평 바인딩
    if (monthlySummaryDevText) {
      monthlySummaryDevText.textContent = mob?.monthly_summary?.development_summary || `${obs1Area} 및 ${obs2Area} 영역에서 또래 및 교사와의 상호작용에 적극적으로 참여하며 전반적인 발달 과업을 원활히 수행함.`;
    }
    if (monthlySummaryPlanText) {
      monthlySummaryPlanText.textContent = mob?.monthly_summary?.next_month_plan || '다음 달에는 유아의 자율적 탐색을 격려하고 성공 경험을 누적할 수 있도록 칭찬과 비계를 지속 지원할 계획임.';
    }

    // 기존 단일 폼 필드 채우기 (하위 호환)
    if (obsStandardArea) obsStandardArea.textContent = `표준보육 영역: ${obs1Area}`;
    if (obsActivityName) obsActivityName.textContent = `활동: ${playObs.activity_title || obs.activity_name || state.activityArea}`;
    if (obsBehaviorContent) obsBehaviorContent.value = playObs.behavior || obs.behavior || '';
    if (obsEvaluationContent) obsEvaluationContent.value = playObs.teacher_support || obs.evaluation || '';

    // 2-B. 📊 한그루 ERP 발달평가 (아동발달종합평가 3문단 + 차기 지원계획 2문단) 채우기
    const he = data.hangroo_eval;
    if (he || (state.selectedFormats && state.selectedFormats.includes('hangroo_eval'))) {
      if (tabHangrooEval) tabHangrooEval.style.display = 'inline-flex';
      const evalChildName = state.selectedChild ? `${state.selectedChild.name} (${state.selectedChild.age || '만 2세'})` : '원아 (만 2세)';
      if (hangrooEvalDocTitle) hangrooEvalDocTitle.textContent = `${evalChildName} 1학기 발달평가서 (한그루 ERP 규격)`;
      if (hangrooEvalSummaryText) {
        hangrooEvalSummaryText.value = he?.development_summary || (mob?.monthly_summary?.development_summary ? `${mob.monthly_summary.development_summary}\n\n신체운동 및 기본생활 영역에서 능동적인 태도를 보이며 고른 발달을 나타냄.` : '');
      }
      if (hangrooEvalSupportText) {
        hangrooEvalSupportText.value = he?.support_plan || (mob?.monthly_summary?.next_month_plan ? `${mob.monthly_summary.next_month_plan}\n\n또래 간 긍정적인 상호작용과 언어 표현 확장을 돕기 위한 모델링 및 환경 구성을 지속 지원함.` : '');
      }
    }

    // 3. 일일 보육일지 (놀이 평가 및 내일 지원) 채우기
    if (dailyPlaySummary) dailyPlaySummary.value = dc.play_summary || '';
    if (dailyPlayEval) dailyPlayEval.value = dc.play_evaluation || '';
    if (dailyNextPlan) dailyNextPlan.value = dc.next_support_plan || '';

    // 4. 학부모 상담 면담일지 채우기
    const pc = data.parent_counseling || {};
    if (counselRoutine) counselRoutine.value = pc.daily_routine || '';
    if (counselSocial) counselSocial.value = pc.social_relations || '';
    if (counselDev) counselDev.value = pc.development_feature || '';
    if (counselOpinion) counselOpinion.value = pc.counseling_opinion || '';

    // 5. 놀이 지원 & 환경구성안 채우기
    const ps = data.play_support_plan || {};
    if (playExtension) playExtension.value = ps.extension_idea || '';
    if (playMaterials) playMaterials.value = ps.recommended_materials || '';
    if (playTips) playTips.value = ps.interaction_tips || '';

    // 6. 과거 기록 출처 (Citation) 표기
    const cit = data.citation || {};
    if (citationBox) {
      if (cit.has_citation && cit.summary) {
        citationBox.style.display = 'flex';
        if (citationSummaryText) citationSummaryText.textContent = cit.summary;
      } else {
        citationBox.style.display = 'none';
      }
    }

    // 7. 선택된 서식만 탭 바에 표시하고, 선택되지 않은 서식은 깔끔하게 숨김 (시인성 극대화)
    const validFormats = (state.selectedFormats && state.selectedFormats.length > 0)
      ? state.selectedFormats
      : ['class_daily_report', 'kidsnote'];

    resultTabBtns.forEach(b => {
      const tab = b.dataset.tab;
      if (validFormats.includes(tab)) {
        b.style.display = 'inline-flex';
      } else {
        b.style.display = 'none';
      }
    });

    // 기본 활성화 탭 결정 (선택된 서식 중 가장 적절한 탭 우선)
    const isClassAll = state.selectedChild && (
      state.selectedChild.id === 'class-all' ||
      state.selectedChild.name?.includes('학급') ||
      state.selectedChild.name?.includes('전체') ||
      state.selectedChild.name?.includes('우리 반')
    );

    let targetTab = 'kidsnote';
    if (isClassAll && validFormats.includes('class_daily_report')) {
      targetTab = 'class_daily_report';
    } else if (validFormats.includes('class_daily_report') && !validFormats.includes('kidsnote') && !validFormats.includes('observation')) {
      targetTab = 'class_daily_report';
    } else if (validFormats.includes('hangroo_eval') && !validFormats.includes('kidsnote') && !validFormats.includes('class_daily_report')) {
      targetTab = 'hangroo_eval';
    } else if (validFormats.includes('kidsnote')) {
      targetTab = 'kidsnote';
    } else {
      targetTab = validFormats[0] || 'class_daily_report';
    }

    switchResultTab(targetTab);

    // 결과 섹션 노출 및 스크롤
    if (resultsSection) {
      resultsSection.style.display = 'flex';
      resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // 🛡️ 생성 완료 즉시 로컬 임시보관 (Crash Guard)
    if (typeof window.saveAutoDraft === 'function') {
      window.saveAutoDraft();
    } else if (window.AutoDraft && typeof window.AutoDraft.save === 'function') {
      window.AutoDraft.save();
    }
  }

  // 🌐 전역 노출 및 파사드 유지
  window.ResultsRenderer = {
    renderResults,
    switchResultTab
  };
  window.renderResults = renderResults;
  window.switchResultTab = switchResultTab;
})();
