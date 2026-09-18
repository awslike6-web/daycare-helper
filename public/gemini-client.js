/**
 * 🧸 Gemini 3.8 Flash 브라우저 클라이언트 엔진 (gemini-client.js)
 * 
 * 마스터타워 GEMINI.md 12-4항 표준:
 *  - Cloudflare Worker의 Secret (/api/gemini-key)을 메모리로 안전 수급
 *  - 한국 사용자 브라우저 IP에서 구글 공식 엔드포인트 직통 호출로 해외 엣지 지역제한(400) 100% 회피
 *  - [아동A] 실명 마스킹 & 언마스킹 안심 가드 탑재
 */

(function(window) {
  'use strict';

  let _cachedKey = null;

  async function getGeminiKey() {
    if (_cachedKey) return _cachedKey;
    try {
      const res = await fetch('/api/gemini-key');
      if (res.ok) {
        const json = await res.json();
        if (json && json.key) {
          _cachedKey = json.key;
          return _cachedKey;
        }
      }
    } catch (e) {
      console.warn('키 디스펜서 조회 실패, 서버 폴백 대기:', e);
    }
    return null;
  }

  function maskText(text, childName) {
    if (!text || !childName) return text;
    const escaped = childName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp(escaped, 'g'), '[아동A]');
  }

  function unmaskDeep(obj, childName) {
    if (!childName) return obj;
    if (typeof obj === 'string') {
      return obj.replace(/\[아동\s*A\]/g, childName);
    }
    if (Array.isArray(obj)) {
      return obj.map(item => unmaskDeep(item, childName));
    }
    if (obj && typeof obj === 'object') {
      const res = {};
      for (const [k, v] of Object.entries(obj)) {
        res[k] = unmaskDeep(v, childName);
      }
      return res;
    }
    return obj;
  }

  async function generateWithGeminiClient(payload) {
    const apiKey = await getGeminiKey();
    if (!apiKey) {
      throw new Error('API 키를 워커에서 가져오지 못했습니다. 서버로 폴백합니다.');
    }

    const {
      childName = '김민서',
      childAge = '만 4세',
      childTraits = '',
      allergies = '',
      rawMemo = '',
      mode = 'partial',
      activityArea = '자유놀이',
      teacherStyle = '다정친절체',
      persona = {},
      pastLogs = []
    } = payload;

    const isPlayStory = mode === 'play_story' || mode === 'partial';
    const isObservation = mode === 'observation';
    const maskedMemo = maskText(rawMemo, childName);
    const sampleNote = maskText(persona.sampleNote || '', childName);
    const callStyle = persona.callStyle || '우리 [아동A]';
    const emojiRule = {
      none: '이모지를 일체 사용하지 말고 단정하고 깔끔한 텍스트로만 작성할 것.',
      moderate: '이모지는 과하지 않게 문맥에 맞추어 1~2개 정도만 자연스럽게 넣을 것 (예: ^^, 🌱, ✨).',
      rich: '이모지를 적절히 풍부하고 발랄하게 사용하여 생동감을 살릴 것 (예: 🥰, 💖, 👏, 🌈).'
    }[persona.emojiLevel || 'moderate'];
    const closingGreeting = persona.closingGreeting || '';

    const sampleText = sampleNote ? `
[⭐ 최우선 복제 기준: 선생님의 실제 평소 알림장 예시 (Few-shot Imitation)]
반드시 아래 예시문의 '문장 호흡, 어미 스타일(~했답니다, ~했어요, ~했지요 등), 이모지 감성, 줄바꿈 습관'을 100% 모방하여 동일한 필체로 작성하라:
"""
${sampleNote}
"""` : '';

    const pastLogText = (pastLogs && pastLogs.length > 0) ? `
[과거 관찰 기록 (Citation 출처)]:
${pastLogs.map(p => `- [${p.date}] [${p.activityArea || '놀이'}] ${maskText(p.content || '', childName)}`).join('\n')}` : '';

    let modeInstruction = '';
    if (isPlayStory) {
      modeInstruction = `
[⭐ 현재 모드: 📸 놀이 알림장 집중 (알잘딱 생생 서술형)]
- 핵심 목표: 선생님이 입력한 놀이 사진/장면에 100% 집중하여, 학부모가 읽었을 때 아이의 놀이 모습이 눈앞에 생생하게 그려지는 풍부하고 따뜻한 서술식 본문(250~400자 내외)을 완성하라.
- 절대 금지: 3~4줄로 억지로 짧게 축약하지 말 것! 단편적 요약이 아닌, 놀이의 시작부터 몰입, 친구와의 즐거운 상호작용까지 물 흐르듯 이어지는 한 편의 완성도 높은 이야기로 서술하라.
- 자연스러운 서술 흐름:
  ① 오늘 아이가 어떤 호기심과 즐거움으로 놀이(교구)를 시작했는지
  ② 작은 손으로 교구를 집중해서 탐색하고 조작하며 어떤 표정으로 몰입했는지
  ③ 또래 친구 또는 교사와 어떤 따뜻한 눈빛이나 대화, 웃음을 나누었는지
  ④ 놀이를 통해 아이가 느낀 기특한 성취감과 긍정적인 에너지
  ⑤ 가정에서도 아이의 빛나는 놀이에 대해 많이 칭찬해달라는 따뜻한 연결 맺음말
`;
    } else if (isObservation) {
      modeInstruction = `
[⭐ 현재 모드: 🧸 평가제 관찰일지 집중]
- 보육 평가제(평가인증) 표준보육과정 기준의 철저히 객관적인 행동 사실(~함, ~하는 모습을 보임 체)과 교사의 배움 지원 및 성장을 전문적으로 서술하라.
`;
    } else {
      modeInstruction = `
[⭐ 현재 모드: 📋 5대 보육 서식 종합팩]
- 알림장, 관찰일지, 일일보육일지, 상담일지, 놀이지원안 전체 5대 서식을 균형 있게 완성하라.
`;
    }

    const prompt = `너는 대한민국 어린이집 15년 차 수석 보육교사이자 보육 평가제 수석 컨설턴트다.
원아의 개인정보를 철저히 보호하기 위해 원아는 오직 '[아동A]'로만 호칭한다.

[선생님 스타일 & 페르소나]
- 원아 호칭: '${callStyle}'
- 이모지 스타일: ${emojiRule}
${sampleText}
${closingGreeting ? `- 단골 맺음말 지침: 본문 끝부분에 다음 맺음말을 자연스럽게 반영하라: "${closingGreeting}"` : ''}

${modeInstruction}

[품격 있는 긍정 서술 원칙 (필수)]
- '실패', '미숙', '부족', '산만' 등 아이나 교사에게 부정적이거나 단정적인 어휘는 일체 사용하지 않는다.
- 블록이 무너지거나 어려움이 생겨도 좌절하지 않고 미소 지으며 다시 시도하는 '회복탄력성'과 '배움의 호기심'으로 아름답게 승화하여 서술한다.

[원아 정보]
- 가명: [아동A] (${childAge})
- 특이사항/성향: ${childTraits || '특이사항 없음'}
- 주의사항/알레르기: ${allergies || '없음'}
${pastLogText}

교사 관찰 메모:
${maskedMemo}

반드시 아래 JSON 규격으로만 응답하라:
{
  "kidsnote": {
    "title": "놀이의 기쁨과 아이의 감정을 담은 다정한 알림장 제목",
    "content": "학부모를 감동시키는 따뜻하고 생생한 서술식 본문 (~했답니다, ~했어요)",
    "tags": ["${activityArea}", "어린이집", "${childAge}"]
  },
  "observation_log": {
    "standard_area": "신체운동·건강 / 의사소통 / 사회관계 / 예술경험 / 자연탐구 중 택1",
    "activity_name": "${activityArea}",
    "behavior": "객관적 행동 관찰문 (~함 체)",
    "evaluation": "교사의 상호작용 지원 및 발달 평가 (~를 지원함)"
  },
  "daily_care_log": {
    "play_summary": "오늘 우리 반 유아들의 전반적인 놀이 흐름 요약",
    "play_evaluation": "놀이에 대한 교사의 종합 평가 및 배움 분석",
    "next_support_plan": "내일 놀이 확장을 위한 공간/자료 및 교사 지원 계획"
  },
  "parent_counseling": {
    "daily_routine": "식습관, 낮잠, 배변 등 기본생활습관 특징",
    "social_relations": "또래 및 교사와의 긍정적 상호작용과 사회성",
    "development_feature": "놀이 몰입도 및 신체/언어 발달 강점",
    "counseling_opinion": "가정 연계 및 학부모 상담 시 안내할 종합 조언"
  },
  "play_support_plan": {
    "extension_idea": "아이들의 관심사에 맞춘 심화 확장 놀이 아이디어",
    "recommended_materials": "추가 배치할 놀이 교구 및 환경구성 자료",
    "interaction_tips": "아이의 사고 확장을 돕는 교사의 추천 발문 팁"
  },
  "citation": {
    "has_citation": true,
    "summary": "📌 참고한 과거 기록: 이전 관찰 대비 성장점 한 줄 요약"
  }
}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.6,
          responseMimeType: 'application/json'
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini Client Direct Error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const rawContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawContent) {
      throw new Error('Gemini 응답 본문이 비어있습니다.');
    }

    const parsed = JSON.parse(rawContent);
    const unmasked = unmaskDeep(parsed, childName);
    return { success: true, data: unmasked };
  }

  async function refineKidsnoteText({ currentTitle, currentContent, instruction, childName, persona = {} }) {
    const apiKey = await getGeminiKey();
    if (!apiKey) {
      throw new Error('API 키가 없습니다.');
    }

    const maskedContent = maskText(currentContent, childName);
    const callStyle = persona.callStyle || '우리 [아동A]';
    const closingGreeting = persona.closingGreeting || '';

    const prompt = `너는 대한민국 어린이집 15년 차 수석 보육교사다.
원아는 오직 '[아동A]'로만 칭한다.

[기존 작성된 알림장]
${maskedContent}

[선생님의 다듬기/추가 요청 사항]
"${instruction}"

[다듬기 지침]
1. 기존 글의 따뜻하고 다정한 어조와 핵심 놀이 맥락을 충실히 유지하라.
2. 선생님의 요청 사항("${instruction}")을 본문에 억지스럽지 않고 자연스럽게 스며들도록 반영하라.
3. 원아 호칭은 '${callStyle}' 형태를 유지하고, 맺음말("${closingGreeting}")이 있다면 자연스럽게 어우러지게 하라.
4. 품격 있는 긍정 서술(부정적 어휘 배제, 아이의 회복탄력성 존중)을 엄격히 준수하라.
5. 오직 아래 JSON 형식으로만 응답하라:
{
  "title": "수정된 알림장 제목",
  "content": "수정된 알림장 본문"
}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.6,
          responseMimeType: 'application/json'
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`다듬기 오류 (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const rawContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawContent) throw new Error('응답이 비어있습니다.');

    const parsed = JSON.parse(rawContent);
    return {
      title: unmaskDeep(parsed.title || currentTitle, childName),
      content: unmaskDeep(parsed.content || currentContent, childName)
    };
  }

  window.GeminiClient = {
    getKey: getGeminiKey,
    generate: generateWithGeminiClient,
    refine: refineKidsnoteText
  };

})(window);
