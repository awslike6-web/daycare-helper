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
      parentStyle = '',
      allergies = '',
      rawMemo = '',
      mode = 'partial',
      activityArea = '자유놀이',
      teacherStyle = '다정친절체',
      className = '햇살반',
      teacherName = '김선생님',
      persona = {},
      pastLogs = [],
      monthlyObsOptions = null
    } = payload;

    const isPlayStory = mode === 'play_story' || mode === 'partial';
    const isObservation = mode === 'observation';
    const isClassReport = mode === 'class_report' || (childName && (childName.includes('우리 반') || childName.includes('학급') || childName === '소망반'));

    const targetMonthStr = monthlyObsOptions?.targetMonth || '2026-09';
    const obsDate1 = monthlyObsOptions?.date1 || '2026-09-08';
    const obsArea1 = monthlyObsOptions?.area1 || '의사소통';
    const obsDate2 = monthlyObsOptions?.date2 || '2026-09-22';
    const obsArea2 = monthlyObsOptions?.area2 || '사회관계';

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

    let parentStyleGuideline = '';
    if (parentStyle && !parentStyle.includes('추 후') && !parentStyle.includes('추후')) {
      parentStyleGuideline = `
[⭐ 가정 연계 맞춤 소통 가이드라인 (Parent Persona Adaptation)]
이 아이의 가정 소통 메모:
"${parentStyle}"
- 알림장 본문(kidsnote.content) 작성 시 위 소통 팁을 자연스럽게 반영하라:
  * '안심/일상' 관련: 식사/수유량, 낮잠, 작은 상처 유무, 정서적 안정감을 세심하고 다정하게 안심시켜 주며 서술할 것.
  * '스피디 요약' 관련: 퇴근길 바쁜 학부모를 위해 본문 핵심 놀이 몰입 장면을 3~4줄의 명확하고 알찬 내용으로 임팩트 있게 전달할 것.
  * '교우관계' 관련: 또래 친구를 배려하고, 양보하며 함께 웃은 따뜻한 사회성 일화를 중심으로 부각할 것.
  * '성장 성취' 관련: 아이의 조작력, 공간감각, 문제해결력과 기특한 성취를 칭찬하고 격려하는 내용을 강조할 것.
`;
    } else {
      // 💡 백그라운드 지능형 연령 기본값 (선생님이 학부모 성향을 적지 않아도 자동 안심 서술)
      if (childAge.includes('0세')) {
        parentStyleGuideline = `
[⭐ 만 0세 영아 스마트 안심 소통 원칙 (백그라운드 자동 가동)]
- 만 0세 영아 부모님은 아이의 기본생활(수유/이유식 섭취, 편안한 낮잠, 기저귀 컨디션)과 교사와의 따뜻한 애착 형성을 가장 궁금해하고 안심을 원합니다.
- 교사의 따뜻한 품과 눈맞춤 속에서 정서적으로 편안함을 느끼며 작은 손으로 오감 탐색과 옹알이 미소를 나눈 대목을 포근하고 사랑스럽게 서술하세요.
`;
      } else if (childAge.includes('1세') || childAge.includes('2세')) {
        parentStyleGuideline = `
[⭐ 만 2세 영아 스마트 안심 소통 원칙 (백그라운드 자동 가동)]
- 만 2세는 자아 발달과 또래 관심, 언어 모방 및 신체 에너지가 왕성한 시기입니다.
- 친구와의 즐거운 모방 및 나눔 일화, 교실 규칙을 예쁘게 익혀가는 기특한 노력, 말소리와 신체로 자신의 기쁨을 표현한 대목을 칭찬 위주로 따뜻하게 서술하세요.
`;
      }
    }

    const hasPastLogs = Array.isArray(pastLogs) && pastLogs.length > 0;

    let observationGuideline = '';
    if (!hasPastLogs) {
      observationGuideline = `
- 3. 월간 발달 관찰기록부 (monthly_observation) [🚨 무결성 가드 - 가짜 행동 지어내기(할루시네이션) 원천 차단]:
  * 현재 이 원아는 노션에 누적된 과거 관찰 데이터가 없습니다 (첫 1회차 관찰).
  * obs_1 (1차 관찰, 상순: ${obsDate1}, 영역: ${obsArea1}): 오늘 입력된 실제 메모 팩트만을 바탕으로 사실적이고 객관적인 행동과 교사의 즉각적 비계설정/지원을 서술하세요.
  * obs_2 (2차 관찰): 🚨 절대 가상의 사건이나 없는 놀이 행동을 소설 쓰듯 지어내지 마세요(할루시네이션 엄격 금지)!
    - "activity_title": "(2차 관찰 데이터 누적 대기)"
    - "behavior": "아직 누적된 2차 관찰 기록이 없습니다. 다음 관찰일에 메모를 1회 더 누적해 주시면 실제 기록을 바탕으로 발전적 변화가 연계됩니다."
    - "teacher_support": "유아의 고유 흥미와 발달 수준을 지속 관찰하며 맞춤 상호작용 지원 예정."
    - "growth_continuity": "(관찰 데이터 누적 대기 중)"
  * monthly_summary (월말 총평): 지어낸 발전상이 아니라, 오늘 관찰된 1차 사실을 바탕으로 유아의 현재 발달 특성과 교사의 다음 지도 방향만 간결하고 진솔하게 기술하세요.`;
    } else {
      observationGuideline = `
- 3. 월간 발달 관찰기록부 (monthly_observation) [⭐ 실제 팩트 기반 시계열 연속 관찰 모드]:
  * 노션에 누적된 실제 이전 관찰 기록이 제공되었습니다.
  * 제공된 이전 기록 중 적절한 사건을 obs_1(1차, ${obsDate1})에 매핑하고, 오늘의 최신 사건을 obs_2(2차, ${obsDate2})에 매핑하여, 1차 대비 2차에서의 실제 발전적 변화(growth_continuity)를 완벽하게 도출하세요.
  * 월말 총평(monthly_summary)에는 두 실제 사건의 연속적 발달 변화를 유기적으로 종합하여 서술하세요.`;
    }

    let modeInstruction = '';
    if (isClassReport) {
      modeInstruction = `
[⭐ 현재 모드: 📄 우리 반 놀이중심 보육일지 (A4 정규 공문서 & 학급 전체 알림장 결합형)]
- 핵심 목표: 대한민국 어린이집 평가제 및 원장 결재용 정식 [놀이중심 보육일지] 공문서와 학급 전체 학부모용 [스토리텔링 알림장]을 첨부된 공문서 서식 규격에 100% 맞추어 완벽하게 완성하라.
- 1. 공문서 서식 원칙 (class_daily_report):
  ① 헤더 정보: 반명('${className} (${childAge})'), 일시, 날씨, 놀이 주제(활동 핵심 명쾌한 요약)
  ② [놀이 실행 및 배움 읽기] 2열 테이블 (activities 배열 2~3개):
     - photo_ref: '[사진 1, 2 참조]', '[사진 3 참조]', '[사진 4, 5 참조]' 등 사진 번호 분할
     - observation: '[관찰 내용] '으로 시작하며, 영아들의 생생한 말소리("칙칙폭폭 기차가 출발합니다!", "빨간 다리 지나가요~")와 구체적인 행동 조작/양보/몰입 장면을 현장감 있게 서술
     - learning_content: '[배움 읽기: 영역1, 영역2] - 구체적 배움 분석. 이는 [표준보육과정 영역 > 하위영역 > 세부내용]과 연계된다.' 형식의 표준보육과정(신체운동, 의사소통, 사회관계, 예술경험, 자연탐구) 매핑 문장을 완벽히 수록
  ③ [교사의 성찰 및 지원 내용]:
     - reflection: '● 성찰: '으로 시작하며 놀이의 착안점, 유아들의 반응과 집중도, 야외 활동의 신체 발산 욕구 충족 성찰
     - support: environment('○ 환경 지원: '), safety('○ 바깥놀이 안전 관리: ' 또는 '○ 상호작용 지원: ')
- 2. 학부모용 알림장 원칙 (kidsnote):
  - 학급 전체 학부모용으로 "안녕하세요, ${className} 어머니! 😊" (또는 학부모님)으로 시작
  - 하루의 실내 놀이 ➔ 바깥놀이/산책 ➔ 특별활동/체육을 한 편의 동화처럼 리듬감 있고 다정하게 서술
  - 말미에 반드시 가정 연계 칭찬 발문 가이드("오늘 귀가하면 '오늘 ~ 재미있었어?' 하고 꼬옥 안아주시면서 칭찬 듬뿍 건네주세요!")와 행복한 저녁 기원 인사 포함
`;
    } else if (isPlayStory) {
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
[⭐ 현재 모드: 🧸 영유아 월간 발달 관찰기록부 (보건복지부 평가제 맞춤 관찰)]
${observationGuideline}
`;
    } else {
      modeInstruction = `
[⭐ 현재 모드: 📋 원터치 올인원 마스터 (알림장 + 보육일지 + 관찰일지 동시 완성)]
- 1. 알림장 (kidsnote): 선생님의 평소 어미와 감성을 100% 모방한 다정하고 생생한 놀이 서술문 (250~400자). 놀이 시작부터 친구와의 웃음, 기특한 성취, 가정 연계 칭찬까지 완결성 있게 서술.
- 2. 놀이 보육일지 (class_daily_report): 대한민국 표준보육과정 연계 정식 공문서 양식 ([놀이 실행 및 배움 읽기] 2열 테이블 + 교사 성찰 + 환경/안전 지원).
${observationGuideline}
- 세 가지 대표 서식을 최고의 품격과 완성도로 빠짐없이 완벽하게 동시 출력하라.
`;
    }

    const prompt = `너는 대한민국 어린이집 15년 차 수석 보육교사이자 보육 평가제 수석 컨설턴트다.
원아의 개인정보를 철저히 보호하기 위해 원아는 오직 '[아동A]'로만 호칭한다.

[선생님 스타일 & 페르소나]
- 소속 반: '${className}'
- 선생님 호칭: '${teacherName}'
- 원아 호칭: '${callStyle}'
- 이모지 스타일: ${emojiRule}
${sampleText}
${closingGreeting ? `- 단골 맺음말 지침: 본문 끝부분에 다음 맺음말을 자연스럽게 반영하라: "${closingGreeting}"` : ''}

${parentStyleGuideline}

${modeInstruction}

[품격 있는 긍정 서술 원칙 (필수)]
- '실패', '미숙', '부족', '산만' 등 아이나 교사에게 부정적이거나 단정적인 어휘는 일체 사용하지 않는다.
- 블록이 무너지거나 어려움이 생겨도 좌절하지 않고 미소 지으며 다시 시도하는 '회복탄력성'과 '배움의 호기심'으로 아름답게 승화하여 서술한다.

[원아 정보]
- 가명: [아동A] (${childAge})
- 특이사항/성향: ${childTraits || '특이사항 없음'}
- 학부모 성향/선호 스타일: ${parentStyle || '일반 다정형'}
- 주의사항/알레르기: ${allergies || '없음'}
${pastLogText}

교사 관찰 메모:
${maskedMemo}

반드시 아래 JSON 규격으로만 응답하라:
{
  "class_daily_report": {
    "title": "1. 만 2세 놀이중심 보육일지",
    "date": "2026년 9월 17일 (목)",
    "weather": "맑음",
    "play_theme": "놀이 주제 요약 (예: 칙칙폭폭 기차놀이 & 가을 산책 후 신체놀이)",
    "activities": [
      {
        "photo_ref": "[사진 1, 2 참조]",
        "activity_title": "기차놀이",
        "observation": "[관찰 내용] 영아들은 길게 이어진 파란색 기차 레일 위에... '칙칙폭폭 기차가 출발합니다!' 하고 외친다...",
        "curriculum_areas": ["자연탐구", "예술경험"],
        "learning_content": "[배움 읽기: 자연탐구, 예술경험] - 곡선과 직선 레일을 따라 조작하며 공간과 도형의 연속성을 탐색한다. 이는 [자연탐구 > 수학적 탐구하기 > 공간과 도형에 관심 가지기]와 연계된다. - 기차 소리를 내며 역할을 모방하는 가상놀이를 즐긴다. 이는 [예술경험 > 창의적으로 표현하기 > 모방과 극놀이 즐기기]와 연계된다."
      }
    ],
    "reflection": "● 성찰: 영아들이 블록으로 길게 만들던 기차 형태에 착안해 실제 조립형 레일과 다양한 기차 놀잇감을 연계해 주었더니, 궤도 운동에 높은 집중력을 보였다. 야외에서는 대근육 신체활동을 진행해 아이들의 신체 발산 욕구를 시원하게 충족시켜 줄 수 있었다.",
    "support": {
      "environment": "○ 환경 지원: 기차 레일이 바닥에서 분리되지 않도록 넓은 공간에 안전하게 배치하고 기차 교구를 넉넉히 제공함.",
      "safety": "○ 바깥놀이 안전 관리: 짧은 산책 시 보행 안전선을 지키도록 손잡고 이동을 지도하며 충분한 안전거리를 유지시킴."
    }
  },
  "kidsnote": {
    "title": "놀이의 기쁨과 아이의 감정을 담은 다정한 알림장 제목",
    "content": "학부모를 감동시키는 따뜻하고 생생한 서술식 본문 (~했답니다, ~했어요)",
    "tags": ["${className}", "${activityArea}", "어린이집", "${childAge}"]
  },
  "observation_log": {
    "standard_area": "신체운동·건강 / 의사소통 / 사회관계 / 예술경험 / 자연탐구 중 택1",
    "activity_name": "${activityArea}",
    "behavior": "객관적 행동 관찰문 (~함 체)",
    "evaluation": "교사의 상호작용 지원 및 발달 평가 (~를 지원함)"
  },
  "monthly_observation": {
    "title": "${targetMonthStr} 영유아 발달 관찰기록부",
    "target_month": "${targetMonthStr}",
    "child_name": "[아동A]",
    "age_group": "${childAge}",
    "class_name": "${className}",
    "obs_1": {
      "date": "${obsDate1}",
      "area": "${obsArea1}",
      "activity_title": "활동명",
      "behavior": "객관적 행동 관찰문 (~함 체)",
      "teacher_support": "교사의 언어 모델링 및 상호작용 지원 내용"
    },
    "obs_2": {
      "date": "${obsDate2}",
      "area": "${obsArea2}",
      "activity_title": "활동명",
      "behavior": "1차 지도 이후 아이가 보인 발전된 행동양식 관찰문 (~함 체)",
      "teacher_support": "긍정적 상호작용 지지 및 후속 지원 계획",
      "growth_continuity": "1차 관찰 대비 변화된 성장점 요약"
    },
    "monthly_summary": {
      "development_summary": "1·2차 관찰을 종합한 월간 발달 총평 (표준보육과정 관점)",
      "next_month_plan": "다음 달 교사의 개별 맞춤 지원 및 가정 연계 방향"
    }
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
  "observation_summary": "오늘 아이의 행동양식과 놀이 몰입을 30자 내외로 압축한 핵심 1줄 요약 (노션 관찰 요약 속성 연동용)",
  "individual_observations": [
    {
      "child_name": "원아 실명 (메모에 언급된 아이 이름, 예: 김민수)",
      "activity": "놀이 활동명 (예: 블록 기차놀이)",
      "standard_area": "표준보육 영역 (신체운동/의사소통/사회관계/예술경험/자연탐구)",
      "summary": "해당 아이의 실제 행동과 배움을 객관적으로 요약한 1줄 관찰문 (40~70자)"
    }
  ],
  "citation": {
    "has_citation": true,
    "summary": "📌 참고한 과거 기록: 이전 관찰 대비 성장점 한 줄 요약"
  }
}
[🧩 개별 원아 놀이 발췌 지침 (individual_observations)]:
- 메모나 사진 속에서 특정 아이(예: 민수, 민서 등)의 이름이나 뚜렷한 개별 놀이 모습이 언급된 경우에만 정확히 발췌하라.
- 🚨 절대 메모에 없는 아이를 임의로 지어내지 말 것. 언급된 아이가 없으면 빈 배열 []로 응답하라.`;

    // 3. 파트 구성 (텍스트 프롬프트 + 놀이 사진 멀티모달 파트)
    const parts = [{ text: prompt }];

    if (Array.isArray(payload.images) && payload.images.length > 0) {
      for (const img of payload.images.slice(0, 6)) {
        if (!img) continue;
        const match = img.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
        if (match) {
          parts.push({
            inlineData: {
              mimeType: match[1],
              data: match[2]
            }
          });
        } else {
          parts.push({
            inlineData: {
              mimeType: 'image/jpeg',
              data: img
            }
          });
        }
      }
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: parts }],
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
