/**
 * 🧸 daycare-helper Frontend Application Logic (app.js)
 * 2026 Modern Vanilla JS (ES2024+)
 */

document.addEventListener('DOMContentLoaded', () => {
  // ============================================================================
  // 1. 애플리케이션 상태 (State)
  // ============================================================================
  const state = {
    children: [],
    selectedChild: null,
    mode: 'partial', // 'partial' | 'daily_integrated'
    activityArea: '자유놀이',
    photos: [], // base64 strings
    teacherStyle: localStorage.getItem('daycare_teacher_style') || '다정친절체',
    customApiKey: localStorage.getItem('daycare_custom_api_key') || '',
    isRecording: false,
    recognition: null,
    lastResult: null
  };

  // ============================================================================
  // 2. DOM 요소 참조
  // ============================================================================
  const headerDateText = document.getElementById('headerDateText');
  const notionStatusBadge = document.getElementById('notionStatusBadge');
  const notionStatusText = document.getElementById('notionStatusText');
  const childScrollContainer = document.getElementById('childScrollContainer');
  const selectedChildAge = document.getElementById('selectedChildAge');
  const childTraitsText = document.getElementById('childTraitsText');
  const childAlertText = document.getElementById('childAlertText');

  const modeSwitcher = document.getElementById('modeSwitcher');
  const areaSection = document.getElementById('areaSection');
  const areaGrid = document.getElementById('areaGrid');

  const rawMemoInput = document.getElementById('rawMemoInput');
  const voiceMicBtn = document.getElementById('voiceMicBtn');
  const micIcon = document.getElementById('micIcon');
  const micStatusText = document.getElementById('micStatusText');

  const photoFileInput = document.getElementById('photoFileInput');
  const photoPreviews = document.getElementById('photoPreviews');

  const generateBtn = document.getElementById('generateBtn');
  const loadingBox = document.getElementById('loadingBox');
  const loadingStepText = document.getElementById('loadingStepText');

  const resultsSection = document.getElementById('resultsSection');
  const resultTabBtns = document.querySelectorAll('.result-tab-btn');
  const kidsnoteCard = document.getElementById('kidsnoteCard');
  const observationCard = document.getElementById('observationCard');

  const kidsnoteTitle = document.getElementById('kidsnoteTitle');
  const kidsnoteTags = document.getElementById('kidsnoteTags');
  const kidsnoteContent = document.getElementById('kidsnoteContent');
  const copyKidsnoteBtn = document.getElementById('copyKidsnoteBtn');
  const shareKidsnoteBtn = document.getElementById('shareKidsnoteBtn');

  const obsStandardArea = document.getElementById('obsStandardArea');
  const obsActivityName = document.getElementById('obsActivityName');
  const obsBehaviorContent = document.getElementById('obsBehaviorContent');
  const obsEvaluationContent = document.getElementById('obsEvaluationContent');
  const citationBox = document.getElementById('citationBox');
  const citationSummaryText = document.getElementById('citationSummaryText');
  const saveNotionBtn = document.getElementById('saveNotionBtn');

  const toastMessage = document.getElementById('toastMessage');
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsModal = document.getElementById('settingsModal');
  const closeSettingsBtn = document.getElementById('closeSettingsBtn');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  const customApiKeyInput = document.getElementById('customApiKeyInput');
  const teacherStyleSelect = document.getElementById('teacherStyleSelect');

  // ============================================================================
  // 3. 초기화 (Init)
  // ============================================================================
  function init() {
    // 오늘 날짜 셋업
    const now = new Date();
    const options = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' };
    headerDateText.textContent = now.toLocaleDateString('ko-KR', options);

    // 설정 값 복원
    if (state.customApiKey) customApiKeyInput.value = state.customApiKey;
    if (state.teacherStyle) teacherStyleSelect.value = state.teacherStyle;

    // Web Speech API 초기화
    setupSpeechRecognition();

    // 헬스체크 및 원아 목록 로드
    checkHealth();
    loadChildren();

    // 이벤트 리스너 등록
    setupEventListeners();
  }

  // ============================================================================
  // 4. 이벤트 리스너 등록
  // ============================================================================
  function setupEventListeners() {
    // 모드 스위처 클릭
    modeSwitcher.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        modeSwitcher.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.mode = btn.dataset.mode;
        
        // 부분 모드일 때만 활동 영역 선택 표시
        if (state.mode === 'partial') {
          areaSection.style.display = 'flex';
        } else {
          areaSection.style.display = 'none';
        }
      });
    });

    // 활동 영역 칩 클릭
    areaGrid.querySelectorAll('.area-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        areaGrid.querySelectorAll('.area-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        state.activityArea = chip.dataset.area;
      });
    });

    // 사진 파일 첨부
    photoFileInput.addEventListener('change', handlePhotoUpload);

    // 생성 버튼 클릭
    generateBtn.addEventListener('click', handleGenerate);

    // 결과 탭 스위처 클릭
    resultTabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        resultTabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.tab;
        if (tab === 'kidsnote') {
          kidsnoteCard.style.display = 'flex';
          observationCard.style.display = 'none';
        } else {
          kidsnoteCard.style.display = 'none';
          observationCard.style.display = 'flex';
        }
      });
    });

    // 원터치 알림장 복사
    copyKidsnoteBtn.addEventListener('click', handleCopyKidsnote);

    // 키즈노트 앱 열기 / 공유
    shareKidsnoteBtn.addEventListener('click', handleShareKidsnote);

    // 노션 저장
    saveNotionBtn.addEventListener('click', handleSaveNotion);

    // 설정 모달
    settingsBtn.addEventListener('click', () => {
      settingsModal.style.display = 'flex';
    });
    closeSettingsBtn.addEventListener('click', () => {
      settingsModal.style.display = 'none';
    });
    saveSettingsBtn.addEventListener('click', () => {
      state.customApiKey = customApiKeyInput.value.trim();
      state.teacherStyle = teacherStyleSelect.value;
      localStorage.setItem('daycare_custom_api_key', state.customApiKey);
      localStorage.setItem('daycare_teacher_style', state.teacherStyle);
      settingsModal.style.display = 'none';
      showToast('설정이 저장되었습니다.');
    });
  }

  // ============================================================================
  // 5. 토스트 알림 헬퍼
  // ============================================================================
  let toastTimeout = null;
  function showToast(message) {
    if (toastTimeout) clearTimeout(toastTimeout);
    toastMessage.textContent = message;
    toastMessage.classList.add('show');
    toastTimeout = setTimeout(() => {
      toastMessage.classList.remove('show');
    }, 2400);
  }

  // ============================================================================
  // 6. 서버 헬스체크 및 노션 상태 표시
  // ============================================================================
  async function checkHealth() {
    try {
      const res = await fetch('/health');
      if (res.ok) {
        const data = await res.json();
        if (data.env_configured?.has_notion_token && data.env_configured?.has_daily_log_db) {
          notionStatusBadge.className = 'badge badge-connected';
          notionStatusText.textContent = '노션 연동 완료';
        } else {
          notionStatusBadge.className = 'badge badge-mock';
          notionStatusText.textContent = '모크 테스트 모드';
        }
      }
    } catch (e) {
      console.warn('Health check failed (standalone front mode):', e);
      notionStatusBadge.className = 'badge badge-mock';
      notionStatusText.textContent = '모크 모드';
    }
  }

  // ============================================================================
  // 7. 원아 목록 불러오기 (/api/children)
  // ============================================================================
  async function loadChildren() {
    try {
      const res = await fetch('/api/children');
      const data = await res.json();
      state.children = data.children || [];
      renderChildrenChips();
    } catch (err) {
      console.warn('원아 목록 불러오기 실패, 기본 샘플 사용:', err);
      // 오프라인 폴백 샘플
      state.children = [
        { id: 'mock-child-1', name: '김민서', age: '만 4세', traits: '블록 및 조작 놀이 즐김, 소근육 발달 중', allergies: '우유 주의' },
        { id: 'mock-child-2', name: '이민수', age: '만 5세', traits: '또래 협동 놀이, 언어 표현력 우수', allergies: '' }
      ];
      renderChildrenChips();
    }
  }

  function renderChildrenChips() {
    childScrollContainer.innerHTML = '';
    state.children.forEach((child, index) => {
      const chip = document.createElement('div');
      chip.className = `child-chip ${index === 0 ? 'active' : ''}`;
      chip.innerHTML = `
        <span class="child-avatar">${getAvatarEmoji(child.name)}</span>
        <span>${child.name}</span>
      `;
      chip.addEventListener('click', () => {
        childScrollContainer.querySelectorAll('.child-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        selectChild(child);
      });
      childScrollContainer.appendChild(chip);
    });

    if (state.children.length > 0) {
      selectChild(state.children[0]);
    }
  }

  function getAvatarEmoji(name) {
    const emojis = ['👧', '👦', '🧒', '👶', '🐣'];
    const charCode = (name || '').charCodeAt(0) || 0;
    return emojis[charCode % emojis.length];
  }

  function selectChild(child) {
    state.selectedChild = child;
    selectedChildAge.textContent = child.age || '만 3세';
    childTraitsText.textContent = `💡 성향: ${child.traits || '특이사항 없음'}`;
    
    if (child.allergies) {
      childAlertText.style.display = 'block';
      childAlertText.textContent = `⚠️ 주의: ${child.allergies}`;
    } else {
      childAlertText.style.display = 'none';
    }
  }

  // ============================================================================
  // 8. Web Speech API (STT 한국어 음성 메모)
  // ============================================================================
  function setupSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      voiceMicBtn.style.opacity = '0.5';
      voiceMicBtn.title = '이 브라우저는 음성 인식을 지원하지 않습니다.';
      voiceMicBtn.addEventListener('click', () => {
        showToast('이 브라우저는 음성 인식을 지원하지 않습니다.');
      });
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'ko-KR';
    recognition.continuous = true;
    recognition.interimResults = false;

    recognition.onstart = () => {
      state.isRecording = true;
      voiceMicBtn.classList.add('recording');
      micIcon.textContent = '⏹️';
      micStatusText.textContent = '듣고 있어요...';
      showToast('마이크가 켜졌습니다. 말씀하세요!');
    };

    recognition.onresult = (event) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          transcript += event.results[i][0].transcript + ' ';
        }
      }
      if (transcript) {
        const currentVal = rawMemoInput.value.trim();
        rawMemoInput.value = currentVal ? `${currentVal} ${transcript}` : transcript;
        rawMemoInput.focus();
      }
    };

    recognition.onerror = (event) => {
      console.warn('Speech recognition error:', event.error);
      stopRecording();
      showToast(`음성 인식 오류: ${event.error}`);
    };

    recognition.onend = () => {
      stopRecording();
    };

    state.recognition = recognition;

    voiceMicBtn.addEventListener('click', () => {
      if (state.isRecording) {
        stopRecording();
      } else {
        try {
          recognition.start();
        } catch (e) {
          console.warn('Recognition start failed:', e);
        }
      }
    });
  }

  function stopRecording() {
    state.isRecording = false;
    voiceMicBtn.classList.remove('recording');
    micIcon.textContent = '🎙️';
    micStatusText.textContent = '음성 메모';
    if (state.recognition) {
      try {
        state.recognition.stop();
      } catch (e) {}
    }
  }

  // ============================================================================
  // 9. 사진 업로드 및 Base64 인코딩
  // ============================================================================
  function handlePhotoUpload(e) {
    const files = Array.from(e.target.files);
    if (!files || files.length === 0) return;

    if (state.photos.length + files.length > 6) {
      showToast('사진은 최대 6장까지만 첨부할 수 있습니다.');
      return;
    }

    files.forEach(file => {
      if (!file.type.startsWith('image/')) {
        showToast('이미지 파일만 첨부 가능합니다.');
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        state.photos.push(event.target.result);
        renderPhotoPreviews();
      };
      reader.readAsDataURL(file);
    });

    e.target.value = ''; // 재선택 가능하도록 리셋
  }

  function renderPhotoPreviews() {
    photoPreviews.innerHTML = '';
    state.photos.forEach((base64, index) => {
      const item = document.createElement('div');
      item.className = 'photo-preview-item';
      item.innerHTML = `
        <img src="${base64}" alt="첨부 사진 ${index + 1}">
        <button type="button" class="photo-delete-btn" title="삭제">&times;</button>
      `;
      item.querySelector('.photo-delete-btn').addEventListener('click', () => {
        state.photos.splice(index, 1);
        renderPhotoPreviews();
      });
      photoPreviews.appendChild(item);
    });
  }

  // ============================================================================
  // 10. AI 생성 핸들러 (Gemini 3.8 Flash)
  // ============================================================================
  async function handleGenerate() {
    if (!state.selectedChild) {
      showToast('원아를 먼저 선택해주세요.');
      return;
    }

    const memoText = rawMemoInput.value.trim();
    if (!memoText && state.photos.length === 0) {
      showToast('관찰 메모를 입력하거나 활동 사진을 첨부해주세요.');
      rawMemoInput.focus();
      return;
    }

    // 로딩 시작
    generateBtn.disabled = true;
    loadingBox.style.display = 'block';
    resultsSection.style.display = 'none';

    // 단계별 메시지 애니메이션
    const steps = [
      '🛡️ 원아 실명 마스킹 가드 적용 중...',
      '🤖 Gemini 3.8 Flash 멀티모달 보육 맥락 분석 중...',
      '📌 과거 관찰일지 연계 및 성장점 추출 중...',
      '✨ 실명 안전 복원 및 알림장/일지 조립 중...'
    ];
    let stepIndex = 0;
    loadingStepText.textContent = steps[0];
    const stepInterval = setInterval(() => {
      stepIndex = (stepIndex + 1) % steps.length;
      loadingStepText.textContent = steps[stepIndex];
    }, 1200);

    try {
      const payload = {
        childId: state.selectedChild.id,
        childName: state.selectedChild.name,
        childAge: state.selectedChild.age,
        childTraits: state.selectedChild.traits,
        allergies: state.selectedChild.allergies,
        rawMemo: memoText,
        images: state.photos,
        mode: state.mode,
        activityArea: state.activityArea,
        teacherStyle: state.teacherStyle,
        apiKey: state.customApiKey || undefined
      };

      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || '생성 중 오류가 발생했습니다.');
      }

      const json = await res.json();
      state.lastResult = json.data;
      renderResults(json.data);
      showToast('🎉 알림장과 관찰일지가 완성되었습니다!');
    } catch (err) {
      console.error('Generate Error:', err);
      showToast(`오류: ${err.message}`);
    } finally {
      clearInterval(stepInterval);
      generateBtn.disabled = false;
      loadingBox.style.display = 'none';
    }
  }

  // ============================================================================
  // 11. 생성 결과 렌더링
  // ============================================================================
  function renderResults(data) {
    if (!data) return;

    // 1. 키즈노트 알림장 채우기
    const kn = data.kidsnote || {};
    kidsnoteTitle.textContent = kn.title || '오늘의 알림장';
    kidsnoteContent.value = kn.content || '';

    kidsnoteTags.innerHTML = '';
    (kn.tags || []).forEach(tag => {
      const span = document.createElement('span');
      span.className = 'tag-badge';
      span.textContent = tag.startsWith('#') ? tag : `#${tag}`;
      kidsnoteTags.appendChild(span);
    });

    // 2. 평가제 관찰일지 채우기
    const obs = data.observation_log || {};
    obsStandardArea.textContent = `표준보육 영역: ${obs.standard_area || '의사소통'}`;
    obsActivityName.textContent = `활동: ${obs.activity_name || state.activityArea}`;
    obsBehaviorContent.value = obs.behavior || '';
    obsEvaluationContent.value = obs.evaluation || '';

    // 3. 과거 기록 출처 (Citation) 표기
    const cit = data.citation || {};
    if (cit.has_citation && cit.summary) {
      citationBox.style.display = 'flex';
      citationSummaryText.textContent = cit.summary;
    } else {
      citationBox.style.display = 'none';
    }

    // 결과 섹션 노출 및 스크롤
    resultsSection.style.display = 'flex';
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ============================================================================
  // 12. 알림장 복사 및 키즈노트 공유
  // ============================================================================
  async function handleCopyKidsnote() {
    const textToCopy = kidsnoteContent.value;
    if (!textToCopy) {
      showToast('복사할 알림장 내용이 없습니다.');
      return;
    }

    try {
      await navigator.clipboard.writeText(textToCopy);
      showToast('📋 알림장이 클립보드에 복사되었습니다! 키즈노트에 붙여넣으세요.');
    } catch (e) {
      kidsnoteContent.select();
      document.execCommand('copy');
      showToast('📋 복사되었습니다.');
    }
  }

  async function handleShareKidsnote() {
    const textToShare = kidsnoteContent.value;
    const titleToShare = kidsnoteTitle.textContent;

    if (!textToShare) {
      showToast('공유할 알림장 내용이 없습니다.');
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
        showToast('공유 완료! 키즈노트 앱에 바로 붙여넣으세요.');
        return;
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.warn('Web Share failed:', err);
        }
      }
    }

    // 3. 미지원 환경일 때 안내 팝업 및 복사 완료 안내
    showToast('📋 알림장이 복사되었습니다. 키즈노트 앱을 열어 붙여넣기 하세요!');
  }

  // ============================================================================
  // 13. 노션 3대 DB 저장 핸들러
  // ============================================================================
  async function handleSaveNotion() {
    if (!state.lastResult) {
      showToast('저장할 일지 데이터가 없습니다.');
      return;
    }

    saveNotionBtn.disabled = true;
    saveNotionBtn.innerHTML = '<span>⏳</span> <span>노션에 저장 중...</span>';

    try {
      const payload = {
        date: new Date().toISOString().split('T')[0],
        childId: state.selectedChild?.id,
        childName: state.selectedChild?.name,
        activityArea: state.activityArea,
        standardArea: state.lastResult.observation_log?.standard_area,
        rawMemo: rawMemoInput.value.trim(),
        kidsnoteText: kidsnoteContent.value,
        observationText: `${obsBehaviorContent.value}\n\n[지원 및 평가]\n${obsEvaluationContent.value}`,
        citationSummary: citationSummaryText.textContent || '',
        referencedLogId: null
      };

      const res = await fetch('/api/logs/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const json = await res.json();
      if (json.success) {
        showToast(`💾 노션 저장 완료: ${json.title}`);
      } else {
        throw new Error(json.error || '저장에 실패했습니다.');
      }
    } catch (err) {
      console.error('Notion save error:', err);
      showToast(`저장 오류: ${err.message}`);
    } finally {
      saveNotionBtn.disabled = false;
      saveNotionBtn.innerHTML = '<span>💾</span> <span>노션 3대 DB에 안전 저장</span>';
    }
  }

  // 애플리케이션 시작
  init();
});
