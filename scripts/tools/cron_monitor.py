#!/usr/bin/env python3
"""HundunOS Cron Monitor - List registered cron jobs via OpenClaw CLI"""
import json, sys, subprocess, os

def main():
    result = {"timestamp": None, "jobs": [], "summary": {"total": 0, "active": 0, "paused": 0, "failed": 0}}

    # Try using openclaw CLI to get cron jobs
    try:
        proc = subprocess.run(
            ["openclaw", "cron", "list", "--json"],
            capture_output=True, timeout=10, text=True, encoding="utf-8", errors="replace"
        )
        if proc.returncode == 0 and proc.stdout.strip():
            data = json.loads(proc.stdout)
            result = data
    except FileNotFoundError:
        result["error"] = "openclaw CLI not found in PATH"
    except subprocess.TimeoutExpired:
        result["error"] = "Cron list timeout"
    except json.JSONDecodeError:
        result["error"] = "Failed to parse cron output"

    result["timestamp"] = __import__("time").strftime("%Y-%m-%dT%H:%M:%S+08:00")

    if "--pretty" in sys.argv:
        print("HundunOS Cron Monitor")
        print("=" * 50)
        if result.get("jobs"):
            for job in result["jobs"]:
                name = job.get("name", "unnamed")
                status = job.get("status", "unknown")
                schedule = job.get("schedule", "?")
                print(f"  [{status}] {name} - {schedule}")
        else:
            print("  No cron jobs registered")
        print(f"\nSummary: {result.get('summary', {}).get('total', 0)} total")
    else:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    sys.exit(0)

if __name__ == "__main__":
    main()
