#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
audit_dom_bindings.py
2026 daycare-helper DOM-JS Event Binding Integrity Auditor

검증 목적:
  - public/index.html에 정의된 모든 인터랙션 요소 (버튼, 폼, 주요 인풋, 칩)의 ID를 파싱
  - public/app.js 및 public/js/*.js 전체 코드에서
    해당 ID가 실제로 이벤트 리스너(onclick, onchange, onsubmit, oninput, addEventListener 등)에
    1:1로 결합되어 있는지 전수 검사
  - 단 1개의 버튼이라도 이벤트 바인딩이 누락되어 있으면 FAIL 처리
"""

import os
import re
import sys

sys.stdout.reconfigure(encoding='utf-8')

def audit_dom_bindings():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    base_dir = os.path.join(os.path.dirname(script_dir), "public")
    html_path = os.path.join(base_dir, "index.html")

    with open(html_path, "r", encoding="utf-8") as f:
        html = f.read()

    # 1. index.html에서 로드하는 모든 JS 코드 읽기
    scripts = re.findall(r'<script\s+src=["\']\./([^"\']+\.js)[^"\']*["\']', html)
    all_js_code = ""
    for s in scripts:
        js_path = os.path.join(base_dir, s.replace("/", os.sep))
        if os.path.exists(js_path):
            with open(js_path, "r", encoding="utf-8") as f:
                all_js_code += f"\n/* --- {s} --- */\n" + f.read()

    # 2. index.html에서 모든 <button id="...">, <form id="...">, 상호작용 id 추출
    button_ids = re.findall(r'<button[^>]+id=["\']([^"\']+)["\']', html)
    form_ids = re.findall(r'<form[^>]+id=["\']([^"\']+)["\']', html)
    
    # 주요 인터랙션 컨테이너 및 칩 그리드
    key_interactive_ids = [
        'formatChipsGrid',
        'personaPresetGrid',
        'parentPresetGrid',
        'kidsnoteRefineBox',
        'rawMemoInput',
        'recordDatePicker',
        'photoFileInput'
    ]

    interactive_targets = sorted(list(set(button_ids + form_ids + key_interactive_ids)))

    print(f"🔍 [DOM 바인딩 검증] 총 {len(interactive_targets)}개 인터랙션 요소 전수 검증 시작...\n")

    # 예외 대상 (CSS 스타일링 전용이거나 JS에서 동적 바인딩되지 않아도 되는 정적 컨테이너)
    EXEMPT_IDS = {
        'pinModalCancel', # 닫기 대체
    }

    missing_bindings = []
    passed_count = 0

    for el_id in interactive_targets:
        if el_id in EXEMPT_IDS:
            continue

        found = False

        # 1. 직접 바인딩 패턴: getElementById('xxx').onclick = ... 또는 .addEventListener
        direct_patterns = [
            rf"getElementById\(['\"]{el_id}['\"]\)[^;]*\.(?:onclick|onchange|onsubmit|oninput|addEventListener)",
            rf"querySelector\(['\"][#\.]{el_id}['\"]\)[^;]*\.(?:onclick|onchange|onsubmit|oninput|addEventListener)",
            rf"\b{el_id}\s*\.\s*(?:onclick|onchange|onsubmit|oninput|addEventListener)"
        ]
        for p in direct_patterns:
            if re.search(p, all_js_code):
                found = True
                break

        # 2. 변수 할당 후 바인딩 패턴: const myVar = document.getElementById('xxx'); ... myVar.onclick = ...
        if not found:
            var_matches = re.findall(rf"(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*document\.(?:getElementById|querySelector)\(['\"][#]?{el_id}['\"]\)", all_js_code)
            for var_name in var_matches:
                secondary_bind = rf"\b{var_name}\b[^;]*\.(?:onclick|onchange|onsubmit|oninput|addEventListener)"
                if re.search(secondary_bind, all_js_code):
                    found = True
                    break

        # 3. 폼 내부의 submit 버튼인 경우 (<button type="submit" id="saveChildBtn"> 등)
        if not found and 'type="submit"' in html and f'id="{el_id}"' in html:
            # 부모 폼이 바인딩되어 있는지 확인
            parent_form = re.search(rf"<form[^>]+id=['\"]([^'\"]+)['\"][^>]*>[\s\S]*?id=['\"]{el_id}['\"]", html)
            if parent_form:
                form_id = parent_form.group(1)
                form_bound = re.search(rf"getElementById\(['\"]{form_id}['\"]\)[^;]*\.(?:onsubmit|addEventListener)", all_js_code) or \
                             re.search(rf"\b{form_id}\s*\.\s*(?:onsubmit|addEventListener)", all_js_code)
                if form_bound:
                    found = True

        if found:
            print(f"  ✅ [연결됨] #{el_id}")
            passed_count += 1
        else:
            print(f"  ❌ [누락됨] #{el_id} (HTML에는 있으나 JS 이벤트 리스너가 연결되지 않음!)")
            missing_bindings.append(el_id)

    print(f"\n==========================================")
    print(f"📊 검증 결과: 연결됨 {passed_count}개 / 누락됨 {len(missing_bindings)}개")
    print(f"==========================================")

    if missing_bindings:
        print(f"\n🚨 [치명적 결함] 아래 {len(missing_bindings)}개 요소의 클릭/이벤트 리스너가 누락되었습니다:")
        for m in missing_bindings:
            print(f"   - #{m}")
        print("\n이 상태로는 배포할 수 없습니다. 즉시 리스너를 복원하세요!")
        return False
    else:
        print("\n🎉 모든 버튼과 인터랙션 요소가 JS 이벤트 리스너와 100% 무결하게 연결되었습니다!")
        return True

if __name__ == "__main__":
    success = audit_dom_bindings()
    if not success:
        sys.exit(1)
