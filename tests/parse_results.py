import json, re, sys

# read run.js output from stdin
text = sys.stdin.read()

# extract summary line
m = re.search(r'总计:\s*(\d+)\s*\|\s*通过:\s*(\d+)\s*\|\s*失败:\s*(\d+)', text)
if m:
    total, passed, failed = int(m.group(1)), int(m.group(2)), int(m.group(3))
    print(f'Total: {total}  Passed: {passed}  Failed: {failed}')
else:
    print('No summary found in output')

# read results.json (may be stale)
try:
    with open('tests/results.json', encoding='utf-8') as f:
        d = json.load(f)
    print(f'Results.json: Total={d["total"]} Passed={d["passed"]} Failed={d["failed"]}')
    # check module import stats
    mod_m = re.search(r'模块导入:\s*(\d+)/(\d+)', text)
    if mod_m:
        print(f'Module imports: {mod_m.group(1)}/{mod_m.group(2)}')
    stat_m = re.search(r'代码统计 - (\d+) 文件,\s*([\d.]+) ([KMG]?B),\s*([\d,]+) 行', text)
    if stat_m:
        print(f'Code stats: {stat_m.group(1)} files, {stat_m.group(2)}{stat_m.group(3)}, {stat_m.group(4)} lines')
except Exception as e:
    print(f'Results.json error: {e}')
