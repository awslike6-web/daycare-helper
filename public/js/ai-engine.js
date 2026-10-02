/**
 * 🤖 daycare-helper AI Engine & Results Core (ai-engine.js)
 * 2026 Modern Vanilla JS (ES2024+)
 * 
 * 통합 구성:
 *  - AI 일지 생성 파이프라인 & 마스킹 복원 & AbortController 제어 (구 ai-generator.js)
 *  - 결과물 렌더링 및 7대 서식 탭 전환 스위처 (구 results-renderer.js)
 *  - HWP 공문서 표 복사, 텍스트 복사 및 모바일 공유 (구 export-formatters.js)
 */

(function () {
  const showToast = (msg) => (typeof window.showToast === 'function' ? window.showToast(msg) : console.log(msg));

  // ============================================================================
  // 1. 공통 클립보드 복사 및 내보내기 엔진 (Clipboard & Export)
  // ============================================================================
  async function copyTextToClipboard(text, successMsg = '📋 복사되었습니다.') {
    if (!text) { showToast('복사할 내용이 없습니다.'); return false; }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        showToast(successMsg);
        return true;
      }
    } catch (err) {}
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;';
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      if (ok) { showToast(successMsg); return true; }
    } catch (e) {}
    showToast('복사에 실패했습니다.');
    return false;
  }

  async function copyHwpTableToClipboard(options, plainFallback = '', successMsg = '📄 한글(HWP) 표가 클립보드에 복사되었습니다!') {
    let tableEl = null, msg = successMsg;
    if (typeof options === 'object' && options !== null && options.tableEl !== undefined) {
      tableEl = options.tableEl;
      msg = options.successMsg || successMsg;
    } else if (typeof options === 'string') {
      return copyTextToClipboard(options, plainFallback || successMsg);
    }
    if (!tableEl) return copyTextToClipboard(plainFallback, msg);
    const htmlBlob = new Blob([tableEl.outerHTML], { type: 'text/html' });
    const textBlob = new Blob([tableEl.innerText], { type: 'text/plain' });
    if (navigator.clipboard && window.ClipboardItem) {
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'text/html': htmlBlob, 'text/plain': textBlob })]);
        showToast(msg);
        return true;
      } catch (e) {}
    }
    return copyTextToClipboard(tableEl.innerText, msg);
  }

  // ============================================================================
  // 2. 결과 탭 전환 스위처 (Result Tab Switcher)
  // ============================================================================
  function switchResultTab(targetTab) {
    const resultTabBtns = document.querySelectorAll('.result-tab-btn');
    const cards = {
      class_daily_report: document.getElementById('classDailyReportCard'),
      kidsnote: document.getElementById('kidsnoteCard'),
      observation: document.getElementById('observationCard'),
      hangroo_eval: document.getElementById('hangrooEvalCard'),
      daily_care: document.getElementById('dailyCareCard'),
      counseling: document.getElementById('counselingCard'),
      play_support: document.getElementById('playSupportCard')
    };

    resultTabBtns.forEach(b => {
      b.classList.toggle('active', b.dataset.tab === targetTab);
    });

    Object.entries(cards).forEach(([key, card]) => {
      if (!card) return;
      if (key === targetTab) {
        card.style.display = (key === 'kidsnote' || key === 'daily_care' || key === 'counseling' || key === 'play_support') ? 'flex' : 'block';
      } else {
        card.style.display = 'none';
      }
    });
  }

  function getDayOfWeekName(dateStr) {
    if (!dateStr) return '월';
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    const dt = new Date(dateStr + 'T00:00:00');
    return isNaN(dt.getDay()) ? '월' : days[dt.getDay()];
  }

  // ============================================================================
  // 3. AI 생성 결과 화면 렌더링 (Results Renderer)
  // ============================================================================
  function renderResults(data) {
    if (!data) return;
    const state = window.state || {};

    const tabClassDailyReport = document.getElementById('tabClassDailyReport');
    const tabHangrooEval = document.getElementById('tabHangrooEval');

    // 0. 한그루 정규 놀이중심 보육일지 공문서 채우기
    const rep = data.class_daily_report;
    const kn = data.kidsnote || {};
    const obs = data.observation_log || {};
    const dc = data.daily_care_log || {};

    if (rep || state.mode === 'class_report') {
      if (tabClassDailyReport) tabClassDailyReport.style.display = 'inline-flex';

      const repDocTitle = document.getElementById('repDocTitle');
      const repHdrClass = document.getElementById('repHdrClass');
      const repHdrDate = document.getElementById('repHdrDate');
      const repHdrTheme = document.getElementById('repHdrTheme');
      const reportCurriculumTbody = document.getElementById('reportCurriculumTbody');
      const repReflectionText = document.getElementById('repReflectionText');
      const repSupportEnvText = document.getElementById('repSupportEnvText');
      const repSupportSafetyText = document.getElementById('repSupportSafetyText');

      const ageText = state.selectedChild?.age || (state.className && state.className.includes('사랑') ? '만 0세' : '만 2세');
      const targetDateObj = state.selectedDate ? new Date(state.selectedDate + 'T00:00:00') : new Date();
      const todayFormatted = targetDateObj.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });

      if (repDocTitle) repDocTitle.textContent = rep?.title || `1. ${ageText} 놀이중심 보육일지`;
      if (repHdrClass) repHdrClass.textContent = `${state.className || '우리 반'} (${ageText})`;
      if (repHdrDate) repHdrDate.textContent = rep?.date || state.selectedDate || todayFormatted;
      if (repHdrTheme) repHdrTheme.textContent = rep?.play_theme || `${state.activityArea || '자유놀이'} & 놀이 활동`;

      if (reportCurriculumTbody) {
        reportCurriculumTbody.innerHTML = '';
        const activities = (rep && Array.isArray(rep.activities) && rep.activities.length > 0)
          ? rep.activities
          : (Array.isArray(rep?.curriculum) && rep.curriculum.length > 0)
            ? rep.curriculum.map(c => ({
                photo_ref: c.time || '[활동]',
                activity_title: c.activity_name || '놀이 활동',
                observation: c.execution_notes || '',
                learning_content: c.learning_content || '영유아 주도 놀이 탐색'
              }))
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
          tr.innerHTML = `<td class="rep-td" style="padding: 8px; border: 1px solid #CBD5E1; vertical-align: top;"><div style="font-weight: 700; color: #1E293B; margin-bottom: 4px;">${act.photo_ref || '[사진 참조]'} ${act.activity_title || ''}</div><div style="font-size: 12px; line-height: 1.5; color: #334155;">${act.observation || ''}</div></td><td class="rep-td" style="padding: 8px; border: 1px solid #CBD5E1; font-size: 12px; line-height: 1.5; color: #1E293B; vertical-align: top;">${act.learning_content || ''}</td>`;
          reportCurriculumTbody.appendChild(tr);
        });
      }

      if (repReflectionText) {
        repReflectionText.value = rep?.reflection ? rep.reflection.replace(/^●\s*성찰:\s*/, '') : (rep?.weekly_evaluation || dc.play_evaluation || '유아들의 흥미를 반영한 놀이 연계로 높은 몰입도를 보였다.');
      }
      if (repSupportEnvText) {
        repSupportEnvText.value = rep?.support?.environment ? rep.support.environment.replace(/^○\s*환경\s*지원:\s*/, '') : (rep?.support_environment || dc.next_support_plan || '안전한 공간 확보 및 충분한 놀이 교구 배치 지원.');
      }
      if (repSupportSafetyText) {
        if (rep?.outdoor_play) {
          const outdoorStatus = rep.outdoor_check || '진행(O)';
          const outdoorNote = rep.outdoor_note ? ` (사유: ${rep.outdoor_note})` : '';
          const safetyText = rep.safety_nutrition ? ` / [안전·영양교육] ${rep.safety_nutrition}` : '';
          repSupportSafetyText.value = `<바깥놀이: ${outdoorStatus}${outdoorNote}> ${rep.outdoor_play}${safetyText}`;
        } else {
          repSupportSafetyText.value = rep?.support_safety || (rep?.support?.safety ? rep.support.safety.replace(/^○\s*바깥놀이\s*안전\s*관리:\s*/, '') : '짧은 산책 시 보행 안전선을 지키고 상호작용 간 안전거리를 유지하도록 지도함.');
        }
      }
    }

    // 0-B. 🧩 감지된 원아별 놀이 요약 (Human-in-the-Loop 교사 1초 눈 검수 목록) 채우기
    const indivObs = data.individual_observations;
    const individualObsCard = document.getElementById('individualObsCard');
    const individualObsList = document.getElementById('individualObsList');
    const individualObsCountBadge = document.getElementById('individualObsCountBadge');

    if (individualObsCard && individualObsList) {
      if (Array.isArray(indivObs) && indivObs.length > 0) {
        individualObsCard.style.display = 'block';
        if (individualObsCountBadge) individualObsCountBadge.textContent = `${indivObs.length}명 감지됨`;
        individualObsList.innerHTML = '';

        indivObs.forEach((item, idx) => {
          const itemEl = document.createElement('div');
          itemEl.className = 'individual-obs-item active';
          itemEl.id = `indiv-obs-item-${idx}`;

          const childName = item.child_name || `원아 ${idx + 1}`;
          const standardArea = item.standard_area || '신체운동';
          const activityName = item.activity || item.activity_name || state.activityArea || '놀이 활동';
          const summary = item.summary || item.observation_summary || '';

          itemEl.innerHTML = `<div class="indiv-obs-top-row" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;"><div class="indiv-obs-meta" style="display: flex; align-items: center; gap: 8px;"><label class="indiv-obs-check-label" style="display: flex; align-items: center; gap: 6px; cursor: pointer;"><input type="checkbox" class="indiv-obs-checkbox indiv-obs-check" checked data-idx="${idx}" data-child-name="${childName}" data-area="${standardArea}" data-standard-area="${standardArea}" data-activity="${activityName}" data-play-text="${summary.replace(/"/g, '&quot;')}"><span class="indiv-obs-name" style="font-weight: 700; color: #1E293B;">👶 ${childName}</span></label><div class="indiv-obs-badges" style="display: flex; gap: 4px;"><span class="indiv-obs-badge-area" style="font-size: 11px; background: #EEF2FF; color: #4F46E5; padding: 2px 6px; border-radius: 4px;">${standardArea}</span><span class="indiv-obs-badge-activity" style="font-size: 11px; background: #F1F5F9; color: #475569; padding: 2px 6px; border-radius: 4px;">${activityName}</span></div></div><span class="indiv-obs-status-tag" id="indiv-obs-status-${idx}" style="display: none; background: #DEF7EC; color: #03543F; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 9999px;">✓ 저장됨</span></div><div class="indiv-obs-input-row"><input type="text" class="indiv-obs-input" id="indiv-obs-input-${idx}" value="${summary.replace(/"/g, '&quot;')}" placeholder="원아의 관찰 요약 (1초 수정 가능)" data-original="${summary.replace(/"/g, '&quot;')}" style="width: 100%; padding: 6px 10px; font-size: 12.5px; border: 1px solid #CBD5E1; border-radius: 6px; background: #FFF;"></div>`;

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
    if (kn) {
      const kidsnoteTitle = document.getElementById('kidsnoteTitle');
      const kidsnoteContent = document.getElementById('kidsnoteContent');
      const kidsnoteTags = document.getElementById('kidsnoteTags');

      if (kidsnoteTitle) kidsnoteTitle.textContent = kn.title || '오늘의 알림장';
      if (kidsnoteContent) kidsnoteContent.value = kn.content || '';
      if (kidsnoteTags && Array.isArray(kn.tags)) {
        kidsnoteTags.innerHTML = '';
        kn.tags.forEach(t => {
          const span = document.createElement('span');
          span.className = 'tag-badge';
          span.textContent = t.startsWith('#') ? t : `#${t}`;
          kidsnoteTags.appendChild(span);
        });
      }
    }

    // 2. 월간 관찰기록부 (observation) 채우기
    const mob = data.monthly_observation || data.observation_log;
    if (mob) {
      const monthlyObsDocTitle = document.getElementById('monthlyObsDocTitle');
      const monthlyObsChildName = document.getElementById('monthlyObsChildName');
      const monthlyObsTeacherName = document.getElementById('monthlyObsTeacherName');
      const monthlyObsPeriod = document.getElementById('monthlyObsPeriod');

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

      const targetMonthStr = state.selectedDate ? `${state.selectedDate.slice(0, 7).replace('-', '년 ')}월` : '2026년 9월';
      const childDisplayName = state.selectedChild ? `${state.selectedChild.name} (${state.selectedChild.age || '만 2세'})` : '원아 (만 2세)';
      const teacherDisplayName = `${state.className || '소망반'} / ${state.teacherName || '담당교사'}`;

      if (monthlyObsDocTitle) monthlyObsDocTitle.textContent = mob?.title || `[${targetMonthStr}] 영유아 발달 관찰기록부`;
      if (monthlyObsChildName) monthlyObsChildName.textContent = childDisplayName;
      if (monthlyObsTeacherName) monthlyObsTeacherName.textContent = teacherDisplayName;
      if (monthlyObsPeriod) monthlyObsPeriod.textContent = `${targetMonthStr} (상순 1회 + 하순 1회 연속 관찰)`;

      // 1차 관찰 바인딩
      const playObs = mob?.play_obs || mob?.obs_1 || mob || {};
      const obs1Date = playObs.date || state.selectedDate || '2026-09-08';
      const obs1Area = playObs.area || (mob?.play_obs ? '놀이' : (obs.standard_area || '의사소통'));
      if (obs1DateMeta) obs1DateMeta.textContent = `${obs1Date} (${getDayOfWeekName(obs1Date)})`;
      if (obs1AreaBadge) obs1AreaBadge.textContent = obs1Area;
      if (obs1ActivityTitle) obs1ActivityTitle.textContent = playObs.activity_title || playObs.activity_name || obs.activity_name || state.activityArea || '놀이 활동';
      if (obs1BehaviorText) obs1BehaviorText.textContent = playObs.behavior || obs.behavior || '';
      if (obs1SupportText) obs1SupportText.textContent = playObs.teacher_support || obs.evaluation || '';

      // 2차 관찰 바인딩
      const dailyObs = mob?.daily_obs || mob?.obs_2 || {};
      const obs2Date = dailyObs.date || '2026-09-22';
      const obs2Area = dailyObs.area || (mob?.daily_obs ? '일상생활' : '사회관계');
      if (obs2DateMeta) obs2DateMeta.textContent = `${obs2Date} (${getDayOfWeekName(obs2Date)})`;
      if (obs2AreaBadge) obs2AreaBadge.textContent = obs2Area;
      if (obs2ActivityTitle) obs2ActivityTitle.textContent = dailyObs.activity_title || state.activityArea || '일상생활';
      if (obs2BehaviorText) obs2BehaviorText.textContent = dailyObs.behavior || (obs.behavior ? `1차 지도 이후 ${obs.behavior}` : '');
      if (obs2SupportText) obs2SupportText.textContent = dailyObs.teacher_support || obs.evaluation || '';
      if (obs2GrowthText) obs2GrowthText.textContent = dailyObs.growth_continuity || mob?.growth_continuity || '1차 상호작용 지원 이후 상황을 수용하고 긍정적으로 반응하는 발전적 행동 변화를 보임.';

      // 월말 종합 총평 바인딩
      if (monthlySummaryDevText) {
        monthlySummaryDevText.textContent = mob?.monthly_summary?.development_summary || `${obs1Area} 및 ${obs2Area} 영역에서 또래 및 교사와의 상호작용에 적극적으로 참여하며 전반적인 발달 과업을 원활히 수행함.`;
      }
      if (monthlySummaryPlanText) {
        monthlySummaryPlanText.textContent = mob?.monthly_summary?.next_month_plan || '다음 달에는 유아의 자율적 탐색을 격려하고 성공 경험을 누적할 수 있도록 칭찬과 비계를 지속 지원할 계획임.';
      }
    }

    // 3. 한그루 발달평가 (hangroo_eval) 채우기
    const he = data.hangroo_eval;
    if (he || (state.selectedFormats && state.selectedFormats.includes('hangroo_eval'))) {
      if (tabHangrooEval) tabHangrooEval.style.display = 'inline-flex';
      const hangrooEvalDocTitle = document.getElementById('hangrooEvalDocTitle');
      const hangrooEvalSummaryText = document.getElementById('hangrooEvalSummaryText');
      const hangrooEvalSupportText = document.getElementById('hangrooEvalSupportText');

      const evalChildName = state.selectedChild ? `${state.selectedChild.name} (${state.selectedChild.age || '만 2세'})` : '원아 (만 2세)';
      if (hangrooEvalDocTitle) hangrooEvalDocTitle.textContent = he?.title || `${evalChildName} 1학기 발달평가서 (한그루 ERP 규격)`;
      if (hangrooEvalSummaryText) {
        hangrooEvalSummaryText.value = he?.development_summary || (mob?.monthly_summary?.development_summary ? `${mob.monthly_summary.development_summary}\n\n신체운동 및 기본생활 영역에서 능동적인 태도를 보이며 고른 발달을 나타냄.` : '');
      }
      if (hangrooEvalSupportText) {
        hangrooEvalSupportText.value = he?.support_plan || (mob?.monthly_summary?.next_month_plan ? `${mob.monthly_summary.next_month_plan}\n\n또래 간 긍정적인 상호작용과 언어 표현 확장을 돕기 위한 모델링 및 환경 구성을 지속 지원함.` : '');
      }
    }

    // 4. 일일 보육일지 채우기
    if (dc) {
      const dailyPlaySummary = document.getElementById('dailyPlaySummary');
      const dailyPlayEval = document.getElementById('dailyPlayEval');
      const dailyNextPlan = document.getElementById('dailyNextPlan');
      if (dailyPlaySummary) dailyPlaySummary.value = dc.play_summary || '';
      if (dailyPlayEval) dailyPlayEval.value = dc.play_evaluation || '';
      if (dailyNextPlan) dailyNextPlan.value = dc.next_support_plan || '';
    }

    // 5. 학부모 상담일지 채우기
    const pc = data.parent_counseling;
    if (pc) {
      const counselRoutine = document.getElementById('counselRoutine');
      const counselSocial = document.getElementById('counselSocial');
      const counselDev = document.getElementById('counselDev');
      const counselOpinion = document.getElementById('counselOpinion');
      if (counselRoutine) counselRoutine.value = pc.daily_routine || '';
      if (counselSocial) counselSocial.value = pc.social_relations || '';
      if (counselDev) counselDev.value = pc.development_feature || '';
      if (counselOpinion) counselOpinion.value = pc.counseling_opinion || '';
    }

    // 6. 놀이 지원안 채우기
    const ps = data.play_support_plan || data.play_support;
    if (ps) {
      const playExtension = document.getElementById('playExtension');
      const playMaterials = document.getElementById('playMaterials');
      const playTips = document.getElementById('playTips');
      if (playExtension) playExtension.value = ps.extension_idea || ps.play_theme || '';
      if (playMaterials) playMaterials.value = ps.recommended_materials || ps.interest_cue || '';
      if (playTips) playTips.value = ps.interaction_tips || ps.teacher_support || '';
    }

    // 7. 과거 기록 출처 (Citation) 표기
    const cit = data.citation;
    const citationBox = document.getElementById('citationBox');
    const citationSummaryText = document.getElementById('citationSummaryText');
    if (citationBox) {
      if (cit && cit.has_citation && cit.summary) {
        citationBox.style.display = 'flex';
        if (citationSummaryText) citationSummaryText.textContent = cit.summary;
      } else {
        citationBox.style.display = 'none';
      }
    }

    // 8. 결과 탭 바 표시 최적화
    const resultTabBtns = document.querySelectorAll('.result-tab-btn');
    const validFormats = (state.selectedFormats && state.selectedFormats.length > 0)
      ? state.selectedFormats
      : ['class_daily_report', 'kidsnote'];

    resultTabBtns.forEach(b => {
      const tab = b.dataset.tab;
      b.style.display = 'inline-flex';
      if (validFormats.includes(tab)) {
        b.style.opacity = '1';
        b.style.fontWeight = '700';
      } else {
        b.style.opacity = '0.7';
        b.style.fontWeight = '500';
      }
    });

    // 기본 활성화 탭 결정
    let defaultTab = 'kidsnote';
    if (state.selectedChild?.isClassAll && validFormats.includes('class_daily_report')) {
      defaultTab = 'class_daily_report';
    } else if (validFormats.includes('kidsnote')) {
      defaultTab = 'kidsnote';
    } else {
      defaultTab = validFormats[0] || 'kidsnote';
    }

    switchResultTab(defaultTab);

    // 결과 섹션 표시 및 스크롤
    const resultsSection = document.getElementById('resultsSection');
    if (resultsSection) {
      resultsSection.style.display = 'flex';
      resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // 임시보관 저장 연동
    if (typeof window.saveAutoDraft === 'function') {
      window.saveAutoDraft();
    }
  }

  // ============================================================================
  // 4. AI 생성 파이프라인 (AI Generator)
  // ============================================================================
  async function handleGenerate() {
    const state = window.state || {};
    const rawMemoInput = document.getElementById('rawMemoInput');
    const memoText = rawMemoInput ? rawMemoInput.value.trim() : '';

    if (!state.selectedChild) {
      showToast('⚠️ 먼저 원아나 학급을 선택해주세요.');
      return;
    }
    if (!memoText && (!state.photos || state.photos.length === 0)) {
      showToast('⚠️ 놀이 관찰 메모나 사진을 입력해주세요.');
      if (rawMemoInput) rawMemoInput.focus();
      return;
    }

    // 로딩 UI 시작
    const generateBtn = document.getElementById('generateBtn');
    const loadingBox = document.getElementById('loadingBox');
    const resultsSection = document.getElementById('resultsSection');
    const loadingStepText = document.getElementById('loadingStepText');

    if (generateBtn) generateBtn.disabled = true;
    if (loadingBox) loadingBox.style.display = 'block';
    if (resultsSection) resultsSection.style.display = 'none';

    const abortController = new AbortController();
    state.currentAbortController = abortController;
    state.isGenerationAborted = false;

    // 로딩 스텝 애니메이션
    const steps = [
      '🛡️ 원아 실명 마스킹 가드 적용 중...',
      '🤖 Gemini 3.8 Flash 멀티모달 보육 맥락 분석 중...',
      '📌 표준보육과정 연계 및 성장점 도출 중...',
      '✨ 맞춤 알림장 및 보육일지 완성 중...'
    ];
    let stepIdx = 0;
    if (loadingStepText) loadingStepText.textContent = steps[0];
    const stepTimer = setInterval(() => {
      stepIdx = (stepIdx + 1) % steps.length;
      if (loadingStepText) loadingStepText.textContent = steps[stepIdx];
    }, 1200);

    try {
      const payload = {
        childId: state.selectedChild.id, childName: state.selectedChild.name, childAge: state.selectedChild.age,
        childTraits: state.selectedChild.traits || '', parentStyle: state.selectedChild.parentStyle || '', allergies: state.selectedChild.allergies || '',
        rawMemo: memoText, images: state.photos || [], mode: state.mode || 'all_suite',
        activityArea: state.activityArea || '자유놀이', teacherStyle: state.teacherStyle || '다정하고 꼼꼼한 선생님',
        className: state.className || '사랑반', teacherName: state.teacherName || '공가영 선생님', persona: state.persona,
        selectedFormats: state.selectedFormats || ['class_daily_report', 'kidsnote']
      };

      let resultData = null;

      // 1. 브라우저 클라이언트 직통 생성 시도
      if (window.GeminiClient?.generate) {
        try {
          const clientRes = await window.GeminiClient.generate(payload, { signal: abortController.signal });
          if (clientRes?.success) resultData = clientRes.data;
        } catch (e) {
          if (e.name === 'AbortError' || state.isGenerationAborted) throw e;
          console.warn('클라이언트 직통 실패, 서버 폴백 전환:', e);
        }
      }

      // 2. 서버 폴백
      if (!resultData && !state.isGenerationAborted) {
        const res = await fetch('/api/generate', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          signal: abortController.signal, body: JSON.stringify(payload)
        });
        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          throw new Error(errJson.error || '생성 실패');
        }
        const json = await res.json();
        resultData = json.data;
      }

      state.lastResult = resultData;
      state.originalResult = JSON.parse(JSON.stringify(resultData));
      renderResults(resultData);
      showToast('🎉 선택한 서식이 모두 완성되었습니다!');
    } catch (err) {
      if (err.name === 'AbortError' || state.isGenerationAborted) {
        showToast('⏹️ 생성이 안전하게 중단되었습니다.');
      } else {
        showToast(`❌ 생성 오류: ${err.message}`);
      }
    } finally {
      clearInterval(stepTimer);
      if (loadingBox) loadingBox.style.display = 'none';
      if (generateBtn) generateBtn.disabled = false;
      state.currentAbortController = null;
    }
  }

  // ============================================================================
  // 5. 내보내기/복사/저장 이벤트 리스너 바인딩 (Setup Export Listeners)
  // ============================================================================
  function setupExportListeners() {
    // 한그루 보육일지 복사
    const copyHangrooReportBtn = document.getElementById('copyHangrooReportBtn');
    if (copyHangrooReportBtn) {
      copyHangrooReportBtn.onclick = () => {
        const title = document.getElementById('repDocTitle')?.textContent || '보육일지';
        const date = document.getElementById('repHdrDate')?.textContent || '';
        const theme = document.getElementById('repHdrTheme')?.textContent || '';
        const ref = document.getElementById('repReflectionText')?.value || '';
        const env = document.getElementById('repSupportEnvText')?.value || '';
        const safe = document.getElementById('repSupportSafetyText')?.value || '';

        const text = `[${title}]\n일시: ${date}\n놀이주제: ${theme}\n\n[놀이 관찰 및 반성평가]\n${ref}\n\n[환경 지원]\n${env}\n\n[안전 및 기본생활 지도]\n${safe}`;
        copyTextToClipboard(text, '📋 보육일지 텍스트가 복사되었습니다!');
      };
    }

    // 키즈노트 알림장 복사 & 공유
    const copyKidsnoteBtn = document.getElementById('copyKidsnoteBtn');
    const shareKidsnoteBtn = document.getElementById('shareKidsnoteBtn');

    if (copyKidsnoteBtn) {
      copyKidsnoteBtn.onclick = () => {
        const title = document.getElementById('kidsnoteTitle')?.textContent || '알림장';
        const content = document.getElementById('kidsnoteContent')?.value || '';
        const text = `[${title}]\n\n${content}`;
        copyTextToClipboard(text, '📋 키즈노트 알림장이 복사되었습니다!');
      };
    }

    if (shareKidsnoteBtn) {
      shareKidsnoteBtn.onclick = async () => {
        const title = document.getElementById('kidsnoteTitle')?.textContent || '알림장';
        const content = document.getElementById('kidsnoteContent')?.value || '';
        const text = `[${title}]\n\n${content}`;
        if (navigator.share) {
          try {
            await navigator.share({ title, text });
            showToast('공유 완료! 키즈노트 앱에 바로 붙여넣으세요.');
            return;
          } catch (e) {
            if (e.name !== 'AbortError') console.warn('Share error:', e);
          }
        }
        copyTextToClipboard(text, '📋 알림장이 복사되었습니다. 키즈노트 앱에 붙여넣으세요!');
      };
    }

    // 결과 탭 버튼 리스너 바인딩
    const resultTabBtns = document.querySelectorAll('.result-tab-btn');
    resultTabBtns.forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        const tab = btn.dataset.tab;
        switchResultTab(tab);
      };
    });

    // 1초 다듬기 박스 이벤트 바인딩
    const kidsnoteRefineBox = document.getElementById('kidsnoteRefineBox');
    const customRefineBtn = document.getElementById('customRefineBtn');
    const customRefineInput = document.getElementById('customRefineInput');
    const resetKidsnoteBtn = document.getElementById('resetKidsnoteBtn');

    if (kidsnoteRefineBox) {
      const refinePrompts = {
        warmer: '아이의 표정과 감정, 교사의 따뜻한 눈맞춤을 더 다정하고 포근한 어조로 보강해줘',
        concise: '문맥의 핵심 놀이 몰입 장면 위주로 군더더기 없이 3~4줄로 명료하고 간결하게 다듬어줘',
        growth: '소근육 조작, 또래와의 언어적 상호작용 등 발달적 성장 관점을 1~2줄 더 돋보이게 보강해줘',
        safe: '오늘 안전하게 놀이하고 친구와 다투지 않고 양보하며 잘 지냈다는 안심 멘트를 자연스럽게 보강해줘',
        meal: '본문 끝부분에 오늘 점심 식사 시간에 스스로 숟가락으로 골고루 맛있게 잘 먹었다는 기특한 식습관 칭찬 1줄을 자연스럽게 덧붙여줘'
      };

      kidsnoteRefineBox.querySelectorAll('.refine-chip[data-refine]').forEach(chip => {
        chip.onclick = () => {
          const type = chip.dataset.refine;
          const prompt = refinePrompts[type];
          if (prompt) handleRefine(prompt);
        };
      });

      if (resetKidsnoteBtn) {
        resetKidsnoteBtn.onclick = handleResetOriginal;
      }

      if (customRefineBtn && customRefineInput) {
        customRefineBtn.onclick = () => {
          const val = customRefineInput.value.trim();
          if (val) {
            handleRefine(val);
            customRefineInput.value = '';
          }
        };
        customRefineInput.onkeydown = (e) => {
          if (e.key === 'Enter') {
            const val = customRefineInput.value.trim();
            if (val) {
              handleRefine(val);
              customRefineInput.value = '';
            }
          }
        };
      }
    }

    // 노션 저장 버튼 연동
    const saveClassReportNotionBtn = document.getElementById('saveClassReportNotionBtn');
    if (saveClassReportNotionBtn) saveClassReportNotionBtn.onclick = () => window.handleSaveClassReportNotion?.();
    const saveHangrooEvalNotionBtn = document.getElementById('saveHangrooEvalNotionBtn');
    if (saveHangrooEvalNotionBtn) saveHangrooEvalNotionBtn.onclick = () => window.handleSaveHangrooEvalNotion?.();
    const btnSaveIndividualObs = document.getElementById('btnSaveIndividualObs');
    if (btnSaveIndividualObs) btnSaveIndividualObs.onclick = () => window.DaycareNotion?.handleSaveIndividualObs?.();
    const saveNotionBtn = document.getElementById('saveNotionBtn');
    if (saveNotionBtn) saveNotionBtn.onclick = () => window.DaycareNotion?.handleSaveNotion?.();
    const saveAllUnifiedNotionBtn = document.getElementById('saveAllUnifiedNotionBtn');
    if (saveAllUnifiedNotionBtn) saveAllUnifiedNotionBtn.onclick = () => window.DaycareNotion?.handleSaveNotion?.();
    const saveKidsnoteNotionBtn = document.getElementById('saveKidsnoteNotionBtn');
    if (saveKidsnoteNotionBtn) saveKidsnoteNotionBtn.onclick = () => window.DaycareNotion?.handleSaveNotion?.();
    const saveCounselingNotionBtn = document.getElementById('saveCounselingNotionBtn');
    if (saveCounselingNotionBtn) saveCounselingNotionBtn.onclick = () => window.DaycareNotion?.handleSaveNotion?.();
    const savePlaySupportNotionBtn = document.getElementById('savePlaySupportNotionBtn');
    if (savePlaySupportNotionBtn) savePlaySupportNotionBtn.onclick = () => window.DaycareNotion?.handleSaveNotion?.();

    // 서식 복사 및 인쇄 버튼 연동
    const copyObservationBtn = document.getElementById('copyObservationBtn');
    if (copyObservationBtn) copyObservationBtn.onclick = () => {
      const o = state.lastResult?.observation;
      copyTextToClipboard(o ? `[관찰일지 - ${o.standard_area || '신체운동'}]\n활동명: ${o.activity_name || ''}\n\n[관찰내용]\n${o.behavior || ''}\n\n[평가 및 지원]\n${o.evaluation || ''}` : '', '📋 관찰일지가 복사되었습니다!');
    };

    const copyHangrooObsBtn = document.getElementById('copyHangrooObsBtn');
    if (copyHangrooObsBtn) copyHangrooObsBtn.onclick = () => {
      const mob = state.lastResult?.monthly_observation, p = mob?.play_obs || {}, d = mob?.daily_obs || {};
      copyTextToClipboard(`[한그루 ERP 월간 관찰일지]\n■ 놀이: ${p.activity_title || ''}\n${p.behavior || ''}\n\n■ 일상생활: ${d.activity_title || ''}\n${d.behavior || ''}`, '📋 한그루 ERP 관찰일지가 복사되었습니다!');
    };

    const copyHangrooEvalBtn = document.getElementById('copyHangrooEvalBtn');
    if (copyHangrooEvalBtn) copyHangrooEvalBtn.onclick = () => {
      const ev = state.lastResult?.hangroo_eval;
      copyTextToClipboard(ev ? `[한그루 ERP 발달평가]\n■ 종합평가:\n${ev.development_summary || ''}\n\n■ 지원계획:\n${ev.support_plan || ''}` : '', '📋 발달평가서가 복사되었습니다!');
    };

    const copyHangrooEvalHwpBtn = document.getElementById('copyHangrooEvalHwpBtn');
    if (copyHangrooEvalHwpBtn) copyHangrooEvalHwpBtn.onclick = () => copyHwpTableToClipboard({ tableEl: document.getElementById('officialHangrooEvalSheet'), successMsg: '🎉 한글(HWP) 발달평가 표 복사 완료!' });

    const copyHwpTableBtn = document.getElementById('copyHwpTableBtn');
    if (copyHwpTableBtn) copyHwpTableBtn.onclick = () => copyHwpTableToClipboard({ tableEl: document.getElementById('officialReportSheet'), successMsg: '🎉 한글(HWP) 보육일지 표 복사 완료!' });

    const copyMonthlyObsHwpBtn = document.getElementById('copyMonthlyObsHwpBtn');
    if (copyMonthlyObsHwpBtn) copyMonthlyObsHwpBtn.onclick = () => copyHwpTableToClipboard({ tableEl: document.getElementById('officialObsSheet'), successMsg: '🎉 한글(HWP) 관찰기록부 표 복사 완료!' });

    const copyFullReportTextBtn = document.getElementById('copyFullReportTextBtn');
    if (copyFullReportTextBtn) copyFullReportTextBtn.onclick = () => copyTextToClipboard(document.getElementById('officialReportSheet')?.innerText || '', '📋 보육일지 전체 텍스트가 복사되었습니다!');

    const copyCounselingBtn = document.getElementById('copyCounselingBtn');
    if (copyCounselingBtn) copyCounselingBtn.onclick = () => {
      const pc = state.lastResult?.parent_counseling;
      copyTextToClipboard(pc ? `[학부모 상담일지]\n■ 생활습관: ${pc.daily_routine || ''}\n■ 대인관계: ${pc.social_relations || ''}\n■ 발달특징: ${pc.development_feature || ''}\n■ 종합의견: ${pc.counseling_opinion || ''}` : '', '📋 상담일지가 복사되었습니다!');
    };

    const copyDailyCareBtn = document.getElementById('copyDailyCareBtn');
    if (copyDailyCareBtn) copyDailyCareBtn.onclick = () => {
      const dc = state.lastResult?.daily_care;
      copyTextToClipboard(dc ? `[일일 보육일지]\n놀이활동: ${dc.play_activity || ''}\n상호작용: ${dc.interaction || ''}\n발달평가: ${dc.play_evaluation || ''}` : '', '📋 일일 보육일지가 복사되었습니다!');
    };

    const copyPlaySupportBtn = document.getElementById('copyPlaySupportBtn');
    if (copyPlaySupportBtn) copyPlaySupportBtn.onclick = () => {
      const ps = state.lastResult?.play_support_plan || state.lastResult?.play_support;
      copyTextToClipboard(ps ? `[놀이지원안]\n확장아이디어: ${ps.extension_idea || ps.play_theme || ''}\n추천교구: ${ps.recommended_materials || ps.interest_cue || ''}\n교사지원: ${ps.interaction_tips || ps.teacher_support || ''}` : '', '📋 놀이지원안이 복사되었습니다!');
    };

    const printReportBtn = document.getElementById('printReportBtn');
    if (printReportBtn) printReportBtn.onclick = () => window.print();

    const printMonthlyObsBtn = document.getElementById('printMonthlyObsBtn');
    if (printMonthlyObsBtn) printMonthlyObsBtn.onclick = () => window.print();

    const btnAutoDistributeDates = document.getElementById('btnAutoDistributeDates');
    if (btnAutoDistributeDates) btnAutoDistributeDates.onclick = () => {
      const m = document.getElementById('monthlyObsTargetMonth')?.value || '2026-09';
      const d1 = document.getElementById('monthlyObsDate1'), d2 = document.getElementById('monthlyObsDate2');
      if (d1) d1.value = `${m}-08`;
      if (d2) d2.value = `${m}-22`;
      showToast('📅 1차(상순) 및 2차(하순) 관찰일자가 자동 설정되었습니다.');
    };
  }

  // ============================================================================
  // 5-B. 1초 다듬기 (Quick Refine) 및 원본 복원
  // ============================================================================
  async function handleRefine(instruction) {
    const state = window.state || {};
    const kidsnoteTitle = document.getElementById('kidsnoteTitle');
    const kidsnoteContent = document.getElementById('kidsnoteContent');
    const kidsnoteRefineBox = document.getElementById('kidsnoteRefineBox');
    const refiningSpinner = document.getElementById('refiningSpinner');

    if (!instruction || !instruction.trim()) return;
    if (!kidsnoteContent || !kidsnoteContent.value.trim()) {
      showToast('다듬을 알림장 내용이 없습니다.');
      return;
    }

    const currentTitle = kidsnoteTitle ? kidsnoteTitle.textContent : '';
    const currentContent = kidsnoteContent.value;
    const childName = state.selectedChild ? state.selectedChild.name : '김민서';

    if (refiningSpinner) refiningSpinner.style.display = 'inline';
    const chips = kidsnoteRefineBox ? kidsnoteRefineBox.querySelectorAll('.refine-chip, .refine-custom-btn') : [];
    chips.forEach(b => { b.disabled = true; });

    try {
      if (window.GeminiClient && typeof window.GeminiClient.refine === 'function') {
        const refined = await window.GeminiClient.refine({
          currentTitle,
          currentContent,
          instruction,
          childName,
          persona: state.persona
        });
        if (kidsnoteTitle && refined.title) kidsnoteTitle.textContent = refined.title;
        if (kidsnoteContent && refined.content) kidsnoteContent.value = refined.content;
        showToast('✨ 요청하신 내용으로 자연스럽게 다듬어졌습니다!');
      } else {
        throw new Error('다듬기 엔진(GeminiClient)이 준비되지 않았습니다.');
      }
    } catch (err) {
      console.error('Refine Error:', err);
      showToast(`다듬기 오류: ${err.message}`);
    } finally {
      if (refiningSpinner) refiningSpinner.style.display = 'none';
      chips.forEach(b => { b.disabled = false; });
    }
  }

  function handleResetOriginal() {
    const state = window.state || {};
    const kidsnoteTitle = document.getElementById('kidsnoteTitle');
    const kidsnoteContent = document.getElementById('kidsnoteContent');

    if (!state.originalResult || !state.originalResult.kidsnote) {
      showToast('복원할 최초 생성본이 없습니다.');
      return;
    }
    if (kidsnoteTitle) kidsnoteTitle.textContent = state.originalResult.kidsnote.title || '오늘의 알림장';
    if (kidsnoteContent) kidsnoteContent.value = state.originalResult.kidsnote.content || '';
    showToast('↺ 처음 생성된 원본 초안으로 복원되었습니다.');
  }

  // ============================================================================
  // 6. 글로벌 노출 및 파사드 유지 (Facade)
  // ============================================================================
  window.AiEngine = {
    handleGenerate,
    renderResults,
    switchResultTab,
    setupExportListeners,
    copyTextToClipboard,
    copyHwpTableToClipboard,
    handleRefine,
    handleResetOriginal
  };

  // 하위 호환 단독 전역 함수 바인딩
  window.handleGenerate = handleGenerate;
  window.renderResults = renderResults;
  window.switchResultTab = switchResultTab;
  window.setupExportListeners = setupExportListeners;
  window.copyTextToClipboard = copyTextToClipboard;
  window.copyHwpTableToClipboard = copyHwpTableToClipboard;
  window.handleRefine = handleRefine;
  window.handleResetOriginal = handleResetOriginal;
  window.ResultsRenderer = window.AiEngine;
  window.ExportFormatters = window.AiEngine;
  window.AiGenerator = window.AiEngine;
})();

