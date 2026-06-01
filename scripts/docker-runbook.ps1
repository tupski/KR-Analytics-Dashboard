# scripts/docker-runbook.ps1
# Phase 3 Runbook — KR Analytics Dashboard
# Usage: .\scripts\docker-runbook.ps1 -Command <command> [options]
# Commands: start, stop, logs, health, check-rows, backup, restore, refresh-summary, status, build, up-build, deploy, cloudflare-help, help

param(
    [ValidateSet('start','stop','logs','health','check-rows','backup','restore','refresh-summary','status','build','up-build','deploy','fix','cloudflare-help','help')]
    [string]$Command,
    [string]$BackupFile,
    [switch]$Help
)

$composeFile = "docker-compose.yml"

function Show-Help {
    Write-Host @"
KR Analytics Dashboard — Docker Runbook
========================================
Usage:
  .\scripts\docker-runbook.ps1 -Command <command> [options]

Commands:
  start             Start the stack (docker compose up -d)
  stop              Stop the stack (docker compose down)
  logs              Tail logs for all services
  health            Run health checks for sync-worker and Postgres
  check-rows        Query sync_metadata and analytics_monthly_summary
  backup            Backup the analytics database
  restore           Restore the analytics database from a backup file
  refresh-summary   Trigger manual summary refresh in sync-worker
  status            Show container status (docker compose ps)
  build             Build images (docker compose build)
  up-build          Build and start (docker compose up -d --build)
  deploy            Full clean deploy — no-cache build + up
  fix               Fix Server Action & Refresh Token errors (rebuild + restart)
  cloudflare-help   Show Cloudflare proxy compatibility notes
  help              Show this help message

Options:
  -BackupFile <path>  Path to backup file (required for restore)

Examples:
  .\scripts\docker-runbook.ps1 -Command deploy
  .\scripts\docker-runbook.ps1 -Command fix
  .\scripts\docker-runbook.ps1 -Command start
  .\scripts\docker-runbook.ps1 -Command status
  .\scripts\docker-runbook.ps1 -Command cloudflare-help
"@
}

function Start-Stack {
    Write-Host ">>> Starting KR Analytics Dashboard stack..." -ForegroundColor Green
    docker compose -f $composeFile up -d
    Write-Host ">>> Stack started. Use health command to verify." -ForegroundColor Green
}

function Stop-Stack {
    Write-Host ">>> Stopping KR Analytics Dashboard stack..." -ForegroundColor Yellow
    docker compose -f $composeFile down
    Write-Host ">>> Stack stopped." -ForegroundColor Green
}

function Logs-All {
    docker compose -f $composeFile logs -f
}

function Health-Check {
    Health-Sync
    Health-Postgres
}

function Health-Sync {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3032/health" -UseBasicParsing -TimeoutSec 5
        if ($response.StatusCode -eq 200) {
            Write-Host ">>> sync-worker HEALTHY (HTTP $($response.StatusCode))" -ForegroundColor Green
            Write-Host $response.Content
        } else {
            Write-Host ">>> sync-worker UNHEALTHY (HTTP $($response.StatusCode))" -ForegroundColor Red
        }
    } catch {
        Write-Host ">>> sync-worker UNREACHABLE: $_" -ForegroundColor Red
    }
}

function Health-Postgres {
    docker compose -f $composeFile exec postgres pg_isready -U analytics_user -d analytics_db
}

function Check-Rows {
    Write-Host "=== Sync Metadata ===" -ForegroundColor Cyan
    docker compose -f $composeFile exec postgres psql -U analytics_user -d analytics_db -c "SELECT sync_type, row_count, last_sync_at FROM sync_metadata ORDER BY sync_type;"
    Write-Host "`n=== Summary Table Row Count ===" -ForegroundColor Cyan
    docker compose -f $composeFile exec postgres psql -U analytics_user -d analytics_db -c "SELECT COUNT(*) as total_summaries FROM analytics_monthly_summary;"
    Write-Host "`n=== Latest Summary Months ===" -ForegroundColor Cyan
    docker compose -f $composeFile exec postgres psql -U analytics_user -d analytics_db -c "SELECT year_month, total_revenue, total_expenses, occupied_room_days, total_possible_room_days FROM analytics_monthly_summary ORDER BY year_month DESC LIMIT 6;"
}

function Refresh-Summary {
    Write-Host ">>> Triggering manual summary refresh..." -ForegroundColor Yellow
    docker compose -f $composeFile exec sync-worker npx tsx scripts/run-summary-refresh.ts
    Write-Host ">>> Summary refresh completed." -ForegroundColor Green
}

function Backup-DB {
    $backupDir = "backups"
    if (-not (Test-Path $backupDir)) {
        New-Item -ItemType Directory -Path $backupDir | Out-Null
    }
    $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $backupFile = Join-Path $backupDir "analytics_db_$timestamp.sql"
    Write-Host ">>> Backing up analytics DB to $backupFile ..." -ForegroundColor Yellow
    # Dump inside container then copy out — avoids > redirect encoding issues in PS5.1
    docker compose -f $composeFile exec postgres pg_dump -U analytics_user -d analytics_db -f /tmp/analytics_backup.sql
    if ($?) {
        docker compose -f $composeFile cp postgres:/tmp/analytics_backup.sql $backupFile
        docker compose -f $composeFile exec postgres rm /tmp/analytics_backup.sql
        Write-Host ">>> Backup completed: $backupFile" -ForegroundColor Green
    } else {
        Write-Host ">>> Backup FAILED." -ForegroundColor Red
    }
}

