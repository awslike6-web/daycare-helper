/**
 * 🎙️ daycare-helper Media & AI Assistant Module (media-assistant.js)
 * 2026 Modern Vanilla JS (ES2024+)
 * 
 * - Web Speech API 한국어 음성인식 (STT 실시간 누적)
 * - 놀이 관찰 사진 업로드, 캔버스 리사이징 및 Base64 인코딩
 * - 🪄 AI 실시간 알림장 다듬기 (Quick Refine) 및 원본 복원
 */

// ============================================================================
// 1. Web Speech API (STT 한국어 음성 메모)
// ============================================================================
function setupSpeechRecognition() {
  const state = window.state || {};
  const voiceMicBtn = document.getElementById('voiceMicBtn');
  const micIcon = document.getElementById('micIcon');
  const micStatusText = document.getElementById('micStatusText');
  const rawMemoInput = document.getElementById('rawMemoInput');

  if (!voiceMicBtn) return;

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    voiceMicBtn.style.opacity = '0.5';
    voiceMicBtn.title = '이 브라우저는 음성 인식을 지원하지 않습니다.';
    voiceMicBtn.addEventListener('click', () => {
      if (typeof showToast === 'function') showToast('이 브라우저는 음성 인식을 지원하지 않습니다.');
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
    if (micIcon) micIcon.textContent = '⏹️';
    if (micStatusText) micStatusText.textContent = '듣고 있어요...';
    if (typeof showToast === 'function') showToast('마이크가 켜졌습니다. 말씀하세요!');
  };

  recognition.onresult = (event) => {
    let transcript = '';
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        transcript += event.results[i][0].transcript + ' ';
      }
    }
    if (transcript.trim() && rawMemoInput) {
      const currentVal = rawMemoInput.value.trim();
      rawMemoInput.value = currentVal ? `${currentVal}\n${transcript.trim()}` : transcript.trim();
      try {
        localStorage.setItem('daycare_draft_memo', rawMemoInput.value);
      } catch (e) {}
      rawMemoInput.focus();
      if (typeof showToast === 'function') showToast('🎙️ 음성 메모가 텍스트에 누적 저장되었습니다.');
    }
  };

  recognition.onerror = (event) => {
    console.warn('Speech recognition error:', event.error);
    stopRecording();
    if (typeof showToast === 'function') showToast(`음성 인식 오류: ${event.error}`);
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
  const state = window.state || {};
  const voiceMicBtn = document.getElementById('voiceMicBtn');
  const micIcon = document.getElementById('micIcon');
  const micStatusText = document.getElementById('micStatusText');

  state.isRecording = false;
  if (voiceMicBtn) voiceMicBtn.classList.remove('recording');
  if (micIcon) micIcon.textContent = '🎙️';
  if (micStatusText) micStatusText.textContent = '음성 메모';
  if (state.recognition) {
    try {
      state.recognition.stop();
    } catch (e) {}
  }
}

// ============================================================================
// 2. 사진 업로드 및 Base64 인코딩
// ============================================================================
function handlePhotoUpload(e) {
  const state = window.state || {};
  if (!state.photos) state.photos = [];
  const files = Array.from(e.target.files);
  if (!files || files.length === 0) return;

  if (state.photos.length + files.length > 6) {
    if (typeof showToast === 'function') showToast('사진은 최대 6장까지만 첨부할 수 있습니다.');
    return;
  }

  files.forEach(file => {
    if (!file.type.startsWith('image/')) {
      if (typeof showToast === 'function') showToast('이미지 파일만 첨부 가능합니다.');
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
  const state = window.state || {};
  const photoPreviews = document.getElementById('photoPreviews');
  if (!photoPreviews) return;

  photoPreviews.innerHTML = '';
  (state.photos || []).forEach((base64, index) => {
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
// 3. AI 실시간 알림장 다듬기 (Quick Refine)
// ============================================================================
async function handleRefine(instruction) {
  const state = window.state || {};
  const kidsnoteTitle = document.getElementById('kidsnoteTitle');
  const kidsnoteContent = document.getElementById('kidsnoteContent');
  const kidsnoteRefineBox = document.getElementById('kidsnoteRefineBox');
  const refiningSpinner = document.getElementById('refiningSpinner');

  if (!instruction || !instruction.trim()) return;
  if (!kidsnoteContent || !kidsnoteContent.value.trim()) {
    if (typeof showToast === 'function') showToast('다듬을 알림장 내용이 없습니다.');
    return;
  }

  const currentTitle = kidsnoteTitle ? kidsnoteTitle.textContent : '';
  const currentContent = kidsnoteContent.value;
  const childName = state.selectedChild ? state.selectedChild.name : '김민서';

  if (refiningSpinner) refiningSpinner.style.display = 'inline';
  const chips = kidsnoteRefineBox ? kidsnoteRefineBox.querySelectorAll('.refine-chip, .refine-custom-btn') : [];
  chips.forEach(b => b.disabled = true);

  try {
    if (window.GeminiClient && typeof window.GeminiClient.refine === 'function') {
      const refined = await window.GeminiClient.refine({
        currentTitle,
        currentContent,
        instruction,
        childName,
        persona: state.persona
      });
      if (kidsnoteTitle) kidsnoteTitle.textContent = refined.title;
      if (kidsnoteContent) kidsnoteContent.value = refined.content;
      if (typeof showToast === 'function') showToast('✨ 요청하신 내용으로 자연스럽게 다듬어졌습니다!');
    } else {
      throw new Error('다듬기 엔진이 준비되지 않았습니다.');
    }
  } catch (err) {
    console.error('Refine Error:', err);
    if (typeof showToast === 'function') showToast(`다듬기 오류: ${err.message}`);
  } finally {
    if (refiningSpinner) refiningSpinner.style.display = 'none';
    chips.forEach(b => b.disabled = false);
  }
}

// ↺ 원래대로 복원
function handleResetOriginal() {
  const state = window.state || {};
  const kidsnoteTitle = document.getElementById('kidsnoteTitle');
  const kidsnoteContent = document.getElementById('kidsnoteContent');

  if (!state.originalResult || !state.originalResult.kidsnote) {
    if (typeof showToast === 'function') showToast('복원할 최초 생성본이 없습니다.');
    return;
  }
  if (kidsnoteTitle) kidsnoteTitle.textContent = state.originalResult.kidsnote.title || '오늘의 알림장';
  if (kidsnoteContent) kidsnoteContent.value = state.originalResult.kidsnote.content || '';
  if (typeof showToast === 'function') showToast('↺ 처음 생성된 원본 초안으로 복원되었습니다.');
}

// 🌐 전역 네임스페이스 등록
window.setupSpeechRecognition = setupSpeechRecognition;
window.stopRecording = stopRecording;
window.handlePhotoUpload = handlePhotoUpload;
window.renderPhotoPreviews = renderPhotoPreviews;
window.handleRefine = handleRefine;
window.handleResetOriginal = handleResetOriginal;

window.MediaAssistant = {
  setupSpeechRecognition,
  stopRecording,
  handlePhotoUpload,
  renderPhotoPreviews,
  handleRefine,
  handleResetOriginal
};
