#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
🧸 daycare-helper Notion Schema Upgrade Script
노션 3대 Database 스키마 확장 및 교사 프로필 레코드 등록
- CHILD_DB: '학부모 성향 & 알림장 스타일' (rich_text), '소속 반' (select)
- TEACHER_DB: '평소 알림장 예시문' (rich_text), '원아 호칭' (rich_text)
- 아내(김선생님 - 햇살반), 처형(이선생님 - 바다반) 초기 프로필 등록
"""

import sys
import json
import urllib.request

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

PROXY = 'https://minmin-notion.awslike6.workers.dev'
HEADERS = {
    'Content-Type': 'application/json',
    'Notion-Version': '2022-06-28',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
}

TEACHER_DB_ID = '3e0a2711-5b68-8186-ad30-cbaea7687006'
CHILD_DB_ID   = '3e0a2711-5b68-8182-955e-f116e4174e3a'
DAILY_LOG_DB_ID = '3e0a2711-5b68-8122-9eea-dd49bf8a625c'

def notion_request(endpoint, method='GET', payload=None):
    url = f"{PROXY}/v1{endpoint}"
    data = json.dumps(payload).encode('utf-8') if payload else None
    req = urllib.request.Request(url, data=data, headers=HEADERS, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode('utf-8')
        print(f"❌ Notion API Error [{e.code}] {endpoint}: {err_msg}")
        return None

def update_database_properties(db_id, new_props, db_name):
    print(f"\n🔄 [{db_name}] 스키마 확장 중...")
    payload = {"properties": new_props}
    res = notion_request(f"/databases/{db_id}", method='PATCH', payload=payload)
    if res:
        print(f"✅ [{db_name}] 프로퍼티 확장 완료:")
        for k in new_props.keys():
            print(f"   - '{k}'")
    return res

def query_database(db_id):
    res = notion_request(f"/databases/{db_id}/query", method='POST', payload={"page_size": 100})
    return res.get('results', []) if res else []

def ensure_teacher_records():
    print(f"\n👩‍🏫 교사 프로필 레코드 등록 및 확인...")
    existing = query_database(TEACHER_DB_ID)
    existing_names = []
    for page in existing:
        props = page.get('properties', {})
        t_title = props.get('교사명', {}).get('title', [])
        if t_title:
            existing_names.append(t_title[0].get('plain_text', ''))

    print(f"현재 등록된 교사 레코드: {existing_names}")

    teachers_to_add = [
        {
            "교사명": "김선생님",
            "담당반": "햇살반",
            "문체 프리셋": "놀이 중심 다정체",
            "원아 호칭": "우리 [아동A]",
            "단골 맺음말": "가정에서도 편안하고 따뜻한 저녁 되세요^^",
            "평소 알림장 예시문": "오늘 우리 민서는 블록 영역에서 친구들과 커다란 동물원 울타리를 만들며 신나게 놀이했답니다. 기린 인형을 울타리 안에 넣고 나뭇잎 먹이를 주는 흉내를 내며 활짝 웃는 모습이 참 사랑스러웠어요. 쌓던 블록이 와르르 쓰러져도 속상해하지 않고 씩씩하게 다시 세우는 모습에서 기특한 성장을 느꼈답니다. 가정에서도 오늘 즐거웠던 동물원 놀이에 대해 많은 칭찬 부탁드립니다.^^"
        },
        {
            "교사명": "이선생님",
            "담당반": "바다반",
            "문체 프리셋": "발달 관찰 서술체",
            "원아 호칭": "[아동A]",
            "단골 맺음말": "가정에서도 오늘의 성취에 대해 따뜻한 격려 부탁드립니다.",
            "평소 알림장 예시문": "오늘 민서는 오전 자유놀이 시간에 조작 영역에 스스로 다가가 블록 놀이에 깊이 몰입하였습니다. 이전보다 손가락 힘과 양손 협응력이 향상되어 10단 이상의 탑을 안정적으로 쌓았으며, 블록이 흔들릴 때 조심스럽게 받쳐 균형을 유지하는 문제해결력을 보였습니다. 또래 친구에게 블록을 나누어주며 긍정적인 사회적 상호작용을 나누는 모습이 무척 인상 깊었습니다. 가정에서도 오늘의 성취에 대해 따뜻한 격려 부탁드립니다."
        }
    ]

    for t in teachers_to_add:
        if t["교사명"] in existing_names:
            print(f"ℹ️ '{t['교사명']}' 프로필 이미 존재함 (건너뜀)")
            continue

        page_payload = {
            "parent": {"database_id": TEACHER_DB_ID},
            "properties": {
                "교사명": {"title": [{"text": {"content": t["교사명"]}}]},
                "담당반": {"select": {"name": t["담당반"]}},
                "문체 프리셋": {"select": {"name": t["문체 프리셋"]}},
                "기본 마무리 멘트": {"rich_text": [{"text": {"content": t["단골 맺음말"]}}]},
                "원아 호칭": {"rich_text": [{"text": {"content": t["원아 호칭"]}}]},
                "평소 알림장 예시문": {"rich_text": [{"text": {"content": t["평소 알림장 예시문"]}}]}
            }
        }
        res = notion_request("/pages", method='POST', payload=page_payload)
        if res:
            print(f"🎉 '{t['교사명']}' ({t['담당반']}) 프로필 레코드 신규 등록 완료! (ID: {res.get('id')})")

def main():
    print("==================================================")
    print("🧸 daycare-helper Notion DB 스키마 확장 & 초기화")
    print("==================================================")

    # 1. CHILD_DB 스키마 확장
    child_props = {
        "학부모 성향 & 알림장 스타일": {"rich_text": {}},
        "소속 반": {
            "select": {
                "options": [
                    {"name": "햇살반", "color": "orange"},
                    {"name": "바다반", "color": "blue"},
                    {"name": "달님반", "color": "yellow"},
                    {"name": "별님반", "color": "purple"}
                ]
            }
        }
    }
    update_database_properties(CHILD_DB_ID, child_props, "CHILD_DB")

    # 2. TEACHER_DB 스키마 확장
    teacher_props = {
        "평소 알림장 예시문": {"rich_text": {}},
        "원아 호칭": {"rich_text": {}}
    }
    update_database_properties(TEACHER_DB_ID, teacher_props, "TEACHER_DB")

    # 3. 교사 레코드 등록
    ensure_teacher_records()

    print("\n✅ 전체 스키마 확장 및 초기 데이터 연동이 성공적으로 완료되었습니다!")

if __name__ == '__main__':
    main()
