#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys
import json
import urllib.request

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

url = 'https://api.github.com/repos/awslike6-web/daycare-helper/actions/runs'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
try:
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode('utf-8'))
        runs = data.get('workflow_runs', [])
        print(f"총 {len(runs)}건의 GitHub Actions 실행 이력 발견:")
        for r in runs[:5]:
            msg = r.get('head_commit', {}).get('message', '').split('\n')[0]
            print(f"- Run ID: {r['id']}")
            print(f"  Event: {r['event']}, Status: {r['status']}, Conclusion: {r['conclusion']}")
            print(f"  Commit: {r['head_sha'][:7]} - {msg}")
            print(f"  HTML URL: {r['html_url']}")
            print()
except Exception as e:
    print(f"Error checking actions: {e}")
