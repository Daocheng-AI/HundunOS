#!/usr/bin/env python3
"""HundunOS List Files - Directory listing tool"""
import json, sys, os, fnmatch
from pathlib import Path

def main():
    path = "."
    pattern = None
    recursive = False

    i = 1
    while i < len(sys.argv):
        if sys.argv[i] == "--path" and i+1 < len(sys.argv):
            path = sys.argv[i+1]; i += 2
        elif sys.argv[i] == "--pattern" and i+1 < len(sys.argv):
            pattern = sys.argv[i+1]; i += 2
        elif sys.argv[i] == "--recursive":
            recursive = True; i += 1
        else:
            i += 1

    target = Path(path).expanduser().resolve()
    if not target.exists():
        print(json.dumps({"success": False, "error": f"Path not found: {path}"}))
        sys.exit(1)

    files = []
    if recursive:
        for root, dirs, filenames in os.walk(target):
            dirs.sort()
            for fn in sorted(filenames):
                if pattern is None or fnmatch.fnmatch(fn, pattern):
                    rel = Path(root).relative_to(target)
                    files.append(str(rel / fn) if str(rel) != '.' else fn)
    else:
        for item in sorted(target.iterdir()):
            if pattern is None or fnmatch.fnmatch(item.name, pattern):
                t = "dir" if item.is_dir() else "file"
                files.append(f"[{t}] {item.name}")

    if "--pretty" in sys.argv:
        print(f"Files in {target}")
        print("=" * 50)
        for f in files:
            print(f"  {f}")
    else:
        print(json.dumps({"success": True, "path": str(target), "files": files, "count": len(files)}, ensure_ascii=False))
    sys.exit(0)

if __name__ == "__main__":
    main()
