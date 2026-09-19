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
            child_db_id = os.environ.get("NOTION_CHILD_DB_ID")
            proxy_url = os.environ.get("NOTION_PROXY_URL", "https://minmin-notion.awslike6.workers.dev")
            if child_db_id:
                try:
                    req_url = f"{proxy_url}/v1/databases/{child_db_id}/query"
                    payload = {"page_size": 100, "sorts": [{"property": "아동명", "direction": "ascending"}]}
                    req = urllib.request.Request(req_url, data=json.dumps(payload).encode("utf-8"), headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"}, method="POST")
                    with urllib.request.urlopen(req, timeout=5) as resp:
                        data = json.loads(resp.read().decode("utf-8"))
                        children = []
                        for page in data.get("results", []):
                            props = page.get("properties", {})
                            name = props.get("아동명", {}).get("title", [{}])[0].get("plain_text", "이름 없음")
                            age = props.get("생년월일/연령", {}).get("rich_text", [{}])[0].get("plain_text", "만 4세")
                            traits = props.get("성향 및 특이사항", {}).get("rich_text", [{}])[0].get("plain_text", "")
                            allergies = props.get("알레르기/주의사항", {}).get("rich_text", [{}])[0].get("plain_text", "")
                            children.append({"id": page["id"], "name": name, "age": age, "traits": traits, "allergies": allergies})
                        if children:
                            self._send_json({"source": "notion", "children": children})
                            return
                except Exception as e:
                    print(f"[WARN] Local notion query failed: {e}")
            self._send_json({"source": "local_dev", "children": CHILDREN})
            return

        if self.path == "/api/gemini-key":
            self._send_json({"status": "ok" if GEMINI_API_KEY else "empty", "key": GEMINI_API_KEY})
            return

        if self.path.startswith("/api/session"):
            import time
            from datetime import datetime, timezone
            now_sec = int(time.time())
            is_mock_expiring = "mock_expiring=true" in self.path
            
            if is_mock_expiring:
                exp_sec = now_sec + 5 * 86400  # 5일 뒤 만료
                self._send_json({
                    "protected": True,
                    "email": "wife_teacher@daycare.kr",
                    "exp": exp_sec,
                    "expiresAt": datetime.fromtimestamp(exp_sec, timezone.utc).isoformat(),
                    "remainingDays": 5,
                    "remainingSeconds": 5 * 86400,
                    "isExpiringSoon": True,
                    "isExpired": False,
                    "mock": True
                })
            else:
                self._send_json({
                    "protected": False,
                    "email": "local-dev@localhost",
                    "remainingDays": None,
                    "isExpiringSoon": False,
                    "message": "로컬 개발 환경입니다. (?mock_expiring=true 로 D-5 테스트 가능)"
                })
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
            child_age = body.get("childAge", "만 2세")
            class_name = body.get("className", "소망반")
            monthly_obs_opts = body.get("monthlyObsOptions") or {}
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

            # 로컬 시뮬레이션 폴백 응답 (정규 공문서 + 5대 서식 완비)
            mock_res = {
                "class_daily_report": {
                    "title": "1. 만 2세 놀이중심 보육일지 (9월 17일)",
                    "date": "2026년 9월 17일 (목)",
                    "weather": "맑음",
                    "play_theme": "칙칙폭폭 기차놀이 & 가을 산책 후 앞마당 신체놀이(술래잡기, 비눗방울, 낙하산)",
                    "activities": [
                        {
                            "photo_ref": "[사진 1, 2 참조]",
                            "activity_title": "블록 기차놀이",
                            "observation": "[관찰 내용] 영아들은 길게 이어진 파란색 기차 레일 위에 초록 기차, 빨간 기차, 고속열차를 올려놓고 손으로 밀며 '칙칙폭폭 기차가 출발합니다!', '빨간 다리 지나가요~ 덜컹덜컹!' 하고 외친다. 맞은편 친구가 굴려오는 기차와 부딪히지 않도록 속도를 늦추거나 레일을 양보하며 기차의 움직임에 몰입한다.",
                            "curriculum_areas": ["자연탐구", "예술경험"],
                            "learning_content": "[배움 읽기: 자연탐구, 예술경험] - 곡선과 직선 레일을 따라 기차를 조작하며 선의 방향과 움직임, 공간의 연속성을 탐색한다. 이는 [자연탐구 > 수학적 탐구하기 > 공간과 도형에 관심 가지기]와 연계된다. - 기차 소리(칙칙폭폭, 덜컹덜컹)를 내며 기차 운전사나 승객의 역할을 모방하는 가상놀이를 즐긴다. 이는 [예술경험 > 창의적으로 표현하기 > 모방과 극놀이 즐기기]와 연계된다."
                        },
                        {
                            "photo_ref": "[사진 3 참조]",
                            "activity_title": "바깥 산책 전 교실 스트레칭",
                            "observation": "[관찰 내용] 영아들은 바닥에 다리를 쭉 펴고 앉아 선생님의 양손 손가락 동작(브이, 숫자 세기)을 흉내 내며 눈을 반짝인다. 선생님의 구호에 맞춰 발끝을 톡톡 치고 손을 위로 뻗으며 바깥놀이 전 준비운동에 씩씩하게 참여한다.",
                            "curriculum_areas": ["신체운동", "의사소통"],
                            "learning_content": "[배움 읽기: 신체운동, 의사소통] - 교사의 신체 동작을 시각적으로 모방하며 손가락 소근육과 팔다리 스트레칭을 통해 신체를 유연하게 조절한다. 이는 [신체운동 > 신체 조절과 기본 운동하기 > 신체 조절하기]와 연계된다. - 말하는 사람의 설명과 동작에 주의를 기울이며 바른 자세로 소통에 참여한다. 이는 [의사소통 > 듣기와 말하기 > 말하는 사람에게 주의 집중하기]와 연계된다."
                        },
                        {
                            "photo_ref": "[사진 4, 5 참조]",
                            "activity_title": "앞마당 대형 무지개 낙하산 신체놀이",
                            "observation": "[관찰 내용] 영아들은 알록달록 무지개 낙하산의 가장자리를 꼭 쥐고 '하나, 둘, 셋!' 구호에 맞춰 위로 번쩍 들어 올렸다가 바닥으로 펄럭인다. 가운데 쏙 들어간 친구들은 천막처럼 부풀어 오른 낙하산 안에서 웃음을 터뜨리고, 밖에서 흔드는 친구들도 펄럭이는 바람을 맞으며 힘껏 팔을 흔든다.",
                            "curriculum_areas": ["신체운동", "사회관계"],
                            "learning_content": "[배움 읽기: 신체운동, 사회관계] - 큰 천을 힘껏 올리고 내리는 전신 대근육 운동을 경험하며 낙하산이 만드는 공기의 저항과 움직임을 느낀다. 이는 [신체운동 > 신체 조절과 기본 운동하기 > 기본 운동 능력 기르기]와 연계된다. - 친구들과 함께 호흡을 맞춰 천을 잡고 흔들며 하나의 큰 파도를 만드는 협동의 기쁨과 소속감을 경험한다. 이는 [사회관계 > 더불어 살기 > 친구와 함께 놀이하기]와 연계된다."
                        }
                    ],
                    "reflection": "영아들이 블록으로 길게 만들던 기차 형태에 착안해 실제 조립형 레일과 다양한 기차 놀잇감을 연계해 주었더니, 레일 위를 따라 달리는 궤도 운동에 높은 집중력을 보였다. 야외에서는 가벼운 동네 산책 후 어린이집 앞마당 광장에서 술래잡기와 비눗방울 잡기, 대형 낙하산 흔들기 등 대근육을 역동적으로 쓰는 놀이를 진행해 아이들의 신체 발산 욕구를 시원하게 충족시켜 줄 수 있었다.",
                    "support": {
                        "environment": "기차 레일이 바닥에서 분리되지 않도록 넓은 공간에 안전하게 배치하고, 영아 수에 맞춰 기차 교구를 넉넉하게 꺼내주어 자리 다툼 없이 함께 굴릴 수 있도록 도움.",
                        "safety": "짧은 산책 시 보행 안전선을 지키도록 손잡고 이동을 지도하였으며, 광장 술래잡기 및 비눗방울 쫓기 시 친구들과 부딪히거나 넘어지지 않도록 충분한 안전거리를 유지시킴."
                    }
                },
                "kidsnote": {
                    "title": f"꼬마 기차역이 활짝 문을 열었어요! 🚂✨",
                    "content": f"안녕하세요, 소망반 어머니! 😊\n오늘 우리 소망반 교실에는 파란 철길을 따라 달리는 '꼬마 기차역'이 활짝 문을 열었답니다! 🚂✨\n평소 블록으로 길쭉길쭉 기차를 만들던 우리 아이들을 위해 오늘은 알록달록 기차와 레일을 짠! 준비해 주었는데요. 고사리손으로 기차를 꼭 쥐고 빨간 다리 아래로 \"칙칙폭폭~ 덜컹덜컹!\" 소리를 내며 레일 위를 신나게 달렸어요. 맞은편에서 친구 기차가 다가오면 \"기다려~ 먼저 가!\" 하며 사이좋게 양보하고 배려하는 모습이 얼마나 기특하고 예뻤는지 몰라요. 💛\n실내에서 칙칙폭폭 기차놀이를 마친 뒤에는 솔솔 부는 가을바람 맞으러 밖으로 나섰답니다! 🌿\n선생님과 짝꿍 손을 꼭 잡고 짧은 동네 산책을 즐긴 뒤, 어린이집 앞마당 광장에 모여 신나는 신체놀이를 즐겼어요. 하늘 높이 퐁퐁 날아가는 비눗방울을 쫓아 까르르 웃으며 잡으러 뛰고, \"나 잡아봐라~\" 꼬마 다람쥐처럼 요리조리 술래잡기도 했답니다. 🏃‍♂️🏃‍♀️💨\n실내에서는 체육 선생님과 함께 커다란 무지개 낙하산도 펄럭펄럭 흔들어 보았어요! 천을 위로 번쩍 들어 올려 커다란 무지개 텐트를 만들고, 그 속에서 친구들과 눈을 맞추며 까르르 웃는 얼굴들이 가을 햇살처럼 눈부시게 빛났답니다. 🌈💕\n손끝으로 기차도 굴리고, 온몸으로 가을 공기 마시며 땀방울 송골송골 맺히도록 씩씩하게 뛰어논 하루였어요.\n오늘 귀가하면 \"오늘 칙칙폭폭 기차 운전 재미있었어?\", \"비눗방울 많이 잡았어?\" 하고 꼬옥 안아주시면서 칭찬 듬뿍 건네주세요!\n오늘 저녁도 가족들과 함께 편안하고 행복 가득한 시간 보내세요. 감사합니다. 🥰",
                    "tags": [f"#소망반", f"#놀이중심", f"#기차놀이", "#신체놀이"]
                },
                "observation_log": {
                    "standard_area": "신체운동·건강",
                    "activity_name": activity_area,
                    "behavior": f"{child_name}는 {activity_area}에서 {raw_memo or '블록을 양손으로 조작하여 성 모양으로 구성함'}. 놀이 중 블록이 흔들리자 조심스럽게 균형을 잡는 모습을 보임.",
                    "evaluation": f"눈과 손의 협응력 및 소근육 조절력이 향상되고 있으며, 문제 상황 시 스스로 해결하려는 끈기를 격려함."
                },
                "monthly_observation": {
                    "title": f"[{monthly_obs_opts.get('targetMonth', '2026-09')}] {child_name} 발달 관찰기록부",
                    "target_month": monthly_obs_opts.get('targetMonth', '2026년 9월'),
                    "child_name": child_name,
                    "age_group": child_age,
                    "class_name": class_name,
                    "obs_1": {
                        "date": monthly_obs_opts.get('date1', '2026-09-08'),
                        "area": monthly_obs_opts.get('area1', '의사소통'),
                        "activity_title": f"{activity_area} 및 조작 놀이",
                        "behavior": f"{child_name}는 블록을 높이 쌓다가 무너지자 즉시 교사를 바라보며 손을 뻗어 도움을 요청함. 교사가 '도와줄까?' 묻자 고개를 끄덕이며 교사의 단어를 모방하여 발화를 시도함.",
                        "teacher_support": "유아의 요구를 즉각 수용하여 긍정적 언어 모델링을 제공하고, 무너진 블록을 함께 받쳐주며 심리적 안정감을 지원함."
                    },
                    "obs_2": {
                        "date": monthly_obs_opts.get('date2', '2026-09-22'),
                        "area": monthly_obs_opts.get('area2', '사회관계'),
                        "activity_title": "기차 레일 협동 구성놀이",
                        "behavior": f"1차 관찰 지도 이후 {child_name}는 놀이 중 어려움이 발생했을 때 울거나 떼쓰지 않고, 친구에게 먼저 블록 레일을 건네며 미소를 짓는 등 발전된 친사회적 상호작용을 보임.",
                        "teacher_support": "친구와의 성공적인 나눔 및 협동 장면을 포착하여 '건하가 친구를 배려해 주었구나!' 하고 언어로 따뜻하게 격려함.",
                        "growth_continuity": "1차 관찰 대비 교사 및 또래와의 상호작용 상황을 긍정적으로 수용하고 자발적인 나눔을 실천하는 발달적 성장을 나타냄."
                    },
                    "monthly_summary": {
                        "development_summary": f"한 달 동안 {child_name}는 {monthly_obs_opts.get('area1', '의사소통')} 및 {monthly_obs_opts.get('area2', '사회관계')} 영역에서 괄목할 만한 긍정적 변화를 보임. 부정적 정서 표출 대신 교사와의 눈맞춤과 모방 발화, 또래와의 교구 나눔을 통해 원만한 보육실 적응을 이루어 냄.",
                        "next_month_plan": f"다음 달에는 {child_name}의 신체 에너지와 조작 욕구를 살려 다양한 대소근육 복합 놀이와 소그룹 협동 놀이를 점진적으로 확대 지원할 계획임."
                    }
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

        if self.path == "/api/children":
            name = body.get("name", "신규 원아")
            age = body.get("age", "만 4세")
            traits = body.get("traits", "")
            allergies = body.get("allergies", "")

            child_db_id = os.environ.get("NOTION_CHILD_DB_ID")
            proxy_url = os.environ.get("NOTION_PROXY_URL", "https://minmin-notion.awslike6.workers.dev")

            if child_db_id:
                try:
                    req_url = f"{proxy_url}/v1/pages"
                    create_payload = {
                        "parent": {"database_id": child_db_id},
                        "properties": {
                            "아동명": {"title": [{"text": {"content": name}}]},
                            "생년월일/연령": {"rich_text": [{"text": {"content": age}}]},
                            "성향 및 특이사항": {"rich_text": [{"text": {"content": traits}}]},
                            "알레르기/주의사항": {"rich_text": [{"text": {"content": allergies}}]}
                        }
                    }
                    req = urllib.request.Request(req_url, data=json.dumps(create_payload).encode("utf-8"), headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"}, method="POST")
                    with urllib.request.urlopen(req, timeout=5) as resp:
                        res_data = json.loads(resp.read().decode("utf-8"))
                        self._send_json({"success": True, "mode": "notion_created", "child": {"id": res_data["id"], "name": name, "age": age, "traits": traits, "allergies": allergies}})
                        return
                except Exception as e:
                    print(f"[WARN] Local notion child create failed: {e}")

            new_child = {"id": f"mock-child-{len(CHILDREN)+1}", "name": name, "age": age, "traits": traits, "allergies": allergies}
            CHILDREN.append(new_child)
            self._send_json({"success": True, "mode": "local_created", "child": new_child})
            return

        if self.path == "/api/logs/save":
            daily_db_id = os.environ.get("NOTION_DAILY_LOG_DB_ID")
            proxy_url = os.environ.get("NOTION_PROXY_URL", "https://minmin-notion.awslike6.workers.dev")
            today = body.get("date") or "2026-09-19"
            child_name = body.get("childName") or "원아"
            activity_area = body.get("activityArea") or "자유놀이"
            page_title = f"[{today}] {child_name} - {activity_area}"

            if daily_db_id:
                try:
                    req_url = f"{proxy_url}/v1/pages"
                    props = {
                        "기록명/식별자": {"title": [{"text": {"content": page_title}}]},
                        "작성일자": {"date": {"start": today}},
                        "활동 구분": {"select": {"name": activity_area}},
                        "표준보육 영역": {"multi_select": [{"name": body.get("standardArea") or "의사소통"}]},
                        "원시 메모/키워드": {"rich_text": [{"text": {"content": body.get("rawMemo") or ""}}]},
                        "알림장 최종본": {"rich_text": [{"text": {"content": body.get("kidsnoteText") or ""}}]},
                        "관찰일지 최종본": {"rich_text": [{"text": {"content": body.get("observationText") or ""}}]},
                        "참조 출처 요약": {"rich_text": [{"text": {"content": body.get("citationSummary") or ""}}]}
                    }
                    if body.get("childId") and not str(body.get("childId")).startswith("mock-"):
                        props["원아"] = {"relation": [{"id": body.get("childId")}]}

                    create_payload = {"parent": {"database_id": daily_db_id}, "properties": props}
                    req = urllib.request.Request(req_url, data=json.dumps(create_payload).encode("utf-8"), headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"}, method="POST")
                    with urllib.request.urlopen(req, timeout=5) as resp:
                        res_data = json.loads(resp.read().decode("utf-8"))
                        self._send_json({"success": True, "mode": "notion_saved", "title": page_title, "url": res_data.get("url")})
                        return
                except Exception as e:
                    print(f"[WARN] Local notion log save failed: {e}")

            self._send_json({
                "success": True,
                "mode": "local_mock_saved",
                "title": page_title,
                "message": "로컬 개발 서버에 성공적으로 저장되었습니다."
            })
            return

        self._send_json({"error": "Not Found"}, 404)

    def do_PUT(self):
        self._handle_update()

    def do_PATCH(self):
        self._handle_update()

    def _handle_update(self):
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            body_bytes = self.rfile.read(content_length)
            body = json.loads(body_bytes.decode("utf-8")) if body_bytes else {}

            if self.path.startswith("/api/children/"):
                child_id = self.path.split("/api/children/")[1].split("?")[0]
                name = body.get("name")
                age = body.get("age")
                traits = body.get("traits")
                allergies = body.get("allergies")

                proxy_url = os.environ.get("NOTION_PROXY_URL", "https://minmin-notion.awslike6.workers.dev")
                if child_id and not child_id.startswith("mock-"):
                    try:
                        req_url = f"{proxy_url}/v1/pages/{child_id}"
                        props = {}
                        if name:
                            props["아동명"] = {"title": [{"text": {"content": name}}]}
                        if age is not None:
                            props["생년월일/연령"] = {"rich_text": [{"text": {"content": age}}]}
                        if traits is not None:
                            props["성향 및 특이사항"] = {"rich_text": [{"text": {"content": traits}}]}
                        if allergies is not None:
                            props["알레르기/주의사항"] = {"rich_text": [{"text": {"content": allergies}}]}

                        update_payload = {"properties": props}
                        req = urllib.request.Request(req_url, data=json.dumps(update_payload).encode("utf-8"), headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"}, method="PATCH")
                        with urllib.request.urlopen(req, timeout=5) as resp:
                            res_data = json.loads(resp.read().decode("utf-8"))
                            self._send_json({"success": True, "mode": "notion_updated", "child": {"id": child_id, "name": name, "age": age, "traits": traits, "allergies": allergies}})
                            return
                    except Exception as e:
                        print(f"[WARN] Local notion child update failed: {e}")

                for c in CHILDREN:
                    if c["id"] == child_id:
                        if name: c["name"] = name
                        if age: c["age"] = age
                        if traits is not None: c["traits"] = traits
                        if allergies is not None: c["allergies"] = allergies
                        break
                self._send_json({"success": True, "mode": "local_updated", "child": {"id": child_id, "name": name, "age": age, "traits": traits, "allergies": allergies}})
                return

            self._send_json({"error": "Not Found"}, 404)
        except Exception as err:
            print(f"[ERROR in _handle_update]: {err}")
            self._send_json({"error": str(err)}, 500)

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
