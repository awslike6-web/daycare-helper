#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import os
import re
import glob
import sys

sys.stdout.reconfigure(encoding='utf-8')

def run_audit():
    base_dir = r"g:\master-tower\daycare-helper\public"
    html_path = os.path.join(base_dir, "index.html")
    
    with open(html_path, "r", encoding="utf-8") as f:
        html = f.read()

    # 1. HTML 내 모든 id 추출
    html_ids = set(re.findall(r'id=["\']([^"\']+)["\']', html))
    print(f"[*] Total DOM element IDs found in index.html: {len(html_ids)}")

    # 2. 로드되는 script 순서 추출
    scripts = re.findall(r'<script\s+src=["\']\./([^"\']+\.js)[^"\']*["\']', html)
    print(f"[*] Loaded scripts in index.html ({len(scripts)}):")
    for s in scripts:
        print(f"    - {s}")

    # 3. 모든 JS 파일에서 전역 함수 / window.xxx 할당 목록 수집
    global_functions = set()
    window_exports = set()
    
    for s in scripts:
        js_path = os.path.join(base_dir, s.replace("/", os.sep))
        if not os.path.exists(js_path):
            print(f"❌ Script NOT found: {s}")
            continue
        with open(js_path, "r", encoding="utf-8") as f:
            code = f.read()
        
        # 최상위 function foo(...) 추출
        top_funcs = re.findall(r'^(?:async\s+)?function\s+([a-zA-Z0-9_$]+)\s*\(', code, re.MULTILINE)
        global_functions.update(top_funcs)
        
        # window.foo = ... 추출
        win_assigns = re.findall(r'window\.([a-zA-Z0-9_$]+)\s*=', code)
        window_exports.update(win_assigns)

    all_globals = global_functions | window_exports
    print(f"\n[*] Total global/window identifiers found: {len(all_globals)}")

    # 4. 각 스크립트에서 직접 호출하는 함수 중 선언되지 않은 것 검사
    print("\n🔍 Checking for potentially undefined function calls...")
    # 브라우저 기본 내장 함수 목록
    builtins = {
        'alert', 'confirm', 'prompt', 'fetch', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
        'requestAnimationFrame', 'cancelAnimationFrame', 'parseInt', 'parseFloat', 'isNaN', 'isFinite',
        'encodeURIComponent', 'decodeURIComponent', 'encodeURI', 'decodeURI', 'btoa', 'atob',
        'addEventListener', 'removeEventListener', 'dispatchEvent', 'postMessage', 'scrollTo', 'scrollBy',
        'focus', 'blur', 'close', 'open', 'print', 'stop', 'getComputedStyle', 'matchMedia'
    }

    issues_found = 0
    for s in scripts:
        js_path = os.path.join(base_dir, s.replace("/", os.sep))
        with open(js_path, "r", encoding="utf-8") as f:
            code = f.read()

        # IIFE나 내부 함수 안에서 선언된 지역 함수들 추출
        local_funcs = set(re.findall(r'function\s+([a-zA-Z0-9_$]+)\s*\(', code))
        local_vars = set(re.findall(r'(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=', code))
        scope_known = local_funcs | local_vars | all_globals | builtins

        # foo(...) 형태의 호출 추출
        calls = re.findall(r'(?<![.\w$])([a-zA-Z0-9_$]+)\s*\(', code)
        for c in set(calls):
            # JS 키워드 제외
            if c in ('if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'typeof', 'delete', 'void', 'throw', 'new', 'import', 'async', 'await', 'case', 'super', 'with'):
                continue
            if c not in scope_known:
                print(f"  ❌ [{s}] Undeclared function called directly: '{c}()'")
                issues_found += 1

    if issues_found == 0:
        print("  ✅ No undeclared direct function calls found!")
    else:
        print(f"  ⚠️ Total undeclared calls found: {issues_found}")

if __name__ == "__main__":
    run_audit()
