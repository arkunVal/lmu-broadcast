@echo off
REM Baut FLM-Reader.exe (einmalig, braucht Python mit pip). Ergebnis: dist\FLM-Reader.exe
cd /d "%~dp0"
py -m pip install --upgrade pyinstaller
py -m PyInstaller --noconfirm --onefile --console --name FLM-Reader --icon flm.ico --collect-submodules pylmu lmu_reader.py
echo.
echo Fertig: dist\FLM-Reader.exe  (config.json legt der Reader beim ersten Start daneben ab)
pause
