/** 원시 메모 전용 노션 행과 기기 간 쓰기 직렬화. 검수 완성본은 변경하지 않는다. */
import { ApiError } from './auth.js';
import { callNotionApi, textOf, saveChildToNotion, getAllDailyLogs, getLogDetail } from './notion.js';
import { linkChildRecord } from './child-links.js';

const PREFIX = '[원시 메모 자동저장 v1] ';
const normalized = value => String(value || '').replace(/-/g, '');
const rich = value => ({ rich_text: Array.from({ length: Math.ceil(value.length / 1800) }, (_, i) => ({ text: { content: value.slice(i * 1800, (i + 1) * 1800) } })) });
async function hash(value) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(v => v.toString(16).padStart(2, '0')).join('');
}
function identity(context) { return JSON.stringify([context.teacherId, context.className, context.date, context.childId || null]); }
function metadata(page) {
  const text = textOf(page.properties['참조 출처 요약']);
  try { return text.startsWith(PREFIX) ? JSON.parse(text.slice(PREFIX.length)) : null; } catch { return null; }
}
async function view(page) {
  if (!page) return { rawMemo: '', version: 'empty', revision: 0, pageId: null, updatedAt: null };
  const meta = metadata(page), rawMemo = textOf(page.properties['원시 메모/키워드']);
  return { rawMemo, version: await hash(JSON.stringify([rawMemo, meta?.mutationId || '', page.last_edited_time || ''])),
    revision: meta?.revision || 0, pageId: page.id, updatedAt: page.last_edited_time || meta?.updatedAt || null, url: page.url };
}
function checkPage(page, context, marker, env) {
  const p = page.properties || {}, children = p['원아']?.relation || [];
  if (page.archived || normalized(page.parent?.database_id) !== normalized(env.NOTION_DAILY_LOG_DB_ID) ||
      p['학급']?.select?.name !== context.className || p['작성일자']?.date?.start !== context.date ||
      !(p['작성교사']?.relation || []).some(r => normalized(r.id) === normalized(context.teacherId)) ||
      (context.childId ? children.length !== 1 || normalized(children[0].id) !== normalized(context.childId) : children.length !== 0) ||
      !textOf(p['기록명/식별자']).startsWith(marker) || !metadata(page)) {
    throw new ApiError('자동 메모의 원아·날짜·교사 연결을 확인해 주세요. 기존 기록은 보존했습니다.', 409);
  }
}
function properties(context, marker, pending) {
  return {
    '기록명/식별자': { title: [{ text: { content: `${marker} ${context.date} ${context.className} ${context.childName}` } }] },
    '작성일자': { date: { start: context.date } }, '학급': { select: { name: context.className } },
    '원아': { relation: context.childId ? [{ id: context.childId }] : [] },
    '작성교사': { relation: [{ id: context.teacherId }] },
    '원시 메모/키워드': rich(pending.rawMemo),
    '참조 출처 요약': rich(PREFIX + JSON.stringify({ revision: pending.revision, mutationId: pending.mutationId, updatedAt: pending.updatedAt }))
  };
}

export async function memoCall(env, operation, context, input = {}) {
  if (!env.MEMO_STORE) throw new ApiError('원시 메모 공유 저장소 설정이 필요합니다.', 503);
  const stub = env.MEMO_STORE.get(env.MEMO_STORE.idFromName(identity(context)));
  const response = await stub.fetch('https://memo.internal/' + operation, { method: 'POST', body: JSON.stringify({ context, input }) });
  const data = await response.json();
  return { status: response.status, data };
}

/** 운영 연구반 가상 원아에서만 자동 메모 쓰기·수정·직접 노션 조회를 확인한다. */
export async function verifyMemoConnection(env, teacher, date) {
  const child = await saveChildToNotion({ name: '자동메모검증가상원아', className: teacher.className, age: '만 0세', traits: '실제 원아가 아닌 자동 메모 연결 검증 자료' }, env);
  const context = { teacherId: teacher.id, className: teacher.className, date, childId: child.id, childName: '자동메모검증가상원아' };
  const rawMemo = '[자동 저장 연결 검증용 가상 메모 · 실제 원아 기록 아님] 블록을 손으로 잡음.';
  try {
    const first = await memoCall(env, 'save', context, { rawMemo, baseVersion: 'empty' });
    if (first.status !== 200 || !first.data.success) throw new ApiError(first.data.error || '가상 메모 저장 확인이 필요합니다.', 502);
    const nextMemo = rawMemo + '\n[PC 수정 검증용] 가상 메모 내용을 추가함.';
    const updated = await memoCall(env, 'save', context, { rawMemo: nextMemo, baseVersion: first.data.version });
    const read = await memoCall(env, 'read', context);
    const detail = await getLogDetail(env, first.data.pageId, teacher.className);
    if (updated.status !== 200 || read.data.rawMemo !== nextMemo || detail.memo !== nextMemo || !detail.memoOnly || first.data.pageId !== updated.data.pageId) throw new ApiError('노션 원시 메모 저장·수정·조회가 일치하지 않습니다.', 502);
    return { success: true, ai: false, memoWriteRead: true, memoUpdateSamePage: true, source: 'notion', archived: true };
  } finally {
    const records = await getAllDailyLogs(env, teacher.className, { childId: child.id, from: date, to: date });
    for (const row of records.data) await callNotionApi(env, '/pages/' + row.id, 'PATCH', { archived: true });
    await callNotionApi(env, '/pages/' + child.id, 'PATCH', { archived: true });
  }
}

