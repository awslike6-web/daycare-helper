/** 실제 원아와 노션에 접근하지 않는 로컬 종단 검증용 서비스. */
import { createServer } from 'node:http';
const teacherId = '11111111-1111-4111-8111-111111111111';
const secondTeacherId = '55555555-5555-4555-8555-555555555555';
const childId = '22222222-2222-4222-8222-222222222222';
const logs = new Map();
const blocks = new Map();
const rt = value => ({ rich_text: [{ plain_text: value }] });
function page(properties, parent, id = crypto.randomUUID()) { return { id, properties, parent, url: 'https://notion.test/' + id }; }
const teachers = [page({ '교사명': { title: [{ plain_text: '검증 교사 A' }] }, '담당반': { select: { name: '사랑반' } }, '평소 알림장 예시문': rt('관찰한 사실을 다정하게 적었어요.') }, {}, teacherId),
  page({ '교사명': { title: [{ plain_text: '검증 교사 B' }] }, '담당반': { select: { name: '소망반' } } }, {}, secondTeacherId)];
const children = [page({ '아동명': { title: [{ plain_text: '검증원아' }] }, '소속 반': { select: { name: '사랑반' } }, '생년월일/연령': rt('만 0세') }, {}, childId)];
children.push(...['33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444'].map((id, i) => page({ '아동명': { title: [{ plain_text: '검증동명' }] }, '소속 반': { select: { name: '사랑반' } }, '생년월일/연령': rt(i ? '만 2세' : '만 0세') }, {}, id)));
function plainProperties(properties) {
  for (const p of Object.values(properties)) for (const key of ['title', 'rich_text']) if (p[key]) p[key] = p[key].map(t => ({ ...t, plain_text: t.text?.content || t.plain_text || '' }));
  return properties;
}
createServer(async (req, res) => {
  let text = ''; for await (const chunk of req) text += chunk;
  const input = text ? JSON.parse(text) : {};
  const path = new URL(req.url, 'http://localhost').pathname;
  // 월간 가상 응답도 요청에 포함된 실제 기록 날짜만 사용한다.
  const prompt = input.contents?.[0]?.parts?.[0]?.text || '';
  const targetMonth = /- 대상 월: (\d{4}-\d{2})/.exec(prompt)?.[1];
  const observedDate = [...prompt.matchAll(/날짜: (\d{4}-\d{2}-\d{2})/g)].map(match => match[1]).find(date => !targetMonth || date.startsWith(targetMonth)) || '';
  let output;
  if (path.includes('/models/')) output = { candidates: [{ content: { parts: [{ text: JSON.stringify({
    kidsnote: { title: '오늘의 블록 놀이', content: '[아동1]가 블록을 손으로 잡았어요.' }, observation_summary: '블록을 손으로 잡음',
    monthly_observation: { title: '실제 관찰일 기준 관찰일지', play_obs: { date: observedDate, area: '신체운동·건강', behavior: observedDate ? '블록을 손으로 잡음' : '해당 영역의 관찰 기록 부족', teacher_support: '지원 계획: 블록을 손이 닿는 곳에 배치' }, daily_obs: { date: '', behavior: '해당 영역의 관찰 기록 부족', teacher_support: '추가 관찰 필요' }, monthly_summary: { development_summary: '블록을 손으로 잡는 모습이 관찰됨', next_month_plan: '다양한 크기의 블록 탐색을 지원할 계획' } },
    hangroo_eval: { title: '관찰 기간 발달평가', development_summary: '블록을 손으로 잡음. 다른 영역의 관찰 기록은 부족함.', support_plan: '블록 탐색 지원 계획' },
    parent_counseling: { daily_routine: '관찰 기록 부족', social_relations: '관찰 기록 부족', development_feature: '블록을 손으로 잡음', counseling_opinion: '상담 준비 초안: 실제 상담 발언과 합의는 아직 없음' },
    daily_care_log: { play_summary: '블록을 손으로 잡음', play_evaluation: '손으로 물체 탐색을 관찰함', next_support_plan: '블록 탐색 지원 계획' },
    play_support: { play_theme: '블록 탐색', interest_cue: '블록을 손으로 잡음', teacher_support: '다양한 크기의 블록 제공 계획' },
    individual_observations: [{ child_name: '[아동1]', source_excerpt: '[아동1] 블록을 손으로 잡음.', activity: '블록 놀이', standard_area: '신체운동·건강', summary: '블록을 손으로 잡음' }],
    class_daily_report: { play_theme: '블록 놀이', activities: [{ activity_title: '블록 놀이', observation: '블록을 손으로 잡음', learning_content: '손으로 물체를 잡는 모습을 관찰함' }], reflection: '손을 뻗어 블록을 잡는 모습을 관찰함', support: { environment: '지원 계획: 손이 닿는 곳에 블록을 배치할 예정', safety: '관찰 기록 부족' } }
  }) }] } }] };
  else if (path.endsWith('/databases/teachers/query')) output = { results: teachers, has_more: false };
  else if (path.endsWith('/databases/children/query')) output = { results: children.filter(c => c.properties['소속 반'].select.name === input.filter?.select?.equals), has_more: false };
  else if (path.endsWith('/query')) {
    const filters = input.filter?.and || [];
    output = { results: [...logs.values()].filter(log => filters.every(f => {
      const p = log.properties[f.property];
      if (f.select) return p?.select?.name === f.select.equals;
      if (f.relation) return p?.relation?.some(r => r.id === f.relation.contains);
      if (f.title?.starts_with) return p?.title?.some(t => (t.plain_text || t.text?.content || '').startsWith(f.title.starts_with));
      if (f.date?.equals) return p?.date?.start === f.date.equals;
      if (f.date?.on_or_after) return p?.date?.start >= f.date.on_or_after;
      if (f.date?.on_or_before) return p?.date?.start <= f.date.on_or_before;
      return true;
    })), has_more: false };
  } else if (path === '/v1/pages' && req.method === 'POST') {
    const saved = page(plainProperties(input.properties), input.parent); logs.set(saved.id, saved); blocks.set(saved.id, input.children || []); output = saved;
  } else if (path.startsWith('/v1/pages/')) {
    const id = path.split('/')[3]; output = logs.get(id);
    if (req.method === 'PATCH' && output) {
      if (input.properties) output.properties = { ...output.properties, ...plainProperties(input.properties) };
      if (input.archived !== undefined) output.archived = input.archived;
    }
  } else if (path.startsWith('/v1/blocks/')) {
    const id = path.split('/')[3];
    if (req.method === 'PATCH') blocks.set(id, [...(blocks.get(id) || []), ...(input.children || [])]);
    output = { results: blocks.get(id) || [], has_more: false };
  }
  if (path.includes('/models/') && output) {
    const generated = JSON.parse(output.candidates[0].content.parts[0].text);
    const schema = input.system_instruction?.parts?.[0]?.text || '';
    if (schema.includes('"rawMemo"')) {
      generated.rawMemo = '사진 1: 빨간 옷을 입은 아이가 오른손으로 파란 블록을 잡고 있음.\n사진 2: 같은 옷의 아이 앞에 블록 두 개가 놓여 있음.';
      generated.limitations = '사진 속 아이가 선택한 원아인지, 선택 날짜가 실제 관찰일인지 확인해야 함. 사진 순서는 행동 순서를 뜻하지 않음.';
    }
    for (const key of ['kidsnote', 'class_daily_report', 'monthly_observation', 'hangroo_eval', 'parent_counseling', 'daily_care_log', 'play_support']) {
      if (!schema.includes(`  "${key}": {`)) delete generated[key];
    }
    output.candidates[0].content.parts[0].text = JSON.stringify(generated);
  }
  res.writeHead(output ? 200 : 404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(output || { error: '검증 경로 없음' }));
}).listen(8790, '127.0.0.1', () => console.log('검증 서비스: http://127.0.0.1:8790'));
