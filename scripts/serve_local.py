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

# .dev.vars 로컬 환경변수 자동 로드
DEV_VARS_FILE = BASE_DIR / ".dev.vars"
if DEV_VARS_FILE.exists():
    with open(DEV_VARS_FILE, "r", encoding="utf-8-sig") as f:
        for line in f:
            line = line.strip().lstrip("\ufeff")
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ[k.strip()] = v.strip()

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

        if self.path == "/api/gemini-key":
            self._send_json({"status": "ok" if GEMINI_API_KEY else "empty", "key": GEMINI_API_KEY})
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
            persona = body.get("persona") or {}
            api_key = body.get("apiKey") or GEMINI_API_KEY

            # 실명 마스킹
            masked_memo = raw_memo.replace(child_name, "[아동A]")
            sample_note = (persona.get("sampleNote") or "").replace(child_name, "[아동A]")
            call_style = persona.get("callStyle", "우리 [아동A]")
            emoji_level = persona.get("emojiLevel", "moderate")
            closing_greeting = persona.get("closingGreeting", "")

            if api_key:
                try:
                    # Gemini 3.8 Flash 실제 호출
                    sample_instruction = f"""
[⭐ 최우선 복제 기준: 선생님의 실제 평소 알림장 예시]
반드시 아래 예시문의 '문장 길이, 어미 스타일(~했지요, ~했답니다 등), 이모지 습관, 말투'를 100% 모방하라:
\"\"\"
{sample_note}
\"\"\"""" if sample_note else ""

                    prompt = f"""너는 대한민국 어린이집 15년차 보육교사다. 원아는 '[아동A]'로만 칭한다.
원아 정보: [아동A] ({body.get('childAge', '만 4세')})
작성 모드: {'부분/시간대별 (3~4줄 간결형)' if mode == 'partial' else '하루 전체 통합형'}
활동 영역: {activity_area}
원아 호칭: '{call_style}'
이모지 스타일: {emoji_level}
단골 맺음말: {closing_greeting}
{sample_instruction}

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
  "daily_care_log": {{
    "play_summary": "오늘 우리 반 유아들의 전반적인 놀이 흐름 요약",
    "play_evaluation": "놀이에 대한 교사의 종합 평가 및 배움 분석",
    "next_support_plan": "내일 놀이 확장을 위한 공간/자료 및 교사 지원 계획"
  }},
  "parent_counseling": {{
    "daily_routine": "식습관, 낮잠, 배변 등 기본생활습관 특징",
    "social_relations": "또래 및 교사와의 긍정적 상호작용과 사회성",
    "development_feature": "놀이 몰입도 및 신체/언어 발달 강점",
    "counseling_opinion": "가정 연계 및 학부모 상담 시 안내할 종합 조언"
  }},
  "play_support_plan": {{
    "extension_idea": "아이들의 관심사에 맞춘 심화 확장 놀이 아이디어",
    "recommended_materials": "추가 배치할 놀이 교구 및 환경구성 자료",
    "interaction_tips": "아이의 사고 확장을 돕는 교사의 추천 발문 팁"
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

            # 로컬 시뮬레이션 폴백 응답 (5대 서식 완비)
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
                "daily_care_log": {
                    "play_summary": f"유아들이 {activity_area} 영역에 자발적으로 모여 다양한 크기의 교구를 탐색하고 자신만의 구조물을 만드는 놀이가 활발히 전개됨.",
                    "play_evaluation": f"블록의 균형을 맞추며 공간 감각과 소근육 조절력을 기르고, 친구와 교구를 나누어 쓰는 긍정적 또래 상호작용이 관찰됨.",
                    "next_support_plan": f"유아들의 성 쌓기 흥미를 확장하여 내일은 동물 피규어와 바퀴 달린 자동차 소품을 함께 배치하여 마을 구성 놀이로 연계 지원할 계획임."
                },
                "parent_counseling": {
                    "daily_routine": f"{child_name}는 정해진 일과 순서를 잘 인지하고 스스로 정리정돈에 적극적으로 참여하며 규칙적인 식습관을 형성해 가고 있음.",
                    "social_relations": f"친구들에게 먼저 다가가 관심 있는 놀이를 제안하고 갈등 발생 시 교사의 중재를 경청하며 타협점을 찾는 모습이 돋보임.",
                    "development_feature": f"조작 및 구성 놀이에 대한 집중 시간이 길고 소근육 협응력이 또래 대비 안정적으로 발달하고 있음.",
                    "counseling_opinion": f"가정에서도 {child_name}의 훌륭한 자기 조절력과 성취감을 칭찬해 주시고, 다양한 재료를 만지는 촉감 놀이를 함께해 주시면 더욱 좋습니다."
                },
                "play_support_plan": {
                    "extension_idea": f"블록 성에 간판을 달아주는 '우리 동네 마을 만들기' 미술/역할 놀이로 확장.",
                    "recommended_materials": "도로 매트, 신호등 소품, 다양한 표정의 사람 및 동물 피규어.",
                    "interaction_tips": "'이 성에는 어떤 친구들이 살고 있을까?'처럼 상상력을 자극하는 열린 발문 지원."
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