function Restore-DB {
    param([string]$BackupFile)
    if (-not (Test-Path $BackupFile)) {
        Write-Host ">>> Backup file not found: $BackupFile" -ForegroundColor Red
        exit 1
    }
    Write-Host ">>> Restoring analytics DB from $BackupFile ..." -ForegroundColor Yellow
    $containerPath = "/tmp/analytics_restore.sql"
    # Copy file into container then restore — avoids pipe encoding issues in PS5.1
    docker compose -f $composeFile cp $BackupFile postgres:$containerPath
    docker compose -f $composeFile exec -T postgres psql -U analytics_user -d analytics_db -f $containerPath
    if ($?) {
        docker compose -f $composeFile exec postgres rm $containerPath
        Write-Host ">>> Restore completed." -ForegroundColor Green
    } else {
        Write-Host ">>> Restore FAILED." -ForegroundColor Red
    }
}

function Show-Status {
    docker compose -f $composeFile ps
}

function Build-Images {
    docker compose -f $composeFile build
}

function Up-Build {
    docker compose -f $composeFile up -d --build
}

function Deploy {
    Write-Host @"

=== KR Analytics Dashboard — Full Deploy ===

This performs a clean build+deploy with no-cache,
which is the recommended sequence for production.

Step 1: Pull latest (if using Git)
Step 2: Clean-build images with no-cache
Step 3: Spin up new containers
Step 4: Health check

"@ -ForegroundColor Cyan

    # Confirm
    $confirm = Read-Host "Continue with full deploy? (y/N)"
    if ($confirm -ne 'y' -and $confirm -ne 'Y') {
        Write-Host ">>> Deploy cancelled." -ForegroundColor Yellow
        return
    }

    Write-Host ">>> [1/4] Pulling latest code..." -ForegroundColor Yellow
    git pull

    Write-Host ">>> [2/4] Building images (no-cache)..." -ForegroundColor Yellow
    docker compose -f $composeFile build --no-cache

    Write-Host ">>> [3/4] Starting stack..." -ForegroundColor Yellow
    docker compose -f $composeFile up -d

    Write-Host ">>> [4/4] Waiting for health checks..." -ForegroundColor Yellow
    Start-Sleep -Seconds 10

    Health-Check

    Write-Host @"

=== Deploy Complete ===

What happens next:
- Old JS chunks cached in browsers will fail on server action calls
- The ServerActionRecovery component (added in this deploy)
  detects those errors and forces a hard reload + cache clear
- next.config.js now sends no-cache headers for all HTML/RSC pages
- middleware.ts also sets no-cache on every response

If users are still stuck:
- Tell them to hard-refresh (Ctrl+Shift+R / Cmd+Shift+R)
- Or visit /login and the recovery component should auto-fire

"@ -ForegroundColor Green
}

function Fix-Errors {
    Write-Host ">>> Running error fix script..." -ForegroundColor Yellow
    & "$PSScriptRoot\docker-fix-errors.ps1"
}

function Show-CloudflareHelp {
    Write-Host @"

=== Cloudflare Proxy Compatibility Notes ===

Since KR Analytics Dashboard runs behind Cloudflare proxy,
these settings MUST be configured in the Cloudflare dashboard:

1. Cache Level → "Standard" or "Bypass"
   - DO NOT use "Cache Everything"
   - Settings → Speed → Optimization → Cache Level

2. Auto Minify → DISABLE for HTML and JS
   - Cloudflare minification can break Next.js RSC payloads
   - Settings → Speed → Optimization → Auto Minify
   - Uncheck HTML and JS (CSS is safe)

3. Always Online → OFF
   - Always Online serves stale pages when origin is down
   - This defeats the no-cache headers we set
   - Settings → Speed → Always Online

4. Browser Cache TTL → "Respect Existing Headers"
   - OR set to 0 (no cache)
   - Our middleware already sets no-cache headers
   - Settings → Speed → Cache → Browser Cache TTL

5. (Optional) Development Mode
   - After deploy, you can enable Dev Mode temporarily
   - This bypasses ALL cache for 3 hours
   - Useful right after deployment to flush stale cache
   - Settings → Speed → Development Mode

6. If users receive cached 404 on /login:
   - Purge cache in Cloudflare: Purge Everything
   - Or wait for TTL to expire (if Edge Cache TTL is set)
   - Go to Caching → Configuration → Purge Everything

7. SSL/TLS → Full (strict)
   - Required for secure cookie handling
   - SSL/TLS → Overview → Full (strict)

"@ -ForegroundColor Cyan
}

# Dispatch
try {
    if ($Help -or -not $Command -or $Command -eq 'help') {
        Show-Help
        return
    }

    switch ($Command) {
        'start'           { Start-Stack }
        'stop'            { Stop-Stack }
        'logs'            { Logs-All }
        'health'          { Health-Check }
        'check-rows'      { Check-Rows }
        'refresh-summary' { Refresh-Summary }
        'backup'          { Backup-DB }
        'restore'         { Restore-DB -BackupFile $BackupFile }
        'status'          { Show-Status }
        'build'           { Build-Images }
        'up-build'        { Up-Build }
        'deploy'          { Deploy }
        'fix'             { Fix-Errors }
        'cloudflare-help' { Show-CloudflareHelp }
        default {
            Write-Host ">>> Unknown command: $Command" -ForegroundColor Red
            Show-Help
        }
    }
} catch {
    Write-Host ">>> Error: $_" -ForegroundColor Red
    exit 1
}
