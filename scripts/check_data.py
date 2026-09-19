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

CHILD_DB_ID = '3e0a2711-5b68-8182-955e-f116e4174e3a'
TEACHER_DB_ID = '3e0a2711-5b68-8186-ad30-cbaea7687006'
DAILY_LOG_DB_ID = '3e0a2711-5b68-8122-9eea-dd49bf8a625c'

def query_db(db_id, title_prop):
    req = urllib.request.Request(f"{PROXY}/v1/databases/{db_id}/query", data=b"{}", headers=HEADERS, method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            results = data.get('results', [])
            print(f"\n=== DB [{db_id}] (총 {len(results)}건) ===")
            for p in results:
                props = p.get('properties', {})
                title = props.get(title_prop, {}).get('title', [{}])[0].get('plain_text', '제목없음') if props.get(title_prop, {}).get('title') else '제목없음'
                cls = props.get('소속 반', {}).get('select', {}) or props.get('담당반', {}).get('select', {}) or {}
                cls_name = cls.get('name', '-')
                print(f" - [{cls_name}] {title} (ID: {p['id']})")
    except Exception as e:
        print(f"Error querying {db_id}: {e}")

print("🧸 노션 DB 데이터 현황 점검")
query_db(TEACHER_DB_ID, '교사명')
query_db(CHILD_DB_ID, '아동명')
query_db(DAILY_LOG_DB_ID, '기록 제목')
