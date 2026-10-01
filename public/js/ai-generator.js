/**
 * 🤖 daycare-helper AI Generator Module (ai-generator.js)
 * 2026 Modern Vanilla JS (ES2024+)
 * 
 * 주요 역할:
 *  - 📌 원아의 노션 실제 과거 관찰 기록 시계열 스캔 (fetchChildPastLogs)
 *  - 🤖 AI 생성 핸들러 (Gemini 3.8 Flash 직통 호출 & Cloudflare 서버 폴백)
 *  - 🛡️ 실명 마스킹 가드, 단계별 메시지 애니메이션, AbortController 안전 중단 제어
 *  - 📑 선택된 서식만 스마트 생성 페이로드 조립 및 렌더링/임시저장 연계
 */

(function () {
  /**
   * 9-B. 원아의 노션 실제 과거 관찰 기록 스캔 (시계열 팩트 기반 검증)
   */
  async function fetchChildPastLogs(childId, childName) {
    if (!childId && !childName) return [];

    const state = window.state || {};
    const { NOTION_CONFIG } = window.DaycareConfig || window;
    const directNotionCall = window.directNotionCall || (window.DaycareNotion && window.DaycareNotion.directNotionCall);

    if (!directNotionCall || !NOTION_CONFIG || !NOTION_CONFIG.DAILY_LOG_DB_ID) {
      return [];
    }

    let targetChildId = childId;
    if (!targetChildId || targetChildId.startsWith('mock-') || targetChildId.startsWith('sandbox_')) {
      const matched = (state.children || []).find(c => c.name === childName && !c.id.startsWith('mock-') && !c.id.startsWith('sandbox_'));
      if (matched) targetChildId = matched.id;
    }

    try {
      let filter = null;
      if (targetChildId && !targetChildId.startsWith('mock-') && !targetChildId.startsWith('sandbox_')) {
        filter = {
          property: '원아',
          relation: { contains: targetChildId }
        };
      } else if (childName) {
        filter = {
          property: '기록명/식별자',
          title: { contains: childName }
        };
      }

      if (!filter) return [];

      const queryRes = await directNotionCall(`/databases/${NOTION_CONFIG.DAILY_LOG_DB_ID}/query`, 'POST', {
        filter,
        page_size: 10,
        sorts: [{ property: '작성일자', direction: 'descending' }]
      });

      const pages = queryRes.results || [];
      const pastLogs = pages.map(p => {
        const props = p.properties || {};
        const date = props['작성일자']?.date?.start || (p.created_time ? p.created_time.split('T')[0] : '');
        const area = props['활동 구분']?.select?.name || (props['표준보육 영역']?.multi_select?.[0]?.name || '자유놀이');
        const summary = props['관찰 요약']?.rich_text?.[0]?.plain_text ||
                        props['원시 메모/키워드']?.rich_text?.[0]?.plain_text ||
                        props['알림장 최종본']?.rich_text?.[0]?.plain_text?.slice(0, 120) || '';
        return { date, activity: area, behavior: summary };
      }).filter(log => log.date && log.behavior);

      return pastLogs;
    } catch (err) {
      console.warn('원아 과거 관찰 기록 조회 실패:', err);
      return [];
    }
  }

  /**
   * 10. AI 생성 메인 핸들러
   */
  async function handleGenerate() {
    const state = window.state || {};
    const showToast = window.showToast || console.log;

    const rawMemoInput = document.getElementById('rawMemoInput');
    const generateBtn = document.getElementById('generateBtn');
    const loadingBox = document.getElementById('loadingBox');
    const loadingStepText = document.getElementById('loadingStepText');
    const resultsSection = document.getElementById('resultsSection');
    const monthlyObsTargetMonth = document.getElementById('monthlyObsTargetMonth');
    const monthlyObsDate1 = document.getElementById('monthlyObsDate1');
    const monthlyObsArea1 = document.getElementById('monthlyObsArea1');
    const monthlyObsDate2 = document.getElementById('monthlyObsDate2');
    const monthlyObsArea2 = document.getElementById('monthlyObsArea2');

    if (!state.selectedChild) {
      showToast('원아를 먼저 선택해주세요.');
      return;
    }

    const memoText = rawMemoInput ? rawMemoInput.value.trim() : '';
    if (!memoText && (!state.photos || state.photos.length === 0)) {
      showToast('관찰 메모를 입력하거나 활동 사진을 첨부해주세요.');
      if (rawMemoInput) rawMemoInput.focus();
      return;
    }

    // 로딩 시작
    if (generateBtn) generateBtn.disabled = true;
    if (loadingBox) loadingBox.style.display = 'block';
    if (resultsSection) resultsSection.style.display = 'none';

    // ⏹️ AbortController 초기화 (언제든 안전 중단 가능)
    const abortController = new AbortController();
    state.currentAbortController = abortController;
    state.isGenerationAborted = false;

    // 단계별 메시지 애니메이션
    const steps = [
      '🛡️ 원아 실명 마스킹 가드 적용 중...',
      '🤖 Gemini 3.8 Flash 멀티모달 보육 맥락 분석 중...',
      '📌 과거 관찰일지 연계 및 성장점 추출 중...',
      '✨ 실명 안전 복원 및 알림장/일지 조립 중...'
    ];
    let stepIndex = 0;
    if (loadingStepText) loadingStepText.textContent = steps[0];
    const stepInterval = setInterval(() => {
      stepIndex = (stepIndex + 1) % steps.length;
      if (loadingStepText) loadingStepText.textContent = steps[stepIndex];
    }, 1200);

    try {
      // 원아의 과거 실제 관찰 기록 스캔 (노션 DAILY_LOG_DB)
      let pastLogs = [];
      try {
        pastLogs = await fetchChildPastLogs(state.selectedChild.id, state.selectedChild.name);
      } catch (pastErr) {
        console.warn('과거 기록 스캔 실패:', pastErr);
      }

      const payload = {
        childId: state.selectedChild.id,
        childName: state.selectedChild.name,
        childAge: state.selectedChild.age,
        childTraits: state.selectedChild.traits,
        parentStyle: state.selectedChild.parentStyle || '',
        allergies: state.selectedChild.allergies,
        rawMemo: memoText,
        images: state.photos || [],
        mode: state.mode,
        activityArea: state.activityArea,
        teacherStyle: state.teacherStyle,
        className: state.className || '햇살반',
        teacherName: state.teacherName || '김선생님',
        persona: state.persona,
        pastLogs: pastLogs,
        selectedFormats: state.selectedFormats || ['class_daily_report', 'kidsnote'] // 📑 선택된 서식만 스마트 생성
      };

      if (monthlyObsTargetMonth) {
        payload.monthlyObsOptions = {
          targetMonth: monthlyObsTargetMonth.value || '2026-09',
          date1: monthlyObsDate1 ? monthlyObsDate1.value : '',
          area1: monthlyObsArea1 ? monthlyObsArea1.value : '의사소통',
          date2: monthlyObsDate2 ? monthlyObsDate2.value : '',
          area2: monthlyObsArea2 ? monthlyObsArea2.value : '사회관계'
        };
      }

      let resultData = null;

      // 1. 한국 브라우저 IP 직통 호출 시도 (Cloudflare 유럽 노드 지역 제한 400 원천 회피)
      if (window.GeminiClient && typeof window.GeminiClient.generate === 'function') {
        try {
          const clientRes = await window.GeminiClient.generate(payload, { signal: abortController.signal });
          if (clientRes && clientRes.success) {
            resultData = clientRes.data;
          }
        } catch (clientErr) {
          if (clientErr.name === 'AbortError' || state.isGenerationAborted) {
            throw clientErr;
          }
          console.warn('클라이언트 직통 호출 실패, 서버 엔드포인트로 폴백:', clientErr);
        }
      }

      // 2. 서버 폴백 (/api/generate)
      if (!resultData && !state.isGenerationAborted) {
        const res = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: abortController.signal,
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || '생성 중 오류가 발생했습니다.');
        }

        const json = await res.json();
        resultData = json.data;
      }

      state.lastResult = resultData;
      state.originalResult = JSON.parse(JSON.stringify(resultData)); // ↺ 최초 생성 원본 백업 (원래대로 복원용)

      // 렌더링 호출
      if (typeof window.renderResults === 'function') {
        window.renderResults(resultData);
      } else if (window.ResultsRenderer && typeof window.ResultsRenderer.renderResults === 'function') {
        window.ResultsRenderer.renderResults(resultData);
      }

      showToast('🎉 맞춤 보육 기록이 완성되었습니다!');
    } catch (err) {
      if (err.name === 'AbortError' || state.isGenerationAborted) {
        console.log('AI 작성이 교사에 의해 안전하게 취소되었습니다.');
        showToast('⏹️ AI 생성이 안전하게 중단되었습니다. 메모를 수정해보세요.');
        if (rawMemoInput) rawMemoInput.focus();
      } else {
        console.error('Generate Error:', err);
        showToast(`오류: ${err.message}`);
      }
    } finally {
      clearInterval(stepInterval);
      if (generateBtn) generateBtn.disabled = false;
      if (loadingBox) loadingBox.style.display = 'none';
      state.currentAbortController = null;
      state.isGenerationAborted = false;
    }
  }

  // 🌐 전역 노출 및 파사드 유지
  window.AiGenerator = {
    fetchChildPastLogs,
    handleGenerate
  };
  window.fetchChildPastLogs = fetchChildPastLogs;
  window.handleGenerate = handleGenerate;
})();
