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

// 초기 환경 및 테스트용 기본 모크 데이터
const MOCK_CHILDREN = [
  {
    id: 'mock-child-1',
    name: '김민서',
    age: '만 4세',
    birth: '2021-04-15',
    traits: '손으로 만지는 조작 놀이(블록, 클레이)를 매우 즐김. 가위질 등 정밀 소근육 조절력 발달 중.',
    allergies: '우유 과다 섭취 주의'
  },
  {
    id: 'mock-child-2',
    name: '이민수',
    age: '만 5세',
    birth: '2020-08-20',
    traits: '또래 친구들과 협동 놀이에 흥미를 보이며 관찰력이 뛰어남. 낯선 환경에 적응 시간이 약간 필요함.',
    allergies: '복숭아 알레르기'
  },
  {
    id: 'mock-child-3',
    name: '박서준',
    age: '만 3세',
    birth: '2022-02-10',
    traits: '활동적인 신체 놀이와 공놀이를 좋아함. 식사 시간 스스로 숟가락질 시도 중.',
    allergies: '계란 알레르기(약함)'
  },
  {
    id: 'mock-child-4',
    name: '최지우',
    age: '만 4세',
    birth: '2021-11-03',
    traits: '동화책 읽기와 그림 그리기를 좋아함. 차분하게 선생님의 안내에 귀 기울임.',
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
      const age = props['생년월일/연령']?.rich_text?.[0]?.plain_text || props['생년월일/연령']?.date?.start || '만 3세';
      const traits = props['성향 및 특이사항']?.rich_text?.[0]?.plain_text || '';
      const allergies = props['알레르기/주의사항']?.rich_text?.[0]?.plain_text || '';

      return {
        id: page.id,
        name,
        age,
        traits,
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
export async function saveChildToNotion({ name, age, traits, allergies }, env) {
  const dbId = env.NOTION_CHILD_DB_ID;
  const token = env.NOTION_TOKEN;
  const proxyUrl = env.NOTION_PROXY_URL;

  if (!name) {
    throw new Error('원아 이름이 필요합니다.');
  }

  // 노션 DB가 연결되지 않은 경우 로컬 모크 생성
  if (!dbId || (!token && !proxyUrl)) {
    const mockId = `mock-child-${Date.now()}`;
    return {
      success: true,
      mode: 'mock_created',
      child: {
        id: mockId,
        name,
        age: age || '만 4세',
        traits: traits || '',
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
    '알레르기/주의사항': {
      rich_text: [{ text: { content: allergies || '' } }]
    }
  };

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
      traits: traits || '',
      allergies: allergies || '',
      url: response.url
    }
  };
}

/**
 * 5️⃣ 원아 정보 수정 (/api/children/:id - PUT)
 */
export async function updateChildInNotion(childId, { name, age, traits, allergies }, env) {
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
        traits: traits || '',
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
  if (traits !== undefined) {
    properties['성향 및 특이사항'] = {
      rich_text: [{ text: { content: traits } }]
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
        traits,
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

