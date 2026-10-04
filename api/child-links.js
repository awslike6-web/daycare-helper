/** 교사가 확인한 원문 발췌를 실제 노션 원아 ID로 연결한다. */
import { ApiError } from './auth.js';
import { callNotionApi, getLogDetail, saveDailyLogToNotion, getAllDailyLogs, saveChildToNotion } from './notion.js';
const same = (a, b) => String(a || '').replace(/-/g, '') === String(b || '').replace(/-/g, '');
async function digest(value) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(v => v.toString(16).padStart(2, '0')).join('');
}
export async function linkChildRecord(env, context, input, storage) {
  if (!context.childId || input.confirmed !== true) throw new ApiError('원아와 근거 문장을 확인한 뒤 연결 확인을 체크해 주세요.');
  if (typeof input.sourceId !== 'string' || !/^[a-f0-9-]{32,36}$/i.test(input.sourceId)) throw new ApiError('먼저 원시 메모를 노션에 저장해 주세요.');
  const source = await getLogDetail(env, input.sourceId, context.className);
  if (source.date !== context.date || !source.teacherIds.some(id => same(id, context.teacherId)) ||
      source.childIds.length > 1 || (source.childId && !same(source.childId, context.childId))) throw new ApiError('원문 기록의 교사·원아·날짜가 다릅니다.', 403);
  if (typeof input.sourceRawMemo !== 'string' || input.sourceRawMemo !== source.raw_memo) throw new ApiError('노션 원문이 변경됐습니다. 최신 메모를 조회하고 근거를 다시 확인해 주세요.', 409);
  const excerpt = typeof input.excerpt === 'string' ? input.excerpt.trim() : '';
  const summary = typeof input.summary === 'string' ? input.summary.trim() : '';
  if (!excerpt || excerpt.length > 30000 || !source.raw_memo.includes(excerpt)) throw new ApiError('근거는 저장된 원시 메모에서 그대로 발췌해 주세요.');
  if (summary.length > 5000) throw new ApiError('관찰 요약은 5,000자 이내로 적어 주세요.');
  const marker = '[원아연결:' + (await digest(JSON.stringify([source.id, context.childId, excerpt]))).slice(0, 24) + ']';
  const query = await callNotionApi(env, '/databases/' + env.NOTION_DAILY_LOG_DB_ID + '/query', 'POST', {
    page_size: 2, filter: { and: [{ property: '기록명/식별자', title: { starts_with: marker } }] }
  });
  if (query.results.length > 1) throw new ApiError('원아 연결 기록이 중복되어 있습니다. 기존 기록을 보존하고 관리자 확인을 요청해 주세요.', 409);
  const pendingKey = 'child-link-pending:' + marker;
  let existing;
  if (query.results[0]) {
    existing = await getLogDetail(env, query.results[0].id, context.className);
    if (existing.childIds.length !== 1 || !same(existing.childId, context.childId) || existing.date !== context.date ||
        !existing.teacherIds.some(id => same(id, context.teacherId)) || existing.saved?.result?.child_link?.sourceId !== source.id || existing.raw_memo !== excerpt) throw new ApiError('기존 원아 연결의 대상·근거가 다릅니다. 기록을 보존했습니다.', 409);
    if (existing.summary === summary) { await storage.delete(pendingKey); return { success: true, source: 'notion', pageId: existing.id, url: existing.url, reused: true, childId: context.childId }; }
  }
  if (await storage.get(pendingKey)) throw new ApiError('이전 원아 연결의 저장 여부를 확인 중입니다. 보관함에서 확인하고 계속되면 관리자에게 문의해 주세요.', 503);
  const citation = { has_citation: true, summary: `원아 연결 확인: ${context.date} 원문 ${source.id}의 발췌문을 교사가 확인함`,
    sources: [{ id: source.id, date: source.date, url: source.url }], from: source.date, to: source.date };
  const result = { observation_summary: summary, child_link: { version: 1, sourceId: source.id, sourceUrl: source.url,
    sourceDate: source.date, sourceHash: await digest(source.raw_memo), excerpt, childId: context.childId,
    confirmedBy: context.teacherId, confirmedAt: new Date().toISOString() }, citation,
    record_context: { date: context.date, childId: context.childId, className: context.className, teacherId: context.teacherId } };
  await storage.put(pendingKey, true);
  try {
    const saved = await saveDailyLogToNotion({ pageId: existing?.id, recordTitle: `${marker} ${context.date} ${context.childName}`,
      date: context.date, childId: context.childId, childName: context.childName, childClass: context.className,
      teacherId: context.teacherId, teacherName: context.teacherName || '', rawMemo: excerpt, obsSummary: summary,
      observationText: summary, standardArea: input.standardArea || '', activityArea: input.activityArea || '자유놀이', result }, env);
    await storage.delete(pendingKey);
    return { ...saved, childId: context.childId, reused: !!existing };
  } catch (error) {
    if (error.writeRejected || error.status === 429) await storage.delete(pendingKey);
    throw error;
  }
}

