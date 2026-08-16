@echo off
chcp 65001 >nul
title OI 代码可视化 (cpp-viz)
cd /d "%~dp0"

echo ============================================
echo    OI 代码可视化  (cpp-viz)
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 goto nodenode

if not exist node_modules goto install

goto run

:install
echo 首次运行，正在安装依赖（可能要几分钟）...
echo.
call npm install
if errorlevel 1 goto installfail
goto run

:run
echo 正在启动开发服务器...
echo 浏览器会自动打开 http://localhost:5173
echo 提示：关闭窗口或按 Ctrl+C 即停止，进程随窗口结束。
echo.
node node_modules\vite\bin\vite.js --open
echo.
echo 服务已停止。
pause
exit /b 0

:nodenode
echo [错误] 未检测到 Node.js，请先安装：https://nodejs.org/
echo.
pause
exit /b 1

:installfail
echo [错误] 依赖安装失败，请检查网络后重试。
pause
exit /b 1
