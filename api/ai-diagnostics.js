/** 관리자 전용 운영 연결 점검. 실제 원아 자료와 비밀값을 반환하지 않는다. */
import { ApiError } from './auth.js';
import { GEMINI_PRIMARY_MODEL, GEMINI_FALLBACK_MODEL, GEMINI_API_BASE } from './gemini.js';

export async function diagnoseAi(env) {
  if (!env.GEMINI_API_KEY) throw new ApiError('서버의 AI 키 설정이 필요합니다.', 503);
  const primary = env.GEMINI_MODEL || GEMINI_PRIMARY_MODEL;
  const fallback = env.GEMINI_FALLBACK_MODEL || GEMINI_FALLBACK_MODEL;
  const base = env.GEMINI_API_BASE || GEMINI_API_BASE;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(env.GEMINI_API_KEY));
  const fingerprint = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
  async function probe(model) {
    const start = Date.now();
    try {
      const response = await fetch(base + (model ? '/' + model + ':generateContent' : ''), {
        method: model ? 'POST' : 'GET', headers: { 'x-goog-api-key': env.GEMINI_API_KEY, 'Content-Type': 'application/json' },
        ...(model ? { body: JSON.stringify({ contents: [{ parts: [{ text: 'Connection check only. Return OK.' }] }], generationConfig: { maxOutputTokens: 128 } }) } : {}),
        signal: AbortSignal.timeout(20000)
      });
      const body = await response.json();
      const status = body.error?.status;
      const safeStatus = ['UNAVAILABLE', 'RESOURCE_EXHAUSTED', 'PERMISSION_DENIED', 'UNAUTHENTICATED', 'INVALID_ARGUMENT', 'FAILED_PRECONDITION', 'NOT_FOUND'].includes(status) ? status : undefined;
      return { model: model || 'models-list', httpStatus: response.status, upstreamStatus: safeStatus, durationMs: Date.now() - start,
        ...(model ? { hasText: !!body.candidates?.[0]?.content?.parts?.some(p => p.text && !p.thought) } : {
          primaryAvailable: body.models?.some(m => m.name === 'models/' + primary) || false,
          fallbackAvailable: body.models?.some(m => m.name === 'models/' + fallback) || false
        }) };
    } catch (error) {
      return { model: model || 'models-list', failed: true, timeout: ['TimeoutError', 'AbortError'].includes(error.name), durationMs: Date.now() - start };
    }
  }
  // 동시 호출을 피하고 각 점검을 20초로 제한한다.
  const results = [];
  for (const model of [null, primary, fallback]) results.push(await probe(model));
  const endpoint = new URL(base);
  return { diagnosticOnly: true, keyFingerprint: fingerprint, endpoint: endpoint.origin + endpoint.pathname, results };
}
