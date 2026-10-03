/** 공용 프록시에서 보육 DB와 그 하위 페이지/블록을 보호한다. 캐시보다 먼저 적용한다. */
const protectedIds = new Set([
  '3e0a27115b688186ad30cbaea7687006',
  '3e0a27115b688182955ef116e4174e3a',
  '3e0a27115b6881229eeadd49bf8a625c'
]);
const normalize = value => String(value || '').replace(/-/g, '').toLowerCase();
const denied = () => Response.json({ error: '보육 기록은 보육비서에서 인증 후 이용해 주세요.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
function equal(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
export async function guardDaycareProxy(request, env, callRaw, resolveAuth) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/v1/') || url.pathname === '/v1/gemini' || url.pathname === '/v1/audio/speech') return null;
  const auth = resolveAuth(request, env);
  if (!auth) return null;
  if (equal(request.headers.get('X-Daycare-Service-Key'), env.DAYCARE_SERVICE_KEY)) {
    const body = ['GET', 'HEAD'].includes(request.method) ? null : await request.clone().text();
    const response = await callRaw(url.pathname + url.search, request.method, body, auth);
    return new Response(response.body, { status: response.status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
  async function isProtected(type, id, depth = 0) {
    if (protectedIds.has(normalize(id))) return true;
    if (type === 'databases') return false;
    if (depth > 20 || !/^[a-f0-9-]{32,36}$/i.test(id || '')) return true;
    const response = await callRaw(`/v1/${type}/${encodeURIComponent(id)}`, 'GET', null, auth);
    if (!response.ok) return true;
    const object = await response.json(); const p = object.parent || {};
    if (p.database_id) return protectedIds.has(normalize(p.database_id));
    if (p.data_source_id) return true;
    if (p.page_id) return isProtected('pages', p.page_id, depth + 1);
    if (p.block_id) return isProtected('blocks', p.block_id, depth + 1);
    return false;
  }
  const match = url.pathname.match(/^\/v1\/(databases|pages|blocks)\/([^/]+)/);
  if (match && await isProtected(match[1], decodeURIComponent(match[2]))) return denied();
  // 공개 검색은 서버의 전체 통합 권한을 빌려 비공개 페이지를 노출할 수 있다.
  if (url.pathname === '/v1/search') return denied();
  if (['POST', 'PATCH'].includes(request.method)) {
    let body;
    try { body = await request.clone().json(); } catch { return denied(); }
    const parent = body.parent || {};
    if (parent.database_id && protectedIds.has(normalize(parent.database_id))) return denied();
    if (parent.page_id && await isProtected('pages', parent.page_id)) return denied();
    if (parent.block_id && await isProtected('blocks', parent.block_id)) return denied();
  }
  return null;
}
