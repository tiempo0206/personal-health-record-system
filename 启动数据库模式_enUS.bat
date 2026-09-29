@echo off
rem ===========================================================================
rem  Personal Health Record System - DATABASE MODE launcher (ENGLISH interface)
rem  ---------------------------------------------------------------------------
rem  IMPORTANT: this file must contain ASCII characters ONLY.
rem  Windows cmd reads .bat files using the OEM code page (GBK on Chinese
rem  Windows), NOT UTF-8. Chinese text written as UTF-8 gets mis-decoded into
rem  stray bytes, and a byte inside a GBK trail range can happen to be a quote
rem  or a pipe - which ends a "rem" line early and makes the REST OF THE LINE
rem  run as a command. Keep this file ASCII-only. Chinese belongs in the docs.
rem
rem  WHAT THIS DOES
rem    Same as the Chinese database-mode launcher - starts the local server
rem    (server\serve.ps1, plain Windows PowerShell 5.1, nothing to install, no
rem    administrator rights) and keeps the database in the real file
rem    data\database.json - but opens index_enUS.html, so the interface comes
rem    up in ENGLISH.
rem
rem  THE FOUR LAUNCHERS, AND WHY THERE ARE FOUR
rem    interface language  x  where the data lives:
rem      start website (CN)          browser storage
rem      start website (EN)          browser storage
rem      start database mode (CN)    data\database.json
rem      start database mode (EN)    << this file
rem    The two storage locations are SEPARATE DATABASES that cannot see each
rem    other. Pick one and stay with it, or your data will look like it
rem    vanished.
rem
rem  NOTE ON THE FORCED LANGUAGE
rem    index_enUS.html forwards to index.html?lang=en-US. A ?lang= parameter is
rem    deliberately NOT written back to your saved preference (see the language
rem    dialog's note in the app), so this stays English every time you use this
rem    launcher. If you would rather have English remembered for the Chinese
rem    launcher too, switch language once with the globe button in the top bar.
rem
rem  NOTE ON LINE ENDINGS
rem    This file deliberately uses CRLF and avoids goto/labels. cmd.exe can
rem    mis-parse label jumps in a bare-LF batch file, and being unparseable is
rem    not a trade worth making for consistency with the other launchers.
rem ===========================================================================

title PHR - Database Mode (English)

echo.
echo  ============================================================
echo   Personal Health Record System - DATABASE MODE (ENGLISH)
echo  ============================================================
echo.
echo   Starting the local database server, please wait...
echo.
echo   Database file : data\database.json
echo   Interface     : ENGLISH (this session)
echo   Demo account  : demo / Demo@2026
echo   SMS code      : 000000  universal test code
echo.
echo   THIS WINDOW IS THE SERVER. Close it to stop the server.
echo   If the browser does not open by itself, use the URL above
echo   and append index_enUS.html to it.
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0server\serve.ps1" -Root "%~dp0." -Open "/index_enUS.html"
if errorlevel 3 (
  echo.
  echo   Another PHR server is already running.
  echo   Use that window instead - it is still serving the app.
  echo   To reach the ENGLISH interface, open:
  echo.
  echo       http://127.0.0.1:17800/index_enUS.html
  echo.
  ping -n 6 127.0.0.1 >nul
) else (
  echo.
  echo   Server stopped.
  echo.
  ping -n 3 127.0.0.1 >nul
)
exit /b 0
