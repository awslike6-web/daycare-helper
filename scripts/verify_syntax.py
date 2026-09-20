#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys
import re

sys.stdout.reconfigure(encoding='utf-8')

def check_js_syntax(path):
    with open(path, encoding='utf-8') as f:
        code = f.read()

    # 문자열 및 주석 제거 상태에서 괄호 검사
    # 1. 블록 주석
    stripped = re.sub(r'/\*[\s\S]*?\*/', '', code)
    # 2. 한 줄 주석
    stripped = re.sub(r'//.*', '', stripped)
    # 3. 템플릿 리터럴 `...`
    stripped = re.sub(r'`[\s\S]*?`', '""', stripped)
    # 4. 큰따옴표 문자열
    stripped = re.sub(r'"(?:[^"\\]|\\.)*"', '""', stripped)
    # 5. 작은따옴표 문자열
    stripped = re.sub(r"'(?:[^'\\]|\\.)*'", "''", stripped)

    c = stripped.count('{') - stripped.count('}')
    p = stripped.count('(') - stripped.count(')')
    b = stripped.count('[') - stripped.count(']')
    print(f"[{path}] Code Tokens -> curlies: {c}, parens: {p}, brackets: {b}")
    return c == 0 and p == 0 and b == 0

files = ['public/app.js', 'public/gemini-client.js', 'worker.js']
all_pass = True
for f in files:
    if not check_js_syntax(f):
        all_pass = False

if all_pass:
    print("🎉 ALL PASS: All JS files have 100% valid bracket/parenthesis matching!")
else:
    print("❌ FAILED: Some JS files have syntax mismatch!")
