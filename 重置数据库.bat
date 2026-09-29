@echo off
rem ===========================================================================
rem  Personal Health Record System - RESET DATABASE
rem  ---------------------------------------------------------------------------
rem  IMPORTANT: this file must contain ASCII characters ONLY.
rem  Windows cmd reads .bat files using the OEM code page (GBK on Chinese
rem  Windows), NOT UTF-8. Chinese text written as UTF-8 gets mis-decoded into
rem  stray bytes, and a byte inside a GBK trail range can happen to be a quote
rem  or a pipe - which ends a "rem" line early and makes the REST OF THE LINE
rem  run as a command. Keep this file ASCII-only. Chinese belongs in the docs.
rem
rem  WHAT THIS DOES
rem    Restores the built-in demo data: everything YOU added - new records,
rem    posts, replies, registered accounts, search history, likes, drafts - is
rem    removed, and the original sample data comes back: the demo patient's
rem    profile and health records, the seeded community posts, the seeded
rem    doctor consents.
rem
rem    It works by starting the database server and opening the app with
rem    ?reset=1. THE APP THEN ASKS YOU TO CONFIRM before anything is deleted.
rem    This launcher deliberately never touches data\database.json itself: a
rem    file deleted behind the user's back would be unrecoverable.
rem
rem  BEFORE YOU RUN IT
rem    Export a backup first if there is anything you want to keep. In the app:
rem    Settings - Data and storage - Export backup.
rem
rem  ONE MORE THING
rem    This resets the DATABASE FILE, data\database.json. If you are running
rem    the app through the original launcher instead, its data lives inside the
rem    browser and is NOT affected by this - use the restore-sample-data button
rem    in the app's settings page for that one.
rem
rem  NOTE ON LINE ENDINGS
rem    This file deliberately uses CRLF and avoids goto/labels. cmd.exe can
rem    mis-parse label jumps in a bare-LF batch file.
rem ===========================================================================

title PHR - Reset Database

echo.
echo  ============================================================
echo   Personal Health Record System - RESET DATABASE
echo  ============================================================
echo.
echo   This restores the built-in demo data.
echo   Everything you added will be removed.
echo.
echo   You will be asked to confirm INSIDE THE APP before
echo   anything is deleted. This window deletes nothing.
echo.
echo   Starting the local database server, please wait...
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0server\serve.ps1" -Root "%~dp0." -Open "/?reset=1"
if errorlevel 3 (
  echo.
  echo   A PHR server is already running, so it was reused.
  echo   The app should have opened on the confirmation page.
  echo   If it did not, open this address in your browser:
  echo.
  echo       http://127.0.0.1:17800/?reset=1
  echo.
  ping -n 6 127.0.0.1 >nul
) else (
  echo.
  echo   Server stopped.
  echo.
  ping -n 3 127.0.0.1 >nul
)
exit /b 0
