@echo off
rem ===========================================================================
rem  Personal Health Record System - Chinese launcher (the default one)
rem  ---------------------------------------------------------------------------
rem  IMPORTANT: this file must contain ASCII characters ONLY.
rem  Windows cmd reads .bat files using the OEM code page (GBK on Chinese
rem  Windows), NOT UTF-8. Chinese text written as UTF-8 gets mis-decoded into
rem  stray bytes, and a byte inside a GBK trail range can happen to be a quote
rem  or a pipe - which ends a "rem" line early and makes the REST OF THE LINE
rem  run as a command.
rem  Keep this file ASCII-only. Chinese belongs in the docs, not here.
rem
rem  Entry points, one to one:
rem    index.html       <- this launcher        default, CHINESE
rem    index_enUS.html  <- the _enUS launcher   forced ENGLISH
rem
rem  index.html used to follow the BROWSER language when the user had never
rem  picked one in the app. navigator.language follows the operating system
rem  DISPLAY language, not the region - so on a machine set to
rem  "display language English, region China" (a very common corporate image)
rem  the default entry opened in ENGLISH, identical to the English entry.
rem
rem  That fallback is gone: index.html now defaults to Chinese, and English is
rem  reached through index_enUS.html. No guessing from the machine environment.
rem
rem  A language you pick inside the app with the globe button is still
rem  remembered and is used the next time you open index.html.
rem ===========================================================================

title Personal Health Record System

echo.
echo  ============================================================
echo   Personal Health Record System (PHR) v1.1.0
echo   Secure - Controllable - Understandable - Traceable
echo  ============================================================
echo.
echo   Starting...
echo.
echo   Language: CHINESE by default (index.html).
echo             For English use the _enUS launcher or index_enUS.html.
echo.
echo   A language you pick inside the app with the globe button is
echo   remembered and used next time you open index.html.
echo.
echo   Demo account : demo / Demo@2026
echo   SMS code     : 000000  (universal test code; the real code is
echo                  also shown on the verification page)
echo.
echo   If the browser does not open, just double-click
echo   index.html in this folder.
echo.
echo  ============================================================
echo.

start "" "%~dp0index.html"

rem ping is used instead of timeout: timeout fails when stdin is redirected.
ping -n 4 127.0.0.1 >nul

exit
