#!/usr/bin/env node

/**
 * 清理所有文件中的// 垃圾注释
 */

import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');
const excludeDirs = ['.git', 'node_modules', 'dist', 'build'];
const fileExtensions = ['.js', '.mjs', '.jsx', '.ts', '.tsx'];

function cleanReviewComments(filePath) {
    try {
        const content = readFileSync(filePath, 'utf8');
        
        // 清理重复的// 注释
        const cleanedContent = content
            // 清理重复的// 前缀
            .replace(/(\/\/ review: removed\s*)+/g, '// ')
            // 移除只有// 的行
            .replace(/^\s*\/\/ review: removed\s*$/gm, '');
        
        if (content !== cleanedContent) {
            writeFileSync(filePath, cleanedContent, 'utf8');
            console.log(`Cleaned: ${filePath}`);
        }
    } catch (error) {
        console.error(`Error cleaning ${filePath}:`, error.message);
    }
}

function traverseDirectory(dir) {
    const entries = readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        
        if (entry.isDirectory()) {
            if (!excludeDirs.includes(entry.name)) {
                traverseDirectory(fullPath);
            }
        } else if (entry.isFile()) {
            if (fileExtensions.some(ext => entry.name.endsWith(ext))) {
                cleanReviewComments(fullPath);
            }
        }
    }
}

console.log('Cleaning review comments...');
traverseDirectory(rootDir);
console.log('Cleanup completed!');
