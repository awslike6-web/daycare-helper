/**
 * 🏰 Cloudflare Worker: daycare-helper 백엔드 & 정적 에셋 라우터
 * 
 * 2026 표준 기술 스택:
 *  - AI: Gemini 3.8 Flash (멀티모달, 실명 마스킹, One-Source Multi-Use)
 *  - DB: Notion REST API (Notion-Version: 2022-06-28)
 *  - Frontend: Workers Assets 서빙
 */

import { generateDaycareLog } from './api/gemini.js';
import { getChildrenList, getRecentChildLogs, saveDailyLogToNotion } from './api/notion.js';

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

    // 3. API 라우트 핸들링 (/api/*)
    if (url.pathname.startsWith('/api/')) {
      try {
        // [GET] /api/children - 원아 목록 조회
        if (url.pathname === '/api/children' && request.method === 'GET') {
          const result = await getChildrenList(env);
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
            allergies,
            rawMemo,
            images,
            mode = 'partial',
            activityArea = '자유놀이',
            teacherStyle = '다정친절체',
            persona = {},
            apiKey: customApiKey
          } = body;

          if (!childName) {
            return jsonResponse({ error: '원아 이름이 필요합니다.' }, 400);
          }

          const apiKey = customApiKey || env.GEMINI_API_KEY;
          if (!apiKey) {
            return jsonResponse({
              error: 'GEMINI_API_KEY가 설정되지 않았습니다. .dev.vars 또는 화면 설정에서 API 키를 입력해주세요.'
            }, 400);
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
            allergies,
            rawMemo,
            images,
            pastLogs,
            mode,
            activityArea,
            teacherStyle,
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
