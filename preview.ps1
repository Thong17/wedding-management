# Builds the frontend, then serves the production build (with the service worker,
# so offline/PWA behaviour can be tested) alongside the Django backend.
# Frontend: http://localhost:4173  Backend: http://localhost:8000. Ctrl+C stops both.
$root = $PSScriptRoot
$python = Join-Path $root 'backend\.venv\Scripts\python.exe'
$frontend = Join-Path $root 'frontend'

if (-not (Test-Path $python)) {
    Write-Error "Backend venv not found at $python - see README 'Run it'."
    exit 1
}
if (-not (Test-Path (Join-Path $frontend 'node_modules'))) {
    Write-Host 'Installing frontend dependencies...'
    npm --prefix $frontend install
}

Push-Location $frontend
try {
    Write-Host 'Building frontend...'
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Error 'Frontend build failed; not starting preview.'
        exit 1
    }
}
finally {
    Pop-Location
}

$backend = Start-Process -FilePath $python -ArgumentList 'manage.py', 'runserver' `
    -WorkingDirectory (Join-Path $root 'backend') -NoNewWindow -PassThru

try {
    Push-Location $frontend
    npm run preview
}
finally {
    Pop-Location
    if (-not $backend.HasExited) {
        # runserver spawns a reloader child process, so kill the whole tree
        taskkill /PID $backend.Id /T /F | Out-Null
    }
    Write-Host 'Backend stopped.'
}
