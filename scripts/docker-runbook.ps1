# scripts/docker-runbook.ps1
# Phase 3 Runbook — KR Analytics Dashboard
# Usage: .\scripts\docker-runbook.ps1 -Command <command>
# Commands: start, stop, restart, logs-dashboard, logs-sync, health-sync, health-postgres, check-rows, refresh-summary, backup, restore

param(
    [Parameter(Mandatory)]
    [ValidateSet('start','stop','restart','logs-dashboard','logs-sync','health-sync','health-postgres','check-rows','refresh-summary','backup','restore','shell-postgres','shell-sync')]
    [string]$Command
)

$composeFile = "docker-compose.yml"

function Start-Stack {
    Write-Host ">>> Starting KR Analytics Dashboard stack..." -ForegroundColor Green
    docker compose -f $composeFile up -d
    Write-Host ">>> Stack started. Use health commands to verify." -ForegroundColor Green
}

function Stop-Stack {
    Write-Host ">>> Stopping KR Analytics Dashboard stack..." -ForegroundColor Yellow
    docker compose -f $composeFile down
    Write-Host ">>> Stack stopped." -ForegroundColor Green
}

function Restart-Stack {
    Stop-Stack
    Start-Stack
}

function Logs-Dashboard {
    docker compose -f $composeFile logs -f dashboard
}

function Logs-Sync {
    docker compose -f $composeFile logs -f sync-worker
}

function Health-Sync {
    $exitCode = 0
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3032/health" -UseBasicParsing -TimeoutSec 5
        if ($response.StatusCode -eq 200) {
            Write-Host ">>> sync-worker HEALTHY (HTTP $($response.StatusCode))" -ForegroundColor Green
            Write-Host $response.Content
        } else {
            Write-Host ">>> sync-worker UNHEALTHY (HTTP $($response.StatusCode))" -ForegroundColor Red
            $exitCode = 1
        }
    } catch {
        Write-Host ">>> sync-worker UNREACHABLE: $_" -ForegroundColor Red
        $exitCode = 1
    }
    exit $exitCode
}

function Health-Postgres {
    docker compose -f $composeFile exec postgres pg_isready -U analytics_user -d analytics_db
}

function Check-Rows {
    Write-Host "=== Sync Metadata ===" -ForegroundColor Cyan
    docker compose -f $composeFile exec postgres psql -U analytics_user -d analytics_db -c "SELECT table_name, rows_synced, last_synced_at FROM sync_metadata ORDER BY table_name;"
    Write-Host "`n=== Summary Table Row Count ===" -ForegroundColor Cyan
    docker compose -f $composeFile exec postgres psql -U analytics_user -d analytics_db -c "SELECT COUNT(*) as total_summaries FROM analytics_monthly_summary;"
    Write-Host "`n=== Latest Summary Months ===" -ForegroundColor Cyan
    docker compose -f $composeFile exec postgres psql -U analytics_user -d analytics_db -c "SELECT month, total_revenue, total_expenses, occupied_room_nights, available_room_nights FROM analytics_monthly_summary ORDER BY month DESC LIMIT 6;"
}

function Refresh-Summary {
    Write-Host ">>> Triggering manual summary refresh..." -ForegroundColor Yellow
    docker compose -f $composeFile exec sync-worker node /app/dist/sync/run-summary-refresh.js
    Write-Host ">>> Summary refresh completed." -ForegroundColor Green
}

function Backup-DB {
    $backupDir = "backups"
    if (-not (Test-Path $backupDir)) {
        New-Item -ItemType Directory -Path $backupDir | Out-Null
    }
    $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $backupFile = "$backupDir/analytics_db_$timestamp.sql"
    Write-Host ">>> Backing up analytics DB to $backupFile ..." -ForegroundColor Yellow
    docker compose -f $composeFile exec postgres pg_dump -U analytics_user -d analytics_db > $backupFile
    if ($?) {
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
    Get-Content $BackupFile | docker compose -f $composeFile exec -T postgres psql -U analytics_user -d analytics_db
    if ($?) {
        Write-Host ">>> Restore completed." -ForegroundColor Green
    } else {
        Write-Host ">>> Restore FAILED." -ForegroundColor Red
    }
}

function Shell-Postgres {
    docker compose -f $composeFile exec postgres psql -U analytics_user -d analytics_db
}

function Shell-Sync {
    docker compose -f $composeFile exec sync-worker sh
}

# Dispatch
switch ($Command) {
    'start'           { Start-Stack }
    'stop'            { Stop-Stack }
    'restart'         { Restart-Stack }
    'logs-dashboard'  { Logs-Dashboard }
    'logs-sync'       { Logs-Sync }
    'health-sync'     { Health-Sync }
    'health-postgres' { Health-Postgres }
    'check-rows'      { Check-Rows }
    'refresh-summary' { Refresh-Summary }
    'backup'          { Backup-DB }
    'restore'         { Restore-DB }
    'shell-postgres'  { Shell-Postgres }
    'shell-sync'      { Shell-Sync }
}
