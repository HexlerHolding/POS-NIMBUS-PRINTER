@echo off
setlocal

:: ── Self-elevate if not admin ─────────────────────────────────────────────────
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Requesting administrator privileges...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

:: ── Extract everything after #==PS_START== and run as PowerShell ────────────────
:: Path passed via env var to avoid quoting issues with apostrophes in usernames
set "NIMBUS_BAT=%~f0"
powershell -ExecutionPolicy Bypass -Command "$t=[IO.Path]::Combine($env:TEMP,'nimbus_install.ps1');$m=$false;$l=New-Object Collections.Generic.List[string];foreach($x in [IO.File]::ReadAllLines($env:NIMBUS_BAT,[Text.Encoding]::UTF8)){if($m){$l.Add($x)}elseif($x -eq '#==PS_START=='){$m=$true}};[IO.File]::WriteAllLines($t,$l,[Text.Encoding]::UTF8);& $t;Remove-Item $t -Force -ErrorAction SilentlyContinue"

exit /b

#==PS_START==
# =============================================================================
#  Nimbus Printer Service - Installer
#  Do not run this file directly. Double-click install.bat instead.
# =============================================================================

$ErrorActionPreference = "Stop"

$REPO_URL     = "https://github.com/HexlerHolding/POS-NIMBUS-PRINTER.git"
$INSTALL_DIR  = "C:\NimbusPrinter"
$SERVICE_NAME = "NimbusPrinterService"
$NSSM_DIR     = "C:\nssm"
$NSSM_ZIP_URL = "https://nssm.cc/release/nssm-2.24.zip"

# ── Helpers ───────────────────────────────────────────────────────────────────

function Write-Step { param($msg) Write-Host "`n[*] $msg" -ForegroundColor Cyan }
function Write-OK   { param($msg) Write-Host "    [OK] $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "    [!] $msg" -ForegroundColor Yellow }
function Write-Fail {
    param($msg)
    Write-Host "`n[ERROR] $msg" -ForegroundColor Red
    Write-Host "`nPress any key to exit..." -ForegroundColor DarkGray
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}

function Update-SessionPath {
    $machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath    = [System.Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path    = "$machinePath;$userPath"
}

function Install-WithWinget {
    param([string]$PackageId, [string]$FriendlyName)
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        Write-Fail "winget is not available. Install $FriendlyName manually and re-run this script."
    }
    Write-Warn "Installing $FriendlyName via winget..."
    winget install --id $PackageId --exact --silent --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) { Write-Fail "winget failed to install $FriendlyName (exit $LASTEXITCODE)." }
    Write-OK "$FriendlyName installed."
    Update-SessionPath
}

# ── Admin guard ───────────────────────────────────────────────────────────────

$currentPrincipal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Fail "This script must be run as Administrator.`n        Close this window and double-click install.bat instead."
}

# ── 1. Node.js ────────────────────────────────────────────────────────────────

Write-Step "Checking Node.js..."

try { $nodeVersion = node --version 2>$null } catch { $nodeVersion = $null }
if (-not $nodeVersion) {
    Write-Warn "Node.js not found — installing automatically..."
    Install-WithWinget "OpenJS.NodeJS.LTS" "Node.js LTS"
    try { $nodeVersion = node --version 2>$null } catch { $nodeVersion = $null }
    if (-not $nodeVersion) { Write-Fail "Node.js installed but 'node' not in PATH. Re-run this script." }
}

$major = [int]($nodeVersion.TrimStart('v').Split('.')[0])
if ($major -lt 16) {
    Write-Warn "Node.js $nodeVersion is too old (v16+ required) — upgrading..."
    Install-WithWinget "OpenJS.NodeJS.LTS" "Node.js LTS"
    try { $nodeVersion = node --version 2>$null } catch { $nodeVersion = $null }
    $major = [int]($nodeVersion.TrimStart('v').Split('.')[0])
    if ($major -lt 16) { Write-Fail "Node.js upgrade did not take effect. Re-run this script." }
}

Write-OK "Node.js $nodeVersion ready."

# ── 2. Git ────────────────────────────────────────────────────────────────────

Write-Step "Checking Git..."

try { $gitVersion = git --version 2>$null } catch { $gitVersion = $null }
if (-not $gitVersion) {
    Write-Warn "Git not found — installing automatically..."
    Install-WithWinget "Git.Git" "Git"
    try { $gitVersion = git --version 2>$null } catch { $gitVersion = $null }
    if (-not $gitVersion) { Write-Fail "Git installed but 'git' not in PATH. Re-run this script." }
}

