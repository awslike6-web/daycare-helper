/**
 * 🧸 daycare-helper Config & Presets Module (config.js)
 * 2026 Modern Vanilla JS (ES2024+)
 * 
 * - 페르소나 4대 프리셋 (PERSONA_PRESETS)
 * - 학부모 성향 프리셋 (PARENT_PRESETS)
 * - 3대 교사 독립 프로필 표준 (TEACHER_PROFILES)
 * - 노션 교사 페이지 매핑 (TEACHER_PAGE_MAP)
 * - 노션 클라이언트 직결 설정 (NOTION_CONFIG)
 */

// ============================================================================
// 0. 4대 대표 페르소나 프리셋 (Presets)
// ============================================================================
const PERSONA_PRESETS = {
  play_friendly: {
    preset: 'play_friendly',
    name: '놀이 중심 다정체',
    icon: '🌿',
    sampleNote: '오늘 우리 민서는 블록 영역에서 친구들과 커다란 동물원 울타리를 만들며 신나게 놀이했답니다. 기린 인형을 울타리 안에 넣고 나뭇잎 먹이를 주는 흉내를 내며 활짝 웃는 모습이 참 사랑스러웠어요. 쌓던 블록이 와르르 쓰러져도 속상해하지 않고 씩씩하게 다시 세우는 모습에서 기특한 성장을 느꼈답니다. 가정에서도 오늘 즐거웠던 동물원 놀이에 대해 많은 칭찬 부탁드립니다.^^',
    callStyle: '우리 [아동A]',
    emojiLevel: 'moderate',
    closingGreeting: '가정에서도 편안하고 따뜻한 저녁 되세요^^'
  },
  growth_detail: {
    preset: 'growth_detail',
    name: '발달 관찰 서술체',
    icon: '📖',
    sampleNote: '오늘 민서는 오전 자유놀이 시간에 조작 영역에 스스로 다가가 블록 놀이에 깊이 몰입하였습니다. 이전보다 손가락 힘과 양손 협응력이 향상되어 10단 이상의 탑을 안정적으로 쌓았으며, 블록이 흔들릴 때 조심스럽게 받쳐 균형을 유지하는 문제해결력을 보였습니다. 또래 친구에게 블록을 나누어주며 긍정적인 사회적 상호작용을 나누는 모습이 무척 인상 깊었습니다. 가정에서도 오늘의 성취에 대해 따뜻한 격려 부탁드립니다.',
    callStyle: '[아동A]',
    emojiLevel: 'none',
    closingGreeting: '가정에서도 오늘의 성취에 대해 따뜻한 격려 부탁드립니다.'
  },
  warm_parent: {
    preset: 'warm_parent',
    name: '따뜻한 공감형',
    icon: '🌸',
    sampleNote: '어머님 안녕하세요~^^ 오늘 우리 민서가 원에 들어올 때부터 환한 미소로 인사를 건네주어 교실이 온통 환해졌답니다! 블록 놀이를 하면서 "선생님 이것 보세요!" 하며 자랑스럽게 보여주는데 어찌나 사랑스럽던지요. 친구를 배려하는 따뜻한 마음씨에 가슴이 뭉클했답니다. 오늘 밤 가정에서도 민서 많이 안아주세요💕',
    callStyle: '우리 [아동A]',
    emojiLevel: 'rich',
    closingGreeting: '오늘 밤 가정에서도 우리 민서 꼭 안아주세요💕'
  },
  lively_vivid: {
    preset: 'lively_vivid',
    name: '밝고 생동감 있는 문체',
    icon: '✨',
    sampleNote: '오늘 우리 민서의 하루는 에너지 만점! 🌟 친구들과 함께 블록으로 거대한 우주선을 만들었답니다! 🚀 뚝딱뚝딱 손끝이 야무진 우리 민서, 친구들과 "출발!"을 외치며 신나게 웃는 모습이 교실을 환하게 밝혔어요. 🥰 내일도 신나게 놀자 민서야~!',
    callStyle: '우리 [아동A]',
    emojiLevel: 'rich',
    closingGreeting: '내일도 즐겁게 만나요! 🥰'
  }
};

// ============================================================================
// 1. 학부모 성향 프리셋
// ============================================================================
const PARENT_PRESETS = {
  safe_detail: '안심 서술형 (식사량, 낮잠, 작은 상처, 정서적 안정감 세심 안내 선호)',
  speedy_summary: '스피디 요약형 (바쁜 맞벌이 부모님, 퇴근 후 3줄 핵심 요약 선호)',
  social_care: '인성·교우관계형 (또래 배려, 양보, 따뜻한 사회성 일화 중심 선호)',
  growth_praise: '성장 성취형 (조작력과 문제해결력, 발달 성취 칭찬 중심 선호)'
};

