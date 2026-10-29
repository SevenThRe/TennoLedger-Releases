param(
 [Parameter(Mandatory=$true)][ValidatePattern('^\d+\.\d+\.\d+$')][string]$Version,
 [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{40}$')][string]$SourceCommit,
 [string]$Directory,
 [switch]$Publish
)
$ErrorActionPreference='Stop'
if(-not $env:VSCMD_VER){
 $rerun=@('-NoProfile','-File',$PSCommandPath,'-Version',$Version,'-SourceCommit',$SourceCommit)
 if($Directory){$rerun+=@('-Directory',[IO.Path]::GetFullPath($Directory))}
 if($Publish){$rerun+='-Publish'}
 & pwsh -NoProfile -File (Join-Path $PSScriptRoot 'with-msvc.ps1') pwsh @rerun
 exit $LASTEXITCODE
}
$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$folder=if($Directory){(Resolve-Path -LiteralPath $Directory).Path}else{Join-Path $root "builds/updates/$Version"}
$manifest=Join-Path $folder 'latest.json';$value=Get-Content -LiteralPath $manifest -Raw|ConvertFrom-Json
$repo='SevenThRe/TennoLedger-Releases';$name="TennoLedger_${Version}_x64-setup.exe"
$expected="https://github.com/$repo/releases/download/v$Version/$name"
if($value.version -ne $Version -or $value.platforms.'windows-x86_64'.url -ne $expected){throw 'Manifest version/destination mismatch'}
$sig=(Get-Content -LiteralPath (Join-Path $folder "$name.sig") -Raw).Trim()
if($sig -ne $value.platforms.'windows-x86_64'.signature){throw 'Manifest and signature sidecar differ'}
$allowed=@($name,"$name.sig",'latest.json','incremental.json','incremental.json.sig','incremental.bin',"TennoLedger_${Version}_build-resources.zip")
$files=@();foreach($line in Get-Content -LiteralPath (Join-Path $folder 'SHA256SUMS.txt')){
 if($line -notmatch '^([a-f0-9]{64})  ([A-Za-z0-9_.-]+)$'){throw 'Invalid checksum entry'}
 $hash=$matches[1];$file=$matches[2]
 if($file -notin $allowed -or $file -in $files){throw 'Unexpected or duplicate release asset'}
 if((Get-FileHash -LiteralPath (Join-Path $folder $file) -Algorithm SHA256).Hash.ToLowerInvariant() -ne $hash){throw "Candidate changed: $file"};$files+=$file
}
foreach($required in @($name,"$name.sig",'latest.json','incremental.json','incremental.json.sig','incremental.bin')){if($required -notin $files){throw "Missing release asset: $required"}}
& pwsh -NoProfile -File (Join-Path $PSScriptRoot 'verify-update.ps1') -Manifest $manifest
if($LASTEXITCODE -ne 0){throw 'Candidate signature verification failed'}
$remoteCommit=& gh api "repos/$repo/commits/$SourceCommit" --jq '.sha'
if($LASTEXITCODE -ne 0 -or $remoteCommit -ne $SourceCommit){throw 'Push the reviewed source commit before creating its release'}
$notes=Join-Path $folder 'release-notes.md';[IO.File]::WriteAllText($notes,[string]$value.notes)
$assets=@($files|ForEach-Object {Join-Path $folder $_})+(Join-Path $folder 'SHA256SUMS.txt')
& gh release create "v$Version" @assets --repo $repo --target $SourceCommit --draft --title "TennoLedger $Version" --notes-file $notes
if($LASTEXITCODE -ne 0){throw 'Draft creation failed; inspect existing tag/draft before retrying. Assets are never overwritten.'}
if($Publish){& gh release edit "v$Version" --repo $repo --draft=false --latest;if($LASTEXITCODE -ne 0){throw 'Publish failed; validated draft retained'}}else{Write-Output 'Verified draft uploaded; updater endpoint is unchanged until publication.'}
