import sys

def check_brackets(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    stack = []
    pairs = {')': '(', '}': '{', ']': '['}
    in_str = None
    in_line_comment = False
    in_block_comment = False
    i = 0
    line = 1
    col = 1
    while i < len(content):
        c = content[i]
        if c == '\n':
            line += 1
            col = 1
            in_line_comment = False
            i += 1
            continue
        col += 1
        if in_line_comment:
            i += 1
            continue
        if in_block_comment:
            if c == '*' and i + 1 < len(content) and content[i+1] == '/':
                in_block_comment = False
                i += 2
                col += 1
                continue
            i += 1
            continue
        if in_str:
            if c == '\\':
                i += 2
                col += 1
                continue
            if c == in_str:
                in_str = None
            i += 1
            continue
        if c == '/' and i + 1 < len(content):
            if content[i+1] == '/':
                in_line_comment = True
                i += 2
                col += 1
                continue
            elif content[i+1] == '*':
                in_block_comment = True
                i += 2
                col += 1
                continue
            # Regex literal check (if preceded by assignment, return, comma, paren, etc.)
            prev_content = content[:i].rstrip()
            if prev_content and prev_content[-1] in '(=,:[!&|?{};\n':
                # Possible regex literal! Scan until closing unescaped /
                j = i + 1
                while j < len(content) and content[j] != '\n':
                    if content[j] == '\\':
                        j += 2
                        continue
                    if content[j] == '/':
                        # End of regex literal!
                        col += (j - i + 1)
                        i = j + 1
                        break
                    j += 1
                else:
                    i += 1
                continue
        if c in ('"', "'", '`'):
            in_str = c
            i += 1
            continue
        if c in '({[':
            stack.append((c, line, col))
        elif c in ')}]':
            if not stack:
                print(f'{filepath}: Unmatched closing {c} at line {line}:{col}')
                return False
            top, l, cl = stack.pop()
            if pairs[c] != top:
                print(f'{filepath}: Mismatched {top} from line {l}:{cl} with {c} at line {line}:{col}')
                return False
        i += 1
    if stack:
        top, l, cl = stack.pop()
        print(f'{filepath}: Unclosed {top} from line {l}:{cl}')
        return False
    print(f'{filepath}: OK (Brackets matching clean)')
    return True

all_ok = True
for target in ['public/app.js', 'public/gemini-client.js', 'api/notion.js']:
    try:
        if not check_brackets(target):
            all_ok = False
    except Exception as e:
        print(f'{target}: Error {e}')
        all_ok = False

if all_ok:
    print('All JS files bracket integrity verified successfully!')
    sys.exit(0)
else:
    sys.exit(1)
