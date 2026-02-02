@echo off
setlocal

echo Setting up CubiCasa5k Local Environment...

:: Check for Python 3.10+
python --version > nul 2>&1
if %errorlevel% neq 0 (
    echo Python is not installed or not in PATH. Please install Python 3.10+.
    pause
    exit /b 1
)

:: Create Virtual Environment
if not exist "venv" (
    echo Creating virtual environment...
    python -m venv venv
) else (
    echo Virtual environment already exists.
)

:: Activate Virtual Environment
call venv\Scripts\activate

:: Upgrade pip
echo Upgrading pip...
python -m pip install --upgrade pip

:: Install Dependencies
echo Installing dependencies from requirements.txt...
pip install -r requirements.txt

echo.
echo setup complete!
echo To start working, run: call venv\Scripts\activate
echo.
pause
