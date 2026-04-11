import subprocess
import json
import sys
    ("Schema Search file", {"action": "Schema", "query": {"type": "Search", "keyword": "file"}}}),
exe = r"C:\Users\Lin\.qclaw\workspace\hundunos-rust\tool-bridge\target\release\hundunos-tool.exe"

    ("Shortcuts system", {"action": "Shortcuts", "category": "system"}),
    proc = subprocess.run(
        [exe],
        input=json.dumps(req) + "\n",
        capture_output=True,
        text=True,
        timeout=5,
        encoding="utf-8",
        errors="replace"
    )
    raw = proc.stdout.strip()
    lines = raw.split('\n')
    json_lines = []
    for line in lines:
        stripped = line.strip()
        if stripped and not stripped.startswith('[') and not stripped.startswith('\x1b'):
            json_lines.append(line)
    json_text = '\n'.join(json_lines)
    if json_text:
        return json.loads(json_text)
    return {"error": proc.stderr or "no json output", "raw": raw[:200]}

tests = [
    ("Dry Run health", {"action": "Execute", "request": {"command": "+health", "dry_run": True}}),
    ("Schema Tree", {"action": "Schema", "query": {"type": "Tree"}}),
    ("Schema Search file", {"action": "Schema", "query": {"type": "Search", "keyword": "file"}}}),
    ("Resolve +ls", {"action": "Resolve", "command": "+ls"}),
    ("Resolve clear side effects", {"action": "Resolve", "command": "+clear"}),
    ("Shortcuts system", {"action": "Shortcuts", "category": "system"}}),
    ("Dry Run clear", {"action": "Execute", "request": {"command": "+clear", "dry_run": True}}),
    ("Real exec health", {"action": "Execute", "request": {"command": "+health", "dry_run": False}}),
    ("Get Stats", {"action": "GetStats"}),
]

all_pass = True
for name, req in tests:
    print("\n" + "="*60)
    print("TEST: " + name)
    try:
        resp = send(req)
        ok = resp.get('success', False)
        if not ok:
            all_pass = False
        print("  success: " + str(ok))
        d = resp.get('data') or {}
        if isinstance(d, dict):
            if 'layer' in d: print("  layer: " + str(d['layer']))
            if 'expanded_command' in d: print("  expanded: " + str(d['expanded_command']))
            if d.get('side_effects_warning'): print("  warning: " + str(d['side_effects_warning']))
            if d.get('stdout'): print("  stdout: " + d['stdout'][:200])
            if 'truncated' in d: print("  truncated: " + str(d['truncated']))
            if 'duration_ms' in d: print("  duration_ms: " + str(d['duration_ms']))
        if resp.get('error') and not ok:
            print("  ERROR: " + str(resp['error']))
    except Exception as e:
        print("  EXCEPTION: " + str(e))
        all_pass = False

print("\n" + "="*60)
print("RESULT: " + ("ALL PASS" if all_pass else "SOME FAILED"))
