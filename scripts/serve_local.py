"""
🧸 daycare-helper 로컬 개발 및 테스트 서버 (scripts/serve_local.py)

기능:
 1. public/ 정적 프론트엔드 (HTML/CSS/JS) 서빙
 2. /api/children, /api/generate, /api/logs/save 로컬 시뮬레이션/Gemini 직접 연동
 3. 별도의 Node.js 설치 없이 Python 3.12 표준 라이브러리만으로 로컬 실행 가능
"""

import os
import sys
import json
import urllib.request
import urllib.error
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')

BASE_DIR = Path(__file__).resolve().parent.parent
PUBLIC_DIR = BASE_DIR / "public"
PORT = 8787

# Gemini 설정
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = "gemini-3.8-flash"

# 모크 원아 데이터
CHILDREN = [
    {
        "id": "mock-child-1",
        "name": "김민서",
        "age": "만 4세",
        "birth": "2021-04-15",
        "traits": "손으로 만지는 조작 놀이(블록, 클레이)를 매우 즐김. 가위질 등 정밀 소근육 조절력 발달 중.",
        "allergies": "우유 과다 섭취 주의"
    },
    {
        "id": "mock-child-2",
        "name": "이민수",
        "age": "만 5세",
        "birth": "2020-08-20",
        "traits": "또래 친구들과 협동 놀이에 흥미를 보이며 관찰력이 뛰어남. 낯선 환경에 적응 시간이 약간 필요함.",
        "allergies": "복숭아 알레르기"
    },
    {
        "id": "mock-child-3",
        "name": "박서준",
        "age": "만 3세",
        "birth": "2022-02-10",
        "traits": "활동적인 신체 놀이와 공놀이를 좋아함. 식사 시간 스스로 숟가락질 시도 중.",
        "allergies": "계란 알레르기(약함)"
    },
    {
        "id": "mock-child-4",
        "name": "최지우",
        "age": "만 4세",
        "birth": "2021-11-03",
        "traits": "동화책 읽기와 그림 그리기를 좋아함. 차분하게 선생님의 안내에 귀 기울임.",
        "allergies": "없음"
    }
]

class DaycareHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC_DIR), **kwargs)

    def _send_json(self, data, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode("utf-8"))

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        if self.path == "/health":
            self._send_json({
                "status": "ok",
                "server": "python-local-dev",
                "env_configured": {
                    "has_gemini_key": bool(GEMINI_API_KEY),
                    "has_notion_token": bool(os.environ.get("NOTION_TOKEN")),
                    "has_daily_log_db": bool(os.environ.get("NOTION_DAILY_LOG_DB_ID"))
                }
            })
            return

        if self.path == "/api/children":
            self._send_json({"source": "local_dev", "children": CHILDREN})
            return

        # 기본 정적 파일 서빙
        super().do_GET()

    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        body_bytes = self.rfile.read(content_length)
        body = json.loads(body_bytes.decode("utf-8")) if body_bytes else {}

        if self.path == "/api/generate":
            child_name = body.get("childName", "김민서")
            raw_memo = body.get("rawMemo", "")
            mode = body.get("mode", "partial")
            activity_area = body.get("activityArea", "자유놀이")
            api_key = body.get("apiKey") or GEMINI_API_KEY

            # 실명 마스킹
            masked_memo = raw_memo.replace(child_name, "[아동A]")

            if api_key:
                try:
                    # Gemini 3.8 Flash 실제 호출
                    prompt = f"""너는 대한민국 어린이집 15년차 보육교사다. 원아는 '[아동A]'로만 칭한다.
원아 정보: [아동A] ({body.get('childAge', '만 4세')})
작성 모드: {'부분/시간대별 (3~4줄 간결형)' if mode == 'partial' else '하루 전체 통합형'}
활동 영역: {activity_area}
교사 메모: {masked_memo}

반드시 다음 JSON 형식으로만 응답하라:
{{
  "kidsnote": {{
    "title": "알림장 제목",
    "content": "학부모용 다정체 서술문 (~했답니다, ~했어요)",
    "tags": ["{activity_area}", "어린이집"]
  }},
  "observation_log": {{
    "standard_area": "신체운동·건강",
    "activity_name": "{activity_area}",
    "behavior": "객관적 행동 관찰문 (~함 체)",
    "evaluation": "교사의 지원 및 발달 평가 (~를 도움)"
  }},
  "citation": {{
    "has_citation": true,
    "summary": "📌 참고한 과거 기록: [2026-09-05] 가위질 미숙 기록 대비 양손 협응력 향상 관찰됨"
  }}
}}"""
                    url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={api_key}"
                    req = urllib.request.Request(
                        url,
                        data=json.dumps({
                            "contents": [{"parts": [{"text": prompt}]}],
                            "generationConfig": {"responseMimeType": "application/json"}
                        }).encode("utf-8"),
                        headers={"Content-Type": "application/json"},
                        method="POST"
                    )
                    with urllib.request.urlopen(req, timeout=15) as resp:
                        res_data = json.loads(resp.read().decode("utf-8"))
                        text_res = res_data["candidates"][0]["content"]["parts"][0]["text"]
                        parsed = json.loads(text_res)
                        # 언마스킹 복원
                        unmasked_str = json.dumps(parsed, ensure_ascii=False).replace("[아동A]", child_name)
                        self._send_json({"success": True, "data": json.loads(unmasked_str)})
                        return
                except Exception as e:
                    print(f"[Gemini Error]: {e}")

            # 로컬 시뮬레이션 폴백 응답
            mock_res = {
                "kidsnote": {
                    "title": f"{child_name}가 신나게 참여한 {activity_area} 시간!",
                    "content": f"오늘 우리 {child_name}는 {activity_area} 활동에서 {raw_memo or '친구들과 함께 블록을 높이 쌓으며'} 즐겁게 참여했답니다. 작은 손으로 집중하는 모습이 무척 대견했어요! 가정에서도 오늘 놀이에 대해 많은 칭찬 부탁드립니다.^^",
                    "tags": [f"#{activity_area}", f"#{child_name}의하루", "#소근육발달"]
                },
                "observation_log": {
                    "standard_area": "신체운동·건강",
                    "activity_name": activity_area,
                    "behavior": f"{child_name}는 {activity_area}에서 {raw_memo or '블록을 양손으로 조작하여 성 모양으로 구성함'}. 놀이 중 블록이 흔들리자 조심스럽게 균형을 잡는 모습을 보임.",
                    "evaluation": f"눈과 손의 협응력 및 소근육 조절력이 향상되고 있으며, 문제 상황 시 스스로 해결하려는 끈기를 격려함."
                },
                "citation": {
                    "has_citation": True,
                    "summary": f"📌 참고한 과거 기록: [2026-09-05] 가위질 조절 미숙 대비 {child_name}의 양손 협응력 및 손가락 힘 향상 관찰됨"
                }
            }
            self._send_json({"success": True, "data": mock_res})
            return

        if self.path == "/api/logs/save":
            title = f"[{body.get('date')}] {body.get('childName')} - {body.get('activityArea')}"
            self._send_json({
                "success": True,
                "mode": "local_mock_saved",
                "title": title,
                "message": "로컬 개발 서버에 성공적으로 저장되었습니다."
            })
            return

        self._send_json({"error": "Not Found"}, 404)

def run():
    server_address = ("", PORT)
    httpd = HTTPServer(server_address, DaycareHandler)
    print("=" * 60)
    print(f"🧸 daycare-helper 로컬 테스트 서버가 시작되었습니다!")
    print(f"👉 브라우저 주소: http://localhost:{PORT}")
    print(f"👉 정적 파일 경로: {PUBLIC_DIR}")
    print("=" * 60)
    print("서버를 종료하려면 Ctrl+C 를 누르세요.\n")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n서버가 안전하게 종료되었습니다.")

if __name__ == "__main__":
    run()
