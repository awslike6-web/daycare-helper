/** 노션 스키마 도감에 따른 교사·원아·일지 저장소. 실제 조회 실패는 숨기지 않는다. */
import { ApiError } from './auth.js';
export const textOf = property => (property?.title || property?.rich_text || []).map(t => t.plain_text ?? t.text?.content ?? '').join('');
const rt = value => ({ rich_text: chunks(String(value || '')).map(content => ({ type: 'text', text: { content } })) });
const select = name => ({ select: name ? { name } : null });
function chunks(value, size = 1800) {
  return Array.from({ length: Math.ceil(value.length / size) }, (_, i) => value.slice(i * size, (i + 1) * size));
}
export async function callNotionApi(env, endpoint, method = 'GET', body) {
  if (!env.NOTION_TOKEN && !env.NOTION_PROXY_URL) throw new ApiError('노션 연결 설정이 필요합니다.', 503);
  const base = env.NOTION_PROXY_URL ? env.NOTION_PROXY_URL.replace(/\/$/, '') + '/v1' : 'https://api.notion.com/v1';
  const headers = { 'Content-Type': 'application/json', 'Notion-Version': env.NOTION_VERSION || '2022-06-28' };
  if (env.NOTION_TOKEN) headers.Authorization = 'Bearer ' + env.NOTION_TOKEN.replace(/^Bearer /, '');
  if (env.NOTION_PROXY_SECRET) headers['X-Daycare-Service-Key'] = env.NOTION_PROXY_SECRET;
  for (let attempt = 0; attempt < 3; attempt++) {
    const request = new Request(base + endpoint, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000) });
    // 같은 계정의 Worker끼리는 서비스 바인딩으로 호출한다. 쓰기 불명확 오류는 재전송하지 않는다.
    let response;
    try { response = env.NOTION_PROXY ? await env.NOTION_PROXY.fetch(request) : await fetch(request); }
    catch { throw new ApiError('노션 응답을 확인하지 못했습니다. 작성본은 보존됩니다. 저장 기록을 먼저 조회한 뒤 다시 시도해 주세요.', 502); }
    if (response.ok) return response.json();
    const detail = await response.json().catch(() => ({}));
    console.error('노션 요청 실패', response.status, endpoint.split('/')[1]);
    if ([429, 529].includes(response.status) && detail.additional_data?.rate_limit_reason !== 'public_api_request_blocked') {
      const seconds = Number(response.headers.get('Retry-After') ?? detail.additional_data?.retry_after ?? 2 ** attempt);
      if (attempt < 2 && Number.isFinite(seconds) && seconds >= 0 && seconds <= 10) {
        await new Promise(resolve => setTimeout(resolve, seconds * 1000 + 100)); continue;
      }
      throw new ApiError('노션이 요청을 제한하고 있습니다. 작성본을 보관했습니다. 잠시 후 저장을 다시 눌러 주세요.', 429);
    }
    if ([401, 403].includes(response.status)) throw Object.assign(new ApiError('노션 DB의 연결 권한 또는 이용 한도를 확인해 주세요. 작성본은 보존됩니다.', 502), { writeRejected: true });
    if (response.status === 400) throw Object.assign(new ApiError('노션이 저장 서식을 거부했습니다. 관리자에게 DB 속성 확인을 요청해 주세요. 작성본은 보존됩니다.', 502), { writeRejected: true });
    throw new ApiError('노션 연결에 실패했습니다. 작성본은 보존됩니다. 저장 기록을 먼저 조회한 뒤 다시 시도해 주세요.', 502);
  }
}
function db(env, key) {
  if (!env[key]) throw new ApiError('노션 DB 설정이 필요합니다.', 503);
  return env[key];
}
async function queryAll(env, id, query = {}, maximum = 500) {
  const pages = []; let cursor;
  do {
    const data = await callNotionApi(env, `/databases/${id}/query`, 'POST', { ...query, page_size: Math.min(100, maximum - pages.length), ...(cursor ? { start_cursor: cursor } : {}) });
    pages.push(...data.results); cursor = data.has_more ? data.next_cursor : null;
  } while (cursor && pages.length < maximum);
  return { pages, nextCursor: cursor || null };
}
export async function getTeachersList(env) {
  const { pages } = await queryAll(env, db(env, 'NOTION_TEACHER_DB_ID'));
  return pages.map(page => {
    const p = page.properties;
    return { id: page.id, name: textOf(p['교사명']), className: p['담당반']?.select?.name || '',
      style: p['문체 프리셋']?.select?.name || '', sampleNote: textOf(p['평소 알림장 예시문']),
      closing: textOf(p['기본 마무리 멘트']), childTitle: textOf(p['원아 호칭']) };
  }).filter(t => t.name && t.className);
}
export async function getChildrenList(env, className) {
  if (!className) throw new ApiError('학급 인증이 필요합니다.', 401);
  const { pages, nextCursor } = await queryAll(env, db(env, 'NOTION_CHILD_DB_ID'), {
    filter: { property: '소속 반', select: { equals: className } }, sorts: [{ property: '아동명', direction: 'ascending' }]
  });
  if (nextCursor) throw new ApiError('원아 목록이 조회 한도를 초과했습니다.', 503);
  return { source: 'notion', children: pages.map(page => {
    const p = page.properties;
    return { id: page.id, name: textOf(p['아동명']), age: textOf(p['생년월일/연령']),
      className: p['소속 반']?.select?.name || '', childClass: p['소속 반']?.select?.name || '',
      traits: textOf(p['성향 및 특이사항']), parentStyle: textOf(p['학부모 성향 & 알림장 스타일']), allergies: textOf(p['알레르기/주의사항']) };
  }) };
}
export async function requireChild(env, childId, className) {
  const { children } = await getChildrenList(env, className);
  const child = children.find(c => c.id.replace(/-/g, '') === String(childId || '').replace(/-/g, ''));
  if (!child) throw new ApiError('이 학급에서 접근할 수 없는 원아입니다.', 403);
  return child;
}
function logFromPage(page, childMap = new Map()) {
  const p = page.properties;
  const childId = p['원아']?.relation?.[0]?.id || null;
  const raw = textOf(p['원시 메모/키워드']);
  const observation = textOf(p['관찰일지 최종본']);
  const summary = textOf(p['관찰 요약']);
  return { id: page.id, url: page.url, title: textOf(p['기록명/식별자']), memoOnly: textOf(p['기록명/식별자']).startsWith('[원시메모:'),
    childId, child_name: childMap.get(childId)?.name || (childId ? '원아' : '학급 전체'),
    class_name: p['학급']?.select?.name || '', date: p['작성일자']?.date?.start || '',
    activity: p['활동 구분']?.select?.name || '', summary, observation_summary: summary,
    behavior: observation, content: observation || textOf(p['알림장 최종본']),
    kidsnoteText: textOf(p['알림장 최종본']), memo: raw, raw_memo: raw,
    citationSummary: textOf(p['참조 출처 요약']), teacherIds: (p['작성교사']?.relation || []).map(r => r.id) };
}
export async function getAllDailyLogs(env, className, options = {}) {
  if (!className) throw new ApiError('학급 인증이 필요합니다.', 401);
  const filters = [{ property: '학급', select: { equals: className } }];
  if (options.childId) filters.push({ property: '원아', relation: { contains: options.childId } });
  if (options.from) filters.push({ property: '작성일자', date: { on_or_after: options.from } });
  if (options.to) filters.push({ property: '작성일자', date: { on_or_before: options.to } });
  const limit = Math.min(100, Math.max(1, Number(options.limit) || 30));
  const response = await callNotionApi(env, `/databases/${db(env, 'NOTION_DAILY_LOG_DB_ID')}/query`, 'POST', {
    page_size: limit, filter: { and: filters }, sorts: [{ property: '작성일자', direction: 'descending' }],
    ...(options.cursor ? { start_cursor: options.cursor } : {})
  });
  const { children } = await getChildrenList(env, className);
  const map = new Map(children.map(c => [c.id, c]));
  return { source: 'notion', data: response.results.map(p => logFromPage(p, map)), nextCursor: response.has_more ? response.next_cursor : null };
}
export async function getRecentChildLogs(childId, childName, env, className, options = {}) {
  const response = await getAllDailyLogs(env, className, { ...options, childId, limit: options.limit || 100 });
  return { source: 'notion', logs: response.data, nextCursor: response.nextCursor };
}
export async function getLogDetail(env, pageId, className) {
  const page = await callNotionApi(env, `/pages/${encodeURIComponent(pageId)}`);
  if (page.parent?.database_id?.replace(/-/g, '') !== db(env, 'NOTION_DAILY_LOG_DB_ID').replace(/-/g, '') || page.properties['학급']?.select?.name !== className || page.archived) {
    throw new ApiError('이 학급에서 접근할 수 없는 기록입니다.', 403);
  }
  const blocks = await queryBlocks(env, pageId);
  let snapshot = ''; let managed = false;
  for (const block of blocks) {
    if (block.type === 'heading_3') {
      managed = textOf({ rich_text: block.heading_3.rich_text }) === '보육비서 검수 저장본 v1';
      if (managed) snapshot = '';
    } else if (managed && block.type === 'code' && block.code.language === 'json') snapshot += textOf({ rich_text: block.code.rich_text });
  }
  let parsedData = null; let saved = null;
  try { saved = JSON.parse(snapshot); parsedData = saved.result; } catch {}
  return { ...logFromPage(page), parsedData, saved };
}
async function queryBlocks(env, pageId) {
  const blocks = []; let cursor;
  do {
    const result = await callNotionApi(env, `/blocks/${pageId}/children?page_size=100${cursor ? '&start_cursor=' + encodeURIComponent(cursor) : ''}`);
    blocks.push(...result.results); cursor = result.has_more ? result.next_cursor : null;
  } while (cursor);
  return blocks;
}
function snapshotBlocks(data) {
  const json = JSON.stringify(data);
  if (json.length > 100000) throw new ApiError('저장할 문서가 너무 큽니다. 사진을 제외하고 저장해 주세요.');
  return [{ object: 'block', type: 'heading_3', heading_3: { rich_text: [{ type: 'text', text: { content: '보육비서 검수 저장본 v1' } }] } },
    ...chunks(json).map(content => ({ object: 'block', type: 'code', code: { language: 'json', rich_text: [{ type: 'text', text: { content } }] } }))];
}
export async function saveDailyLogToNotion(payload, env) {
  const { date, childId, childName, childClass, teacherId, teacherName, result = {} } = payload;
  const summary = String(payload.obsSummary || result.observation_summary || '').trim();
  if (!payload.rawMemo && !summary) throw new ApiError('저장할 실제 메모 또는 관찰 요약이 필요합니다.');
  const area = payload.standardArea || result.observation_log?.standard_area || '';
  const allowed = new Set(['기본생활', '신체운동·건강', '의사소통', '사회관계', '예술경험', '자연탐구', '신체운동']);
  const properties = {
    '기록명/식별자': { title: [{ text: { content: `${date} ${childClass} ${childName || '학급 전체'}` } }] },
    '작성일자': { date: { start: date } }, '학급': select(childClass), '활동 구분': select(payload.activityArea || '자유놀이'),
    '원아': { relation: childId && childId !== 'class-all' ? [{ id: childId }] : [] },
    '작성교사': { relation: [{ id: teacherId }] },
    '원시 메모/키워드': rt(payload.rawMemo), '관찰 요약': rt(summary),
    '알림장 최종본': rt(payload.kidsnoteText ?? result.kidsnote?.content),
    '관찰일지 최종본': rt(payload.observationText ?? result.observation_log?.behavior ?? result.monthly_observation?.play_obs?.behavior),
    '참조 출처 요약': rt(payload.citationSummary || result.citation?.summary),
    '표준보육 영역': { multi_select: (Array.isArray(area) ? area : [area]).filter(a => allowed.has(a)).map(name => ({ name })) }
  };
  const saved = { version: 1, date, childId, childName, className: childClass, teacherId, teacherName,
    rawMemo: payload.rawMemo || '', observationSummary: summary, result, savedAt: new Date().toISOString() };
  const children = snapshotBlocks(saved);
  let page;
  if (payload.pageId) {
    await getLogDetail(env, payload.pageId, childClass);
    page = await callNotionApi(env, `/pages/${payload.pageId}`, 'PATCH', { properties });
    await callNotionApi(env, `/blocks/${payload.pageId}/children`, 'PATCH', { children });
  } else {
    page = await callNotionApi(env, '/pages', 'POST', { parent: { database_id: db(env, 'NOTION_DAILY_LOG_DB_ID') }, properties, children });
  }
  return { success: true, source: 'notion', pageId: page.id, url: page.url };
}

