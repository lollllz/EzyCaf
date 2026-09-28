@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
if errorlevel 1 (
  echo ERROR: Could not change to the repository directory.
  exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js is not installed or is not on PATH. Install Node.js 18+ and retry.
  exit /b 1
)
where npm >nul 2>&1
if errorlevel 1 (
  echo ERROR: npm is not installed or is not on PATH. Install Node.js 18+ and retry.
  exit /b 1
)

for /f "delims=" %%V in ('node -p "process.versions.node" 2^>nul') do set "NODE_VERSION=%%V"
if not defined NODE_VERSION (
  echo ERROR: Unable to read the Node.js version.
  exit /b 1
)
for /f "tokens=1 delims=." %%M in ("%NODE_VERSION%") do set "NODE_MAJOR=%%M"
set /a NODE_MAJOR_NUM=%NODE_MAJOR% >nul 2>&1
if %NODE_MAJOR_NUM% LSS 18 (
  echo ERROR: Node.js 18 or newer is required; found %NODE_VERSION%.
  exit /b 1
)

if not exist package.json (
  echo ERROR: package.json was not found in %CD%.
  exit /b 1
)

echo === Kamil — Restaurant Order Management ===
echo Node.js %NODE_VERSION%
echo.

if not exist data mkdir data
if not exist uploads mkdir uploads

if not exist node_modules (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo ERROR: npm install failed.
    exit /b 1
  )
) else (
  echo Dependencies present ^(node_modules found^).
)

if defined SUPABASE_URL (
  echo Optional Supabase env detected — LAN Hub still does not depend on cloud.
) else if defined SUPABASE_ANON_KEY (
  echo Optional Supabase env detected — LAN Hub still does not depend on cloud.
) else (
  echo Supabase OFF — local SQLite only.
)

if exist client\package.json (
  echo Building client...
  call npm run build -w client
  if errorlevel 1 (
    echo ERROR: client build failed.
    exit /b 1
  )
) else (
  echo Note: client\package.json not found yet — skipping client build.
)

if not defined PORT set "PORT=3847"
set "NODE_ENV=production"

echo.
echo Starting Kamil Hub on port %PORT%...
echo   Local:   http://localhost:%PORT%
echo   Hub:     http://localhost:%PORT%/
echo   Kitchen: http://localhost:%PORT%/kitchen
echo   Cashier: http://localhost:%PORT%/cashier
echo   Admin:   http://localhost:%PORT%/admin
echo.
echo On a phone, use the LAN IP printed by the Hub ^(same Wi-Fi^).
echo Press Ctrl-C to stop.
echo.

call npm run start -w server
exit /b %ERRORLEVEL%
