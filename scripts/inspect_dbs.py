import sys
import json
import urllib.request

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

PROXY = 'https://minmin-notion.awslike6.workers.dev'
headers = {'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0'}

dbs = {
    '1. TEACHER_DB': '3e0a2711-5b68-8186-ad30-cbaea7687006',
    '2. CHILD_DB': '3e0a2711-5b68-8182-955e-f116e4174e3a',
    '3. DAILY_LOG_DB': '3e0a2711-5b68-8122-9eea-dd49bf8a625c'
}

for name, db_id in dbs.items():
    url = f"{PROXY}/v1/databases/{db_id}"
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode('utf-8'))
        print(f"=== {name} ===")
        title = ''.join([t.get('plain_text','') for t in data.get('title', [])])
        print(f"Title: {title}")
        for p_name, p_val in data.get('properties', {}).items():
            print(f"  - {p_name}: {p_val.get('type')}")
        print()
