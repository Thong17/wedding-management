# Starts the Django backend and the Vite frontend together. Ctrl+C stops both.
$root = $PSScriptRoot
$python = Join-Path $root 'backend\.venv\Scripts\python.exe'

if (-not (Test-Path $python)) {
    Write-Error "Backend venv not found at $python - see README 'Run it'."
    exit 1
}
if (-not (Test-Path (Join-Path $root 'frontend\node_modules'))) {
    Write-Host 'Installing frontend dependencies...'
    npm --prefix (Join-Path $root 'frontend') install
}

$backend = Start-Process -FilePath $python -ArgumentList 'manage.py', 'runserver' `
    -WorkingDirectory (Join-Path $root 'backend') -NoNewWindow -PassThru

try {
    Push-Location (Join-Path $root 'frontend')
    npm run dev
}
finally {
    Pop-Location
    if (-not $backend.HasExited) {
        # runserver spawns a reloader child process, so kill the whole tree
        taskkill /PID $backend.Id /T /F | Out-Null
    }
    Write-Host 'Backend stopped.'
}
