@echo off
rem ===========================================================================
rem  Personal Health Record System - DATABASE MODE launcher
rem  ---------------------------------------------------------------------------
rem  IMPORTANT: this file must contain ASCII characters ONLY.
rem  Windows cmd reads .bat files using the OEM code page (GBK on Chinese
rem  Windows), NOT UTF-8. Chinese text written as UTF-8 gets mis-decoded into
rem  stray bytes, and a byte inside a GBK trail range can happen to be a quote
rem  or a pipe - which ends a "rem" line early and makes the REST OF THE LINE
rem  run as a command. Keep this file ASCII-only. Chinese belongs in the docs,
rem  and the launcher whose name means "start website" refers to the other one.
rem
rem  WHAT THIS DOES
rem    Starts a small local server (server\serve.ps1, plain Windows PowerShell
rem    5.1 - nothing to install, no administrator rights) and opens the app at
rem    http://127.0.0.1:<port>/. In this mode the database is a real file,
rem    data\database.json, which you can open, edit, back up and copy.
rem
rem  READ THIS BEFORE MIXING LAUNCHERS
rem    The ORIGINAL launcher is unchanged: it still opens index.html directly,
rem    and the browser then keeps the data inside its own storage
rem    (localStorage). Those are TWO SEPARATE DATABASES that cannot see each
rem    other. Pick one launcher and stay with it, or your data will look like
rem    it vanished. The Chinese user manual explains this in detail.
rem
rem  WHY A SERVER IS NEEDED AT ALL
rem    A page opened from file:// is sandboxed by the browser and cannot write
rem    to disk. There is no way around it - keeping the database in a file
rem    requires http.
rem
rem  WHY serve.ps1 PRINTS ENGLISH
rem    PowerShell 5.1 reads a BOM-less .ps1 as ANSI/GBK, so non-ASCII text in
rem    it would corrupt exactly the way described above. Everything the user
rem    reads is inside the web app, which has its own i18n layer.
rem
rem  NOTE ON LINE ENDINGS
rem    This file deliberately uses CRLF and avoids goto/labels. cmd.exe can
rem    mis-parse label jumps in a bare-LF batch file, and being unparseable is
rem    not a trade worth making for consistency with the other launchers.
rem ===========================================================================

title PHR - Database Mode

echo.
echo  ============================================================
echo   Personal Health Record System - DATABASE MODE
echo  ============================================================
echo.
echo   Starting the local database server, please wait...
echo.
echo   Database file : data\database.json
echo   Demo account  : demo / Demo@2026
echo   SMS code      : 000000  universal test code
echo.
echo   THIS WINDOW IS THE SERVER. Close it to stop the server.
echo   If the browser does not open by itself, use the URL above.
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0server\serve.ps1" -Root "%~dp0." -Open "/"
if errorlevel 3 (
  echo.
  echo   Another PHR server is already running.
  echo   Use that window instead - it is still serving the app.
  echo.
  ping -n 4 127.0.0.1 >nul
) else (
  echo.
  echo   Server stopped.
  echo.
  ping -n 3 127.0.0.1 >nul
)
exit /b 0
