from pathlib import Path
import subprocess
import sys
import re

def main():
    root = Path(__file__).resolve().parent.parent
    html = (root / 'public/index.html').read_text(encoding='utf-8')
    scripts = re.findall(r'<script\s+src=["\']\./([^"\']+\.js)[^"\']*["\']', html)
    failed = False
    for relative in scripts:
        path = root / 'public' / relative
        lines = len(path.read_text(encoding='utf-8').splitlines())
        result = subprocess.run(['node', '--check', str(path)], capture_output=True, text=True, encoding='utf-8')
        passed = result.returncode == 0 and lines < 800
        print(f"{'통과' if passed else '실패'}: {relative} · {lines}줄 · 실제 JavaScript 파서")
        if not passed:
            failed = True
            print(result.stderr)
    sys.exit(1 if failed else 0)

if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    main()
