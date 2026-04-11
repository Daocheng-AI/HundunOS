@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo === HundunOS Rust Modules Test ===
echo.

cd /d "%~dp0target\release"

echo --- Test 1: Tool Bridge ---
echo {"command":"echo hello","timeout_ms":5000} | hundunos-tool.exe
echo.

echo --- Test 2: Policy Engine ---
echo {"CheckFileRead":{"path":"test.js"}} | hundunos-policy.exe
echo.

echo --- Test 3: Memory Graph ---
echo {"Record":{"content":"test memory","intent":"test","result":true}} | hundunos-memory.exe
echo.

echo --- Test 4: Model Router ---
echo {"Route":{"content":"translate","task_type":null,"max_tokens":null}} | hundunos-router.exe
echo.

echo === All tests completed ===
