/**
 * 🏰 Cloudflare Worker: daycare-helper 백엔드 & 정적 에셋 라우터
 * 
 * 2026 표준 기술 스택:
 *  - AI: Gemini 3.8 Flash (멀티모달, 실명 마스킹, One-Source Multi-Use)
 *  - DB: Notion REST API (Notion-Version: 2022-06-28)
 *  - Frontend: Workers Assets 서빙
 */

import { generateDaycareLog } from './api/gemini.js';
import { getChildrenList, getRecentChildLogs, saveDailyLogToNotion, saveChildToNotion, updateChildInNotion } from './api/notion.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Notion-Version',
  'Access-Control-Max-Age': '86400',
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...CORS_HEADERS
    }
  });
}

function parseJwtPayload(token) {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    console.warn('JWT Payload 디코딩 실패:', e);
    return null;
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1. CORS 사전 비행(Preflight) 요청 처리
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS
      });
    }

    // 2. 헬스체크 엔드포인트 (/health)
    if (url.pathname === '/health') {
      return jsonResponse({
        status: 'ok',
        service: 'daycare-helper',
        timestamp: new Date().toISOString(),
        env_configured: {
          has_gemini_key: Boolean(env.GEMINI_API_KEY),
          has_notion_token: Boolean(env.NOTION_TOKEN),
          has_child_db: Boolean(env.NOTION_CHILD_DB_ID),
          has_daily_log_db: Boolean(env.NOTION_DAILY_LOG_DB_ID)
        }
      });
    }

    // 2-B. 🔑 Gemini 런타임 보안 키 디스펜서 (/api/gemini-key)
    // Cloudflare Worker Secret을 사용자 브라우저(한국 IP) 런타임 메모리에 안전 수급
    if (url.pathname === '/api/gemini-key') {
      const apiKey = env.GEMINI_API_KEY || '';
      return jsonResponse({
        status: apiKey ? 'ok' : 'empty',
        key: apiKey
      });
    }

    // 2-C. 🔐 Cloudflare Access 보안 세션 확인 (/api/session)
    if (url.pathname === '/api/session' && request.method === 'GET') {
      const jwtToken = request.headers.get('Cf-Access-Jwt-Assertion');
      const userEmail = request.headers.get('Cf-Access-Authenticated-User-Email');

      if (jwtToken) {
        const payload = parseJwtPayload(jwtToken);
        if (payload && payload.exp) {
          const nowSec = Math.floor(Date.now() / 1000);
          const remainingSeconds = payload.exp - nowSec;
          const remainingDays = Math.max(0, Math.ceil(remainingSeconds / (24 * 3600)));
          const email = userEmail || payload.email || '인증 사용자';

          return jsonResponse({
            protected: true,
            email,
            exp: payload.exp,
            expiresAt: new Date(payload.exp * 1000).toISOString(),
            remainingDays,
            remainingSeconds,
            isExpiringSoon: remainingDays <= 7 && remainingSeconds > 0,
            isExpired: remainingSeconds <= 0
          });
        }
      }

      return jsonResponse({
        protected: false,
        email: userEmail || '로컬/미보호 환경',
        remainingDays: null,
        isExpiringSoon: false,
        message: 'Cloudflare Access가 아직 활성화되지 않았거나 로컬 환경입니다.'
      });
    }

    // 3. API 라우트 핸들링 (/api/*)
    if (url.pathname.startsWith('/api/')) {
      try {
        // [GET] /api/children - 원아 목록 조회
        if (url.pathname === '/api/children' && request.method === 'GET') {
          const result = await getChildrenList(env);
          return jsonResponse(result);
        }

        // [POST] /api/children - 신규 원아 등록
        if (url.pathname === '/api/children' && request.method === 'POST') {
          const body = await request.json();
          const result = await saveChildToNotion(body, env);
          return jsonResponse(result);
        }

        // [PUT/PATCH] /api/children/:id - 원아 정보 수정
        const childUpdateMatch = url.pathname.match(/^\/api\/children\/([^/]+)$/);
        if (childUpdateMatch && (request.method === 'PUT' || request.method === 'PATCH')) {
          const childId = decodeURIComponent(childUpdateMatch[1]);
          const body = await request.json();
          const result = await updateChildInNotion(childId, body, env);
          return jsonResponse(result);
        }

        // [GET] /api/children/:id/recent-logs - 특정 원아의 최근 관찰 기록
        const recentLogsMatch = url.pathname.match(/^\/api\/children\/([^/]+)\/recent-logs$/);
        if (recentLogsMatch && request.method === 'GET') {
          const childId = decodeURIComponent(recentLogsMatch[1]);
          const childName = url.searchParams.get('name') || '';
          const result = await getRecentChildLogs(childId, childName, env);
          return jsonResponse(result);
        }

        // [POST] /api/generate - Gemini 3.8 Flash 알림장 & 일지 생성
        if (url.pathname === '/api/generate' && request.method === 'POST') {
          const body = await request.json();
          const {
            childId,
            childName,
            childAge,
            childTraits,
            parentStyle = '',
            allergies,
            rawMemo,
            images,
            mode = 'partial',
            activityArea = '자유놀이',
            teacherStyle = '다정친절체',
            className = env.DEFAULT_CLASS_NAME || '햇살반',
            teacherName = env.DEFAULT_TEACHER_NAME || '김선생님',
            persona = {}
          } = body;

          if (!childName) {
            return jsonResponse({ error: '원아 이름이 필요합니다.' }, 400);
          }

          const apiKey = env.GEMINI_API_KEY;
          if (!apiKey) {
            return jsonResponse({
              error: 'Cloudflare Worker에 GEMINI_API_KEY 시크릿이 설정되지 않았습니다. Cloudflare 대시보드 Settings -> Variables and Secrets에서 등록해 주세요.'
            }, 500);
          }

          // 최근 과거 기록 조회 (문맥 연계 및 Citation용)
          let pastLogs = [];
          if (childId) {
            try {
              const logsRes = await getRecentChildLogs(childId, childName, env);
              pastLogs = logsRes.logs || [];
            } catch (e) {
              console.warn('과거 기록 조회 실패, 진행 지속:', e);
            }
          }

          // Gemini 3.8 Flash 호출 (실명 마스킹 -> 생성 -> 언마스킹)
          const generated = await generateDaycareLog({
            apiKey,
            childName,
            childAge,
            childTraits,
            parentStyle,
            allergies,
            rawMemo,
            images,
            pastLogs,
            mode,
            activityArea,
            teacherStyle,
            className,
            teacherName,
            persona
          });

          return jsonResponse(generated);
        }

        // [POST] /api/logs/save - 노션 3대 DB 일지 적재
        if (url.pathname === '/api/logs/save' && request.method === 'POST') {
          const body = await request.json();
          const result = await saveDailyLogToNotion(body, env);
          return jsonResponse(result);
        }

        return jsonResponse({ error: `Not Found: ${url.pathname}` }, 404);
      } catch (err) {
        console.error('API Error:', err);
        return jsonResponse({
          error: err.message || 'Internal Server Error',
          stack: err.stack
        }, 500);
      }
    }

    // 4. 정적 에셋 서빙 (Cloudflare Workers Assets binding)
    if (env.ASSETS) {
      return await env.ASSETS.fetch(request);
    }

    return new Response('Daycare Helper Worker is running. Assets binding not configured.', {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
};
