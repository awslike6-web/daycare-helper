/**
 * 🧸 Gemini 3.8 Flash 멀티모달 프롬프트 & 실명 안심 가드 오케스트레이터
 * 
 * 2026 플래그십 표준 모델: gemini-3.8-flash (후보: gemini-3.6-flash)
 * 기능:
 *  1. 개인정보 안심 가드: 실명 -> [아동A] 자동 마스킹 및 수신 후 안전 복원
 *  2. 듀얼 모드 프롬프트: 부분/시간대별(3~4줄 간결) vs 하루 통합(종합 관찰)
 *  3. One-Source Multi-Use: 알림장(다정체) + 평가제 관찰일지(객관체) 동시 생성
 *  4. 멀티모달 이미지 인식: 사진 속 표정, 교구, 놀이 맥락 분석 반영
 *  5. 과거 기록(Citation) 연계: 이전 2~3건 관찰 이력 대조 및 성장점 출처 표기
 */

const GEMINI_PRIMARY_MODEL = 'gemini-3.8-flash';
const GEMINI_FALLBACK_MODEL = 'gemini-3.6-flash';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * 실명 마스킹 유틸리티
 */
export function maskName(text, childName) {
  if (!text || !childName) return text;
  // 이름의 특수문자 이스케이프
  const escaped = childName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(escaped, 'g'), '[아동A]');
}

/**
 * 실명 복원 유틸리티
 */
export function unmaskName(text, childName) {
  if (!text || !childName) return text;
  return text.replace(/\[아동\s*A\]/g, childName);
}

/**
 * 중첩된 객체 내의 모든 문자열에서 [아동A]를 원아 실명으로 복원
 */
export function unmaskDeep(obj, childName) {
  if (!childName) return obj;
  if (typeof obj === 'string') {
    return unmaskName(obj, childName);
  }
  if (Array.isArray(obj)) {
    return obj.map(item => unmaskDeep(item, childName));
  }
  if (obj && typeof obj === 'object') {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = unmaskDeep(value, childName);
    }
    return result;
  }
  return obj;
}

/**
 * 시스템 인스트럭션 생성
 */
