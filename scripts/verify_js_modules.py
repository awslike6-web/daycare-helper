#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys
import glob
import os
import re

sys.stdout.reconfigure(encoding='utf-8')

def check_js_syntax_and_cohesion():
    base_dir = r"g:\master-tower\daycare-helper\public"
    html_path = os.path.join(base_dir, "index.html")
    
    with open(html_path, "r", encoding="utf-8") as f:
        html = f.read()

    scripts = re.findall(r'<script\s+src=["\']\./([^"\']+\.js)[^"\']*["\']', html)
    print(f"🔍 Validating {len(scripts)} active JavaScript core modules in daycare-helper...")

    all_passed = True
    for s in scripts:
        js_path = os.path.join(base_dir, s.replace("/", os.sep))
        with open(js_path, "r", encoding="utf-8") as f:
            lines = f.readlines()
        line_count = len(lines)
        
        # 괄호 매칭 검사
        content = "".join(lines)
        stack = []
        for ch in content:
            if ch in '({[':
                stack.append(ch)
            elif ch in ')}]':
                if not stack:
                    stack.append('mismatch')
                    break
                top = stack.pop()
                if (ch == ')' and top != '(') or (ch == '}' and top != '{') or (ch == ']' and top != '['):
                    stack.append('mismatch')
                    break

        syntax_ok = (len(stack) == 0)
        
        # 골디락스 헌법: 300~600줄 최적, 절대 상한 800줄 미만
        cohesion_ok = line_count < 800
        
        status_icon = "✅" if (syntax_ok and cohesion_ok) else "❌"
        print(f"{status_icon} [{s}] Lines: {line_count} | Syntax: {'OK' if syntax_ok else 'FAIL'} | Cohesion (<800): {'PASS' if cohesion_ok else 'OVER'}")
        
        if not (syntax_ok and cohesion_ok):
            all_passed = False

    if all_passed:
        print("\n🎉 ALL core JavaScript modules passed Goldilocks cohesion (<800 lines) & syntax integrity check successfully!")
    else:
        print("\n⚠️ Some checks failed!")
        sys.exit(1)

if __name__ == "__main__":
    check_js_syntax_and_cohesion()