// ============================================================================
// 2. 3대 교사 프로필 표준 (선생님별 PIN, 페르소나, 학급 완전 격리)
// ============================================================================
const TEACHER_PROFILES = {
  wife: {
    key: 'wife',
    name: '공가영 선생님',
    className: '사랑반',
    ageText: '만 0세',
    icon: '🌸',
    defaultPreset: 'warm_parent',
    defaultPersona: {
      preset: 'warm_parent',
      name: '따뜻한 공감형 (사랑반 만0세 영아)',
      sampleNote: '오늘 우리 [아동A]는 따뜻한 품에 안겨 방긋 미소를 지으며 작은 손으로 오감 딸랑이 교구를 부드럽게 탐색했답니다.',
      callStyle: '우리 [아동A]',
      emojiLevel: 'moderate',
      closingGreeting: '가정에서도 따뜻하고 포근한 저녁 시간 보내세요^^'
    },
    notionPageId: '3e0a2711-5b68-8102-9fbb-c635637c5b33'
  },
  sister_in_law: {
    key: 'sister_in_law',
    name: '공가희 주임교사',
    className: '소망반',
    ageText: '만 2세',
    icon: '🌿',
    defaultPreset: 'play_friendly',
    defaultPersona: {
      preset: 'play_friendly',
      name: '놀이 중심 다정체 (소망반 만2세 주임)',
      sampleNote: '평소 블록으로 길쭉길쭉 기차를 만들던 우리 아이들을 위해 오늘은 알록달록 기차와 레일을 짠! 준비해 주었는데요. 고사리손으로 기차를 꼭 쥐고 "칙칙폭폭~ 덜컹덜컹!" 소리를 내며 레일 위를 신나게 달렸어요.',
      callStyle: '우리 [아동A]',
      emojiLevel: 'rich',
      closingGreeting: '가정에서도 오늘 즐거웠던 원 생활에 대해 많은 칭찬 부탁드립니다.^^'
    },
    notionPageId: '3e0a2711-5b68-81a1-ba8e-d05d1f5e9631'
  },
  sandbox: {
    key: 'sandbox',
    name: '연구 선생님',
    className: '연구반',
    ageText: '체험',
    icon: '🧪',
    defaultPreset: 'play_friendly',
    defaultPersona: {
      preset: 'play_friendly',
      name: '자유 체험형 (다정 체)',
      sampleNote: '오늘 우리 [아동A]는 호기심 가득한 눈빛으로 새로운 놀이에 몰입하며 즐거운 하루를 보냈답니다.',
      callStyle: '우리 [아동A]',
      emojiLevel: 'moderate',
      closingGreeting: '가정에서도 오늘 하루 즐거웠던 일에 대해 많은 칭찬 부탁드립니다.^^'
    },
    notionPageId: '3e0a2711-5b68-81ea-be6e-ed72a8a12f42'
  }
};

// 👩‍🏫 노션 TEACHER_DB 교사 페이지 매핑
const TEACHER_PAGE_MAP = {
  wife: TEACHER_PROFILES.wife.notionPageId,
  sister_in_law: TEACHER_PROFILES.sister_in_law.notionPageId,
  sandbox: TEACHER_PROFILES.sandbox.notionPageId
};

// ============================================================================
// 3. 노션 클라이언트 직결 브릿지 설정 (Cloudflare Error 1042 차단 회피 SSOT)
// ============================================================================
const NOTION_CONFIG = {
  PROXY_URL: 'https://minmin-notion.awslike6.workers.dev',
  TEACHER_DB_ID: '3e0a2711-5b68-8186-ad30-cbaea7687006',
  CHILD_DB_ID: '3e0a2711-5b68-8182-955e-f116e4174e3a',
  DAILY_LOG_DB_ID: '3e0a2711-5b68-8122-9eea-dd49bf8a625c',
  VERSION: '2022-06-28'
};

// 🌐 전역 네임스페이스 및 하위 호환성 등록
window.PERSONA_PRESETS = PERSONA_PRESETS;
window.PARENT_PRESETS = PARENT_PRESETS;
window.TEACHER_PROFILES = TEACHER_PROFILES;
window.TEACHER_PAGE_MAP = TEACHER_PAGE_MAP;
window.NOTION_CONFIG = NOTION_CONFIG;

window.DaycareConfig = {
  PERSONA_PRESETS,
  PARENT_PRESETS,
  TEACHER_PROFILES,
  TEACHER_PAGE_MAP,
  NOTION_CONFIG
};
