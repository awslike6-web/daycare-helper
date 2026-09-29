/**
 * 🏰 Notion REST API 연동 모듈 (api/notion.js)
 * 
 * 표준 헤더: Notion-Version: 2022-06-28
 * 3대 관계형 DB 연동:
 *  1️⃣ 교사/반 관리 DB (TEACHER_DB)
 *  2️⃣ 원아 마스터 DB (CHILD_DB)
 *  3️⃣ 일지 & 알림장 메인 DB (DAILY_LOG_DB)
 */

const NOTION_API_BASE = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

// 초기 환경 및 오프라인 폴백용 노션 CHILD_DB 실데이터 11명
const MOCK_CHILDREN = [
  // 🌸 사랑반 (공가영 선생님 / 아내분 - 만 0세)
  {
    id: '3e0a2711-5b68-81c6-a415-cd9c81fbfa72',
    name: '김태리',
    age: '만 0세',
    childClass: '사랑반',
    traits: '여아, 눈맞춤과 옹알이 반응이 좋으며 감각 탐색 놀이에 반응함',
    parentStyle: '안심 서술형 (식사/수유, 낮잠, 정서적 안정감 중심 안내 선호)',
    allergies: '없음'
  },
  {
    id: '3e0a2711-5b68-8179-a7ee-d12f0224c47c',
    name: '인우진',
    age: '만 0세',
    childClass: '사랑반',
    traits: '남아, 오감 감각 놀이 및 교사와의 따뜻한 애착 형성 중',
    parentStyle: '안심 서술형 (수유량, 낮잠 시간, 작은 컨디션 변화 세심 안내 선호)',
    allergies: '없음'
  },

  // 🌿 소망반 (공가희 주임교사 / 처형분 - 만 2세)
  {
    id: '3e0a2711-5b68-8186-b889-e52f2acac412',
    name: '김건하',
    age: '만 2세',
    childClass: '소망반',
    traits: '남아, 교사의 말을 귀 기울여 따라 하려는 모방 발화가 나타남, 활발한 대근육 신체활동을 무척 즐김',
    parentStyle: '담백한 일상 서술형 (아이가 즐거워한 놀이와 활동 중심의 자연스러운 소통)',
    allergies: '없음'
  },
  {
    id: '3e0a2711-5b68-8177-ab06-cdba836d50b1',
    name: '나화음',
    age: '만 2세',
    childClass: '소망반',
    traits: '여아, 춤과 노래, 아기자기한 소꿉놀이를 좋아함. 약속을 잘 지키며, 낯선 환경에서는 긴장하는 조심스러운 성격',
    parentStyle: '안정 지지형 (아이가 교실에서 편안하게 적응하고 성취한 따뜻한 순간 안내 선호)',
    allergies: '낯선 환경 방문 시 따뜻하게 손잡아주며 안심 유도'
  },
  {
    id: '3e0a2711-5b68-817d-ace4-c7baa9155114',
    name: '서은호',
    age: '만 2세',
    childClass: '소망반',
    traits: '남아, 또래 친구들과 어울리는 것을 좋아하며, 신체놀이보다는 차분한 미술 및 조작 놀이에 깊이 몰입함',
    parentStyle: '관심사 존중 및 성장 격려형 (손끝 조작 성취 칭찬 및 즐거운 신체놀이 점진적 확장)',
    allergies: '없음'
  },
  {
    id: '3e0a2711-5b68-8186-8e7f-fdfc96f4aafa',
    name: '임아윤',
    age: '만 2세',
    childClass: '소망반',
    traits: '여아, 친구들의 놀이를 관찰한 뒤 관심 있는 곳으로 이동해 탐색함. 노래와 춤추기를 좋아하며, 놀이 방해 시 싫다는 표현을 명확히 함',
    parentStyle: '자율 탐색 격려형 (호기심 많은 다양한 놀이 이동과 즐거운 음악 놀이 소통 선호)',
    allergies: '한 가지 놀이 지속 시간이 짧으므로 다양한 놀이 코너 순차 지원'
  },
  {
    id: '3e0a2711-5b68-810a-8fcd-de34a2b9c1b5',
    name: '김도준',
    age: '만 2세',
    childClass: '소망반',
    traits: '남아, 신체놀이를 좋아하여 에너지 넘침(교실 내 안전 규칙 지도 중), 친구를 잘 챙기며 놀잇감을 잘 나누어 줌',
    parentStyle: '교우관계 및 긍정 격려형 (친구와의 배려/나눔 일화 및 규칙 성장 칭찬 선호)',
    allergies: '없음'
  },
  {
    id: '3e0a2711-5b68-8116-b826-ead833777772',
    name: '김하율',
    age: '만 2세',
    childClass: '소망반',
    traits: '여아, 흥이 많고 노래와 춤을 매우 좋아함. 발음이 아직 미숙하여 언어 표현보다 표정과 신체 표현을 많이 사용함',
    parentStyle: '따뜻한 정서 공감형 (아이의 흥겨운 감정과 또래 상호작용 지지 선호)',
    allergies: '⚠️ 아토피가 심함 (피부 긁음 및 실내 보습/온도 세심 관찰)'
  },
  {
    id: '3e0a2711-5b68-81f7-b404-ce36a83b05f2',
    name: '이제하',
    age: '만 2세',
    childClass: '소망반',
    traits: '남아, 신체 놀이와 뛰기를 매우 좋아함(교실 내 걷기 약속 지도 중). 블록 창의 만들기와 역할놀이 분담을 잘함',
    parentStyle: '창의력 칭찬형 (뛰어난 블록 만들기 및 친구와의 협동 놀이 성과 공유 선호)',
    allergies: '⚠️ 놀이를 방해받으면 말보다 울음으로 표현함 (친구 중재 및 감정 언어화 지도)'
  },

  // 🧪 연구반 (연구 선생님 - 샌드박스)
  {
    id: '3e0a2711-5b68-81ec-b2a1-f1d6ac1e0184',
    name: '김민수',
    age: '만 2세 (연구반)',
    childClass: '연구반',
    traits: '블록 놀이와 탈것을 좋아하며 집중력이 높고 호기심이 많음.',
    parentStyle: '칭찬과 격려를 좋아하시고 오늘의 특별한 놀이 활동을 궁금해하심',
    allergies: '없음'
  },
  {
    id: '3e0a2711-5b68-81a1-95e2-dfda7a74750f',
    name: '김민서',
    age: '만 2세 (연구반)',
    childClass: '연구반',
    traits: '방긋방긋 잘 웃고 음악에 맞춰 몸을 흔드는 것을 좋아함.',
    parentStyle: '따뜻한 일상 소통을 선호하시고 수면 및 이유식 섭취 상태를 세심하게 챙기심',
    allergies: '없음'
  }
];

