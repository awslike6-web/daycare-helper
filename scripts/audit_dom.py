import re

with open('public/app.js', 'r', encoding='utf-8') as f:
    app_js = f.read()

with open('public/index.html', 'r', encoding='utf-8') as f:
    index_html = f.read()

# 1. getElementById로 가져오는 모든 변수 매핑: varName -> elementId
id_map = dict(re.findall(r'const\s+([a-zA-Z0-9_]+)\s*=\s*document\.getElementById\([\'"]([^\'"]+)[\'"]\);', app_js))

# 2. app.js에서 varName.style 을 호출하는 모든 변수 찾기
style_vars = set(re.findall(r'\b([a-zA-Z0-9_]+)\.style\b', app_js))

missing = []
for var in style_vars:
    elem_id = id_map.get(var)
    if elem_id:
        # index.html에 id="elem_id" 가 있는지 확인
        if f'id="{elem_id}"' not in index_html and f"id='{elem_id}'" not in index_html:
            missing.append((var, elem_id))
    else:
        # id_map에 없는 변수(직접 getElementById를 안 거친 경우)
        if var not in ('e', 'target', 'item', 'btn', 'element', 'document', 'body', 'toastMessage'):
            missing.append((var, 'NOT_DECLARED_IN_ID_MAP'))

print('=== Missing or Null DOM elements with .style calls ===')
for var, eid in missing:
    print(f'  - Var: {var} -> Element ID: {eid}')
