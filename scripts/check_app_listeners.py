import re

with open('public/app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# addEventListener('click', identifier) 형태 추출
listeners = re.findall(r'addEventListener\([\'\"][a-zA-Z0-9_-]+[\'\"]\s*,\s*([a-zA-Z0-9_]+)\s*\)', content)

print('=== Checking Event Listener Handlers in app.js ===')
missing = []
for fn in sorted(set(listeners)):
    pat = r'(function\s+' + fn + r'\b|const\s+' + fn + r'\b|let\s+' + fn + r'\b|var\s+' + fn + r'\b|' + fn + r'\s*=\s*|window\.' + fn + r'\b)'
    if re.search(pat, content):
        print(f'  [OK] {fn}')
    else:
        # 다른 js 파일(notion-bridge.js 등)에 있는지 확인
        found_in_other = False
        for other in ['public/js/notion-bridge.js', 'public/js/children-store.js', 'public/js/history-viewer.js', 'public/js/auth-gate.js']:
            with open(other, 'r', encoding='utf-8') as of:
                if re.search(r'(function\s+' + fn + r'\b|window\.' + fn + r'\b)', of.read()):
                    found_in_other = other
                    break
        if found_in_other:
            print(f'  [EXTERNAL in {found_in_other}] {fn}')
        else:
            print(f'  [MISSING/UNDEFINED] {fn}')
            missing.append(fn)

print(f'\nTotal missing handlers: {len(missing)}')
if missing:
    print(f'Missing: {missing}')
