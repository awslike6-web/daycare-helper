#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
JavaScript 파일들의 괄호 및 템플릿 리터럴 구문 정밀 검사
"""
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

def check_file(filename):
    print(f"\n🔍 Checking {filename}...")
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()

    lines = content.split('\n')
    print(f"Total lines: {len(lines)}")

    # 괄호 스택 검사
    stack = []
    pairs = {')': '(', '}': '{', ']': '['}
    in_single_quote = False
    in_double_quote = False
    in_template = False
    in_line_comment = False
    in_block_comment = False
    escape = False

    i = 0
    line_no = 1
    col_no = 1

    errors = []

    while i < len(content):
        ch = content[i]
        nxt = content[i+1] if i + 1 < len(content) else ''

        if ch == '\n':
            line_no += 1
            col_no = 1
            in_line_comment = False
            i += 1
            continue

        if in_line_comment:
            i += 1
            col_no += 1
            continue

        if in_block_comment:
            if ch == '*' and nxt == '/':
                in_block_comment = False
                i += 2
                col_no += 2
                continue
            i += 1
            col_no += 1
            continue

        if escape:
            escape = False
            i += 1
            col_no += 1
            continue

        if ch == '\\':
            escape = True
            i += 1
            col_no += 1
            continue

        if in_single_quote:
            if ch == "'":
                in_single_quote = False
            i += 1
            col_no += 1
            continue

        if in_double_quote:
            if ch == '"':
                in_double_quote = False
            i += 1
            col_no += 1
            continue

        if in_template:
            if ch == '`':
                in_template = False
            elif ch == '$' and nxt == '{':
                stack.append(('${', line_no, col_no))
                i += 2
                col_no += 2
                continue
            i += 1
            col_no += 1
            continue

        # Comments
        if ch == '/' and nxt == '/':
            in_line_comment = True
            i += 2
            col_no += 2
            continue

        if ch == '/' and nxt == '*':
            in_block_comment = True
            i += 2
            col_no += 2
            continue

        # Strings
        if ch == "'":
            in_single_quote = True
            i += 1
            col_no += 1
            continue
        if ch == '"':
            in_double_quote = True
            i += 1
            col_no += 1
            continue
        if ch == '`':
            in_template = True
            i += 1
            col_no += 1
            continue

        # Brackets
        if ch in '({[':
            stack.append((ch, line_no, col_no))
        elif ch in ')}]':
            if not stack:
                errors.append(f"Unexpected closing '{ch}' at line {line_no}:{col_no}")
            else:
                top, top_l, top_c = stack.pop()
                if top == '${' and ch == '}':
                    pass
                elif pairs.get(ch) != top:
                    errors.append(f"Mismatched bracket: expected match for '{top}' (from {top_l}:{top_c}) but found '{ch}' at {line_no}:{col_no}")

        i += 1
        col_no += 1

    if in_single_quote:
        errors.append("Unclosed single quote string")
    if in_double_quote:
        errors.append("Unclosed double quote string")
    if in_template:
        errors.append("Unclosed template literal")
    if in_block_comment:
        errors.append("Unclosed block comment")
    while stack:
        top, top_l, top_c = stack.pop()
        errors.append(f"Unclosed opening bracket '{top}' at line {top_l}:{top_c}")

    if errors:
        print(f"❌ Errors in {filename}:")
        for e in errors[:10]:
            print(f"  - {e}")
    else:
        print(f"✅ {filename} syntax brackets are clean!")

for f in ['public/app.js', 'public/gemini-client.js', 'worker.js', 'api/gemini.js', 'api/notion.js']:
    check_file(f)
