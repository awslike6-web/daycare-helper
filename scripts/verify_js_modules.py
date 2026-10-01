#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys
import glob
import os

sys.stdout.reconfigure(encoding='utf-8')

def check_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    # JS tokenizer state
    stack = []
    i = 0
    n = len(content)
    line = 1
    col = 1

    while i < n:
        c = content[i]
        if c == '\n':
            line += 1
            col = 1
            i += 1
            continue

        # Line comment
        if c == '/' and i + 1 < n and content[i+1] == '/':
            while i < n and content[i] != '\n':
                i += 1
            continue

        # Block comment
        if c == '/' and i + 1 < n and content[i+1] == '*':
            i += 2
            while i + 1 < n and not (content[i] == '*' and content[i+1] == '/'):
                if content[i] == '\n':
                    line += 1
                    col = 1
                i += 1
            i += 2
            continue

        # Regex literal: /pattern/flags (simple check if preceding char suggests regex)
        if c == '/' and i + 1 < n and content[i+1] not in ('/', '*', '='):
            prev_idx = i - 1
            while prev_idx >= 0 and content[prev_idx] in (' ', '\t', '\n', '\r'):
                prev_idx -= 1
            prev_char = content[prev_idx] if prev_idx >= 0 else ''
            if prev_char in ('(', '=', ',', ':', '[', '!', '&', '|', '?', ';', '{', '}'):
                i += 1
                in_class = False
                while i < n:
                    if content[i] == '\\':
                        i += 2
                        continue
                    if content[i] == '[':
                        in_class = True
                    elif content[i] == ']':
                        in_class = False
                    elif content[i] == '/' and not in_class:
                        i += 1
                        while i < n and content[i].isalpha():
                            i += 1
                        break
                    if content[i] == '\n':
                        break
                    i += 1
                continue

        # String single / double quote
        if c in ("'", '"'):
            q = c
            i += 1
            while i < n:
                if content[i] == '\\':
                    i += 2
                    continue
                if content[i] == q:
                    i += 1
                    break
                if content[i] == '\n':
                    line += 1
                    col = 1
                i += 1
            continue

        # Template literal
        if c == '`':
            i += 1
            depth = 0
            while i < n:
                if content[i] == '\\':
                    i += 2
                    continue
                if content[i] == '`' and depth == 0:
                    i += 1
                    break
                if content[i] == '$' and i + 1 < n and content[i+1] == '{':
                    # nested template expression
                    depth += 1
                    i += 2
                    continue
                if content[i] == '}' and depth > 0:
                    depth -= 1
                    i += 1
                    continue
                if content[i] == '\n':
                    line += 1
                    col = 1
                i += 1
            continue

        # Brackets
        if c in ('(', '{', '['):
            stack.append((c, line, col))
        elif c in (')', '}', ']'):
            match = {')': '(', '}': '{', ']': '['}
            if not stack:
                print(f"❌ [{os.path.basename(path)}] Mismatched closing '{c}' at line {line}:{col}")
                return False
            top, tl, tc = stack.pop()
            if top != match[c]:
                print(f"❌ [{os.path.basename(path)}] Mismatched '{c}' at line {line}:{col}, expected matching for '{top}' (opened at {tl}:{tc})")
                return False

        i += 1
        col += 1

    if stack:
        top, tl, tc = stack[-1]
        print(f"❌ [{os.path.basename(path)}] Unclosed bracket '{top}' at line {tl}:{tc}")
        return False

    print(f"✅ [{os.path.basename(path)}] Valid (line count: {line})")
    return True

if __name__ == '__main__':
    target_files = sorted(glob.glob('public/js/*.js') + ['public/app.js', 'worker.js'])
    failed = []
    print(f"🔍 Validating {len(target_files)} JavaScript files in daycare-helper...")
    for f in target_files:
        if not check_file(f):
            failed.append(f)

    if failed:
        print(f"\n❌ FAILED files ({len(failed)}): {failed}")
        sys.exit(1)
    else:
        print("\n🎉 ALL 14 JavaScript files passed syntax integrity check successfully!")