function buildSystemInstruction(mode, activityArea, teacherStyle, persona = {}, className = '햇살반', teacherName = '김선생님') {
  const isPlayStory = mode === 'play_story' || mode === 'partial';
  const isObservation = mode === 'observation';

  const sampleNoteText = persona.sampleNote ? `
[⭐ 최우선 복제 기준: 선생님의 실제 평소 알림장 예시 (Few-shot Imitation)]
다음은 이 선생님이 평소 학부모님께 실제로 보냈던 알림장 문장이다.
반드시 아래 예시문의 '문장 호흡, 어미 스타일(~했답니다, ~했어요 등), 이모지 감성, 줄바꿈 습관'을 100% 모방하여 동일한 필체로 작성하라:
"""
${persona.sampleNote}
"""
` : '';

  const emojiRule = {
    none: '이모지를 일체 사용하지 말고 단정하고 깔끔한 텍스트로만 작성할 것.',
    moderate: '이모지는 과하지 않게 문맥에 맞추어 1~2개 정도만 자연스럽게 넣을 것 (예: ^^, 🌱, ✨).',
    rich: '이모지를 적절히 풍부하고 발랄하게 사용하여 생동감을 살릴 것 (예: 🥰, 💖, 👏, 🌈).'
  }[persona.emojiLevel || 'moderate'];

  const callRule = persona.callStyle || '우리 [아동A]';
  const closingGreeting = persona.closingGreeting || '';

  return `너는 대한민국 어린이집 및 유치원의 15년 차 수석 보육교사이자 보육 평가제(평가인증) 수석 컨설턴트다.
원아의 개인정보를 철저히 보호하기 위해 원아는 오직 '[아동A]'로만 호칭한다.

[선생님 페르소나 & 스타일 가이드]
- 소속 반: '${className || '햇살반'}'
- 선생님 호칭: '${teacherName || '김선생님'}'
- 원아 호칭 규칙: 원아를 부를 때 '${callRule}' 형태로 다정하게 호칭하라.
- 이모지 스타일: ${emojiRule}
${sampleNoteText}
${closingGreeting ? `- 단골 맺음말 지침: 알림장 본문 끝부분에 다음 맺음말을 자연스럽게 포함하거나 반영하라: "${closingGreeting}"` : ''}

[작성 모드 지침]
${isPlayStory ? `
- 현재 모드: [📸 놀이 알림장 집중 (알잘딱 생생 서술형)]
- 선택된 활동 영역: [${activityArea || '자유놀이'}]
- 핵심 지침: 3~4줄로 억지로 줄이지 말 것! 선생님이 입력한 놀이 사진/장면에 100% 집중하여, 학부모가 읽었을 때 아이의 놀이 모습과 감정이 눈앞에 따뜻하게 그려지도록 250~400자 내외의 풍부한 서술형으로 완성하라.
- 서술 흐름: 호기심과 놀이 시작 ➔ 교구 탐색 및 조작 ➔ 또래/교사와의 따뜻한 상호작용 및 웃음 ➔ 아이의 기특한 성취감 ➔ 가정 연계 칭찬.
` : isObservation ? `
- 현재 모드: [🧸 평가제 관찰일지 집중]
- 보육 평가제 표준보육과정 기준의 객관적 행동 사실 서술(~함 체)과 교사의 배움 지원을 전문적으로 작성하라.
` : `
- 현재 모드: [📋 5대 보육 서식 종합팩]
- 알림장, 관찰일지, 보육일지, 상담일지, 놀이지원안 전체 5대 서식을 균형 있게 완성하라.
`}

[품격 있는 긍정 서술 원칙 (필수)]
- '실패', '미숙', '부족', '산만' 등 아이나 교사에게 부정적이거나 낙인을 찍는 어휘는 일체 배제한다.
- 어려움이 생겨도 밝게 웃으며 재도전하는 '회복탄력성'과 '배움의 과정'으로 긍정적으로 승화하여 서술한다.

[어조 및 5대 보육 표준 서식 규격]
1. kidsnote (키즈노트 알림장):
   - 학부모 안심 및 공감을 위한 따뜻하고 다정한 어조 (~했답니다, ~하는 모습이 정말 사랑스러웠어요, ~했어요 체).
   - 페르소나 기본 문체: ${persona.name || teacherStyle || '다정친절체'}
   - 사진이 있다면 사진 속 아이의 즐거운 행동, 사용한 교구, 친구와의 상호작용을 생생히 묘사.

2. observation_log (평가제 관찰일지):
   - 보육 평가제 인증 기준의 철저히 객관적인 행동 사실 서술 (~함, ~하는 모습을 보임 체).
   - 절대 금지 표현: '착하다', '예쁘다', '산만하다', '고집부리다' 등 주관적 낙인/심판적 어휘 절대 배제.
   - 표준보육과정 5대 영역 중 가장 부합하는 영역(신체운동·건강, 의사소통, 사회관계, 예술경험, 자연탐구) 매핑.
   - '행동 관찰(behavior)'과 '교사의 지원 및 평가(evaluation)'를 명확히 분리 서술.

3. daily_care_log (일일 보육일지 - 반 전체 놀이 평가):
   - 공문서 결재용 단정체 (~을 지원함, ~가 나타남 체).
   - 오늘 우리 반의 주요 놀이 흐름(summary), 교사의 종합 놀이 평가(evaluation), **내일 놀이 연계 및 환경/교구 지원 계획(next_plan)** 포함.

4. parent_counseling (학부모 상담 면담일지 요약):
   - 1학기/2학기 학부모 개별 상담에 즉시 인용할 수 있는 체계적 분석.
   - 기본생활습관(routine), 대인관계/사회성(social), 발달 특성(development), 교사 종합 상담 의견(opinion).

5. play_support_plan (놀이 지원 & 환경구성안):
   - 아이들이 오늘 보인 놀이를 더 깊고 넓게 확장할 수 있는 아이디어(extension_idea), 필요한 공간 및 추가 교구(supplies), 교사의 상호작용 발문 팁(interaction_tips).

6. citation (과거 기록 연계):
   - 이전 기록이 제공된 경우, 이전 기록 대비 아동의 발달적 성장점/변화점(예: 소근육 조절력 향상, 또래 관심 증가 등)을 서술에 반영할 것.
   - citation 요약: 반드시 "📌 참고한 과거 기록: [YYYY-MM-DD] ..." 형식으로 한 줄 요약 작성. 이전 기록이 없으면 빈 문자열.

[반환 형식]: 반드시 아래 JSON 스키마를 엄격히 준수하여 응답하라 (추가 텍스트나 마크다운 코드블록 없이 순수 JSON만 반환).
{
  "class_daily_report": {
    "title": "1. 만 2세 놀이중심 보육일지",
    "date": "2026년 9월 17일 (목)",
    "weather": "맑음",
    "play_theme": "놀이 주제 요약",
    "activities": [
      {
        "photo_ref": "[사진 1, 2 참조]",
        "activity_title": "기차놀이",
        "observation": "[관찰 내용] 영아들의 생생한 발화와 행동 조작 관찰문",
        "curriculum_areas": ["자연탐구", "예술경험"],
        "learning_content": "[배움 읽기: 자연탐구, 예술경험] - 구체적 배움 분석. 이는 [자연탐구 > 수학적 탐구하기 > 공간과 도형에 관심 가지기]와 연계된다."
      }
    ],
    "reflection": "● 성찰: 오늘 놀이에 대한 교사의 교육적 배움 성찰",
    "support": {
      "environment": "○ 환경 지원: 교구 및 공간 배치 환경 지원",
      "safety": "○ 바깥놀이 안전 관리: 보행 안전선 또는 상호작용 지도"
    }
  },
  "kidsnote": {
    "title": "알림장 제목",
    "content": "학부모용 다정체 서술문",
    "tags": ["#태그1", "#태그2"]
  },
  "observation_log": {
    "standard_area": "표준보육 영역 (예: 신체운동·건강)",
    "activity_name": "활동명",
    "behavior": "객관적 행동 관찰문 (~함 체)",
    "evaluation": "교사의 상호작용 지원 및 발달 평가"
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
    "summary": "📌 참고한 과거 기록: [2026-09-05] 대비 성장 요약"
  }
}`;
}

