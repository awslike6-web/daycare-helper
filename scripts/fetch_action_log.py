#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys
import json
import urllib.request

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# job id 찾기
run_id = sys.argv[1] if len(sys.argv) > 1 else '35493465801'
url = f'https://api.github.com/repos/awslike6-web/daycare-helper/actions/runs/{run_id}/jobs'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
with urllib.request.urlopen(req) as resp:
    data = json.loads(resp.read().decode('utf-8'))
    jobs = data.get('jobs', [])
    if not jobs:
        print("No jobs found")
        sys.exit(1)
    job_id = jobs[0]['id']

# job log url
log_url = f'https://api.github.com/repos/awslike6-web/daycare-helper/actions/jobs/{job_id}/logs'
log_req = urllib.request.Request(log_url, headers={'User-Agent': 'Mozilla/5.0'})
try:
    with urllib.request.urlopen(log_req) as l_resp:
        lines = l_resp.read().decode('utf-8', errors='ignore').split('\n')
        for line in lines[-40:]:
            print(line)
except Exception as e:
    print(f"Error fetching log: {e}")
