#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
노션 DB 내 초기 예시/테스트 데이터 5건 안전 보관(삭제) 스크립트
"""
import sys
import json
import urllib.request

sys.stdout.reconfigure(encoding='utf-8')
PROXY = 'https://minmin-notion.awslike6.workers.dev'
HEADERS = {
    'Content-Type': 'application/json',
    'Notion-Version': '2022-06-28',
    'User-Agent': 'Mozilla/5.0'
}

TARGETS = [
    {"id": "3e0a2711-5b68-81e5-aeb9-ff68239787f5", "name": "[원아] 박지민 (햇살반)"},
    {"id": "3e0a2711-5b68-8175-ab67-d26011cc4af0", "name": "[원아] 이민수 (바다반)"},
    {"id": "3e0a2711-5b68-819e-a836-c748b0e27584", "name": "[교사] 김선생님 (햇살반)"},
    {"id": "3e0a2711-5b68-813e-aa4c-e4e90e676d2a", "name": "[교사] 이선생님 (바다반)"},
    {"id": "3e0a2711-5b68-81e7-80b8-c7a10d4c3a59", "name": "[일지] 제목없음"}
]

print("🗑️ 노션 예시 데이터 삭제(휴지통 이동) 시작...")
for t in TARGETS:
    url = f"{PROXY}/v1/pages/{t['id']}"
    payload = json.dumps({"archived": True}).encode('utf-8')
    req = urllib.request.Request(url, data=payload, headers=HEADERS, method='PATCH')
    try:
        with urllib.request.urlopen(req) as resp:
            if resp.status == 200:
                print(f"✅ 삭제 완료: {t['name']} (ID: {t['id']})")
            else:
                print(f"⚠️ 상태 코드 {resp.status}: {t['name']}")
    except Exception as e:
        print(f"❌ 삭제 실패: {t['name']} - {e}")

print("✨ 모든 예시 데이터 정리가 완료되었습니다.")
