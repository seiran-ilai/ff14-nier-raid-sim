@echo off
chcp 65001 >nul
rem 啟動模擬器：第一次會先安裝套件，接著開瀏覽器；關掉這個視窗就停止
cd /d "%~dp0"
set "PATH=%LOCALAPPDATA%\Programs\nodejs;%PATH%"
if not exist node_modules call npm install
call npm run dev -- --open