/**
 * 프롬프트 사용자 메시지 조립
 */
function buildUserPrompt({
  maskedMemo,
  childAge,
  childTraits,
  parentStyle,
  allergies,
  pastLogs,
  activityArea,
  mode
}) {
  let prompt = `[원아 기본 정보]
- 가명: [아동A]
- 연령: ${childAge || '만 4세'}
- 특이사항 및 성향: ${childTraits || '특이사항 없음'}
- 학부모 성향 & 알림장 선호 스타일: ${parentStyle || '일반 다정형'}
- 알레르기/주의사항: ${allergies || '없음'}
- 작성 모드: ${mode === 'partial' ? '부분/시간대별' : '하루 통합'}
- 활동 영역: ${activityArea || '자유놀이'}

[선생님 작성 메모/단편 키워드]
${maskedMemo || '오늘 즐겁게 활동함'}
`;

  if (parentStyle && !parentStyle.includes('추 후') && !parentStyle.includes('추후')) {
    prompt += `\n[⭐ 가정 연계 맞춤 소통 팁 (Parent Persona Adaptation)]\n`;
    prompt += `이 아이의 가정 소통 메모: '${parentStyle}'. 알림장 본문(kidsnote.content) 작성 시 이 소통 포인트를 자연스럽게 반영해줘.\n`;
  } else if (childAge && childAge.includes('0세')) {
    prompt += `\n[⭐ 만 0세 영아 스마트 안심 소통 원칙]\n`;
    prompt += `만 0세 영아는 수유/식사, 편안한 낮잠, 기저귀 컨디션과 교사와의 따뜻한 애착 스킨십을 학부모가 가장 궁금해합니다. 포근하고 안심되는 톤으로 서술해줘.\n`;
  } else if (childAge && (childAge.includes('1세') || childAge.includes('2세'))) {
    prompt += `\n[⭐ 만 2세 유아 스마트 안심 소통 원칙]\n`;
    prompt += `만 2세는 또래와의 상호작용, 모방 및 언어/감정 표현 시도, 규칙을 익혀가는 기특한 노력을 칭찬 위주로 따뜻하게 서술해줘.\n`;
  }

  if (pastLogs && pastLogs.length > 0) {
    prompt += `\n[해당 원아의 최근 이전 관찰 기록 (참조용)]\n`;
    pastLogs.slice(0, 3).forEach((log, idx) => {
      prompt += `${idx + 1}. 날짜: ${log.date || '이전'} | 활동: ${log.activity || '놀이'} | 관찰: ${log.behavior || log.raw_memo || ''}\n`;
    });
    prompt += `위 이전 기록과 비교하여 성장하거나 달라진 점이 있다면 관찰일지와 알림장에 자연스럽게 반영하고 citation을 작성해줘.\n`;
  }

  return prompt;
}

