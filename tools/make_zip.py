#!/usr/bin/env python
"""
tools/make_zip.py
Builds the distributable ZIP: source + dist + demo + docs + tests, excluding node_modules,
build caches and generated test artefacts.

Pure stdlib (zipfile), so it works on a bare Windows box without the `zip` CLI.
Usage:  python tools/make_zip.py
"""
import os
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(os.path.dirname(ROOT), 'deliver4')
OUT = os.path.join(OUT_DIR, 'gridstack-studio.zip')

EXCLUDE_DIRS = {
    'node_modules', '.git', 'coverage', 'test-results', 'dist_save', '.angular',
    '.vscode', '.idea', '__pycache__', '.workbuddy',
}
EXCLUDE_REL = {
    'doc/html', 'angular/doc/html', 'react/doc/html', 'vue/doc/html',
}
EXCLUDE_SUFFIX = ('.log', '.tgz', '.DS_Store', '.pyc')
EXCLUDE_NAMES = {'verify-results.json'}


def keep(name, rel):
    if name in EXCLUDE_DIRS:
        return False
    if rel in EXCLUDE_REL:
        return False
    if name.endswith(EXCLUDE_SUFFIX) or name in EXCLUDE_NAMES:
        return False
    return True


def walk(root):
    out = []
    for dirpath, dirnames, filenames in os.walk(root):
        rel_dir = os.path.relpath(dirpath, root).replace('\\', '/')
        if rel_dir == '.':
            rel_dir = ''
        dirnames[:] = [d for d in dirnames if keep(d, f'{rel_dir}/{d}'.lstrip('/'))]
        for f in filenames:
            rel = f'{rel_dir}/{f}'.lstrip('/')
            if keep(f, rel):
                out.append(rel)
    return sorted(out)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    if os.path.exists(OUT):
        os.remove(OUT)

    files = walk(ROOT)
    print(f'{len(files)} files to archive')

    with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for rel in files:
            z.write(os.path.join(ROOT, rel), arcname=f'gridstack-studio/{rel}')

    size = os.path.getsize(OUT)
    print(f'wrote {OUT}')
    print(f'size {size / 1024 / 1024:.2f} MB')
    return 0


if __name__ == '__main__':
    sys.exit(main())
