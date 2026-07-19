@echo off
setlocal
title KCS Dispatch System

cd /d "%~dp0"

where node.exe >nul 2>nul
if errorlevel 1 goto node_missing

where npm.cmd >nul 2>nul
if errorlevel 1 goto npm_missing

if not exist "node_modules\" goto install_dependencies
goto start_system

:install_dependencies
echo.
echo First run: installing required components...
call npm.cmd install
if errorlevel 1 goto install_failed

:start_system
echo.
echo ========================================
echo       Starting KCS Dispatch System
echo ========================================
echo.
echo The browser will open automatically.
echo Keep this window open while using the system.
echo Close this window to stop the system.
echo.
call npm.cmd run dev -- --open
goto stopped

:node_missing
echo.
echo ERROR: Node.js was not found.
echo Please install Node.js and run this file again.
goto failed

:npm_missing
echo.
echo ERROR: npm was not found.
echo Please reinstall Node.js and run this file again.
goto failed

:install_failed
echo.
echo ERROR: Required components could not be installed.
echo Check the internet connection and try again.
goto failed

:stopped
echo.
echo KCS Dispatch System has stopped.
pause
exit /b 0

:failed
echo.
pause
exit /b 1
