#!/usr/bin/env python3
# -*- coding: utf-8 -*-
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

payload = {
    'parent': {'database_id': CHILD_DB_ID},
    'properties': {
        '아동명': {'title': [{'text': {'content': '이민수'}}]},
        '생년월일/연령': {'rich_text': [{'text': {'content': '만 4세'}}]},
        '소속 반': {'select': {'name': '바다반'}},
        '성향 및 특이사항': {'rich_text': [{'text': {'content': '블록 조작 및 관찰력 우수, 친구들과 협동 놀이 몰입'}}]},
        '학부모 성향 & 알림장 스타일': {'rich_text': [{'text': {'content': '스피디 요약형 (바쁜 맞벌이 부모님, 퇴근 후 3줄 핵심 요약 선호)'}}]},
        '알레르기/주의사항': {'rich_text': [{'text': {'content': '땅콩 알레르기 주의'}}]}
    }
}

req = urllib.request.Request(f"{PROXY}/v1/pages", data=json.dumps(payload).encode('utf-8'), headers=HEADERS, method='POST')
with urllib.request.urlopen(req) as resp:
    res = json.loads(resp.read().decode('utf-8'))
    print(f"🎉 바다반 이민수 원아 등록 성공! (ID: {res.get('id')})")
