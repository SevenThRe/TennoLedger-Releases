param([string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
$source = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../desktop/src-tauri/notification-host'))
if (-not $OutputDirectory) { $OutputDirectory = $source }
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$kits = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits/10/References'
$sdk = Get-ChildItem -LiteralPath $kits -Directory | Where-Object { Test-Path (Join-Path $_.FullName 'Windows.Foundation.UniversalApiContract') } | Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1
if (-not $sdk) { throw 'Windows SDK reference contracts are required to build the notification host.' }
$refs = @('/reference:System.Web.Extensions.dll', '/reference:System.Windows.Forms.dll')
$refs += '/reference:' + (Join-Path $source 'Microsoft.Toolkit.Uwp.Notifications.dll')
$refs += '/reference:' + (Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/System.Runtime.WindowsRuntime.dll')
$refs += '/reference:' + (Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/System.Runtime.InteropServices.WindowsRuntime.dll')
$refs += '/reference:' + (Join-Path ${env:ProgramFiles(x86)} 'Reference Assemblies/Microsoft/Framework/.NETFramework/v4.8/Facades/System.Runtime.dll')
foreach ($contract in @('Windows.Foundation.FoundationContract','Windows.Foundation.UniversalApiContract')) {
    $file = Get-ChildItem -LiteralPath (Join-Path $sdk.FullName $contract) -Recurse -Filter '*.winmd' | Sort-Object FullName -Descending | Select-Object -First 1
    $refs += '/reference:' + $file.FullName
}
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
& $compiler /nologo /target:exe /platform:x64 /nowarn:1701 ('/out:' + (Join-Path $OutputDirectory 'MyFrame.Notifications.exe')) @refs (Join-Path $source 'Program.cs')
if ($LASTEXITCODE -ne 0) { throw "Notification host compiler failed: $LASTEXITCODE" }
