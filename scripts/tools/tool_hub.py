#!/usr/bin/env python3
"""HundunOS Tool Hub - List/Find tools"""
import json, sys, os, subprocess
from pathlib import Path

TOOLS_DIR = Path(__file__).parent

def list_tools():
    tools = []
    for f in TOOLS_DIR.glob("*.py"):
        tools.append({"name": f.stem, "path": str(f), "type": "python"})
    for f in TOOLS_DIR.glob("*.js"):
        tools.append({"name": f.stem, "path": str(f), "type": "javascript"})
    return tools

def main():
    action = "list"
    query = None
    if len(sys.argv) > 1:
        action = sys.argv[1]
    if len(sys.argv) > 2:
        query = sys.argv[2].lower()

    tools = list_tools()

    if action == "find" and query:
        tools = [t for t in tools if query in t["name"].lower()]

    if "--pretty" in sys.argv:
        print(f"HundunOS Tool Hub ({action})")
        print("=" * 50)
        for t in tools:
            print(f"  [{t['type']}] {t['name']}")
        print(f"\n  Total: {len(tools)}")
    else:
        print(json.dumps({"action": action, "query": query, "tools": tools, "count": len(tools)}, ensure_ascii=False, indent=2))
    sys.exit(0)

if __name__ == "__main__":
    main()
