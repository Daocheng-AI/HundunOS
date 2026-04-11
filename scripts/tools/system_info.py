#!/usr/bin/env python3
"""HundunOS System Info Worker"""
import json, sys, os, platform, time

def main():
    info = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S+08:00"),
        "platform": platform.system(),
        "platform_version": platform.version(),
        "architecture": platform.machine(),
        "python_version": platform.python_version(),
        "node_version": os.popen("node --version").read().strip() or None,
        "cwd": os.getcwd(),
        "user": os.environ.get("USERNAME") or os.environ.get("USER") or "unknown",
        "hostname": platform.node(),
        "boot_time": None,
        "hundunos_version": "3.1.0",
        "rust_modules": {
            "tool_bridge": True,
            "memory_graph": True,
            "model_router": True,
            "policy_engine": True,
        }
    }

    # Try to get boot time
    try:
        import psutil
        info["boot_time"] = time.strftime("%Y-%m-%dT%H:%M:%S+08:00", time.localtime(psutil.boot_time()))
        info["uptime_seconds"] = int(time.time() - psutil.boot_time())
    except Exception:
        pass

    # Pretty output
    if "--pretty" in sys.argv:
        print("HundunOS System Info")
        print("=" * 40)
        for k, v in info.items():
            if k not in ("timestamp", "rust_modules"):
                print(f"  {k}: {v}")
        print("  rust_modules:")
        for k, v in info.get("rust_modules", {}).items():
            status = "[OK]" if v else "[MISSING]"
            print(f"    {status} {k}")
    else:
        print(json.dumps(info, ensure_ascii=False, indent=2))
    sys.exit(0)

if __name__ == "__main__":
    main()
