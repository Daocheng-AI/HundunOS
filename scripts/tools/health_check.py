#!/usr/bin/env python3
"""HundunOS Health Check Worker

Usage: python health_check.py [--format json|pretty]

Exits 0 if healthy, 1 if degraded, 2 if unhealthy.
"""
import json
import sys
import os
import time
import psutil
from pathlib import Path

def check_memory():
    mem = psutil.virtual_memory()
    percent = mem.percent
    if percent < 80:
        status = "ok"
    elif percent < 90:
        status = "warning"
    else:
        status = "critical"
    return {
        "dimension": "memory",
        "status": status,
        "percent": round(percent, 1),
        "used_gb": round(mem.used / (1024**3), 2),
        "total_gb": round(mem.total / (1024**3), 2),
    }

def check_disk():
    try:
        disk = psutil.disk_usage(os.getcwd() or "C:\\")
        percent = disk.percent
        if percent < 80:
            status = "ok"
        elif percent < 95:
            status = "warning"
        else:
            status = "critical"
        return {
            "dimension": "disk",
            "status": status,
            "percent": round(percent, 1),
            "free_gb": round(disk.free / (1024**3), 2),
        }
    except Exception:
        return {"dimension": "disk", "status": "unknown", "error": str(sys.exc_info()[1])}

def check_rust_modules():
    """Check Rust module status via tool-bridge binary"""
    rust_exe = Path(__file__).parent.parent.parent / "hundunos-rust" / "tool-bridge" / "target" / "release" / "hundunos-tool.exe"
    if not rust_exe.exists():
        rust_exe = Path(__file__).parent.parent.parent / "hundunos-rust" / "target" / "release" / "hundunos-tool.exe"
    
    status = "ok"
    if rust_exe.exists():
        try:
            import subprocess
            result = subprocess.run(
                [str(rust_exe)],
                input='{"action":"GetStats"}\n',
                capture_output=True,
                timeout=3,
                text=True
            )
            if result.returncode == 0:
                status = "ok"
            else:
                status = "degraded"
        except Exception:
            status = "warning"
    else:
        status = "unknown"
    
    return {"dimension": "rust_modules", "status": status}

def calculate_score(checks):
    weights = {"memory": 0.2, "disk": 0.15, "rust_modules": 0.25, "kernel": 0.2, "uptime": 0.1, "cron": 0.1}
    score = 0
    for check in checks:
        dim = check["dimension"]
        w = weights.get(dim, 0.1)
        if check["status"] == "ok":
            score += w * 100
        elif check["status"] == "warning":
            score += w * 60
        elif check["status"] == "degraded":
            score += w * 30
    return round(score)

def main():
    format_type = "json"
    if len(sys.argv) > 1 and sys.argv[1] == "--format" and len(sys.argv) > 2:
        format_type = sys.argv[2]
    elif "--pretty" in sys.argv:
        format_type = "pretty"

    timestamp = time.strftime("%Y-%m-%dT%H:%M:%S+08:00")
    checks = []

    # Memory
    checks.append(check_memory())

    # Disk
    checks.append(check_disk())

    # Rust modules
    checks.append(check_rust_modules())

    # Kernel (check if Node.js modules can be imported)
    try:
        import importlib.util
        spec = importlib.util.find_spec("hundunos")
        kernel_status = "ok" if spec else "unknown"
    except Exception:
        kernel_status = "unknown"
    checks.append({"dimension": "kernel", "status": kernel_status})

    # Uptime
    try:
        uptime_sec = int(time.time() - psutil.boot_time())
        checks.append({
            "dimension": "uptime",
            "status": "ok",
            "uptime_seconds": uptime_sec,
            "uptime_human": f"{uptime_sec//3600}h {(uptime_sec%3600)//60}m"
        })
    except Exception:
        checks.append({"dimension": "uptime", "status": "unknown"})

    score = calculate_score(checks)
    if score >= 90:
        overall = "healthy"
        exit_code = 0
    elif score >= 60:
        overall = "degraded"
        exit_code = 1
    else:
        overall = "unhealthy"
        exit_code = 2

    result = {
        "timestamp": timestamp,
        "score": score,
        "overall": overall,
        "checks": checks,
    }

    if format_type == "pretty":
        print(f"Health Check - {timestamp}")
        print(f"Score: {score}/100 ({overall.upper()})")
        print("Checks:")
        for c in checks:
            icon = {"ok": "[OK]", "warning": "[WARN]", "critical": "[CRIT]", "degraded": "[DEG]", "unknown": "[?]"}
            print(f"  {icon.get(c['status'], '[?]')} {c['dimension']}: {c['status']}")
    else:
        print(json.dumps(result, ensure_ascii=False))

    sys.exit(exit_code)

if __name__ == "__main__":
    main()
