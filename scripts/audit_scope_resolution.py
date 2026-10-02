#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import os
import re
import sys

sys.stdout.reconfigure(encoding='utf-8')

base_dir = r"g:\master-tower\daycare-helper\public"

# 1. index.html에서 로드하는 스크립트 순서
with open(os.path.join(base_dir, "index.html"), "r", encoding="utf-8") as f:
    html = f.read()

scripts = re.findall(r'<script\s+src=["\']\./([^"\']+\.js)[^"\']*["\']', html)
print(f"Loaded {len(scripts)} scripts in order:")

# 2. 브라우저 및 언어 내장 표준 식별자
STANDARD_BUILTINS = {
    'window', 'document', 'navigator', 'localStorage', 'sessionStorage', 'console',
    'location', 'history', 'screen', 'performance', 'fetch', 'setTimeout', 'clearTimeout',
    'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame',
    'alert', 'confirm', 'prompt', 'print', 'focus', 'blur', 'close', 'open',
    'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURIComponent', 'decodeURIComponent',
    'encodeURI', 'decodeURI', 'btoa', 'atob', 'addEventListener', 'removeEventListener',
    'dispatchEvent', 'postMessage', 'getComputedStyle', 'matchMedia',
    'Object', 'Array', 'String', 'Number', 'Boolean', 'Date', 'RegExp', 'Math', 'JSON',
    'Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError',
    'Promise', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Symbol', 'Proxy', 'Reflect',
    'ArrayBuffer', 'Uint8Array', 'Int32Array', 'Float64Array', 'DataView',
    'Blob', 'File', 'FileReader', 'FormData', 'URL', 'URLSearchParams', 'Headers', 'Request', 'Response',
    'AbortController', 'AbortSignal', 'CustomEvent', 'Event', 'MutationObserver',
    'IntersectionObserver', 'ResizeObserver', 'ClipboardItem',
    'SpeechRecognition', 'webkitSpeechRecognition', 'SpeechSynthesisUtterance'
}

# 3. 전역으로 노출되는 식별자 수집 (window.xxx 및 최상위 함수/변수)
global_scope = set(STANDARD_BUILTINS)

file_contents = {}
for s in scripts:
    path = os.path.join(base_dir, s.replace("/", os.sep))
    with open(path, "r", encoding="utf-8") as f:
        code = f.read()
    file_contents[s] = code
    
    # window.xxx = ...
    win_props = re.findall(r'window\.([a-zA-Z0-9_$]+)\s*=', code)
    global_scope.update(win_props)
    
    # 최상위 var, function
    top_defs = re.findall(r'^(?:async\s+)?function\s+([a-zA-Z0-9_$]+)', code, re.MULTILINE)
    top_vars = re.findall(r'^(?:var|const|let)\s+([a-zA-Z0-9_$]+)', code, re.MULTILINE)
    global_scope.update(top_defs)
    global_scope.update(top_vars)

print(f"Collected {len(global_scope)} global identifiers.\n")

# 4. 각 파일에서 스코프 밖의 식별자(함수 호출, 변수 사용) 사용 검사
for s in scripts:
    code = file_contents[s]
    print(f"--- Checking [{s}] ---")
    
    # 주석 제거
    clean = re.sub(r'//.*', '', code)
    clean = re.sub(r'/\*[\s\S]*?\*/', '', clean)
    # 문자열 리터럴 제거
    clean = re.sub(r'`(?:\\.|[^`\\])*`', '""', clean)
    clean = re.sub(r'"(?:\\.|[^"\\])*"', '""', clean)
    clean = re.sub(r"'(?:\\.|[^'\\])*'", "''", clean)
    
    # 로컬 선언 수집 (함수 매개변수, let/const/var, function 선언)
    local_defs = set()
    local_defs.update(re.findall(r'(?:const|let|var)\s+([a-zA-Z0-9_$]+)', clean))
    local_defs.update(re.findall(r'function\s+([a-zA-Z0-9_$]+)', clean))
    local_defs.update(re.findall(r'catch\s*\(\s*([a-zA-Z0-9_$]+)\s*\)', clean))
    
    # 구조분해 할당: const { a, b } = ...
    destructured = re.findall(r'(?:const|let|var)\s*\{([^}]+)\}', clean)
    for d in destructured:
        parts = [p.strip().split(':')[0].strip() for p in d.split(',') if p.strip()]
        local_defs.update(parts)

    # 함수 매개변수
    param_matches = re.findall(r'function[^(]*\(([^)]*)\)', clean)
    for p in param_matches:
        for arg in p.split(','):
            arg = arg.strip().split('=')[0].strip()
            if arg and re.match(r'^[a-zA-Z0-9_$]+$', arg):
                local_defs.update([arg])

    arrow_params = re.findall(r'\(([^)]*)\)\s*=>', clean)
    for p in arrow_params:
        for arg in p.split(','):
            arg = arg.strip().split('=')[0].strip()
            if arg and re.match(r'^[a-zA-Z0-9_$]+$', arg):
                local_defs.update([arg])
                
    visible = global_scope | local_defs
    
    # 단독 호출 foo(...) 패턴 검사
    direct_calls = re.findall(r'(?<![.\w$])([a-zA-Z0-9_$]+)\s*\(', clean)
    keywords = {'if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'typeof', 'delete', 'void', 'throw', 'new', 'import', 'async', 'await', 'case', 'super', 'with'}
    
    bad_calls = set()
    for call in direct_calls:
        if call in keywords:
            continue
        if call not in visible:
            bad_calls.add(call)
            
    if bad_calls:
        print(f"  ❌ Undefined direct function calls: {bad_calls}")
    else:
        print(f"  ✅ All function calls resolved!")