Write-OK "$gitVersion ready."

# ── 3. NSSM ───────────────────────────────────────────────────────────────────

Write-Step "Checking NSSM..."

$nssmCmd = Get-Command nssm -ErrorAction SilentlyContinue
$nssmExe = if ($nssmCmd) { $nssmCmd.Source } else { $null }

if (-not $nssmExe) {
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        Write-Warn "Trying to install NSSM via winget..."
        winget install --id NSSM.NSSM --exact --silent --accept-package-agreements --accept-source-agreements 2>$null
        if ($LASTEXITCODE -eq 0) {
            Update-SessionPath
            $nssmCmd = Get-Command nssm -ErrorAction SilentlyContinue
            $nssmExe = if ($nssmCmd) { $nssmCmd.Source } else { $null }
        }
    }

    if (-not $nssmExe) {
        Write-Warn "Downloading NSSM directly..."
        $zipPath    = "$env:TEMP\nssm.zip"
        $extractDir = "$env:TEMP\nssm_extract"

        Invoke-WebRequest -Uri $NSSM_ZIP_URL -OutFile $zipPath -UseBasicParsing
        Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force

        $nssmBin = Get-ChildItem $extractDir -Recurse -Filter "nssm.exe" |
                   Where-Object { $_.DirectoryName -match "win64" } |
                   Select-Object -First 1
        if (-not $nssmBin) {
            $nssmBin = Get-ChildItem $extractDir -Recurse -Filter "nssm.exe" | Select-Object -First 1
        }
        if (-not $nssmBin) { Write-Fail "Could not find nssm.exe in the downloaded archive." }

        New-Item -ItemType Directory -Force -Path $NSSM_DIR | Out-Null
        Copy-Item $nssmBin.FullName "$NSSM_DIR\nssm.exe" -Force

        $machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
        if ($machinePath -notlike "*$NSSM_DIR*") {
            [System.Environment]::SetEnvironmentVariable("Path", "$machinePath;$NSSM_DIR", "Machine")
        }
        Update-SessionPath

        $nssmExe = "$NSSM_DIR\nssm.exe"
        Remove-Item $zipPath    -Force -ErrorAction SilentlyContinue
        Remove-Item $extractDir -Recurse -Force -ErrorAction SilentlyContinue
    }

    if (-not $nssmExe -or -not (Test-Path $nssmExe)) {
        Write-Fail "Could not install NSSM. Install it manually from https://nssm.cc and re-run."
    }

    Write-OK "NSSM installed."
} else {
    Write-OK "NSSM found at $nssmExe."
}

# ── 4. Clone / update repo ────────────────────────────────────────────────────

Write-Step "Setting up repository at $INSTALL_DIR..."

if (Test-Path "$INSTALL_DIR\.git") {
    Write-Host "    Repository already exists — pulling latest changes..."
    git -C $INSTALL_DIR pull
    Write-OK "Repository updated."
} else {
    if (Test-Path $INSTALL_DIR) {
        Write-Host "    Directory exists but is not a git repo — removing and re-cloning..."
        Remove-Item -Recurse -Force $INSTALL_DIR
    }
    git clone $REPO_URL $INSTALL_DIR
    Write-OK "Repository cloned."
}

# ── 5. Install npm dependencies ───────────────────────────────────────────────

Write-Step "Installing Node.js dependencies..."
Set-Location $INSTALL_DIR
npm install --omit=dev
if ($LASTEXITCODE -ne 0) { Write-Fail "npm install failed." }
Write-OK "Dependencies installed."

# ── 6. Configure .env ─────────────────────────────────────────────────────────

Write-Step "Configuring environment..."

if (-not (Test-Path "$INSTALL_DIR\.env")) {
    if (Test-Path "$INSTALL_DIR\.env.example") {
        Copy-Item "$INSTALL_DIR\.env.example" "$INSTALL_DIR\.env"
        Write-OK ".env created from .env.example."
        Write-Warn "Edit $INSTALL_DIR\.env to customise port, business info, and logo path."
    } else {
        Write-Warn "No .env.example found — skipping."
    }
} else {
    Write-OK ".env already exists — skipping."
}

# ── 7. Prompt for Windows password (needed for service logon) ─────────────────

Write-Step "Service account setup..."

