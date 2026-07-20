# Runs the PN Key backend locally and exposes it publicly via a free
# Cloudflare quick tunnel. Re-run this any time you reboot or the previous
# tunnel dies — the public URL changes each time, so copy the new one into
# the "Backend unreachable" box at https://pnkey.chitemere.co.zw when it's
# printed below.
#
# One-time setup (if .venv doesn't exist yet):
#   py -3.13 -m venv .venv
#   .venv\Scripts\python.exe -m pip install --upgrade pip
#   .venv\Scripts\python.exe -m pip install numpy librosa soundfile fastapi uvicorn python-multipart demucs
#   .venv\Scripts\python.exe -m pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu
# Also needs `ffmpeg` and `cloudflared` on PATH (winget install Gyan.FFmpeg / Cloudflare.cloudflared).

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

function Resolve-Tool($name, $fallbackPath) {
    $cmd = Get-Command $name -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    if (Test-Path $fallbackPath) { return $fallbackPath }
    throw "$name not found on PATH and fallback path '$fallbackPath' doesn't exist either. Install it first."
}

$Cloudflared = Resolve-Tool "cloudflared" "C:\Program Files (x86)\cloudflared\cloudflared.exe"

if (-not (Test-Path "$ScriptDir\.venv\Scripts\python.exe")) {
    Write-Host "No .venv found - see the setup steps at the top of this script." -ForegroundColor Yellow
    exit 1
}

$env:STORAGE_DIR = "$ScriptDir\.jobs"
$env:ALLOWED_ORIGINS = "https://pnkey.chitemere.co.zw"

Write-Host "Starting PN Key backend on http://127.0.0.1:8000 ..."
$backendLog = "$ScriptDir\.backend.log"
$backend = Start-Process -FilePath "$ScriptDir\.venv\Scripts\python.exe" `
    -ArgumentList "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000" `
    -PassThru -NoNewWindow -RedirectStandardOutput $backendLog -RedirectStandardError "$ScriptDir\.backend.err.log"

Start-Sleep -Seconds 3

$tunnelLog = "$ScriptDir\.tunnel.log"
$publicUrl = $null
$tunnel = $null

# Cloudflare's quick-tunnel request endpoint is flaky (transient "error code:
# 1101" failures) - retry a handful of times rather than giving up.
for ($attempt = 1; $attempt -le 5 -and -not $publicUrl; $attempt++) {
    Write-Host "Starting Cloudflare tunnel (attempt $attempt)..."
    Remove-Item $tunnelLog -ErrorAction SilentlyContinue
    if ($tunnel) { Stop-Process -Id $tunnel.Id -ErrorAction SilentlyContinue }
    $tunnel = Start-Process -FilePath $Cloudflared -ArgumentList "tunnel", "--url", "http://127.0.0.1:8000" `
        -PassThru -NoNewWindow -RedirectStandardError $tunnelLog

    for ($i = 0; $i -lt 12; $i++) {
        Start-Sleep -Seconds 1
        if (-not (Test-Path $tunnelLog)) { continue }
        $match = Select-String -Path $tunnelLog -Pattern "https://[a-z0-9-]+\.trycloudflare\.com" | Select-Object -First 1
        if ($match) {
            $publicUrl = $match.Matches[0].Value
            break
        }
        if (Select-String -Path $tunnelLog -Pattern "error code: 1101|failed to unmarshal" -Quiet) {
            break
        }
    }
}

if ($publicUrl) {
    Write-Host ""
    Write-Host "=================================================================="
    Write-Host " PN Key backend is live at:"
    Write-Host " $publicUrl"
    Write-Host ""
    Write-Host " Paste this into the 'Backend unreachable' box at:"
    Write-Host " https://pnkey.chitemere.co.zw"
    Write-Host "=================================================================="
} else {
    Write-Host "Could not detect the tunnel URL - check $tunnelLog" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Backend + tunnel are running. Press Ctrl+C to stop both."

try {
    Wait-Process -Id $backend.Id
} finally {
    Stop-Process -Id $tunnel.Id -ErrorAction SilentlyContinue
    Stop-Process -Id $backend.Id -ErrorAction SilentlyContinue
}
