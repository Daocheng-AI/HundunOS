@echo off
chcp 65001 >nul
echo === HundunOS Rust Modules Test ===
echo.

echo --- Tool Bridge ---
echo {"command":"echo hello","timeout_ms":5000} | hundunos-tool.exe
echo.

echo --- Policy Engine ---
echo {"CheckFileRead":{"path":"test.js"}} | hundunos-policy.exe
echo.

echo --- Memory Graph ---
echo {"Record":{"content":"test memory","intent":"test","result":true}} | hundunos-memory.exe
echo.

echo --- Model Router ---
echo {"Route":{"content":"translate hello","task_type":null,"max_tokens":null}} | hundunos-router.exe
echo.

echo Done.
