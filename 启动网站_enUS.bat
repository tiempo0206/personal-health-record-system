@echo off
rem ===========================================================================
rem  Personal Health Record System - English launcher
rem  ---------------------------------------------------------------------------
rem  IMPORTANT: this file must contain ASCII characters ONLY.
rem  Windows cmd reads .bat files using the OEM code page (GBK on Chinese
rem  Windows), NOT UTF-8. Chinese text written as UTF-8 gets mis-decoded into
rem  stray bytes, and a byte inside a GBK trail range can happen to be a quote
rem  or a pipe - which ends a "rem" line early and makes the REST OF THE LINE
rem  run as a command. That is exactly why the previous version failed with
rem  "'and' is not recognized as an internal or external command".
rem  Keep this file ASCII-only. Chinese belongs in the docs, not here.
rem
rem  Entry points, one to one:
rem    index.html       <- the default launcher   default, CHINESE
rem    index_enUS.html  <- this launcher           forced ENGLISH
rem
rem  This launcher opens  index_enUS.html,  which forwards to
rem  index.html?lang=en-US and forces the interface language.
rem
rem  The forced language applies to THIS session only, and is NOT written back
rem  to the saved preference - so it never affects what index.html opens in.
rem ===========================================================================

title Personal Health Record System - English

echo.
echo  ============================================================
echo   Personal Health Record System (PHR) v1.1.0
echo   Secure - Controllable - Understandable - Traceable
echo  ============================================================
echo.
echo   Starting in ENGLISH...
echo.
echo   This launcher opens  index_enUS.html,  which forwards to
echo   index.html?lang=en-US and forces the interface language.
echo.
echo   The forced language applies to THIS session only. If you
echo   switch language inside the app, that choice is saved and
echo   is used next time you open index.html.
echo.
echo   Demo account : demo / Demo@2026
echo   SMS code     : 000000  (universal test code)
echo.
echo   If the browser does not open, just double-click
echo   index_enUS.html in this folder.
echo.
echo  ============================================================
echo.

rem Do NOT write: start "" "%~dp0index.html?lang=en-US"
rem Windows start needs a real existing file path; "index.html?lang=en-US"
rem is not a filename and ShellExecute reports "file not found".
start "" "%~dp0index_enUS.html"

rem ping is used instead of timeout: timeout fails when stdin is redirected.
ping -n 4 127.0.0.1 >nul

exit