const MOCK_PAST_LOGS = {
  'mock-child-1': [
    {
      id: 'past-log-1',
      date: '2026-09-05',
      activity: '자유놀이(미술)',
      behavior: '색종이를 가위로 오릴 때 양손 협응이 서툴러 교사의 보조를 받아 선을 따라 자름.',
      raw_memo: '가위질 직선 오리기 서툼'
    },
    {
      id: 'past-log-2',
      date: '2026-09-12',
      activity: '실외놀이',
      behavior: '미끄럼틀 계단을 두 발 모아 천천히 오르내리며 안전하게 신체 활동에 참여함.',
      raw_memo: '미끄럼틀 차례 지키기'
    }
  ],
  'mock-child-2': [
    {
      id: 'past-log-3',
      date: '2026-09-10',
      activity: '자유놀이',
      behavior: '블록 영역에서 친구에게 먼저 블록을 건네며 성 쌓기를 시도함.',
      raw_memo: '친구와 블록 같이 씀'
    }
  ]
};

/**
 * Notion API 공통 호출 래퍼
 */
async function callNotionApi({ endpoint, method = 'GET', body = null, token, proxyUrl = null }) {
  const cleanBase = proxyUrl ? proxyUrl.replace(/\/$/, '') + '/v1' : NOTION_API_BASE;
  const targetUrl = `${cleanBase}${endpoint}`;

  const headers = {
    'Content-Type': 'application/json',
    'Notion-Version': NOTION_VERSION,
    'User-Agent': 'Mozilla/5.0'
  };

  if (token) {
    headers['Authorization'] = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
  }

  const options = {
    method,
    headers
  };

  if (body && (method === 'POST' || method === 'PATCH' || method === 'PUT')) {
    options.body = typeof body === 'string' ? body : JSON.stringify(body);
  }

  const resp = await fetch(targetUrl, options);
  if (!resp.ok) {
    const errorText = await resp.text();
    throw new Error(`Notion API Error (${resp.status} ${resp.statusText}): ${errorText}`);
  }

  return await resp.json();
}

