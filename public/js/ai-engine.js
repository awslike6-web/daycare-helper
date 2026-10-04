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
  const safeHTML = (...args) => window.DaycareHTML(...args);
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
    const reviewed = tableEl.cloneNode(true);
    reviewed.querySelectorAll('textarea, input').forEach((node, index) => {
      const original = tableEl.querySelectorAll('textarea, input')[index]; const text = document.createElement('div');
      text.textContent = original.value; text.style.cssText = 'white-space:pre-wrap;font:inherit;line-height:1.6'; node.replaceWith(text);
    });
    reviewed.querySelectorAll('[contenteditable]').forEach(node => node.removeAttribute('contenteditable'));
    tableEl = reviewed;
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
                  observation: `[관찰 내용] ${kn.content ? kn.content.slice(0, 180) + '...' : '관찰 기록 부족'}`,
                  learning_content: `[배움 읽기: ${obs.standard_area || '신체운동'}] - ${obs.evaluation || '해당 영역의 관찰 기록 부족'}`
                }
              ];

        activities.forEach((act, index) => {
          const tr = document.createElement('tr'); tr.dataset.reviewActivity = index;
          tr.innerHTML = safeHTML`<td class="rep-td" style="padding: 8px; border: 1px solid #CBD5E1; vertical-align: top;"><div style="font-weight: 700; color: #1E293B; margin-bottom: 4px;">${act.photo_ref || '[사진 참조]'} ${act.activity_title || ''}</div><div contenteditable="true" role="textbox" aria-label="놀이 관찰 문장" data-review-field="observation" style="font-size: 12px; line-height: 1.5; color: #334155;">${act.observation || ''}</div></td><td class="rep-td" contenteditable="true" role="textbox" aria-label="배움 읽기 문장" data-review-field="learning_content" style="padding: 8px; border: 1px solid #CBD5E1; font-size: 12px; line-height: 1.5; color: #1E293B; vertical-align: top;">${act.learning_content || ''}</td>`;
          reportCurriculumTbody.appendChild(tr);
        });
      }

      if (repReflectionText) {
        repReflectionText.textContent = rep?.reflection ? rep.reflection.replace(/^●\s*성찰:\s*/, '') : (rep?.weekly_evaluation || dc.play_evaluation || '');
      }
      if (repSupportEnvText) {
        repSupportEnvText.textContent = rep?.support?.environment ? rep.support.environment.replace(/^○\s*환경\s*지원:\s*/, '') : (rep?.support_environment || dc.next_support_plan || '');
      }
      if (repSupportSafetyText) {
        if (rep?.reviewed_safety_text !== undefined) { repSupportSafetyText.textContent = rep.reviewed_safety_text; } else if (rep?.outdoor_play) {
          const outdoorStatus = rep.outdoor_check || '진행(O)';
          const outdoorNote = rep.outdoor_note ? ` (사유: ${rep.outdoor_note})` : '';
          const safetyText = rep.safety_nutrition ? ` / [안전·영양교육] ${rep.safety_nutrition}` : '';
          repSupportSafetyText.textContent = `<바깥놀이: ${outdoorStatus}${outdoorNote}> ${rep.outdoor_play}${safetyText}`;
        } else {
          repSupportSafetyText.textContent = rep?.support_safety || (rep?.support?.safety ? rep.support.safety.replace(/^○\s*바깥놀이\s*안전\s*관리:\s*/, '') : '');
        }
      }
    }

    // 원아 ID·원문 근거·교사 확인 화면은 공통 연결 모듈이 담당한다.
    window.DaycareChildLinks?.renderIndividual(data);

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

      const targetMonth = mob.targetMonth || data.citation?.to?.slice(0, 7) || state.selectedDate?.slice(0, 7);
      const targetMonthStr = targetMonth ? `${targetMonth.replace('-', '년 ')}월` : '작성 월';
      const childDisplayName = state.selectedChild ? `${state.selectedChild.name} (${state.selectedChild.age || '만 2세'})` : '원아 (만 2세)';
      const teacherDisplayName = `${state.className || '소망반'} / ${state.teacherName || '담당교사'}`;

      if (monthlyObsDocTitle) monthlyObsDocTitle.textContent = mob?.title || `[${targetMonthStr}] 영유아 발달 관찰기록부`;
      if (monthlyObsChildName) monthlyObsChildName.textContent = childDisplayName;
      if (monthlyObsTeacherName) monthlyObsTeacherName.textContent = teacherDisplayName;
      if (monthlyObsPeriod) monthlyObsPeriod.textContent = `${targetMonthStr} · 실제 관찰일 기준`;

      // 1차 관찰 바인딩
      const playObs = mob?.play_obs || mob?.obs_1 || mob || {};
      const obs1Date = playObs.date || '';
      const obs1Area = playObs.area || (mob?.play_obs ? '놀이' : (obs.standard_area || '의사소통'));
      if (obs1DateMeta) obs1DateMeta.textContent = obs1Date ? `${obs1Date} (${getDayOfWeekName(obs1Date)})` : '관찰일 확인 필요';
      if (obs1AreaBadge) obs1AreaBadge.textContent = obs1Area;
      if (obs1ActivityTitle) obs1ActivityTitle.textContent = playObs.activity_title || playObs.activity_name || obs.activity_name || state.activityArea || '놀이 활동';
      if (obs1BehaviorText) obs1BehaviorText.textContent = playObs.behavior || obs.behavior || '';
      if (obs1SupportText) obs1SupportText.textContent = playObs.teacher_support || obs.evaluation || '';

      // 2차 관찰 바인딩
      const dailyObs = mob?.daily_obs || mob?.obs_2 || {};
      const obs2Date = dailyObs.date || '';
      const obs2Area = dailyObs.area || (mob?.daily_obs ? '일상생활' : '사회관계');
      if (obs2DateMeta) obs2DateMeta.textContent = obs2Date ? `${obs2Date} (${getDayOfWeekName(obs2Date)})` : '관찰일 확인 필요';
      if (obs2AreaBadge) obs2AreaBadge.textContent = obs2Area;
      if (obs2ActivityTitle) obs2ActivityTitle.textContent = dailyObs.activity_title || state.activityArea || '일상생활';
      if (obs2BehaviorText) obs2BehaviorText.textContent = dailyObs.behavior || '해당 시점의 관찰 기록 부족';
      if (obs2SupportText) obs2SupportText.textContent = dailyObs.teacher_support || obs.evaluation || '';
      if (obs2GrowthText) obs2GrowthText.textContent = dailyObs.growth_continuity || mob?.growth_continuity || '비교할 실제 관찰 기록 부족';

      // 월말 종합 총평 바인딩
      if (monthlySummaryDevText) {
        monthlySummaryDevText.textContent = mob?.monthly_summary?.development_summary || '종합할 관찰 기록 부족';
      }
      if (monthlySummaryPlanText) {
        monthlySummaryPlanText.textContent = mob?.monthly_summary?.next_month_plan || '';
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
      const period = data.citation?.has_citation ? ` · ${data.citation.from || '선택 기록'} ~ ${data.citation.to}` : '';
      if (hangrooEvalDocTitle) hangrooEvalDocTitle.textContent = (he?.title || `${evalChildName} 발달평가서`) + period;
      if (hangrooEvalSummaryText) {
        hangrooEvalSummaryText.value = he?.development_summary || (mob?.monthly_summary?.development_summary ? mob.monthly_summary.development_summary : '');
      }
      if (hangrooEvalSupportText) {
        hangrooEvalSupportText.value = he?.support_plan || (mob?.monthly_summary?.next_month_plan ? mob.monthly_summary.next_month_plan : '');
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
    const validFormats = window.DaycareRecords.availableFormats(data).filter(f => !state.selectedFormats?.length || state.selectedFormats.includes(f));

    resultTabBtns.forEach(b => {
      const tab = b.dataset.tab;
      b.style.display = validFormats.includes(tab) ? 'inline-flex' : 'none';
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
    window.DaycareRecords.saveStatus('아직 노션에 저장되지 않았습니다. 검수 확인 후 저장을 눌러 주세요.');

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
    if (state.savingNotion || state.savingIndividual || state.currentAbortController) return;

    if (!state.selectedChild) {
      showToast('⚠️ 먼저 원아나 학급을 선택해주세요.');
      return;
    }
    const historyOnly = !memoText && !state.photos?.length;
    const formats = state.selectedFormats || ['class_daily_report', 'kidsnote'];
    if (historyOnly && (!state.evidenceIds?.length || !formats.length || formats.some(f => !['observation', 'hangroo_eval', 'counseling'].includes(f)))) {
      showToast('⚠️ 오늘 메모 없이 작성하려면 과거 기록과 관찰·발달평가·상담 준비 서식만 선택해 주세요.');
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

    await window.DaycareRecords.save();
    const stepTimer = window.DaycareRecords.generationProgress();

    try {
      const payload = {
        childId: state.selectedChild.id, childName: state.selectedChild.name, childAge: state.selectedChild.age,
        childTraits: state.selectedChild.traits || '', parentStyle: state.selectedChild.parentStyle || '', allergies: state.selectedChild.allergies || '',
        rawMemo: memoText, images: state.photos || [], mode: state.mode || 'all_suite',
        activityArea: state.activityArea || '자유놀이', teacherStyle: state.teacherStyle || '다정하고 꼼꼼한 선생님',
        className: state.className || '사랑반', teacherName: state.teacherName || '공가영 선생님', persona: state.persona,
        selectedFormats: state.selectedFormats || ['class_daily_report', 'kidsnote'], date: state.selectedDate,
        evidenceIds: [...(state.evidenceIds || [])], evidenceFrom: state.evidenceFrom, evidenceTo: state.evidenceTo, photoConsent: !!document.getElementById('photoConsentCheck')?.checked, monthlyObsOptions: state.selectedFormats?.includes('observation') ? window.DaycareRecords.monthlyOptions() : null
      };

      let resultData = null;

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

      if (payload.childId !== state.selectedChild?.id || payload.date !== state.selectedDate || !state.authenticated) throw new Error('대상이 바뀌어 이전 생성 결과를 표시하지 않았습니다.');
      if (payload.evidenceFrom !== state.evidenceFrom || payload.evidenceTo !== state.evidenceTo || JSON.stringify(payload.evidenceIds) !== JSON.stringify(state.evidenceIds || [])) throw new Error('참조 기간이나 선택 기록이 바뀌었습니다. 현재 근거로 다시 생성해 주세요.');
      if (document.getElementById('reviewConfirmed')) document.getElementById('reviewConfirmed').checked = false;
      state.lastResult = resultData;
      state.originalResult = JSON.parse(JSON.stringify(resultData));
      renderResults(resultData);
      window.DaycareRecords.generationStatus('선택한 서식 생성 완료 · 검수 후 노션 저장을 눌러 주세요.', 'success');
      showToast('선택한 서식이 완성되었습니다. 검수 후 저장해 주세요.');
    } catch (err) {
      window.DaycareRecords.generationStatus(err.name === 'AbortError' ? '생성을 중단했습니다. 입력 내용은 보관됩니다.' : '생성 실패 · ' + err.message, 'error');
      await window.DaycareRecords.save();
      if (state.lastResult && resultsSection) resultsSection.style.display = 'flex';
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
        const ref = document.getElementById('repReflectionText')?.textContent || '';
        const env = document.getElementById('repSupportEnvText')?.textContent || '';
        const safe = document.getElementById('repSupportSafetyText')?.textContent || '';

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
        warmer: '실제 관찰 사실을 유지하면서 말투만 다정하게 바꿔줘. 표정·감정·눈맞춤을 추가하지 마.',
        concise: '문맥의 핵심 놀이 몰입 장면 위주로 군더더기 없이 3~4줄로 명료하고 간결하게 다듬어줘',
        growth: '기록에 있는 행동만 구체적으로 풀어줘. 성장이나 지도 효과는 근거 없이 단정하지 마.',
        safe: '기록된 안전 관련 사실만 정리해줘. 기록이 없으면 안심 멘트를 추가하지 마.',
        meal: '원시 메모에 식사 기록이 있을 때 그 사실만 다정한 문장으로 다듬어줘. 식사 기록이 없으면 추가하지 마.'
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
      copyTextToClipboard(document.getElementById('officialObsSheet')?.innerText || '', '📋 관찰일지가 복사되었습니다!');
    };

    const copyHangrooObsBtn = document.getElementById('copyHangrooObsBtn');
    if (copyHangrooObsBtn) copyHangrooObsBtn.onclick = () => {
      const mob = state.lastResult?.monthly_observation, p = mob?.play_obs || {}, d = mob?.daily_obs || {};
      copyTextToClipboard(`[한그루 ERP 월간 관찰일지 · ${mob?.targetMonth || '대상 월 확인'}]\n■ 놀이 (${p.date || '관찰일 확인 필요'}): ${p.activity_title || ''}\n${p.behavior || ''}\n지원: ${p.teacher_support || ''}\n\n■ 일상생활 (${d.date || '관찰일 확인 필요'}): ${d.activity_title || ''}\n${d.behavior || ''}\n지원: ${d.teacher_support || ''}\n\n■ 월말 총평:\n${mob?.monthly_summary?.development_summary || ''}\n${mob?.monthly_summary?.next_month_plan || ''}`, '📋 한그루 ERP 관찰일지가 복사되었습니다!');
    };

    const copyHangrooEvalBtn = document.getElementById('copyHangrooEvalBtn');
    if (copyHangrooEvalBtn) copyHangrooEvalBtn.onclick = () => {
      const ev = state.lastResult?.hangroo_eval;
      copyTextToClipboard(ev ? `[${document.getElementById('hangrooEvalDocTitle')?.textContent || '한그루 발달평가'}]\n■ 종합평가:\n${ev.development_summary || ''}\n\n■ 지원계획:\n${ev.support_plan || ''}` : '', '📋 발달평가서가 복사되었습니다!');
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
    if (btnAutoDistributeDates) btnAutoDistributeDates.onclick = () => handleGenerate();
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
    const childName = state.selectedChild ? state.selectedChild.name : '선택 원아';

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
          persona: state.persona, childId: state.selectedChild?.id, date: state.selectedDate,
          rawMemo: document.getElementById('rawMemoInput')?.value || '', evidenceIds: state.evidenceIds || [], evidenceFrom: state.evidenceFrom, evidenceTo: state.evidenceTo
        });
        if (kidsnoteTitle && refined.title) kidsnoteTitle.textContent = refined.title;
        if (kidsnoteContent && refined.content) kidsnoteContent.value = refined.content;
        window.DaycareRecords?.capture(); window.DaycareRecords?.save();
        if (document.getElementById('reviewConfirmed')) document.getElementById('reviewConfirmed').checked = false;
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

