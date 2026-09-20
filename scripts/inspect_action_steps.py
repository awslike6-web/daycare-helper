import urllib.request
import json
import sys

run_id = sys.argv[1] if len(sys.argv) > 1 else '35495166397'
url = f'https://api.github.com/repos/awslike6-web/daycare-helper/actions/runs/{run_id}/jobs'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
try:
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode('utf-8'))
    for j in data.get('jobs', []):
        print(f"Job: {j['name']}, Status: {j['status']}, Conclusion: {j['conclusion']}")
        for s in j.get('steps', []):
            print(f"  Step: {s['name']} -> {s['conclusion']}")
except Exception as e:
    print(f"Error: {e}")