$currentUser = "$env:USERDOMAIN\$env:USERNAME"
Write-Host "    The service will run as: $currentUser" -ForegroundColor Cyan
Write-Host "    Windows requires your password to register the service logon account." -ForegroundColor Cyan
Write-Host "    It is passed directly to the Service Control Manager and not stored by this script." -ForegroundColor Cyan

$credential = Get-Credential -UserName $currentUser -Message "Enter your Windows login password for '$currentUser' (leave blank if your account has no password)"
if (-not $credential) { Write-Fail "No credentials provided. Installation cancelled." }

$plainPass = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
                 [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($credential.Password))

if ([string]::IsNullOrEmpty($plainPass)) {
    Write-Warn "No password entered — service will run as LocalSystem (full system privileges, recommended for passwordless accounts)."
    $runAsLocalSystem = $true
} else {
    $runAsLocalSystem = $false
    Write-OK "Credentials captured."
}

# ── 8. Register Windows Service via NSSM ─────────────────────────────────────

Write-Step "Registering '$SERVICE_NAME' as a Windows Service..."

$existingSvc = Get-Service -Name $SERVICE_NAME -ErrorAction SilentlyContinue
if ($existingSvc) {
    Write-Host "    Existing service found — removing..."
    if ($existingSvc.Status -eq "Running") {
        & $nssmExe stop $SERVICE_NAME confirm 2>$null | Out-Null
        Start-Sleep -Seconds 2
    }
    & $nssmExe remove $SERVICE_NAME confirm | Out-Null
    Start-Sleep -Seconds 2
}

$nodeExe = (Get-Command node).Source

& $nssmExe install $SERVICE_NAME $nodeExe "`"$INSTALL_DIR\server.js`""
& $nssmExe set $SERVICE_NAME AppDirectory    $INSTALL_DIR
if ($runAsLocalSystem) {
    & $nssmExe set $SERVICE_NAME ObjectName LocalSystem
} else {
    & $nssmExe set $SERVICE_NAME ObjectName $currentUser $plainPass
}
& $nssmExe set $SERVICE_NAME Start           SERVICE_AUTO_START
& $nssmExe set $SERVICE_NAME AppRestartDelay 5000
& $nssmExe set $SERVICE_NAME AppThrottle     10000
& $nssmExe set $SERVICE_NAME AppExit         Default Restart
& $nssmExe set $SERVICE_NAME DisplayName     "Nimbus Printer Service"
& $nssmExe set $SERVICE_NAME Description     "Nimbus PDF Printer microservice — managed by NSSM"

if (-not $runAsLocalSystem) { $plainPass = $null; [System.GC]::Collect() }

Write-OK "Service registered."

# ── 9. Start the service ──────────────────────────────────────────────────────

Write-Step "Starting service..."

& $nssmExe start $SERVICE_NAME
Start-Sleep -Seconds 4

$svc = Get-Service -Name $SERVICE_NAME -ErrorAction SilentlyContinue
if ($svc -and $svc.Status -eq "Running") {
    Write-OK "Service is running!"
} else {
    Write-Warn "Service did not reach 'Running' state within 4s."
    Write-Warn "Check status with:  nssm status $SERVICE_NAME"
    Write-Warn "Check logs with:    Get-EventLog -LogName Application -Source $SERVICE_NAME -Newest 10"
}

# ── Done ──────────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "================================================" -ForegroundColor Green
Write-Host "  Nimbus Printer Service installed successfully!" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Install path : $INSTALL_DIR"
Write-Host "  Config file  : $INSTALL_DIR\.env"
Write-Host "  API base URL : http://localhost:3002  (see .env for PORT)"
Write-Host "  Service name : $SERVICE_NAME  (starts automatically on boot)"
Write-Host ""
Write-Host "  Useful commands:"
Write-Host "    nssm status  $SERVICE_NAME"
Write-Host "    nssm restart $SERVICE_NAME"
Write-Host "    nssm stop    $SERVICE_NAME"
Write-Host "    nssm start   $SERVICE_NAME"
Write-Host ""
Write-Host "  To uninstall:"
Write-Host "    nssm stop    $SERVICE_NAME"
Write-Host "    nssm remove  $SERVICE_NAME confirm"
Write-Host "    Remove-Item -Recurse -Force $INSTALL_DIR"
Write-Host ""

Write-Host "Press any key to exit..." -ForegroundColor DarkGray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