/**
 * 1️⃣ 원아 목록 조회 (/api/children)
 */
export async function getChildrenList(env) {
  const dbId = env.NOTION_CHILD_DB_ID;
  const token = env.NOTION_TOKEN;
  const proxyUrl = env.NOTION_PROXY_URL;

  // 노션 DB가 연결되지 않은 경우 모크 목록 반환
  if (!dbId || (!token && !proxyUrl)) {
    return {
      source: 'mock_fallback',
      children: MOCK_CHILDREN
    };
  }

  try {
    const queryPayload = {
      page_size: 100,
      sorts: [
        {
          property: '아동명',
          direction: 'ascending'
        }
      ]
    };

    const data = await callNotionApi({
      endpoint: `/databases/${dbId}/query`,
      method: 'POST',
      body: queryPayload,
      token,
      proxyUrl
    });

    const children = data.results.map(page => {
      const props = page.properties;
      const name = props['아동명']?.title?.[0]?.plain_text || '이름 없음';
      const age = props['생년월일/연령']?.rich_text?.[0]?.plain_text || props['생년월일/연령']?.date?.start || '만 4세';
      const traits = props['성향 및 특이사항']?.rich_text?.[0]?.plain_text || '';
      const parentStyle = props['학부모 성향 & 알림장 스타일']?.rich_text?.[0]?.plain_text || '';
      const allergies = props['알레르기/주의사항']?.rich_text?.[0]?.plain_text || '';

      let childClass = props['소속 반']?.select?.name || '';
      if (!childClass && age.includes('(')) {
        const match = age.match(/\((.*?)\)/);
        if (match && match[1]) childClass = match[1].trim();
      }

      return {
        id: page.id,
        name,
        age,
        childClass,
        traits,
        parentStyle,
        allergies
      };
    });

    return {
      source: 'notion',
      children: children.length > 0 ? children : MOCK_CHILDREN
    };
  } catch (err) {
    console.warn('Notion getChildrenList failed, using mock data:', err);
    return {
      source: 'mock_fallback',
      error: err.message,
      children: MOCK_CHILDREN
    };
  }
}

/**
 * 2️⃣ 특정 원아의 최근 일지 조회 (/api/children/:id/recent-logs)
 */
export async function getRecentChildLogs(childId, childName, env) {
  const dbId = env.NOTION_DAILY_LOG_DB_ID;
  const token = env.NOTION_TOKEN;
  const proxyUrl = env.NOTION_PROXY_URL;

  // 모크 데이터 확인
  if (!dbId || !token || childId.startsWith('mock-')) {
    const mockLogs = MOCK_PAST_LOGS[childId] || [];
    return {
      source: 'mock_fallback',
      logs: mockLogs
    };
  }

  try {
    const queryPayload = {
      page_size: 3,
      sorts: [
        {
          property: '작성일자',
          direction: 'descending'
        }
      ],
      filter: {
        property: '원아',
        relation: {
          contains: childId
        }
      }
    };

    const data = await callNotionApi({
      endpoint: `/databases/${dbId}/query`,
      method: 'POST',
      body: queryPayload,
      token,
      proxyUrl
    });

    const logs = data.results.map(page => {
      const props = page.properties;
      const date = props['작성일자']?.date?.start || '';
      const activity = props['활동 구분']?.select?.name || '자유놀이';
      const behavior = props['관찰일지 최종본']?.rich_text?.[0]?.plain_text || '';
      const raw_memo = props['원시 메모/키워드']?.rich_text?.[0]?.plain_text || '';

      return {
        id: page.id,
        date,
        activity,
        behavior,
        raw_memo
      };
    });

    return {
      source: 'notion',
      logs
    };
  } catch (err) {
    console.warn('Notion getRecentChildLogs failed:', err);
    return {
      source: 'mock_fallback',
      error: err.message,
      logs: MOCK_PAST_LOGS[childId] || []
    };
  }
}

/**
 * 3️⃣ 일지 & 알림장 노션 DB 저장 (/api/logs/save)
 */
