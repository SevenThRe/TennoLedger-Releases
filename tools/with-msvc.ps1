param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Command)
$ErrorActionPreference='Stop'
if(-not $env:VSCMD_VER){
$locator=Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
if(-not(Test-Path -LiteralPath $locator)){throw 'Visual Studio Installer / C++ Build Tools is required'}
$install=& $locator -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
$vsdev=Join-Path ([string]$install) 'Common7/Tools/VsDevCmd.bat'
if (-not (Test-Path -LiteralPath $vsdev)) { throw 'Visual Studio developer environment missing.' }
$variables=& cmd.exe /d /c ('call "'+$vsdev+'" -arch=x64 -host_arch=x64 >nul && set')
if ($LASTEXITCODE -ne 0) { throw 'Visual Studio developer environment failed.' }
foreach ($line in $variables) { if ($line -match '^([^=]+)=(.*)$') { [Environment]::SetEnvironmentVariable($matches[1],$matches[2],'Process') } }
}
Push-Location (Join-Path $PSScriptRoot '../desktop/src-tauri')
try { & $Command[0] @($Command | Select-Object -Skip 1); exit $LASTEXITCODE } finally { Pop-Location }
