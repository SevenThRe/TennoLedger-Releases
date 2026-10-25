param([string]$Python = "$PSScriptRoot/../.venv/Scripts/python.exe")
$ErrorActionPreference = 'Stop'
$project = (Resolve-Path "$PSScriptRoot/..").Path
$output = Join-Path $project 'desktop/src-tauri/collector-bin'
$work = Join-Path $project 'builds/collector-pyinstaller-work'
$vendor = & $Python -c "import setuptools,pathlib;print(pathlib.Path(setuptools.__file__).parent/'_vendor')"
& $Python -m PyInstaller --noconfirm --clean --onedir --console --name myframe-collector --distpath $output --workpath $work --specpath $work --paths $PSScriptRoot --paths $vendor --hidden-import backports.tarfile --collect-all rapidocr_onnxruntime --collect-all onnxruntime "$PSScriptRoot/auto.py"
if ($LASTEXITCODE -ne 0) { throw 'Worker packaging failed' }
& "$output/myframe-collector/myframe-collector.exe" --self-test
if ($LASTEXITCODE -ne 0) { throw 'Worker self test failed' }