export async function saveDailyLogToNotion({
  date,
  childId,
  childName,
  teacherId,
  activityArea,
  standardArea,
  rawMemo,
  kidsnoteText,
  observationText,
  citationSummary,
  obsSummary,
  referencedLogId
}, env) {
  const dbId = env.NOTION_DAILY_LOG_DB_ID;
  const token = env.NOTION_TOKEN;
  const proxyUrl = env.NOTION_PROXY_URL;

  const today = date || new Date().toISOString().split('T')[0];
  const pageTitle = `[${today}] ${childName} - ${activityArea || '자유놀이'}`;

  // 노션 환경 미구축 시 시뮬레이션 성공 반환
  if (!dbId || (!token && !proxyUrl)) {
    return {
      success: true,
      mode: 'mock_saved',
      message: '로컬 모크 모드로 저장 완료되었습니다. (.dev.vars에 노션 DB ID 설정 시 실시간 저장됩니다.)',
      page_id: `mock-page-${Date.now()}`,
      title: pageTitle
    };
  }

  // 노션 3대 DB 관계형 및 프로퍼티 페이로드 구성
  const properties = {
    '기록명/식별자': {
      title: [
        {
          text: { content: pageTitle }
        }
      ]
    },
    '작성일자': {
      date: { start: today }
    },
    '활동 구분': {
      select: { name: activityArea || '자유놀이' }
    },
    '표준보육 영역': {
      multi_select: standardArea ? [{ name: standardArea }] : [{ name: '의사소통' }]
    },
    '원시 메모/키워드': {
      rich_text: [
        {
          text: { content: rawMemo || '' }
        }
      ]
    },
    '알림장 최종본': {
      rich_text: [
        {
          text: { content: kidsnoteText || '' }
        }
      ]
    },
    '관찰일지 최종본': {
      rich_text: [
        {
          text: { content: observationText || '' }
        }
      ]
    },
    '참조 출처 요약': {
      rich_text: [
        {
          text: { content: citationSummary || '' }
        }
      ]
    },
    '관찰 요약': {
      rich_text: [
        {
          text: { content: obsSummary || rawMemo || '' }
        }
      ]
    }
  };

  // 원아 관계형 연결 (실제 노션 페이지 ID인 경우)
  if (childId && !childId.startsWith('mock-')) {
    properties['원아'] = {
      relation: [{ id: childId }]
    };
  }

  // 교사 관계형 연결
  if (teacherId && !teacherId.startsWith('mock-')) {
    properties['작성교사'] = {
      relation: [{ id: teacherId }]
    };
  }

  // 참조한 과거 일지 관계형 연결
  if (referencedLogId && !referencedLogId.startsWith('mock-')) {
    properties['참조한 과거 일지'] = {
      relation: [{ id: referencedLogId }]
    };
  }

  const createPayload = {
    parent: { database_id: dbId },
    properties
  };

  const response = await callNotionApi({
    endpoint: '/pages',
    method: 'POST',
    body: createPayload,
    token,
    proxyUrl
  });

  return {
    success: true,
    mode: 'notion_saved',
    page_id: response.id,
    title: pageTitle,
    url: response.url
  };
}

/**
 * 4️⃣ 신규 원아 등록 (/api/children - POST)
 */
export async function saveChildToNotion({ name, age, childClass, traits, parentStyle, allergies }, env) {
  const dbId = env.NOTION_CHILD_DB_ID;
  const token = env.NOTION_TOKEN;
  const proxyUrl = env.NOTION_PROXY_URL;

  if (!name) {
    throw new Error('원아 이름이 필요합니다.');
  }

  // 모크 모드인 경우
  if (!dbId || (!token && !proxyUrl)) {
    const mockId = `mock-child-${Date.now()}`;
    return {
      success: true,
      mode: 'mock_created',
      child: {
        id: mockId,
        name,
        age: age || '만 4세',
        childClass: childClass || '',
        traits: traits || '',
        parentStyle: parentStyle || '',
        allergies: allergies || ''
      }
    };
  }

  const properties = {
    '아동명': {
      title: [{ text: { content: name } }]
    },
    '생년월일/연령': {
      rich_text: [{ text: { content: age || '만 4세' } }]
    },
    '성향 및 특이사항': {
      rich_text: [{ text: { content: traits || '' } }]
    },
    '학부모 성향 & 알림장 스타일': {
      rich_text: [{ text: { content: parentStyle || '' } }]
    },
    '알레르기/주의사항': {
      rich_text: [{ text: { content: allergies || '' } }]
    }
  };

  if (childClass) {
    properties['소속 반'] = { select: { name: childClass } };
  }

  const createPayload = {
    parent: { database_id: dbId },
    properties
  };

  const response = await callNotionApi({
    endpoint: '/pages',
    method: 'POST',
    body: createPayload,
    token,
    proxyUrl
  });

  return {
    success: true,
    mode: 'notion_created',
    child: {
      id: response.id,
      name,
      age: age || '만 4세',
      childClass: childClass || '',
      traits: traits || '',
      parentStyle: parentStyle || '',
      allergies: allergies || '',
      url: response.url
    }
  };
}

