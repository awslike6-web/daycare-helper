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
function buildSystemInstruction(mode, activityArea, teacherStyle, persona = {}) {
  const isPartial = mode === 'partial';

  const sampleNoteText = persona.sampleNote ? `
[⭐ 최우선 복제 기준: 선생님의 실제 평소 알림장 예시 (Few-shot Imitation)]
다음은 이 선생님이 평소 학부모님께 실제로 보냈던 알림장 문장이다.
반드시 아래 예시문의 '문장 길이, 어미 스타일(~했답니다, ~했지요 등), 이모지 사용 패턴, 줄바꿈 호흡, 특유의 말투'를 100% 모방하여 동일한 필체로 작성하라:
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
- 원아 호칭 규칙: 원아를 부를 때 '${callRule}' 형태로 다정하게 호칭하라.
- 이모지 스타일: ${emojiRule}
${sampleNoteText}
${closingGreeting ? `- 단골 맺음말 지침: 알림장 본문 끝부분에 다음 맺음말을 자연스럽게 포함하거나 반영하라: "${closingGreeting}"` : ''}

[작성 모드 지침]
${isPartial ? `
- 현재 모드: [부분/시간대별 모드]
- 선택된 활동 영역: [${activityArea || '자유놀이'}]
- 글자 수 및 분량: 군더더기 없는 핵심 서술 3~4줄 (공백 포함 약 150~250자 내외).
- 불필요하게 장황한 아침/저녁 인사말은 생략하고, 선택된 활동 장면과 아이의 반응에만 집중할 것.
` : `
- 현재 모드: [하루 통합 모드]
- 등원, 오전 실내놀이, 점심 식습관, 실외활동/낮잠, 오후 놀이 등 하루 일과 전반을 조망하는 종합 관찰문 작성.
- 공백 포함 300~500자 내외로 풍부하고 연속성 있게 서술할 것.
`}

[어조 및 문체 규격]
1. kidsnote (키즈노트 알림장):
   - 학부모 안심 및 공감을 위한 따뜻하고 다정한 어조 (~했답니다, ~하는 모습이 정말 사랑스러웠어요, ~했어요 체).
   - 페르소나 기본 문체: ${persona.name || teacherStyle || '다정친절체'}
   - 사진이 있다면 사진 속 아이의 즐거운 행동, 사용한 교구, 친구와의 상호작용을 생생히 묘사.

2. observation_log (평가제 관찰일지):
   - 보육 평가제 인증 기준의 철저히 객관적인 행동 사실 서술 (~함, ~하는 모습을 보임 체).
   - 절대 금지 표현: '착하다', '예쁘다', '산만하다', '고집부리다' 등 주관적 낙인/심판적 어휘 절대 배제.
   - 표준보육과정 5대 영역 중 가장 부합하는 영역(신체운동·건강, 의사소통, 사회관계, 예술경험, 자연탐구) 매핑.
   - '행동 관찰(behavior)'과 '교사의 지원 및 평가(evaluation)'를 명확히 분리 서술.

3. citation (과거 기록 연계):
   - 이전 기록이 제공된 경우, 이전 기록 대비 아동의 발달적 성장점/변화점(예: 소근육 조절력 향상, 또래 관심 증가 등)을 서술에 반영할 것.
   - citation 요약: 반드시 "📌 참고한 과거 기록: [YYYY-MM-DD] ..." 형식으로 한 줄 요약 작성. 이전 기록이 없으면 빈 문자열.

[반환 형식]: 반드시 아래 JSON 스키마를 엄격히 준수하여 응답하라 (추가 텍스트나 마크다운 코드블록 없이 순수 JSON만 반환).
{
  "kidsnote": {
    "title": "알림장 제목 (예: 블록으로 높이높이 성을 쌓았어요!)",
    "content": "학부모용 다정체 서술문",
    "tags": ["#영역태그1", "#영역태그2"]
  },
  "observation_log": {
    "standard_area": "표준보육 영역 (예: 신체운동·건강 또는 예술경험)",
    "activity_name": "활동명 (예: 블록 쌓기 놀이)",
    "behavior": "객관적 행동 관찰문 (~함 체)",
    "evaluation": "교사의 상호작용 지원 및 발달 평가 (~를 격려함, ~발달이 촉진됨 체)"
  },
  "citation": {
    "has_citation": true or false,
    "summary": "📌 참고한 과거 기록: [2026-09-05] 가위질 미숙 기록 대비 양손 협응력 향상 관찰됨"
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
  allergies,
  pastLogs,
  activityArea,
  mode
}) {
  let prompt = `[원아 기본 정보]
- 가명: [아동A]
- 연령: ${childAge || '만 3세'}
- 특이사항 및 성향: ${childTraits || '특이사항 없음'}
- 알레르기/주의사항: ${allergies || '없음'}
- 작성 모드: ${mode === 'partial' ? '부분/시간대별' : '하루 통합'}
- 활동 영역: ${activityArea || '자유놀이'}

[선생님 작성 메모/단편 키워드]
${maskedMemo || '오늘 즐겁게 활동함'}
`;

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
 * Gemini 3.8 Flash 호출 핵심 함수
 */
export async function generateDaycareLog({
  apiKey,
  childName,
  childAge,
  childTraits,
  allergies,
  rawMemo,
  images = [],
  pastLogs = [],
  mode = 'partial',
  activityArea = '자유놀이',
  teacherStyle = '다정친절체',
  persona = {}
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
  const systemInstruction = buildSystemInstruction(mode, activityArea, teacherStyle, maskedPersona);
  const userTextPrompt = buildUserPrompt({
    maskedMemo,
    childAge,
    childTraits: maskedTraits,
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
