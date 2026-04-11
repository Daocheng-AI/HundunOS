@echo off
chcp 65001 >nul
echo === HundunOS Tool Bridge Test ===
echo.
set EXE=C:\Users\Lin\.qclaw\workspace\hundunos-rust\tool-bridge\target\release\hundunos-tool.exe

echo Test 1: echo hello
echo {"command":"echo hello","timeout_ms":5000} | %EXE%
echo.

echo Test 2: dir
echo {"command":"dir","timeout_ms":10000} | %EXE%
echo.

echo Done.