/** AI 장애와 독립된 운영 연결 검증. 연구반의 가상 기록만 작성 후 보관한다. */
export async function verifyNotionConnection(env, teacher, date) {
  const rawMemo = '[시스템 연결 검증용 가상 메모 · 실제 원아 기록/AI 생성본 아님] 가상 블록 두 개를 손으로 잡음.';
  const result = { kidsnote: { content: rawMemo + '\n[검수 문장 보존 확인]' }, observation_summary: rawMemo,
    record_context: { date, childId: null, teacherId: teacher.id, className: teacher.className } };
  let pageId;
  try {
    const saved = await saveDailyLogToNotion({ date, childId: null, childName: '가상 연결 검증', childClass: teacher.className,
      teacherId: teacher.id, teacherName: teacher.name, rawMemo, result }, env);
    pageId = saved.pageId;
    const detail = await getLogDetail(env, pageId, teacher.className);
    if (detail.memo !== rawMemo || JSON.stringify(detail.parsedData) !== JSON.stringify(result)) throw new ApiError('검수본 저장·조회가 일치하지 않습니다.', 502);
    return { success: true, ai: false, notionWriteRead: true, reviewedTextPreserved: true, archived: true };
  } finally {
    if (pageId) await callNotionApi(env, '/pages/' + pageId, 'PATCH', { archived: true });
  }
}
function childProperties(child) {
  if (!child.name?.trim()) throw new ApiError('원아 이름을 입력해 주세요.');
  return { '아동명': { title: [{ text: { content: child.name.trim() } }] }, '소속 반': select(child.className),
    '생년월일/연령': rt(child.age), '성향 및 특이사항': rt(child.traits),
    '학부모 성향 & 알림장 스타일': rt(child.parentStyle), '알레르기/주의사항': rt(child.allergies) };
}
export async function saveChildToNotion(child, env) {
  const page = await callNotionApi(env, '/pages', 'POST', { parent: { database_id: db(env, 'NOTION_CHILD_DB_ID') }, properties: childProperties(child) });
  return { success: true, id: page.id };
}
export async function updateChildInNotion(childId, child, env) {
  await requireChild(env, childId, child.className);
  const page = await callNotionApi(env, `/pages/${childId}`, 'PATCH', { properties: childProperties(child) });
  return { success: true, id: page.id };
}
export async function updateTeacherProfile(env, teacherId, input) {
  const properties = {};
  if (typeof input.sampleNote === 'string') properties['평소 알림장 예시문'] = rt(input.sampleNote.slice(0, 10000));
  if (typeof input.closingGreeting === 'string') properties['기본 마무리 멘트'] = rt(input.closingGreeting.slice(0, 2000));
  const styleMap = { '다정하고 꼼꼼한 선생님': '다정친절체', '스피디 실속형 선생님': '단정격식체', '밝고 활기찬 비타민 선생님': '활발발랄체', '성장 관찰 중심 전문가형 선생님': '발달 관찰 서술체' };
  if (styleMap[input.name]) properties['문체 프리셋'] = select(styleMap[input.name]);
  await callNotionApi(env, `/pages/${teacherId}`, 'PATCH', { properties });
  return { success: true, source: 'notion' };
}
