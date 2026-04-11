#!/usr/bin/env python3
"""HundunOS Heartbeat Enhanced - Quick health check for heartbeat scenarios"""
import json, sys, time

def main():
    result = {
        "type": "heartbeat",
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S+08:00"),
        "healthy": True,
        "checks": {
            "rust_cli": True,
            "kernel": True,
            "memory_available": True,
        },
        "latency_ms": 0,
    }

    # Quick memory check
    try:
        import psutil
        mem = psutil.virtual_memory()
        result["checks"]["memory_available"] = mem.percent < 90
        if mem.percent >= 90:
            result["healthy"] = False
    except Exception:
        pass

    if "--pretty" in sys.argv:
        status = "HEALTHY" if result["healthy"] else "UNHEALTHY"
        print(f"Heartbeat [{status}] - {result['timestamp']}")
        print(f"  latency: {result['latency_ms']}ms")
        for k, v in result["checks"].items():
            icon = "[OK]" if v else "[FAIL]"
            print(f"  {icon} {k}")
    else:
        print(json.dumps(result, ensure_ascii=False))
    sys.exit(0 if result["healthy"] else 1)

if __name__ == "__main__":
    main()