/**
 * 이미지 Base64를 Gemini inlineData 파트로 변환
 */
function parseImageData(imageInput) {
  if (!imageInput) return null;
  // data:image/png;base64,xxxx 형태인지 확인
  const match = imageInput.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
  if (match) {
    return {
      inline_data: {
        mime_type: match[1],
        data: match[2]
      }
    };
  }
  // 순수 Base64인 경우 기본 jpeg 처리
  return {
    inline_data: {
      mime_type: 'image/jpeg',
      data: imageInput
    }
  };
}

/**
 * Gemini API 호출 메인 오케스트레이터
 */
export async function generateDaycareLog({
  apiKey,
  childName,
  childAge,
  childTraits,
  parentStyle = '',
  allergies,
  rawMemo,
  images = [],
  pastLogs = [],
  mode = 'partial',
  activityArea = '자유놀이',
  teacherStyle = '다정친절체',
  persona = {},
  className = '햇살반',
  teacherName = '김선생님'
}) {
  if (!apiKey) {
    throw new Error('Gemini API 키가 제공되지 않았습니다.');
  }

  // 1. 실명 마스킹 가드 (개인정보 보호)
  const maskedMemo = maskName(rawMemo || '', childName);
  const maskedTraits = maskName(childTraits || '', childName);
  const maskedPastLogs = pastLogs.map(log => ({
    ...log,
    behavior: maskName(log.behavior || '', childName),
    raw_memo: maskName(log.raw_memo || '', childName)
  }));

  // 페르소나 예시문 내의 아동 실명도 안전 마스킹
  const maskedPersona = {
    ...persona,
    sampleNote: maskName(persona.sampleNote || '', childName)
  };

  // 2. 시스템 인스트럭션 및 프롬프트 빌드
  const systemInstruction = buildSystemInstruction(mode, activityArea, teacherStyle, maskedPersona, className, teacherName);
  const userTextPrompt = buildUserPrompt({
    maskedMemo,
    childAge,
    childTraits: maskedTraits,
    parentStyle,
    allergies,
    pastLogs: maskedPastLogs,
    activityArea,
    mode
  });

  // 3. 파트 구성 (텍스트 + 멀티모달 이미지들)
  const parts = [{ text: userTextPrompt }];

  if (Array.isArray(images)) {
    for (const img of images.slice(0, 6)) {
      const part = parseImageData(img);
      if (part) parts.push(part);
    }
  }

  const payload = {
    system_instruction: {
      parts: [{ text: systemInstruction }]
    },
    contents: [
      {
        role: 'user',
        parts: parts
      }
    ],
    generationConfig: {
      temperature: 0.6,
      topP: 0.95,
      responseMimeType: 'application/json'
    }
  };

  // 4. 모델 호출 (3.8-flash 우선, 실패 시 3.6-flash 폴백)
  const callModel = async (modelName) => {
    const url = `${GEMINI_API_BASE}/${modelName}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API Error (${modelName}, status: ${response.status}): ${errText}`);
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];
    const rawContent = candidate?.content?.parts?.[0]?.text;
    if (!rawContent) {
      throw new Error(`Gemini API returned empty response (${modelName})`);
    }

    return JSON.parse(rawContent);
  };

  let parsedJson = null;
  try {
    parsedJson = await callModel(GEMINI_PRIMARY_MODEL);
  } catch (err) {
    console.warn(`Primary model ${GEMINI_PRIMARY_MODEL} failed, falling back to ${GEMINI_FALLBACK_MODEL}:`, err);
    parsedJson = await callModel(GEMINI_FALLBACK_MODEL);
  }

  // 5. 실명 언마스킹 복원 ([아동A] -> 실제 원아 이름)
  const unmaskedResult = unmaskDeep(parsedJson, childName);

  return {
    success: true,
    data: unmaskedResult,
    meta: {
      child_name: childName,
      mode,
      activity_area: activityArea,
      model_used: GEMINI_PRIMARY_MODEL
    }
  };
}
