param([Parameter(Mandatory=$true)][string]$Manifest)
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$previous=$env:MYFRAME_UPDATE_MANIFEST
try {
 $env:MYFRAME_UPDATE_MANIFEST=(Resolve-Path -LiteralPath $Manifest).Path
 Push-Location "$root/desktop/src-tauri"
 try {
  $cargoArguments=@('test','--bin','myframe-desktop','--offline','actual_signed_installer_accepts_original_and_rejects_tampering','--','--ignored')
  & cargo @cargoArguments
  if($LASTEXITCODE -ne 0){throw 'Signed update verification failed'}
 } finally {Pop-Location}
} finally {$env:MYFRAME_UPDATE_MANIFEST=$previous}
