#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys
import json
import urllib.request

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

run_id = '35433283038'
url = f'https://api.github.com/repos/awslike6-web/daycare-helper/actions/runs/{run_id}/jobs'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
try:
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode('utf-8'))
        for job in data.get('jobs', []):
            print(f"Job: {job['name']} | Conclusion: {job['conclusion']}")
            for step in job.get('steps', []):
                print(f"  Step: {step['name']} -> {step['conclusion']}")
except Exception as e:
    print(f"Error checking job: {e}")
