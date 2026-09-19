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

req = urllib.request.Request(f"{PROXY}/v1/databases/{DAILY_LOG_DB_ID}", headers=HEADERS)
try:
    with urllib.request.urlopen(req) as resp:
        db = json.loads(resp.read().decode('utf-8'))
        print(f"=== DAILY_LOG_DB Schema ===")
        props = db.get('properties', {})
        for name, info in props.items():
            print(f"- {name} ({info.get('type')})")
except Exception as e:
    print(f"Error: {e}")