/**
 * 5️⃣ 원아 정보 수정 (/api/children/:id - PUT)
 */
export async function updateChildInNotion(childId, { name, age, childClass, traits, parentStyle, allergies }, env) {
  const token = env.NOTION_TOKEN;
  const proxyUrl = env.NOTION_PROXY_URL;

  if (!childId) {
    throw new Error('원아 ID가 필요합니다.');
  }

  // 모크 원아인 경우
  if (childId.startsWith('mock-')) {
    return {
      success: true,
      mode: 'mock_updated',
      child: {
        id: childId,
        name,
        age: age || '만 4세',
        childClass: childClass || '',
        traits: traits || '',
        parentStyle: parentStyle || '',
        allergies: allergies || ''
      }
    };
  }

  const properties = {};
  if (name) {
    properties['아동명'] = {
      title: [{ text: { content: name } }]
    };
  }
  if (age !== undefined) {
    properties['생년월일/연령'] = {
      rich_text: [{ text: { content: age } }]
    };
  }
  if (childClass !== undefined) {
    properties['소속 반'] = { select: { name: childClass } };
  }
  if (traits !== undefined) {
    properties['성향 및 특이사항'] = {
      rich_text: [{ text: { content: traits } }]
    };
  }
  if (parentStyle !== undefined) {
    properties['학부모 성향 & 알림장 스타일'] = {
      rich_text: [{ text: { content: parentStyle } }]
    };
  }
  if (allergies !== undefined) {
    properties['알레르기/주의사항'] = {
      rich_text: [{ text: { content: allergies } }]
    };
  }

  const updatePayload = { properties };

  try {
    const response = await callNotionApi({
      endpoint: `/pages/${childId}`,
      method: 'PATCH',
      body: updatePayload,
      token,
      proxyUrl
    });

    return {
      success: true,
      mode: 'notion_updated',
      child: {
        id: response.id,
        name,
        age,
        childClass,
        traits,
        parentStyle,
        allergies
      }
    };
  } catch (err) {
    // 💡 404 Not Found인 경우 (노션에 해당 페이지가 없거나 권한 만료된 경우):
    // 에러로 사용자 작업을 중단시키지 않고, 노션 마스터 DB에 새 원아로 자동 등록(Upsert)
    if (err.message && err.message.includes('404')) {
      console.warn(`[Self-Healing] 원아 페이지(${childId}) 404 발생 -> 신규 원아로 자동 생성 전환:`, err.message);
      const created = await saveChildToNotion({ name, age, traits, allergies }, env);
      return {
        ...created,
        mode: 'notion_created_fallback',
        message: '기존 페이지를 찾을 수 없어 노션 마스터 DB에 새 원아로 안전하게 등록되었습니다.'
      };
    }
    throw err;
  }
}

/**
 * 📂 DAILY_LOG_DB 전체 기록 조회 (히스토리 뷰어 백엔드 폴백용)
 */
export async function getAllDailyLogs(env) {
  const databaseId = env.DAILY_LOG_DB_ID;
  const token = env.NOTION_API_KEY;
  const proxyUrl = env.NOTION_PROXY_URL || 'https://minmin-notion.awslike6.workers.dev';

  if (!databaseId) {
    return { results: [], source: 'empty', message: 'DAILY_LOG_DB_ID 미설정' };
  }

  try {
    const data = await callNotionApi({
      endpoint: `/databases/${databaseId}/query`,
      method: 'POST',
      body: {
        page_size: 100,
        sorts: [{ property: '작성일자', direction: 'descending' }]
      },
      token,
      proxyUrl
    });

    return {
      results: data.results || [],
      source: 'notion'
    };
  } catch (err) {
    console.error('getAllDailyLogs Notion query error:', err);
    return {
      results: [],
      error: err.message,
      source: 'error'
    };
  }
}


