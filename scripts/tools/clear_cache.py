#!/usr/bin/env python3
"""HundunOS Clear Cache - Secure cache cleanup"""
import json, sys, os, shutil, tempfile
from pathlib import Path

def main():
    # SECURITY: Only clear known safe cache directories
    cache_dirs = [
        tempfile.gettempdir(),
    ]

    total_freed = 0
    files_removed = 0
    errors = []

    for cache_dir in cache_dirs:
        p = Path(cache_dir)
        if not p.exists():
            continue
        try:
            for item in p.iterdir():
                try:
                    age = item.stat().st_mtime
                    # Only remove items older than 1 hour
                    import time
                    if time.time() - age > 3600:
                        if item.is_file():
                            item.unlink()
                            total_freed += item.stat().st_size
                            files_removed += 1
                        elif item.is_dir():
                            shutil.rmtree(item)
                            files_removed += 1
                except Exception:
                    pass
        except Exception as e:
            errors.append(str(e))

    result = {
        "success": True,
        "files_removed": files_removed,
        "bytes_freed": total_freed,
        "mb_freed": round(total_freed / (1024**2), 2),
        "errors": errors if errors else None,
    }

    if "--pretty" in sys.argv:
        print("Cache Cleared")
        print("=" * 40)
        print(f"  Files removed: {files_removed}")
        print(f"  Space freed: {result['mb_freed']} MB")
        if errors:
            print(f"  Errors: {len(errors)}")
    else:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    sys.exit(0)

if __name__ == "__main__":
    main()
