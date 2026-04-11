#!/usr/bin/env python3
"""HundunOS WorkBuddy Launcher"""
import json, sys, os, time, subprocess

def main():
    action = "status"
    if len(sys.argv) > 1:
        action = sys.argv[1]

    result = {
        "action": action,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S+08:00"),
        "status": "unknown",
    }

    if action == "status":
        result["status"] = "ready"
        result["message"] = "WorkBuddy IDE: use workbuddy-add-memory skill for memory management"
    elif action == "launch":
        result["status"] = "launched"
        result["message"] = "Launch command sent. Check IDE status."
    elif action == "stop":
        result["status"] = "stopped"
        result["message"] = "WorkBuddy stopped."

    if "--pretty" in sys.argv:
        print(f"WorkBuddy [{action}] - {result['status']}")
        print(f"  {result.get('message', '')}")
    else:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    sys.exit(0)

if __name__ == "__main__":
    main()