/** 운영 연구반의 서로 다른 가상 원아만 만들고 정확한 발췌·관계·재조회 후 보관한다. */
export async function verifyChildLinks(env, teacher, date, run) {
  const children = [], records = [];
  try {
    for (const name of ['연결검증가상원아가', '연결검증가상원아나']) children.push(await saveChildToNotion({ name, className: teacher.className, age: '만 0세' }, env));
    const rawMemo = '연결검증가상원아가 블록을 잡음.\n연결검증가상원아나 공을 굴림.';
    const base = { teacherId: teacher.id, teacherName: teacher.name, className: teacher.className, date, childId: null, childName: '학급 전체' };
    const memo = await saveDailyLogToNotion({ date, childId: null, childName: '원아 연결 검증용 가상 학급 메모', childClass: teacher.className,
      teacherId: teacher.id, teacherName: teacher.name, rawMemo, result: {} }, env);
    records.push(memo.pageId);
    const source = { sourceId: memo.pageId, sourceRawMemo: rawMemo, confirmed: true };
    const contexts = children.map((c, i) => ({ ...base, childId: c.id, childName: ['연결검증가상원아가', '연결검증가상원아나'][i] }));
    const excerpts = rawMemo.split('\n');
    for (let i = 0; i < children.length; i++) {
      const saved = await run('link-child', contexts[i], { ...source, excerpt: excerpts[i], summary: excerpts[i] });
      if (saved.status !== 200) throw new ApiError(saved.data.error || '검증 원아 연결 저장 실패', 502);
      records.push(saved.data.pageId);
      const retry = await run('link-child', contexts[i], { ...source, excerpt: excerpts[i], summary: excerpts[i] });
      const detail = await getLogDetail(env, saved.data.pageId, teacher.className);
      const history = await getAllDailyLogs(env, teacher.className, { childId: children[i].id, from: date, to: date });
      if (retry.data.pageId !== saved.data.pageId || detail.raw_memo !== excerpts[i] || detail.childIds.length !== 1 || !same(detail.childId, children[i].id) || !history.data.some(l => l.id === saved.data.pageId)) throw new ApiError('원아별 근거·관계·조회가 일치하지 않습니다.', 502);
    }
    const wrong = await run('link-child', contexts[0], { ...source, excerpt: '입력하지 않은 관찰', summary: '가상', confirmed: true });
    if (wrong.status !== 400) throw new ApiError('원문 불일치 거부 확인이 필요합니다.', 502);
    return { success: true, ai: false, exactChildRelations: true, isolatedExcerpts: true, retrySamePage: true, invalidExcerptRejected: true, source: 'notion', archived: true };
  } finally {
    // 이번에 만든 원아에 연결된 기록도 조회하여 응답을 잃은 검증 쓰기를 정리한다.
    for (const child of children) {
      const list = await getAllDailyLogs(env, teacher.className, { childId: child.id, from: date, to: date });
      records.push(...list.data.map(l => l.id));
    }
    for (const id of new Set([...records, ...children.map(c => c.id)])) await callNotionApi(env, '/pages/' + id, 'PATCH', { archived: true });
  }
}
