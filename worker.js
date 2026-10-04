import { generateDaycareLog } from './api/gemini.js';
import { ApiError, authCall, cookies, authCookies, checkMutation, requireSession } from './api/auth.js';
import { getTeachersList, getChildrenList, requireChild, getRecentChildLogs, getAllDailyLogs, getLogDetail, saveDailyLogToNotion, saveChildToNotion, updateChildInNotion, updateTeacherProfile, callNotionApi, verifyNotionConnection } from './api/notion.js';
export { AuthStore } from './api/auth.js';

const securityHeaders = {
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store', 'Cross-Origin-Resource-Policy': 'same-origin'
};
function json(data, status = 200, cookieValues = []) {
  const headers = new Headers({ ...securityHeaders, 'Content-Type': 'application/json; charset=utf-8' });
  for (const value of cookieValues) headers.append('Set-Cookie', value);
  return new Response(JSON.stringify(data), { status, headers });
}
async function bodyOf(request) {
  const text = await request.text();
  if (text.length > 12000000) throw new ApiError('입력 용량이 너무 큽니다.', 413);
  try { const body = JSON.parse(text); if (body && typeof body === 'object' && !Array.isArray(body)) return body; } catch {}
  throw new ApiError('요청 내용을 확인해 주세요.');
}
function dateOf(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '') || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new ApiError('작성 날짜를 선택해 주세요.');
  return value;
}
function profileOf(teachers, id) {
  const teacher = teachers.find(t => t.id === id);
  if (!teacher) throw new ApiError('노션 교사 프로필을 확인해 주세요.', 403);
  return teacher;
}
function profileKey(t) { return t.className === '사랑반' ? 'wife' : t.className === '소망반' ? 'sister_in_law' : t.id; }
function publicProfile(t) { return { id: t.id, key: profileKey(t), name: t.name, className: t.className }; }
export function mergeReviewed(previous, current, key = '') {
  if (current === undefined || current === null) return previous;
  if (typeof current === 'string' && typeof previous === 'string') {
    if (['title', 'date', 'child_name', 'activity', 'standard_area', 'from', 'to'].includes(key)) return current;
    return previous && current && previous !== current ? previous + '\n\n' + current : current || previous;
  }
  if (Array.isArray(current)) return [...(Array.isArray(previous) ? previous : []), ...current].filter((v, i, all) => all.findIndex(x => JSON.stringify(x) === JSON.stringify(v)) === i);
  if (current && typeof current === 'object') {
    const output = { ...previous };
    for (const [k, value] of Object.entries(current)) output[k] = mergeReviewed(previous?.[k], value, k);
    return output;
  }
  return current;
}
function mapStrings(value, transform) {
  if (typeof value === 'string') return transform(value);
  if (Array.isArray(value)) return value.map(v => mapStrings(v, transform));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mapStrings(v, transform)]));
  return value;
}
export function privacyMap(children, teacher) {
  const names = new Map();
  children.forEach((c, index) => {
    const alias = `[아동${index + 1}]`;
    names.set(c.name, alias);
    const short = c.name.length === 3 ? c.name.slice(1) : null;
    if (short && children.filter(x => x.name.endsWith(short)).length === 1) names.set(short, alias);
  });
  if (teacher?.name) names.set(teacher.name, '[담임교사]');
  const entries = [...names].sort(([a], [b]) => b.length - a.length);
  const mask = value => mapStrings(value, text => entries.reduce((s, [name, alias]) => s.split(name).join(alias), text));
  const restoreEntries = children.map((c, i) => [`[아동${i + 1}]`, c.name]);
  const restore = value => mapStrings(value, text => [...restoreEntries, ['[담임교사]', teacher?.name || '담임교사']].reduce((s, [alias, name]) => s.split(alias).join(name), text));
  return { mask, restore };
}
async function generate(body, env, teacher) {
  const { children } = await getChildrenList(env, teacher.className);
  const classAll = !body.childId || body.childId === 'class-all';
  const child = classAll ? { id: 'class-all', name: '[학급 전체]', age: '', traits: '' } : children.find(c => c.id === body.childId);
  if (!child) throw new ApiError('이 학급에서 접근할 수 없는 원아입니다.', 403);
  const formats = body.selectedFormats || ['class_daily_report', 'kidsnote'];
  const keys = { class_daily_report: 'class_daily_report', kidsnote: 'kidsnote', observation: 'monthly_observation', hangroo_eval: 'hangroo_eval', daily_care: 'daily_care_log', counseling: 'parent_counseling', play_support: 'play_support' };
  if (!Array.isArray(formats) || !formats.length || formats.some(f => !keys[f])) throw new ApiError('생성할 서식을 확인해 주세요.');
  if (classAll && formats.some(f => ['observation', 'hangroo_eval', 'counseling'].includes(f))) throw new ApiError('관찰·발달평가·상담일지는 원아를 먼저 선택해 주세요.');
  const date = dateOf(body.date);
  if (!String(body.rawMemo || '').trim() && !body.images?.length) throw new ApiError('실제 관찰 메모나 사진을 입력해 주세요.');
  if (body.images?.length && body.photoConsent !== true) throw new ApiError('사진의 외부 AI 전송 동의를 확인해 주세요.');
  if (String(body.rawMemo || '').length > 30000 || (body.images?.length || 0) > 6) throw new ApiError('메모 또는 사진이 너무 많습니다.');
  const ids = body.evidenceIds || [];
  if (!Array.isArray(ids) || ids.length > 60 || new Set(ids).size !== ids.length) throw new ApiError('참조 기록은 최대 60개까지 선택해 주세요.');
  let pastLogs = [];
  if (ids.length) {
    let cursor; const found = [];
    do {
      const page = await getAllDailyLogs(env, teacher.className, { childId: classAll ? undefined : child.id, from: body.evidenceFrom ? dateOf(body.evidenceFrom) : undefined, to: date, limit: 100, cursor });
      found.push(...page.data); cursor = page.nextCursor;
    } while (cursor && found.length < 500);
    pastLogs = ids.map(id => found.find(log => log.id === id));
    if (pastLogs.some(log => !log)) throw new ApiError('참조 기록의 원아·학급·날짜를 다시 확인해 주세요.', 403);
  }
  if (body.monthlyObsOptions) {
    const knownDates = new Set([date, ...pastLogs.map(log => log.date)]);
    for (const key of ['date1', 'date2']) if (body.monthlyObsOptions[key] && !knownDates.has(body.monthlyObsOptions[key])) throw new ApiError('관찰일은 오늘 또는 선택한 실제 기록의 날짜로 지정해 주세요.');
  }
  const privacy = privacyMap(children, teacher);
  const input = privacy.mask({ childName: child.name, childAge: child.age, childTraits: child.traits,
    parentStyle: child.parentStyle || '', allergies: child.allergies || '', rawMemo: body.rawMemo || '',
    images: body.images || [], pastLogs, date, mode: body.mode || 'all_suite', activityArea: body.activityArea,
    teacherStyle: body.teacherStyle || teacher.style, teacherName: teacher.name, className: teacher.className,
    persona: { ...(body.persona || {}), sampleNote: body.persona?.sampleNote || teacher.sampleNote, closingGreeting: body.persona?.closingGreeting || teacher.closing },
    monthlyObsOptions: body.monthlyObsOptions, selectedFormats: formats, refinement: body.refinement || null,
    roster: children.map(c => ({ name: c.name, age: c.age })) });
  const output = await generateDaycareLog({ ...input, apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL, fallbackModel: env.GEMINI_FALLBACK_MODEL, apiBase: env.GEMINI_API_BASE });
  output.data = privacy.restore(output.data);
  if (!output.data || formats.some(f => !output.data[keys[f]])) throw new ApiError('AI가 선택한 서식을 완성하지 못했습니다. 메모를 유지하고 다시 시도해 주세요.', 502);
  output.data.citation = { has_citation: pastLogs.length > 0,
    summary: pastLogs.length ? `참조한 실제 노션 기록 ${pastLogs.length}건: ${pastLogs.map(l => l.date).join(', ')}` : '과거 기록을 선택하지 않아 오늘 입력만 사용했습니다.',
    sources: pastLogs.map(l => ({ id: l.id, date: l.date, url: l.url })), from: body.evidenceFrom || null, to: date };
  output.data.rawMemo = body.rawMemo || '';
  output.data.record_context = { date, childId: classAll ? null : child.id, teacherId: teacher.id, className: teacher.className };
  return output;
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url); const path = url.pathname;
    if (!path.startsWith('/api/')) return env.ASSETS ? env.ASSETS.fetch(request) : new Response('보육비서');
    try {
      if (request.method === 'OPTIONS') return json({ error: '같은 사이트에서 접속해 주세요.' }, 403);
      checkMutation(request);
      if (path === '/api/health') return json({ status: 'ok', service: 'daycare-helper' });
      if (path === '/api/gemini-key') return json({ error: '브라우저 키 배포가 종료되었습니다.' }, 410);
      // 운영 연결 검증은 연구반의 명시적인 가상 기록만 만들고 즉시 보관 처리한다.
      if (path === '/api/admin/verify' && request.method === 'POST') {
        if (!env.AUTH_ADMIN_SECRET || request.headers.get('Authorization') !== 'Bearer ' + env.AUTH_ADMIN_SECRET) throw new ApiError('관리자 인증이 필요합니다.', 403);
        const teacher = (await getTeachersList(env)).find(t => t.className === '연구반');
        if (!teacher) throw new ApiError('연구반 교사 프로필이 필요합니다.', 503);
        const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
        const options = request.body ? await bodyOf(request) : {};
        if (options.notionOnly === true) return json(await verifyNotionConnection(env, teacher, date));
        const childName = '시스템검증가상원아';
        const rawMemo = '[시스템 검증용 가상 메모 · 실제 원아 기록 아님] 시스템검증가상원아 블록 두 개를 손으로 잡음.';
        const child = await saveChildToNotion({ name: childName, className: teacher.className, age: '만 0세', traits: '실제 원아가 아닌 시스템 연결 검증 자료' }, env);
        const cleanup = [child.id];
        try {
          const first = await generate({ childId: child.id, date, rawMemo, selectedFormats: ['kidsnote'], evidenceIds: [] }, env, teacher);
          const saved = await saveDailyLogToNotion({ date, childId: child.id, childClass: teacher.className, childName,
            teacherId: teacher.id, teacherName: teacher.name, rawMemo, result: first.data, activityArea: '자유놀이' }, env);
          cleanup.unshift(saved.pageId);
          const selectedFormats = ['kidsnote', 'class_daily_report', 'observation', 'hangroo_eval', 'counseling', 'daily_care', 'play_support'];
          const output = await generate({ childId: child.id, date, rawMemo, selectedFormats, evidenceIds: [saved.pageId], evidenceFrom: date,
            monthlyObsOptions: { date1: date, date2: '', targetMonth: date.slice(0, 7) } }, env, teacher);
          if (output.data.citation.sources[0]?.id !== saved.pageId) throw new ApiError('선택 근거 연결을 확인해 주세요.', 502);
          output.data.kidsnote.content += '\n[시스템 검수 문장 보존 확인]';
          await saveDailyLogToNotion({ pageId: saved.pageId, date, childId: child.id, childClass: teacher.className, childName,
            teacherId: teacher.id, teacherName: teacher.name, rawMemo, result: output.data, activityArea: '자유놀이' }, env);
          const detail = await getLogDetail(env, saved.pageId, teacher.className);
          if (detail.memo !== rawMemo || JSON.stringify(detail.parsedData) !== JSON.stringify(output.data)) throw new ApiError('노션 저장본과 조회본이 일치하지 않습니다.', 502);
          return json({ success: true, ai: true, model: output.meta.model_used, notionWriteRead: true, evidenceSelected: true, reviewedTextPreserved: true, formats: selectedFormats.length, archived: true });
        } finally {
          let failed = false;
          for (const id of cleanup) try { await callNotionApi(env, `/pages/${id}`, 'PATCH', { archived: true }); } catch { failed = true; }
          if (failed) throw new ApiError('시스템 검증 자료의 보관 처리를 확인해 주세요.', 502);
        }
      }
      if (path.startsWith('/api/auth/')) {
        const op = path.slice('/api/auth/'.length); const c = cookies(request);
        if (op === 'profiles' && request.method === 'GET') {
          const teachers = await getTeachersList(env);
          return json({ profiles: teachers.map(publicProfile), ...await authCall(env, 'status', { deviceToken: c.daycare_device }) });
        }
        if (op === 'device-invite' && request.method !== 'POST') throw new ApiError('등록 링크는 발급 버튼으로 요청해 주세요.', 405);
        const body = await bodyOf(request);
        if (op === 'invite') {
          if (!env.AUTH_ADMIN_SECRET || request.headers.get('Authorization') !== 'Bearer ' + env.AUTH_ADMIN_SECRET) throw new ApiError('관리자 인증이 필요합니다.', 403);
          const teacher = profileOf(await getTeachersList(env), body.teacherId);
          return json(await authCall(env, 'invite', { teacherId: teacher.id, className: teacher.className }));
        }
        if (op === 'device-invite') {
          const session = await requireSession(request, env);
          const teacher = profileOf(await getTeachersList(env), session.teacherId);
          if (teacher.className !== session.className) throw new ApiError('담당반이 변경되어 기기 재등록이 필요합니다.', 403);
          const data = await authCall(env, op, { currentPin: body.currentPin,
            sessionToken: c.daycare_session, deviceToken: c.daycare_device });
          return json({ url: url.origin + '/#register=' + data.token, expiresAt: data.expiresAt });
        }
        if (!['register', 'login', 'logout', 'change-pin', 'invite-status'].includes(op)) throw new ApiError('없는 인증 기능입니다.', 404);
        const data = await authCall(env, op, { ...body, sessionToken: c.daycare_session, deviceToken: c.daycare_device });
        if (op === 'invite-status') return json(data);
        const values = {};
        if (data.sessionToken) values.daycare_session = { token: data.sessionToken, maxAge: data.sessionMaxAge };
        if (data.deviceToken) values.daycare_device = { token: data.deviceToken, maxAge: data.deviceMaxAge };
        if (op === 'logout' || op === 'change-pin') values.daycare_session = {};
        if (op === 'logout' && body.forget) values.daycare_device = {};
        const safe = { success: true, teacherId: data.teacherId, className: data.className };
        return json(safe, 200, authCookies(request, values));
      }
      const session = await requireSession(request, env);
      const teacher = profileOf(await getTeachersList(env), session.teacherId);
      if (teacher.className !== session.className) throw new ApiError('담당반이 변경되어 기기 재등록이 필요합니다.', 403);
      if (path === '/api/session') return json({ protected: true, profile: { ...publicProfile(teacher), style: teacher.style, sampleNote: teacher.sampleNote, closing: teacher.closing }, expiresAt: session.expiresAt, draftKey: session.draftKey });
      if (path === '/api/connection') { await getChildrenList(env, teacher.className); return json({ status: 'ok', source: 'notion' }); }
      if (path === '/api/profile' && request.method === 'POST') return json(await updateTeacherProfile(env, teacher.id, await bodyOf(request)));
      if (path === '/api/children' && request.method === 'GET') return json(await getChildrenList(env, teacher.className));
      if (path === '/api/children' && request.method === 'POST') return json(await saveChildToNotion({ ...await bodyOf(request), className: teacher.className }, env));
      const childMatch = path.match(/^\/api\/children\/([^/]+)(\/recent-logs)?$/);
      if (childMatch) {
        const child = await requireChild(env, childMatch[1], teacher.className);
        if (childMatch[2] && request.method === 'GET') return json(await getRecentChildLogs(child.id, child.name, env, teacher.className, Object.fromEntries(url.searchParams)));
        if (['PUT', 'PATCH'].includes(request.method)) return json(await updateChildInNotion(child.id, { ...await bodyOf(request), className: teacher.className }, env));
      }
      if (['/api/history', '/api/logs'].includes(path) && request.method === 'GET') {
        const options = Object.fromEntries(url.searchParams);
        if (options.childId && options.childId !== 'class-all') await requireChild(env, options.childId, teacher.className);
        if (options.childId === 'class-all') delete options.childId;
        return json(await getAllDailyLogs(env, teacher.className, options));
      }
      const detailMatch = path.match(/^\/api\/history\/([^/]+)$/);
      if (detailMatch && request.method === 'GET') return json(await getLogDetail(env, detailMatch[1], teacher.className));
      if (path === '/api/generate' && request.method === 'POST') return json(await generate(await bodyOf(request), env, teacher));
      if (['/api/logs/save', '/api/save-notion'].includes(path) && request.method === 'POST') {
        const body = await bodyOf(request);
        const child = body.childId && body.childId !== 'class-all' ? await requireChild(env, body.childId, teacher.className) : null;
        const context = body.result?.record_context;
        if (context && (context.date !== body.date || (context.childId || null) !== (child?.id || null) || context.teacherId !== teacher.id)) throw new ApiError('생성 당시의 원아·날짜와 다릅니다. 선택한 대상으로 다시 생성해 주세요.', 409);
        if (body.pageId) {
          const existing = await getLogDetail(env, body.pageId, teacher.className);
          if ((existing.childId || null) !== (child?.id || null)) throw new ApiError('다른 원아의 기록을 덮어쓸 수 없습니다.', 403);
          if (body.append) {
            body.rawMemo = [existing.memo, body.rawMemo].filter(Boolean).join('\n\n');
            body.obsSummary = [existing.summary, body.obsSummary || body.result?.observation_summary].filter(Boolean).join('\n');
            body.result = mergeReviewed(existing.parsedData || { kidsnote: { content: existing.kidsnoteText }, observation_log: { behavior: existing.behavior } }, body.result || {});
          }
        }
        return json(await saveDailyLogToNotion({ ...body, date: dateOf(body.date), childId: child?.id || null,
          childName: child?.name || '학급 전체', childClass: teacher.className, teacherId: teacher.id, teacherName: teacher.name }, env));
      }
      throw new ApiError('요청한 기능을 찾을 수 없습니다.', 404);
    } catch (error) {
      console.error('보육비서 API 오류', path, error.status || 500);
      return json({ error: error instanceof ApiError ? error.message : '처리 중 문제가 발생했습니다. 작성 내용은 유지됩니다.' }, error.status || 500);
    }
  }
};
