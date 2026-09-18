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

    const isPartial = mode === 'partial';
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
반드시 아래 예시문의 '문장 길이, 어미 스타일(~했답니다, ~했지요 등), 이모지 사용 패턴, 말투'를 100% 모방하라:
"""
${sampleNote}
"""` : '';

    const pastLogText = (pastLogs && pastLogs.length > 0) ? `
[과거 관찰 기록 (Citation 출처)]:
${pastLogs.map(p => `- [${p.date}] [${p.activityArea || '놀이'}] ${maskText(p.content || '', childName)}`).join('\n')}` : '';

    const prompt = `너는 대한민국 어린이집 15년 차 수석 보육교사이자 보육 평가제(평가인증) 수석 컨설턴트다.
원아의 개인정보를 보호하기 위해 원아는 오직 '[아동A]'로만 호칭한다.

[선생님 페르소나]
- 원아 호칭: '${callStyle}'
- 이모지 스타일: ${emojiRule}
${sampleText}
${closingGreeting ? `- 단골 맺음말: 본문 끝부분에 자연스럽게 포함: "${closingGreeting}"` : ''}

[작성 모드]
${isPartial ? `
- 현재 모드: [부분/시간대별 모드] (활동: [${activityArea}])
- 글자 수: 군더더기 없는 핵심 서술 3~4줄 (공백 포함 약 150~250자).
` : `
- 현재 모드: [하루 통합 모드] (등원부터 하원까지 하루 일과 전반)
- 글자 수: 300~500자 내외로 풍부하게 서술.
`}

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
    "title": "알림장 제목",
    "content": "학부모용 다정체 서술문 (~했답니다, ~했어요)",
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

  window.GeminiClient = {
    getKey: getGeminiKey,
    generate: generateWithGeminiClient
  };

})(window);
