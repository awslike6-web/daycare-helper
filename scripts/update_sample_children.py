#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
🧸 기존 샘플 원아에 소속 반 및 학부모 성향 데이터 채우기
- 김민서: 햇살반 (아내 반), 학부모 성향: 안심 서술형 (식사량, 낮잠, 작은 상처, 정서 안정 세심 안내 선호)
- 이민수: 바다반 (처형 반), 학부모 성향: 스피디 요약형 (바쁜 맞벌이 부모님, 퇴근 후 3줄 핵심 요약 선호)
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
    'User-Agent': 'Mozilla/5.0'
}
CHILD_DB_ID = '3e0a2711-5b68-8182-955e-f116e4174e3a'

req = urllib.request.Request(f"{PROXY}/v1/databases/{CHILD_DB_ID}/query", data=json.dumps({"page_size": 100}).encode('utf-8'), headers=HEADERS, method='POST')
with urllib.request.urlopen(req) as resp:
    data = json.loads(resp.read().decode('utf-8'))

for page in data.get('results', []):
    pid = page['id']
    name_objs = page['properties'].get('아동명', {}).get('title', [])
    name = name_objs[0].get('plain_text', '') if name_objs else '무명'

    if '민서' in name:
        props = {
            "소속 반": {"select": {"name": "햇살반"}},
            "학부모 성향 & 알림장 스타일": {"rich_text": [{"text": {"content": "안심 서술형 (식사량, 낮잠, 작은 상처, 정서적 안정감 세심 안내 선호)"}}]}
        }
    elif '민수' in name:
        props = {
            "소속 반": {"select": {"name": "바다반"}},
            "학부모 성향 & 알림장 스타일": {"rich_text": [{"text": {"content": "스피디 요약형 (바쁜 맞벌이 부모님, 퇴근 후 3줄 핵심 요약 선호)"}}]}
        }
    else:
        props = {
            "소속 반": {"select": {"name": "햇살반"}},
            "학부모 성향 & 알림장 스타일": {"rich_text": [{"text": {"content": "인성·교우관계형 (친구 배려 및 사회성 일화 중심 선호)"}}]}
        }

    patch_req = urllib.request.Request(f"{PROXY}/v1/pages/{pid}", data=json.dumps({"properties": props}).encode('utf-8'), headers=HEADERS, method='PATCH')
    with urllib.request.urlopen(patch_req) as p_resp:
        print(f"✅ 원아 [{name}] 데이터 업데이트 완료 (반: {props['소속 반']['select']['name']}, 학부모 성향 설정됨)")

print("모든 기존 원아 샘플 데이터 최신화 완료!")
