#requires -Version 5.1
<#
    tauri-measure.ps1

    Numbers for the keep-or-discard verdict: binary size, time to a visible
    window, and idle memory across the whole process tree.

    Run from the worktree root, after `bun tauri build`:
        powershell -ExecutionPolicy Bypass -File .\tauri-measure.ps1

    Throwaway helper - delete it once the verdict is written.
#>

$ErrorActionPreference = 'Stop'

$exe = Join-Path $PSScriptRoot 'src-tauri\target\release\momentum.exe'
$installer = Join-Path $PSScriptRoot 'src-tauri\target\release\bundle\nsis'

if (-not (Test-Path $exe)) {
    Write-Host "No release build found. Run: bun tauri build" -ForegroundColor Red
    exit 1
}

function MB ($bytes) { [math]::Round($bytes / 1MB, 2) }

Write-Host ""
Write-Host "=== Size ===" -ForegroundColor Cyan
Write-Host ("  binary       {0} MB" -f (MB (Get-Item $exe).Length))
Get-ChildItem "$installer\*.exe" -ErrorAction SilentlyContinue | ForEach-Object {
    Write-Host ("  installer    {0} MB  ({1})" -f (MB $_.Length), $_.Name)
}

# ------------------------------------------------------------- cold start --
# Time from process start to a window handle existing. Not the same as "usable"
# — the webview still has to paint — but it is reproducible, which matters more
# than being flattering.

Write-Host ""
Write-Host "=== Time to window ===" -ForegroundColor Cyan

$runs = @()
foreach ($attempt in 1..3) {
    Get-Process momentum -ErrorAction SilentlyContinue | Stop-Process -Force
    Start-Sleep -Milliseconds 800

    $watch = [System.Diagnostics.Stopwatch]::StartNew()
    $proc = Start-Process $exe -PassThru

    while ($true) {
        Start-Sleep -Milliseconds 15
        $proc.Refresh()
        if ($proc.HasExited) { break }
        if ($proc.MainWindowHandle -ne 0) { break }
        if ($watch.ElapsedMilliseconds -gt 30000) { break }
    }

    $watch.Stop()
    $runs += $watch.ElapsedMilliseconds
    Write-Host ("  run {0}        {1} ms" -f $attempt, $watch.ElapsedMilliseconds)
    Start-Sleep -Seconds 2
}

$median = ($runs | Sort-Object)[1]
Write-Host ("  median       {0} ms" -f $median) -ForegroundColor Green
Write-Host "  (first run is the cold one; later runs read from the file cache)" -ForegroundColor Gray

# ----------------------------------------------------------- idle memory --
# Let it settle before reading. A webview allocates aggressively for the first
# few seconds and a number taken too early flatters the shell.

Write-Host ""
Write-Host "=== Idle memory ===" -ForegroundColor Cyan
Write-Host "  settling for 20s, leave the window alone..." -ForegroundColor Gray
Start-Sleep -Seconds 20

# Only *this app's* processes. Naming the executables instead would sweep up
# every other WebView2 host on the machine — Widgets, Teams, Outlook — and
# hand back a number several hundred MB too large.

$root = Get-Process momentum -ErrorAction SilentlyContinue
if (-not $root) {
    Write-Host "  app is not running" -ForegroundColor Red
} else {
    $all = Get-CimInstance Win32_Process |
        Select-Object ProcessId, ParentProcessId, Name, WorkingSetSize

    $tree = @()
    $frontier = @($root.Id)
    while ($frontier.Count -gt 0) {
        $current = $all | Where-Object { $frontier -contains $_.ProcessId }
        $tree += $current
        $frontier = @($all |
            Where-Object { $frontier -contains $_.ParentProcessId } |
            Select-Object -ExpandProperty ProcessId)
        # Guard against a PID that has been recycled into a cycle.
        $frontier = @($frontier | Where-Object { $tree.ProcessId -notcontains $_ })
    }

    $total = ($tree | Measure-Object WorkingSetSize -Sum).Sum
    foreach ($group in $tree | Group-Object Name) {
        $sum = ($group.Group | Measure-Object WorkingSetSize -Sum).Sum
        Write-Host ("  {0,-20} {1,7} MB  ({2} process(es))" -f $group.Name, (MB $sum), $group.Count)
    }
    Write-Host ("  {0,-20} {1,7} MB" -f 'total', (MB $total)) -ForegroundColor Green
}

Write-Host ""
Write-Host "For the comparison, measure Zen the same way:" -ForegroundColor Cyan
Write-Host '  1. close the shell, note Zen total with the Momentum tab CLOSED' -ForegroundColor Gray
Write-Host '  2. open the app in a tab, wait 20s, note Zen total again' -ForegroundColor Gray
Write-Host '  the difference is what the tab actually costs you:' -ForegroundColor Gray
Write-Host '    Get-Process zen* | Measure-Object WorkingSet64 -Sum |' -ForegroundColor Gray
Write-Host '      ForEach-Object { [math]::Round($_.Sum / 1MB, 2) }' -ForegroundColor Gray
Write-Host ""
