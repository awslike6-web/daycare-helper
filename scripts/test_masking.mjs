import { maskName, unmaskName, unmaskDeep } from '../api/gemini.js';

console.log('--- 1. 단일 문자열 마스킹 테스트 ---');
const originalName = '김민서';
const rawMemo = '민서가 오늘 블록으로 높은 탑을 쌓음. 김민서 어린이는 매우 침착했음.';
const masked = maskName(rawMemo, originalName);
console.log('원본:', rawMemo);
console.log('마스킹:', masked);

if (!masked.includes('김민서') && masked.includes('[아동A]')) {
  console.log('✅ 마스킹 성공!');
} else {
  console.error('❌ 마스킹 실패!');
  process.exit(1);
}

console.log('\n--- 2. 복원 (언마스킹) 테스트 ---');
const unmasked = unmaskName(masked, originalName);
console.log('복원:', unmasked);
if (unmasked.includes('김민서') && !unmasked.includes('[아동A]')) {
  console.log('✅ 단일 문자열 복원 성공!');
} else {
  console.error('❌ 단일 문자열 복원 실패!');
  process.exit(1);
}

console.log('\n--- 3. 중첩 JSON 객체 딥 언마스킹 테스트 ---');
const mockGeminiResponse = {
  kidsnote: {
    title: '[아동A]가 만든 멋진 블록 성!',
    content: '오늘 [아동A]는 친구들과 함께 커다란 블록을 차곡차곡 쌓았답니다. [아동A]의 집중력이 돋보였어요.',
    tags: ['[아동A]의하루', '블록놀이']
  },
  observation_log: {
    standard_area: '신체운동·건강',
    behavior: '[아동A]는 양손을 사용하여 10단 높이의 블록을 무너뜨리지 않고 쌓음.',
    evaluation: '[아동A]의 소근육 조절력과 공간지각능력 발달을 격려함.'
  },
  citation: {
    has_citation: true,
    summary: '📌 참고한 과거 기록: [2026-09-05] 대비 [아동A]의 양손 협응력 향상'
  }
};

const deepUnmasked = unmaskDeep(mockGeminiResponse, originalName);
const jsonString = JSON.stringify(deepUnmasked);
console.log('딥 복원 결과:', JSON.stringify(deepUnmasked, null, 2));

if (!jsonString.includes('[아동A]') && jsonString.includes('김민서')) {
  console.log('✅ 중첩 JSON 객체 전체 실명 복원 완벽 통과!');
} else {
  console.error('❌ 중첩 JSON 복원 실패!');
  process.exit(1);
}

console.log('\n🎉 모든 마스킹/언마스킹 무결성 검증 통과!');
