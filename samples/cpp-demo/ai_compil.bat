@echo off
rem ai_compil.bat — Exemple Windows pour le « Correcteur de warnings ».
rem
rem Compile le projet et ecrit les warnings du compilateur dans warning.txt,
rem place A COTE de ce script. Format MSVC reconnu par le parser :
rem     chemin\fichier.cpp(LIGNE): warning Cxxxx: message
rem (le format GCC/Clang est aussi accepte si vous utilisez g++/clang++).
rem
rem S'il existe plusieurs ai_compil.bat (un par module), le correcteur lance
rem celui qui est le plus proche du fichier concerne.

setlocal
cd /d "%~dp0"

set OUT=warning.txt
break > "%OUT%"

rem ── Option A : MSVC (cl.exe) ──────────────────────────────────────────────
rem /W4 active la plupart des warnings ; /c compile sans linker.
cl /nologo /std:c++17 /W4 /c /I src src\*.cpp 2>&1 | findstr /C:": warning " >> "%OUT%"

rem ── Option B : MinGW g++ (decommenter si besoin) ──────────────────────────
rem g++ -std=c++17 -Wall -Wextra -fsyntax-only -Isrc src\*.cpp 2>&1 ^
rem    | findstr /C:": warning:" >> "%OUT%"

echo ai_compil: warnings ecrits dans %OUT%
endlocal
exit /b 0
