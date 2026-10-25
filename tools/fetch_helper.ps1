$ErrorActionPreference='Stop'
$root=(Resolve-Path "$PSScriptRoot/..").Path
$folder=Join-Path $root 'desktop/src-tauri/helper-bin'
$manifest=Get-Content -LiteralPath (Join-Path $folder 'SOURCE.json') -Raw | ConvertFrom-Json
$target=Join-Path $folder 'warframe-api-helper.exe'
if ((Test-Path -LiteralPath $target) -and (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -eq $manifest.sha256) { Write-Output 'Verified helper 1.1.2'; exit 0 }
$staged=Join-Path $folder 'warframe-api-helper.download'
try {
    & curl.exe --noproxy '*' --location --fail --connect-timeout 15 --max-time 120 --output $staged $manifest.url
    if ($LASTEXITCODE -ne 0) { throw 'Helper download failed.' }
    if ((Get-FileHash -LiteralPath $staged -Algorithm SHA256).Hash.ToLowerInvariant() -ne $manifest.sha256) { throw 'Helper SHA256 mismatch.' }
    Move-Item -LiteralPath $staged -Destination $target -Force
    Write-Output 'Verified helper 1.1.2'
} finally { if (Test-Path -LiteralPath $staged) { Remove-Item -LiteralPath $staged } }
