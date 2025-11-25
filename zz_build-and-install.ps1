# =============================================================================
# update-my-kilo.ps1 — One-click update script for your personal Kilo fork
# Works on Windows + PowerShell 5.1 or newer (default on Windows 10/11)
# ========================

function Green  { Write-Host $_ -ForegroundColor Green }
function Yellow { Write-Host $_ -ForegroundColor Yellow }
function Red    { Write-Host $_ -ForegroundColor Red }

# 1. Build the new VSIX
Write-Host "==================" -ForegroundColor Cyan
Write-Host "=== pnpm build ===" -ForegroundColor Cyan
Write-Host "==================`n" -ForegroundColor Cyan
pnpm build


# 2. Find the newest VSIX and install it automatically into VS Code
Write-Host "=============================" -ForegroundColor Cyan
Write-Host "=== Installing extensions ===" -ForegroundColor Cyan
Write-Host "=============================`n" -ForegroundColor Cyan
$vsix = Get-ChildItem "bin\*.vsix" | Sort-Object Name -Descending | Select-Object -First 1
if (!$vsix) {
    Red "No VSIX found in bin/ folder!"
    exit 1
}
code --install-extension $vsix.FullName
if ($LASTEXITCODE -eq 0) {
    Green "`nSUCCESS! Your personal Kilo is now up-to-date and installed."
    Write-Host "Version:" (Get-Content package.json | ConvertFrom-Json).version -ForegroundColor Magenta
} else {
    Red "VS Code failed to install the extension (is VS Code running?)"
}

Write-Host "============" -ForegroundColor Green
Write-Host "=== DONE ===" -ForegroundColor Green
Write-Host "============`n" -ForegroundColor Green
pause