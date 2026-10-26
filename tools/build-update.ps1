param(
 [Parameter(Mandatory=$true)][ValidatePattern('^\d+\.\d+\.\d+$')][string]$Version,
 [string]$NotesFile,
 [string]$OutputDirectory,
 [string]$ResourceArchive,
 [string]$Python='python',
 [string]$KeyDirectory=(Join-Path $env:USERPROFILE '.tauri/TennoLedger'),
 [switch]$SkipPrepare
)
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if(-not $env:VSCMD_VER){
 $rerun=@('-NoProfile','-File',$PSCommandPath)
 foreach($entry in $PSBoundParameters.GetEnumerator()){if($entry.Value -is [switch]){if($entry.Value){$rerun+=('-'+$entry.Key)}}else{$value=[string]$entry.Value;if($entry.Key -in @('ResourceArchive','NotesFile','OutputDirectory','KeyDirectory')){$value=[IO.Path]::GetFullPath($value)};$rerun+=@('-'+$entry.Key,$value)}}
 & pwsh -NoProfile -File (Join-Path $PSScriptRoot 'with-msvc.ps1') pwsh @rerun
 exit $LASTEXITCODE
}
$output=if($OutputDirectory){[IO.Path]::GetFullPath($OutputDirectory)}else{Join-Path $root "builds/updates/$Version"}
if(Test-Path -LiteralPath $output){throw "Preserve existing signed build: $output. Use -OutputDirectory for a fresh candidate."}
& node (Join-Path $PSScriptRoot 'set-version.mjs') $Version
if($LASTEXITCODE -ne 0){throw 'Version synchronization failed'}
if(-not $SkipPrepare){
 $prepare=@('-NoProfile','-File',(Join-Path $PSScriptRoot 'prepare-build.ps1'),'-Python',$Python)
 if($ResourceArchive){$prepare+=@('-ResourceArchive',$ResourceArchive)}
 & pwsh @prepare
 if($LASTEXITCODE -ne 0){throw 'Build preparation failed'}
}
if(-not(Test-Path -LiteralPath (Join-Path $root 'desktop/node_modules'))){
 Push-Location (Join-Path $root 'desktop');try{& npm ci;if($LASTEXITCODE -ne 0){throw 'npm ci failed'}}finally{Pop-Location}
}
$key=Join-Path $KeyDirectory 'updater.key'
$pubkey=(Get-Content -LiteralPath "$key.pub" -Raw).Trim()
$config=Get-Content -LiteralPath (Join-Path $root 'desktop/src-tauri/tauri.conf.json') -Raw|ConvertFrom-Json
if($config.plugins.updater.pubkey -ne $pubkey){throw 'Signing key does not match embedded public key; do not rotate it during release'}
if(-not $config.plugins.updater.endpoints.Count){throw 'Update endpoint is missing'}
$secure=Import-Clixml -LiteralPath (Join-Path $KeyDirectory 'password.dpapi.xml')
$password=[Net.NetworkCredential]::new('', $secure).Password
$oldKey=$env:TAURI_SIGNING_PRIVATE_KEY;$oldPassword=$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD
$oldProxy=$env:CARGO_HTTP_PROXY
$target=if($env:CARGO_TARGET_DIR){[IO.Path]::GetFullPath($env:CARGO_TARGET_DIR)}else{Join-Path $root 'desktop/src-tauri/target'}
try {
 $env:TAURI_SIGNING_PRIVATE_KEY=$key;$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD=$password;$env:CARGO_HTTP_PROXY=''
 Push-Location (Join-Path $root 'desktop')
 try{& npm run tauri build -- --features custom-protocol --bundles nsis --ci -- --locked;if($LASTEXITCODE -ne 0){throw 'Tauri signed NSIS build failed'}}finally{Pop-Location}
 $installer=Get-Item -LiteralPath (Join-Path $target "release/bundle/nsis/TennoLedger_${Version}_x64-setup.exe")
 $nsis=Get-Content -LiteralPath (Join-Path $target 'release/nsis/x64/installer.nsi') -Raw
 foreach($tool in Get-ChildItem -LiteralPath (Join-Path $root 'desktop/src-tauri/src/bin') -Filter '*.rs'){
  if($nsis -match ('File\s+/a\s+"/oname='+[regex]::Escape($tool.BaseName+'.exe')+'"')){throw "Diagnostic executable leaked into installer: $($tool.BaseName)"}
 }
 if(-not(Test-Path -LiteralPath ($installer.FullName+'.sig'))){throw 'Updater signature missing'}
 New-Item -ItemType Directory -Path $output|Out-Null
 Copy-Item -LiteralPath $installer.FullName,($installer.FullName+'.sig') -Destination $output
 New-Item -ItemType Directory -Path (Join-Path $output 'acceptance')|Out-Null
 Copy-Item -LiteralPath (Join-Path $target 'release/myframe-desktop.exe') -Destination (Join-Path $output 'acceptance/myframe-desktop.exe')
 # Tauri restores UNK after bundling; NSIS embeds NSS. Preserve the exact installed EXE for acceptance.
 & $Python -c 'from pathlib import Path; import sys; p=Path(sys.argv[1]); b=p.read_bytes(); old=b"__TAURI_BUNDLE_TYPE_VAR_UNK"; new=b"__TAURI_BUNDLE_TYPE_VAR_NSS"; assert b.count(old)==1, "Unexpected Tauri bundle marker"; p.write_bytes(b.replace(old,new))' (Join-Path $output 'acceptance/myframe-desktop.exe')
 if($LASTEXITCODE -ne 0){throw 'Installed binary acceptance baseline preparation failed'}
 $url="https://github.com/SevenThRe/TennoLedger-Releases/releases/download/v$Version/$($installer.Name)"
 $arguments=@((Join-Path $PSScriptRoot 'update-manifest.mjs'),$Version,$url,($installer.FullName+'.sig'),(Join-Path $output 'latest.json'))
 if($NotesFile){$arguments+=(Resolve-Path -LiteralPath $NotesFile).Path}
 & node @arguments
 if($LASTEXITCODE -ne 0){throw 'Update manifest generation failed'}
 $assets=@($installer.Name,($installer.Name+'.sig'),'latest.json')
 $resources=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'build-resources.json') -Raw|ConvertFrom-Json
 if($resources.version -eq $Version){
  $resource=if($ResourceArchive){(Resolve-Path -LiteralPath $ResourceArchive).Path}else{Join-Path $root "builds/dependencies/resources-$($resources.sha256).zip"}
  if((Get-FileHash -LiteralPath $resource -Algorithm SHA256).Hash.ToLowerInvariant() -ne $resources.sha256){throw 'Build resource archive mismatch'}
  $resourceName="TennoLedger_${Version}_build-resources.zip";Copy-Item -LiteralPath $resource -Destination (Join-Path $output $resourceName);$assets+=$resourceName
 }
 $lines=@($assets|ForEach-Object {"$((Get-FileHash -LiteralPath (Join-Path $output $_) -Algorithm SHA256).Hash.ToLowerInvariant())  $_"})
 [IO.File]::WriteAllText((Join-Path $output 'SHA256SUMS.txt'),($lines -join "`n")+"`n")
 & pwsh -NoProfile -File (Join-Path $PSScriptRoot 'verify-update.ps1') -Manifest (Join-Path $output 'latest.json')
 if($LASTEXITCODE -ne 0){throw 'Signed installer failed cryptographic verification'}
 Write-Output "Signed standalone installer and updater artifacts verified: $output"
} finally {$env:TAURI_SIGNING_PRIVATE_KEY=$oldKey;$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD=$oldPassword;$env:CARGO_HTTP_PROXY=$oldProxy;$password=$null}
