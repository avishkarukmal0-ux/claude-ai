@echo off
title Vendora POS - Local Launcher
cd /d "%~dp0"

echo ==================================================
echo    VENDORA POS  -  starting on your computer
echo ==================================================
echo.

REM --- 1. Check Node.js is installed ---
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed.
  echo Download the "LTS" version from https://nodejs.org  then run this again.
  echo.
  pause
  exit /b 1
)

REM --- 2. Make sure the backend .env exists (holds your database link) ---
if not exist "vendora-pos\backend\.env" (
  copy "vendora-pos\backend\.env.example" "vendora-pos\backend\.env" >nul
  echo.
  echo  IMPORTANT: I created  vendora-pos\backend\.env
  echo  You MUST paste your database link (MONGODB_URI) into it so your
  echo  REAL shop data shows up.
  echo.
  echo  I am opening TWO windows for you:
  echo    1. GET-DATABASE-LINK.txt  - step-by-step guide to copy the link
  echo       from MongoDB Atlas (cloud.mongodb.com).
  echo    2. the .env file          - paste the link on the MONGODB_URI= line,
  echo       then Save (Ctrl+S) and close it.
  echo.
  echo  Opening both now. Follow the guide, save the .env, then come back
  echo  here and press a key.
  pause
  start "" notepad "GET-DATABASE-LINK.txt"
  notepad "vendora-pos\backend\.env"
  echo  Press a key once you have pasted and saved your MONGODB_URI...
  pause
)

REM --- 3. Make sure the frontend .env exists (defaults are fine) ---
if not exist "vendora-pos\frontend\.env" (
  copy "vendora-pos\frontend\.env.example" "vendora-pos\frontend\.env" >nul
)

REM --- 4. Install dependencies the first time ---
if not exist "vendora-pos\backend\node_modules" (
  echo Installing backend dependencies ^(first run only, a few minutes^)...
  pushd "vendora-pos\backend" && call npm install && popd
)
if not exist "vendora-pos\frontend\node_modules" (
  echo Installing frontend dependencies ^(first run only, a few minutes^)...
  pushd "vendora-pos\frontend" && call npm install && popd
)

REM --- 5. Launch backend + frontend in their own windows ---
echo.
echo Starting the POS server and the app...
start "Vendora Backend"  cmd /k "cd /d %~dp0vendora-pos\backend && npm run dev"
start "Vendora Frontend" cmd /k "cd /d %~dp0vendora-pos\frontend && npm run dev"

REM --- 6. Wait for boot, then open the browser ---
echo Waiting for everything to start up...
timeout /t 12 /nobreak >nul
start "" http://localhost:5173

echo.
echo ==================================================
echo   Vendora POS is running!
echo   Open in browser:  http://localhost:5173
echo   Login: choose your store, Employee ID EMP001, PIN 1111
echo ==================================================
echo.
echo Two black windows opened (backend + frontend) - leave them running.
echo To stop the POS, just close those two windows.
echo.
pause
