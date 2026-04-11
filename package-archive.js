const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const sourceDir = 'C:/Users/Lin/.qclaw/workspace/hundunos';
const outputFile = 'C:/Users/Lin/Desktop/HundunOS-Install-Package.zip';

const excludeDirs = ['node_modules', '.git', 'logs', 'dist', '.tmp', '.benchmarks', '.snapshots'];

const output = fs.createWriteStream(outputFile);
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
    console.log(`Archive created: ${archive.pointer()} bytes`);
});

archive.pipe(output);

function addDir(dir) {
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
        if (excludeDirs.includes(entry)) continue;
        
        const fullPath = path.join(dir, entry);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
            addDir(fullPath);
        } else {
            const relativePath = path.relative(sourceDir, fullPath);
            archive.file(fullPath, { name: relativePath });
        }
    }
}

addDir(sourceDir);
archive.finalize();