export class MemoStore {
  constructor(state, env) { this.db = state.storage; this.env = env; this.queue = Promise.resolve(); }
  async fetch(request) {
    // 큐는 노션 호출을 포함하여 직렬화한다. 긴 외부 호출을 blockConcurrencyWhile로 감싸지 않는다.
    const job = this.queue.catch(() => {}).then(async () => {
      try {
        const { context, input } = await request.json();
        const savedContext = await this.db.get('context');
        if (savedContext && identity(savedContext) !== identity(context)) throw new ApiError('메모 접근 문맥이 다릅니다.', 403);
        if (!savedContext) await this.db.put('context', context);
        this.context = context;
        if (new URL(request.url).pathname === '/link-child') return Response.json(await linkChildRecord(this.env, context, input, this.db));
        this.marker = `[원시메모:${(await hash(identity(context))).slice(0, 24)}]`;
        const page = await this.readPage();
        const pending = await this.db.get('pending');
        if (pending) await this.reconcile(page, pending);
        const current = await view(page);
        if (new URL(request.url).pathname === '/read') return Response.json({ source: 'notion', ...current });
        if (new URL(request.url).pathname !== '/save') throw new ApiError('메모 요청을 확인해 주세요.', 404);
        if (typeof input.rawMemo !== 'string' || !input.rawMemo.trim() || input.rawMemo.length > 30000) throw new ApiError('저장할 메모는 1~30,000자입니다. 빈 메모로 기존 기록을 지우지 않습니다.');
        // 응답 유실 후 같은 텍스트를 보내도 노션에 다시 쓰지 않는다.
        if (input.rawMemo === current.rawMemo) return Response.json({ source: 'notion', success: true, ...current });
        if (input.baseVersion !== current.version) return Response.json({ error: '다른 기기 또는 노션에서 수정한 메모가 있습니다. 두 내용을 확인해 주세요.', current }, { status: 409 });
        const next = { rawMemo: input.rawMemo, revision: current.revision + 1, mutationId: crypto.randomUUID(),
          updatedAt: new Date().toISOString(), pageId: current.pageId, baseVersion: current.version };
        await this.db.put('pending', next);
        let written;
        try {
          written = await callNotionApi(this.env, next.pageId ? '/pages/' + next.pageId : '/pages', next.pageId ? 'PATCH' : 'POST', {
            ...(next.pageId ? {} : { parent: { database_id: this.env.NOTION_DAILY_LOG_DB_ID } }), properties: properties(context, this.marker, next)
          });
        } catch (error) {
          // 429는 쓰기 거부가 확정됐다. 그 외 불명확 응답은 조회로 확인할 때까지 최초 생성을 재전송하지 않는다.
          if (error.status === 429 || error.writeRejected) await this.db.delete('pending');
          throw error;
        }
        checkPage(written, context, this.marker, this.env);
        if (textOf(written.properties['원시 메모/키워드']) !== next.rawMemo || metadata(written)?.mutationId !== next.mutationId) throw new ApiError('노션에 저장한 메모를 다시 확인하고 있습니다.', 503);
        await this.db.put('pageId', written.id); await this.db.delete('pending');
        return Response.json({ source: 'notion', success: true, ...await view(written) });
      } catch (error) {
        return Response.json({ error: error instanceof ApiError ? error.message : '메모 저장 연결을 확인해 주세요. 기기 작성본은 보존됩니다.' }, { status: error instanceof ApiError ? error.status : 500 });
      }
    });
    this.queue = job; return job;
  }
  async readPage() {
    const id = await this.db.get('pageId');
    if (id) {
      const page = await callNotionApi(this.env, '/pages/' + id);
      checkPage(page, this.context, this.marker, this.env); return page;
    }
    const response = await callNotionApi(this.env, '/databases/' + this.env.NOTION_DAILY_LOG_DB_ID + '/query', 'POST', {
      page_size: 2, filter: { and: [
        { property: '기록명/식별자', title: { starts_with: this.marker } },
        { property: '학급', select: { equals: this.context.className } },
        { property: '작성교사', relation: { contains: this.context.teacherId } },
        { property: '작성일자', date: { equals: this.context.date } }
      ] }
    });
    if (response.results.length > 1) throw new ApiError('자동 메모가 중복되어 있습니다. 관리자에게 확인을 요청해 주세요.', 409);
    const page = response.results[0];
    if (page) { checkPage(page, this.context, this.marker, this.env); await this.db.put('pageId', page.id); }
    return page || null;
  }
  async reconcile(page, pending) {
    if (page && metadata(page)?.mutationId === pending.mutationId) { await this.db.delete('pending'); return; }
    if (!pending.pageId) throw new ApiError('최초 메모 저장 응답을 확인하는 중입니다. 기기 메모를 보관하고 자동으로 다시 조회합니다. 계속되면 관리자에게 연결 확인을 요청해 주세요.', 503);
    throw new ApiError('메모 저장 응답을 다시 확인하는 중입니다. 기기 메모를 보관하고 노션의 반영 여부를 다시 조회합니다. 계속되면 관리자에게 확인을 요청해 주세요.', 503);
  }
}
