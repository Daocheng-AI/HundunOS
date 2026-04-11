import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const yamlPath = 'kernel/skills/skills/github.yaml';
const content = readFileSync(yamlPath, 'utf-8');

// Copy actual parser from skill-registry.js
function _unquote(val) {
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        if (val.startsWith('"')) {
            return val.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
        }
        return val.slice(1, -1).replace(/''/g, "'");
    }
    if (val === 'true') return true;
    if (val === 'false') return false;
    if (val === 'null' || val === '~') return null;
    const n = Number(val);
    if (!isNaN(n) && val !== '') return n;
    return val;
}

function parseYaml(str) {
    const result = {};
    const lines = str.split('\n');
    let currentKey = null;
    let currentObj = result;
    const stack = [{ obj: result, indent: -1 }];

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        const hashIdx = line.indexOf('#');
        if (hashIdx !== -1) {
            const before = line.slice(0, hashIdx);
            if (!/['"]/.test(before)) line = before;
        }
        line = line.replace(/\t/g, '  ').replace(/\r$/, '');
        const trimmed = line.trim();
        if (!trimmed) { // review: removed // review: removed console.log(`${i}: [BLANK]`); continue; }

        const indent = line.search(/\S/);

        // adjust stack
        while (stack.length > 1) {
            const top = stack[stack.length - 1];
            let shouldPop = false;
            if (top.isArrayItem) {
                shouldPop = (indent < top.indent);
                if (!shouldPop && indent === top.indent) shouldPop = true;
            } else {
                shouldPop = indent <= top.indent;
            }
            if (shouldPop) {
                stack.pop();
            } else {
                break;
            }
        }
        currentObj = stack[stack.length - 1].obj;

        // array item
        if (trimmed.startsWith('- ')) {
            const val = trimmed.slice(2).trim();
            const kvMatch = val.match(/^(\w[\w-]*)\s*:\s*(.*)$/);
            if (kvMatch) {
                const [, firstKey, firstRaw] = kvMatch;
                currentObj[currentKey] = currentObj[currentKey] || [];
                const newObj = { [firstKey]: _unquote(firstRaw.trim()) };
                currentObj[currentKey].push(newObj);
                stack.push({ obj: newObj, indent, isArrayItem: true });
                // review: removed // review: removed console.log(`${i}: ARR_OBJ ${currentKey} -> id=${firstRaw.trim().slice(0,30)} stackLen=${stack.length}`);
            } else {
                currentObj[currentKey] = currentObj[currentKey] || [];
                if (val) currentObj[currentKey].push(_unquote(val));
                // review: removed // review: removed console.log(`${i}: ARR_SCALAR ${currentKey} -> "${val}"`);
            }
            continue;
        }

        // key-value
        const kvMatch2 = trimmed.match(/^(\w[\w-]*)\s*:\s*(.*)$/);
        if (kvMatch2) {
            const [, key, rawVal] = kvMatch2;
            currentKey = key;
            const val = rawVal.trim();
            if (val === '|' || val === '>') {
                const pieces = [];
                let j = i + 1;
                const minIndent = indent + 2;
                for (; j < lines.length; j++) {
                    const l = lines[j];
                    if (l.trim() === '') { pieces.push(''); continue; }
                    if (l.search(/\S/) < minIndent) break;
                    pieces.push(l.trimEnd());
                }
                currentObj[key] = pieces.join(val === '|' ? '\n' : ' ');
                // review: removed // review: removed console.log(`${i}: LITERAL ${key} = "${currentObj[key].slice(0,30)}..."`);
                i = j - 1;
                continue;
            }
            if (!val) {
                if (i + 1 < lines.length) {
                    const nextLine = lines[i + 1];
                    const nextIndent = nextLine.search(/\S/);
                    const nextTrimmed = nextLine.trim();
                    if (nextTrimmed && nextIndent > indent) {
                        if (nextTrimmed.startsWith('- ')) {
                            currentObj[key] = [];
                            // review: removed // review: removed console.log(`${i}: KEY_EMPTY_ARR ${key}`);
                            continue;
                        }
                        currentObj[key] = {};
                        stack.push({ obj: currentObj[key], indent: nextIndent });
                        // review: removed // review: removed console.log(`${i}: KEY_NESTED ${key}`);
                        continue;
                    }
                }
                currentObj[key] = null;
                // review: removed // review: removed console.log(`${i}: KEY_NULL ${key}`);
                continue;
            }
            currentObj[key] = _unquote(val);
            // review: removed // review: removed console.log(`${i}: KEY ${key} = "${val}"`);
            continue;
        }
    }
    return result;
}

const s = parseYaml(content);
// review: removed // review: removed console.log('\n=== RESULT ===');
// review: removed // review: removed console.log('name:', s.name);
// review: removed // review: removed console.log('tools length:', s.tools?.length);
// review: removed // review: removed console.log('first tool:', JSON.stringify(s.tools?.[0]));
// review: removed // review: removed console.log('tags:', JSON.stringify(s.tags));
