"""
🧸 daycare-helper Notion 3대 Database 자동 생성 및 스키마 검증 도구
(scripts/setup_notion_dbs.py)

Notion REST API Version: 2022-06-28
기능:
 1. 지정된 노션 상위 페이지 아래에 3대 DB 자동 생성
    - 1️⃣ [교사/반 관리 DB] (TEACHER_DB)
    - 2️⃣ [원아 마스터 DB] (CHILD_DB)
    - 3️⃣ [일지 & 알림장 메인 DB] (DAILY_LOG_DB)
 2. 생성된 DB ID들을 .dev.vars 및 wrangler.toml에 등록할 수 있도록 출력
"""

import os
import sys
import json
import urllib.request
import urllib.error
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')

NOTION_API_BASE = "https://api.notion.com/v1"
NOTION_VERSION = "2022-06-28"

def create_notion_db(token: str, parent_page_id: str, title: str, properties: dict) -> dict:
    url = f"{NOTION_API_BASE}/databases"
    headers = {
        "Authorization": f"Bearer {token}" if not token.startswith("Bearer ") else token,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json"
    }
    payload = {
        "parent": {"type": "page_id", "page_id": parent_page_id},
        "title": [{"type": "text", "text": {"content": title}}],
        "properties": properties
    }
    req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode("utf-8"))

def main():
    print("=" * 60)
    print("🧸 daycare-helper Notion 3대 DB 생성 도우미")
    print("=" * 60)
    
    token = os.environ.get("NOTION_TOKEN")
    parent_page_id = os.environ.get("NOTION_PARENT_PAGE_ID")
    
    if not token:
        print("\n[안내] NOTION_TOKEN 환경 변수가 설정되지 않았습니다.")
        token = input("👉 노션 통합 토큰(secret_...)을 입력하세요 (건너뛰려면 Enter): ").strip()
        if not token:
            print("❌ 토큰이 없어 종료합니다. .dev.vars에 수동으로 입력해주세요.")
            return

    if not parent_page_id:
        parent_page_id = input("👉 DB들을 생성할 상위 페이지 ID(32자)를 입력하세요: ").strip()
        if not parent_page_id:
            print("❌ 상위 페이지 ID가 필요합니다.")
            return

    # 1️⃣ 교사/반 관리 DB
    print("\n1️⃣ 교사/반 관리 DB 생성 중...")
    teacher_props = {
        "교사명": {"title": {}},
        "담당반": {
            "select": {
                "options": [
                    {"name": "만 0세반 (씨앗반)", "color": "pink"},
                    {"name": "만 1세반 (새싹반)", "color": "yellow"},
                    {"name": "만 2세반 (꽃잎반)", "color": "green"},
                    {"name": "만 3세반 (열매반)", "color": "blue"},
                    {"name": "만 4세반 (햇살반)", "color": "purple"},
                    {"name": "만 5세반 (하늘반)", "color": "orange"}
                ]
            }
        },
        "문체 프리셋": {
            "select": {
                "options": [
                    {"name": "다정친절체", "color": "pink"},
                    {"name": "단정격식체", "color": "gray"},
                    {"name": "활발발랄체", "color": "yellow"}
                ]
            }
        },
        "기본 마무리 멘트": {"rich_text": {}}
    }
    teacher_db = create_notion_db(token, parent_page_id, "🧸 [daycare] 1. 교사/반 관리 DB", teacher_props)
    teacher_db_id = teacher_db["id"]
    print(f"✅ 교사/반 관리 DB 생성 완료: {teacher_db_id}")

    # 2️⃣ 원아 마스터 DB
    print("\n2️⃣ 원아 마스터 DB 생성 중...")
    child_props = {
        "아동명": {"title": {}},
        "생년월일/연령": {"rich_text": {}},
        "성향 및 특이사항": {"rich_text": {}},
        "알레르기/주의사항": {"rich_text": {}}
    }
    child_db = create_notion_db(token, parent_page_id, "🧸 [daycare] 2. 원아 마스터 DB", child_props)
    child_db_id = child_db["id"]
    print(f"✅ 원아 마스터 DB 생성 완료: {child_db_id}")

    # 3️⃣ 일지 & 알림장 메인 DB
    print("\n3️⃣ 일지 & 알림장 메인 DB 생성 중...")
    daily_props = {
        "기록명/식별자": {"title": {}},
        "작성일자": {"date": {}},
        "활동 구분": {
            "select": {
                "options": [
                    {"name": "자유놀이", "color": "blue"},
                    {"name": "식습관/점심", "color": "orange"},
                    {"name": "낮잠/배변", "color": "purple"},
                    {"name": "실외활동", "color": "green"},
                    {"name": "미술/감각", "color": "pink"},
                    {"name": "하루통합", "color": "default"}
                ]
            }
        },
        "표준보육 영역": {
            "multi_select": {
                "options": [
                    {"name": "기본생활", "color": "gray"},
                    {"name": "신체운동·건강", "color": "red"},
                    {"name": "의사소통", "color": "blue"},
                    {"name": "사회관계", "color": "green"},
                    {"name": "예술경험", "color": "purple"},
                    {"name": "자연탐구", "color": "yellow"}
                ]
            }
        },
        "원시 메모/키워드": {"rich_text": {}},
        "알림장 최종본": {"rich_text": {}},
        "관찰일지 최종본": {"rich_text": {}},
        "참조 출처 요약": {"rich_text": {}},
        "원아": {
            "relation": {
                "database_id": child_db_id,
                "single_property": {}
            }
        },
        "작성교사": {
            "relation": {
                "database_id": teacher_db_id,
                "single_property": {}
            }
        }
    }
    daily_db = create_notion_db(token, parent_page_id, "🧸 [daycare] 3. 일지 & 알림장 메인 DB", daily_props)
    daily_db_id = daily_db["id"]
    print(f"✅ 일지 & 알림장 메인 DB 생성 완료: {daily_db_id}")

    print("\n" + "=" * 60)
    print("🎉 3대 DB 생성이 성공적으로 완료되었습니다!")
    print("아래 설정을 .dev.vars 파일에 복사하여 붙여넣으세요:")
    print("=" * 60)
    print(f'NOTION_TEACHER_DB_ID="{teacher_db_id}"')
    print(f'NOTION_CHILD_DB_ID="{child_db_id}"')
    print(f'NOTION_DAILY_LOG_DB_ID="{daily_db_id}"')
    print("=" * 60)

if __name__ == "__main__":
    main()
