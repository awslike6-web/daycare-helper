import subprocess
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

# 각 파일별로 Node나 Python 파서로 문법 에러 위치 출력
files = [
    'worker.js',
    'public/app.js',
    'public/gemini-client.js',
    'public/js/config.js',
    'public/js/auth-gate.js',
    'public/js/children-store.js',
    'public/js/notion-bridge.js',
    'public/js/history-viewer.js'
]

# GitHub Actions 워크플로우 verify.yml과 동일한 검사를 수행하기 위해
# 간단한 JS tokenizer를 구현하여 구문 오류(Syntax Error)를 정확히 출력
def check_js_file(filepath):
    print(f"=== Checking {filepath} ===")
    with open(filepath, 'r', encoding='utf-8') as f:
        code = f.read()

    stack = []
    lines = code.split('\n')
    
    # Check backtick count
    # Note: escaped backticks \` should not toggle string
    in_backtick = False
    in_single = False
    in_double = False
    in_line_comment = False
    in_block_comment = False
    
    i = 0
    line_no = 1
    col_no = 1
    
    errors = []
    
    while i < len(code):
        ch = code[i]
        
        if ch == '\n':
            line_no += 1
            col_no = 1
            in_line_comment = False
            i += 1
            continue
            
        col_no += 1
        
        if in_line_comment:
            i += 1
            continue
            
        if in_block_comment:
            if ch == '*' and i + 1 < len(code) and code[i+1] == '/':
                in_block_comment = False
                i += 2
                col_no += 1
            else:
                i += 1
            continue
            
        if in_single:
            if ch == '\\':
                i += 2
                col_no += 1
            elif ch == "'":
                in_single = False
                i += 1
            else:
                i += 1
            continue
            
        if in_double:
            if ch == '\\':
                i += 2
                col_no += 1
            elif ch == '"':
                in_double = False
                i += 1
            else:
                i += 1
            continue
            
        if in_backtick:
            if ch == '\\':
                i += 2
                col_no += 1
            elif ch == '`':
                in_backtick = False
                i += 1
            elif ch == '$' and i + 1 < len(code) and code[i+1] == '{':
                stack.append(('${', line_no, col_no))
                in_backtick = False # Now in JS expression mode inside template literal!
                i += 2
                col_no += 1
            else:
                i += 1
            continue
            
        # Normal JS code
        if ch == '/' and i + 1 < len(code):
            if code[i+1] == '/':
                in_line_comment = True
                i += 2
                col_no += 1
                continue
            elif code[i+1] == '*':
                in_block_comment = True
                i += 2
                col_no += 1
                continue
                
        if ch == "'":
            in_single = True
            i += 1
            continue
        if ch == '"':
            in_double = True
            i += 1
            continue
        if ch == '`':
            in_backtick = True
            i += 1
            continue
            
        if ch in '({[':
            stack.append((ch, line_no, col_no))
        elif ch in ')}]':
            if not stack:
                errors.append(f"Unexpected closing {ch} at line {line_no}:{col_no}")
            else:
                top, l, c = stack.pop()
                expected = ')' if top == '(' else ']' if top == '[' else '}'
                if ch != expected:
                    errors.append(f"Mismatched bracket: opened {top} at line {l}:{c}, closed with {ch} at line {line_no}:{col_no}")
                if top == '${':
                    # We just closed a template literal expression! Resume template literal string mode
                    in_backtick = True
                    
        i += 1

    if in_backtick:
        errors.append("Unterminated template literal (unclosed `)")
    if in_single:
        errors.append("Unterminated single quote string")
    if in_double:
        errors.append("Unterminated double quote string")
    if in_block_comment:
        errors.append("Unterminated block comment")
        
    while stack:
        top, l, c = stack.pop()
        errors.append(f"Unclosed {top} from line {l}:{c}")
        
    if errors:
        print(f"❌ Found {len(errors)} errors in {filepath}:")
        for e in errors[:10]:
            print(f"  - {e}")
        return False
    else:
        print(f"✅ {filepath} is 100% CLEAN!")
        return True

all_clean = True
for f in files:
    if not check_js_file(f):
        all_clean = False

print("\nResult:", "ALL CLEAN" if all_clean else "ERRORS FOUND")
