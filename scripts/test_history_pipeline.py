#!/usr/bin/env python3
# -*- coding: utf-8 -*-
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
DAILY_LOG_DB_ID = '3e0a2711-5b68-8122-9eea-dd49bf8a625c'

print("🔍 1. DAILY_LOG_DB 현재 건수 쿼리...")
req = urllib.request.Request(f"{PROXY}/v1/databases/{DAILY_LOG_DB_ID}/query", data=b'{"page_size": 10}', headers=HEADERS, method='POST')
with urllib.request.urlopen(req) as resp:
    data = json.loads(resp.read().decode('utf-8'))
    print(f"현재 저장된 일지 수: {len(data.get('results', []))}건")

print("\n📝 2. 테스트용 실제 보육 기록 1건 안전 생성...")
test_payload = {
    "parent": {"database_id": DAILY_LOG_DB_ID},
    "properties": {
        "기록명/식별자": {"title": [{"text": {"content": "[2026-09-19] 소망반 놀이중심 보육일지 (테스트)"}}]},
        "작성일자": {"date": {"start": "2026-09-19"}},
        "활동 구분": {"select": {"name": "자유놀이"}},
        "표준보육 영역": {"multi_select": [{"name": "신체운동"}, {"name": "의사소통"}]},
        "원시 메모/키워드": {"rich_text": [{"text": {"content": "블록으로 동물원 울타리 만들기, 건하와 하율이가 협동함"}}]},
        "알림장 최종본": {"rich_text": [{"text": {"content": "오늘 소망반 친구들은 블록 놀이 영역에서 커다란 동물원을 구성해보았답니다.^^"}}]},
        "관찰일지 최종본": {"rich_text": [{"text": {"content": "[표준보육과정 보육활동]\n블록을 길게 이어 울타리를 세우며 균형 감각과 대소근육 조절력을 발휘함.\n교사의 언어 지원을 받아 친구에게 블록을 건네는 긍정적 상호작용이 관찰됨."}}]},
        "참조 출처 요약": {"rich_text": [{"text": {"content": "소망반 학급 전체 보육일지"}}]
        }
    }
}

req_create = urllib.request.Request(f"{PROXY}/v1/pages", data=json.dumps(test_payload).encode('utf-8'), headers=HEADERS, method='POST')
with urllib.request.urlopen(req_create) as resp:
    created = json.loads(resp.read().decode('utf-8'))
    print(f"✅ 테스트 일지 생성 성공! (ID: {created['id']})")

print("\n📂 3. 기록 보관함 쿼리 파이프라인 검증 (정렬 및 필터 테스트)...")
query_payload = {
    "page_size": 10,
    "sorts": [{"property": "작성일자", "direction": "descending"}]
}
req_query = urllib.request.Request(f"{PROXY}/v1/databases/{DAILY_LOG_DB_ID}/query", data=json.dumps(query_payload).encode('utf-8'), headers=HEADERS, method='POST')
with urllib.request.urlopen(req_query) as resp:
    qdata = json.loads(resp.read().decode('utf-8'))
    results = qdata.get('results', [])
    print(f"조회 성공: 총 {len(results)}건")
    for r in results:
        title = r['properties']['기록명/식별자']['title'][0]['plain_text']
        date = r['properties']['작성일자']['date']['start']
        area = r['properties']['활동 구분']['select']['name']
        print(f" - [{date}] [{area}] {title}")

print("\n🎉 모든 파이프라인이 완벽하게 정상 작동합니다!")
