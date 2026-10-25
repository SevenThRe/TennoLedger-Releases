param(
 [string]$ResourceArchive,
 [string]$Python='python',
 [switch]$RebuildCollector
)
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$arguments=@((Join-Path $PSScriptRoot 'prepare_resources.py'))
if($ResourceArchive){$arguments+=@('--archive',(Resolve-Path -LiteralPath $ResourceArchive).Path)}
& $Python @arguments
if($LASTEXITCODE -ne 0){throw 'Build resource preparation failed'}
& pwsh -NoProfile -File (Join-Path $PSScriptRoot 'fetch_helper.ps1')
if($LASTEXITCODE -ne 0){throw 'Helper preparation failed'}
$collector=Join-Path $root 'desktop/src-tauri/collector-bin/myframe-collector/myframe-collector.exe'
if($RebuildCollector -or -not(Test-Path -LiteralPath $collector)){
 $hasBuildDependencies=& $Python -c 'import PyInstaller,rapidocr_onnxruntime,setuptools'
 if($LASTEXITCODE -ne 0){
  $venv=Join-Path $root '.venv'
  & $Python -m venv $venv
  if($LASTEXITCODE -ne 0){throw 'Python 3.11 virtual environment creation failed'}
  $Python=Join-Path $venv 'Scripts/python.exe'
  & $Python -m pip install -r (Join-Path $root 'collector/requirements-build.txt')
  if($LASTEXITCODE -ne 0){throw 'Collector build dependency installation failed'}
 }
 & pwsh -NoProfile -File (Join-Path $root 'collector/build_worker.ps1') -Python $Python
 if($LASTEXITCODE -ne 0){throw 'Collector compilation or self-test failed'}
}
Write-Output 'Build resources, pinned helper, notification dependency and collector are ready.'
