# Runs the Quick Dial NG benchmark in a throwaway headless Firefox profile and prints the results.
# Usage: pwsh -File test\bench\run.ps1 [-Format ng|orig] [-Src <dir>]
#   ng   = this repo's src (per-tile image keys)
#   orig = the original Quick Dial code (git b1f76da, images inline in one record)
param([ValidateSet('ng','orig')][string]$Format = 'ng', [string]$Src,
      [string]$Tools = 'C:\Data\PortableUtils\QuickDialNG', [string]$Node = 'C:\Data\PortableUtils\NodeJS',
      [string]$Firefox = 'C:\Program Files\Mozilla Firefox\firefox.exe', [int]$TimeoutSec = 150)
$ErrorActionPreference = 'Stop'
$env:PATH = "$Node;$env:PATH"
$repo = (Resolve-Path "$PSScriptRoot\..\..").Path
$work = Join-Path $env:TEMP "qdbench-$Format"
if (-not $Src) {
  if ($Format -eq 'orig') {
    $up = Join-Path $env:TEMP 'qdbench-upstream'; Remove-Item $up -Recurse -Force -ErrorAction SilentlyContinue; New-Item -ItemType Directory $up | Out-Null
    git -C $repo archive b1f76da src | tar -x -C $up
    $Src = Join-Path $up 'src'
  } else { $Src = Join-Path $repo 'src' }
}
node "$PSScriptRoot\build.js" $Src "$work\ext" $Format
if ($LASTEXITCODE -ne 0) { throw "bench build failed" }
$log = "$work\run.log"
$out = Join-Path (New-Object -ComObject Shell.Application).NameSpace('shell:Downloads').Self.Path 'qdbench' # Firefox's download folder
Remove-Item $out -Recurse -Force -ErrorAction SilentlyContinue; New-Item -ItemType Directory $out | Out-Null
$p = Start-Process -FilePath "$Tools\node_modules\.bin\web-ext.cmd" -PassThru -WindowStyle Hidden -RedirectStandardOutput $log -RedirectStandardError "$work\err.log" -ArgumentList @(
  'run', '--source-dir', "`"$work\ext`"", '--firefox', "`"$Firefox`"", '--no-reload', '--no-input', '--verbose', '--arg=-headless',
  '--pref', 'browser.dom.window.dump.enabled=true', '--pref', 'devtools.console.stdout.chrome=true', '--pref', 'devtools.console.stdout.content=true',
  '--pref', 'browser.download.useDownloadDir=true',
  '--pref', 'browser.download.always_ask_before_handling_new_types=false', '--pref', 'browser.download.alwaysOpenPanel=false',
  '--pref', 'browser.shell.checkDefaultBrowser=false', '--pref', 'browser.startup.homepage_override.mstone=ignore')
$deadline = (Get-Date).AddSeconds($TimeoutSec)
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Seconds 2
  if (Get-ChildItem $out -Filter 'qdbench-*.txt' | Select-String -Pattern 'QDBENCH \{"done":true\}' -Quiet) { break }
}
# Stop only the bench Firefox (temporary profile under %TEMP%) and its web-ext; the everyday Firefox is left alone
Get-CimInstance Win32_Process -Filter "Name='firefox.exe'" | Where-Object { $_.CommandLine -match '-profile' -and $_.CommandLine -match [regex]::Escape($env:TEMP) } | ForEach-Object { taskkill /T /F /PID $_.ProcessId | Out-Null }
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'web-ext' -and $_.CommandLine -match 'qdbench' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
$lines = Get-ChildItem $out -Filter 'qdbench-*.txt' | Sort-Object Name | Select-String -Pattern 'QDBENCH (\{.*\})' -AllMatches | ForEach-Object { $_.Matches[0].Groups[1].Value } | Select-Object -Unique
Remove-Item $out -Recurse -Force -ErrorAction SilentlyContinue
if (-not $lines) { Write-Host "No results; see $log"; exit 1 }
$lines
