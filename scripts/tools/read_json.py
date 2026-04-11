#!/usr/bin/env python3
"""HundunOS Read JSON/TXT File"""
import json, sys, os
from pathlib import Path

def main():
    if len(sys.argv) < 2 or sys.argv[1] == "--help":
        print("Usage: python read_json.py --path <file>")
        sys.exit(1)

    path = None
    for i in range(1, len(sys.argv)):
        if sys.argv[i] == "--path" and i+1 < len(sys.argv):
            path = sys.argv[i+1]
            break

    if not path:
        print(json.dumps({"success": False, "error": "No path provided"}))
        sys.exit(1)

    p = Path(path).expanduser().resolve()
    if not p.exists():
        print(json.dumps({"success": False, "error": f"File not found: {path}"}))
        sys.exit(1)

    try:
        with open(p, encoding='utf-8') as f:
            content = f.read()

        if p.suffix in ('.json',):
            try:
                data = json.loads(content)
                print(json.dumps({"success": True, "data": data, "path": str(p)}, ensure_ascii=False, indent=2))
            except json.JSONDecodeError as e:
                print(json.dumps({"success": False, "error": f"Invalid JSON: {e}"}))
                sys.exit(1)
        else:
            print(json.dumps({"success": True, "content": content, "path": str(p), "type": "text"}, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
