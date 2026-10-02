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
    if (!text) {
      showToast('복사할 내용이 없습니다.');
      return false;
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        showToast(successMsg);
        return true;
      }
    } catch (err) {
      console.warn('navigator.clipboard fallback to execCommand:', err);
    }

    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      if (ok) {
        showToast(successMsg);
        return true;
      }
    } catch (e) {
      console.error('execCommand copy failed:', e);
    }
    return false;
  }

  async function copyHwpTableToClipboard(tableHtml, plainText, successMsg = '📄 한글(HWP) 표가 클립보드에 복사되었습니다!') {
    try {
      if (navigator.clipboard && window.ClipboardItem) {
        const htmlBlob = new Blob([tableHtml], { type: 'text/html' });
        const textBlob = new Blob([plainText], { type: 'text/plain' });
        const item = new ClipboardItem({
          'text/html': htmlBlob,
          'text/plain': textBlob
        });
        await navigator.clipboard.write([item]);
        showToast(successMsg);
        return true;
      }
    } catch (e) {
      console.warn('ClipboardItem failed, fallback to plainText:', e);
    }
    return copyTextToClipboard(plainText, successMsg);
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

  // ============================================================================
  // 3. AI 생성 결과 화면 렌더링 (Results Renderer)
  // ============================================================================
  function renderResults(data) {
    if (!data) return;
    const state = window.state || {};

    // 0. 한그루 보육일지 채우기
    const rep = data.class_daily_report;
    if (rep) {
      const repDocTitle = document.getElementById('repDocTitle');
      const repHdrClass = document.getElementById('repHdrClass');
      const repHdrDate = document.getElementById('repHdrDate');
      const repHdrTheme = document.getElementById('repHdrTheme');
      const reportCurriculumTbody = document.getElementById('reportCurriculumTbody');
      const repReflectionText = document.getElementById('repReflectionText');
      const repSupportEnvText = document.getElementById('repSupportEnvText');
      const repSupportSafetyText = document.getElementById('repSupportSafetyText');

      if (repDocTitle) repDocTitle.textContent = rep.title || '놀이중심 보육일지';
      if (repHdrClass) repHdrClass.textContent = `${state.className || '우리 반'}`;
      if (repHdrDate) repHdrDate.textContent = rep.date || state.selectedDate || '';
      if (repHdrTheme) repHdrTheme.textContent = rep.play_theme || '자유놀이 및 활동';

      if (reportCurriculumTbody && Array.isArray(rep.curriculum)) {
        reportCurriculumTbody.innerHTML = '';
        rep.curriculum.forEach(row => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td style="padding: 8px; border: 1px solid #CBD5E1; font-weight: 600; text-align: center;">${row.time || ''}</td>
            <td style="padding: 8px; border: 1px solid #CBD5E1; text-align: center;">${row.activity_name || ''}</td>
            <td style="padding: 8px; border: 1px solid #CBD5E1;">${row.execution_notes || ''}</td>
          `;
          reportCurriculumTbody.appendChild(tr);
        });
      }

      if (repReflectionText) repReflectionText.value = rep.reflection || '';
      if (repSupportEnvText) repSupportEnvText.value = rep.support_environment || '';
      if (repSupportSafetyText) repSupportSafetyText.value = rep.support_safety || '';
    }

    // 1. 키즈노트 알림장 채우기
    const kn = data.kidsnote;
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
      const obs1ActivityTitle = document.getElementById('obs1ActivityTitle');
      const obs1BehaviorText = document.getElementById('obs1BehaviorText');
      const obs1SupportText = document.getElementById('obs1SupportText');
      const obs2ActivityTitle = document.getElementById('obs2ActivityTitle');
      const obs2BehaviorText = document.getElementById('obs2BehaviorText');
      const obs2SupportText = document.getElementById('obs2SupportText');

      if (monthlyObsDocTitle) monthlyObsDocTitle.textContent = mob.title || '영유아 발달 관찰기록부';
      if (monthlyObsChildName) monthlyObsChildName.textContent = state.selectedChild?.name || '원아';

      const playObs = mob.play_obs || mob.obs_1 || mob;
      if (obs1ActivityTitle) obs1ActivityTitle.textContent = playObs.activity_title || playObs.activity_name || '';
      if (obs1BehaviorText) obs1BehaviorText.textContent = playObs.behavior || '';
      if (obs1SupportText) obs1SupportText.textContent = playObs.teacher_support || playObs.evaluation || '';

      const dailyObs = mob.daily_obs || mob.obs_2 || {};
      if (obs2ActivityTitle) obs2ActivityTitle.textContent = dailyObs.activity_title || '';
      if (obs2BehaviorText) obs2BehaviorText.textContent = dailyObs.behavior || '';
      if (obs2SupportText) obs2SupportText.textContent = dailyObs.teacher_support || '';
    }

    // 3. 한그루 발달평가 (hangroo_eval) 채우기
    const he = data.hangroo_eval;
    if (he) {
      const hangrooEvalDocTitle = document.getElementById('hangrooEvalDocTitle');
      const hangrooEvalSummaryText = document.getElementById('hangrooEvalSummaryText');
      const hangrooEvalSupportText = document.getElementById('hangrooEvalSupportText');

      if (hangrooEvalDocTitle) hangrooEvalDocTitle.textContent = he.title || `${state.selectedChild?.name || '원아'} 발달평가서`;
      if (hangrooEvalSummaryText) hangrooEvalSummaryText.value = he.development_summary || '';
      if (hangrooEvalSupportText) hangrooEvalSupportText.value = he.support_plan || '';
    }

    // 4. 일일 보육일지 채우기
    const dc = data.daily_care_log;
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
    const ps = data.play_support_plan;
    if (ps) {
      const playExtension = document.getElementById('playExtension');
      const playMaterials = document.getElementById('playMaterials');
      const playTips = document.getElementById('playTips');
      if (playExtension) playExtension.value = ps.extension_idea || '';
      if (playMaterials) playMaterials.value = ps.recommended_materials || '';
      if (playTips) playTips.value = ps.interaction_tips || '';
    }

    // 7. 결과 탭 바 표시 최적화 (선택된 서식 우선, 모든 탭 버튼은 유연하게 유지)
    const resultTabBtns = document.querySelectorAll('.result-tab-btn');
    const validFormats = (state.selectedFormats && state.selectedFormats.length > 0)
      ? state.selectedFormats
      : ['class_daily_report', 'kidsnote'];

    resultTabBtns.forEach(b => {
      const tab = b.dataset.tab;
      // 선택된 서식은 밝게 표시, 선택되지 않은 서식도 숨기지 않고 탭으로 자유롭게 열람 가능하도록 보장
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
        childId: state.selectedChild.id,
        childName: state.selectedChild.name,
        childAge: state.selectedChild.age,
        childTraits: state.selectedChild.traits || '',
        parentStyle: state.selectedChild.parentStyle || '',
        allergies: state.selectedChild.allergies || '',
        rawMemo: memoText,
        images: state.photos || [],
        mode: state.mode || 'all_suite',
        activityArea: state.activityArea || '자유놀이',
        teacherStyle: state.teacherStyle || '다정하고 꼼꼼한 선생님',
        className: state.className || '사랑반',
        teacherName: state.teacherName || '공가영 선생님',
        persona: state.persona,
        selectedFormats: state.selectedFormats || ['class_daily_report', 'kidsnote']
      };

      let resultData = null;

      // 1. 브라우저 클라이언트 직통 생성 시도
      if (window.GeminiClient && typeof window.GeminiClient.generate === 'function') {
        try {
          const clientRes = await window.GeminiClient.generate(payload, { signal: abortController.signal });
          if (clientRes && clientRes.success) {
            resultData = clientRes.data;
          }
        } catch (e) {
          if (e.name === 'AbortError' || state.isGenerationAborted) throw e;
          console.warn('클라이언트 직통 실패, 서버 폴백 전환:', e);
        }
      }

      // 2. 서버 폴백
      if (!resultData && !state.isGenerationAborted) {
        const res = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: abortController.signal,
          body: JSON.stringify(payload)
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

    // 노션 저장 버튼 연동
    const saveClassReportNotionBtn = document.getElementById('saveClassReportNotionBtn');
    const saveHangrooEvalNotionBtn = document.getElementById('saveHangrooEvalNotionBtn');
    const btnSaveIndividualObs = document.getElementById('btnSaveIndividualObs');
    const saveNotionBtn = document.getElementById('saveNotionBtn');

    if (saveClassReportNotionBtn) saveClassReportNotionBtn.onclick = () => window.handleSaveClassReportNotion?.();
    if (saveHangrooEvalNotionBtn) saveHangrooEvalNotionBtn.onclick = () => window.handleSaveHangrooEvalNotion?.();
    if (btnSaveIndividualObs) btnSaveIndividualObs.onclick = () => window.handleSaveIndividualObs?.();
    if (saveNotionBtn) saveNotionBtn.onclick = () => window.handleSaveNotion?.();
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
    copyHwpTableToClipboard
  };

  // 하위 호환 단독 전역 함수 바인딩
  window.handleGenerate = handleGenerate;
  window.renderResults = renderResults;
  window.switchResultTab = switchResultTab;
  window.setupExportListeners = setupExportListeners;
  window.copyTextToClipboard = copyTextToClipboard;
  window.copyHwpTableToClipboard = copyHwpTableToClipboard;
  window.ResultsRenderer = window.AiEngine;
  window.ExportFormatters = window.AiEngine;
  window.AiGenerator = window.AiEngine;
})();
