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
$config = Get-Content -LiteralPath (Join-Path $source '../tauri.conf.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$brand = $config.app.windows[0].title
if (-not $brand) { $brand = $config.productName }
$brandLiteral = ConvertTo-Json -InputObject ([string]$brand) -Compress
$brandingFile = Join-Path $OutputDirectory 'NotificationBranding.cs'
[IO.File]::WriteAllText($brandingFile, "using System.Reflection;`n[assembly: AssemblyTitle($brandLiteral)]`n[assembly: AssemblyProduct($brandLiteral)]`n", (New-Object Text.UTF8Encoding($false)))
& $compiler /nologo /target:exe /platform:x64 /nowarn:1701 ('/win32icon:' + (Join-Path $source '../icons/tenno-ledger.ico')) ('/out:' + (Join-Path $OutputDirectory 'TennoLedger.Notifications.exe')) @refs $brandingFile (Join-Path $source 'Program.cs')
if ($LASTEXITCODE -ne 0) { throw "Notification host compiler failed: $LASTEXITCODE" }
