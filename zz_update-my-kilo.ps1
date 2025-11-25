# =============================================================================
# update-my-kilo.ps1 — One-click update script for your personal Kilo fork
# Works on Windows + PowerShell 5.1 or newer (default on Windows 10/11)
# =============================================================================

# Config — change only if you renamed your branches
$MirrorBranch = "upstream-mirror"
$MyBranch     = "my-kilo"

# Colors for pretty output
function Green  { Write-Host $_ -ForegroundColor Green }
function Yellow { Write-Host $_ -ForegroundColor Yellow }
function Red    { Write-Host $_ -ForegroundColor Red }

# 1. Fetch latest official code
Write-Host "=========================`n" -ForegroundColor Cyan
Write-Host "=== Fetching upstream ===`n" -ForegroundColor Cyan
Write-Host "=========================`n" -ForegroundColor Cyan
git fetch upstream
if ($LASTEXITCODE -ne 0) { Red "Failed to fetch upstream!"; exit 1 }


# 2. Update mirror branch
Write-Host "================================`n" -ForegroundColor Cyan
Write-Host "=== Updating upstream-mirror ===`n" -ForegroundColor Cyan
Write-Host "================================`n" -ForegroundColor Cyan
git checkout $MirrorBranch 2>$null
if ($LASTEXITCODE -ne 0) { Red "Mirror branch '$MirrorBranch' not found!"; exit 1 }
git reset --hard upstream/main
git push origin $MirrorBranch --force-with-lease


# 3. Switch to your personal branch and merge
Write-Host "====================================`n" -ForegroundColor Cyan
Write-Host "=== Merging updates into my-kilo ===`n" -ForegroundColor Cyan
Write-Host "====================================`n" -ForegroundColor Cyan
git checkout $MyBranch
git merge $MirrorBranch --no-ff
if ($LASTEXITCODE -ne 0) {
    Red "`nCONFLICTS DETECTED!"
    Yellow "Open VS Code now to fix them, then run these two commands manually:"
    Yellow "    git add ."
    Yellow "    git commit"
    Yellow "After that, run the rest of the script again or continue below."
    code .
    pause
    exit 1
}


# 4. Install/update dependencies (only if lockfile changed)
Write-Host "====================`n" -ForegroundColor Cyan
Write-Host "=== pnpm install ===`n" -ForegroundColor Cyan
Write-Host "====================`n" -ForegroundColor Cyan
pnpm install


# 5. Build the new VSIX
Write-Host "==================`n" -ForegroundColor Cyan
Write-Host "=== pnpm build ===`n" -ForegroundColor Cyan
Write-Host "==================`n" -ForegroundColor Cyan
pnpm build


# 6. Find the newest VSIX and install it automatically into VS Code
Write-Host "=============================`n" -ForegroundColor Cyan
Write-Host "=== Installing extensions ===`n" -ForegroundColor Cyan
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

# 7. Push your updated personal branch (backup)
Write-Host "==========================`n" -ForegroundColor Cyan
Write-Host "=== Pushing to my-kilo ===`n" -ForegroundColor Cyan
Write-Host "==========================`n" -ForegroundColor Cyan
git push origin $MyBranch

Write-Host "============`n" -ForegroundColor Cyan
Write-Host "=== DONE ===`n" -ForegroundColor Cyan
Write-Host "============`n" -ForegroundColor Cyan
pause