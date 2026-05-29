# scripts/docker-runbook.ps1
# Phase 3 Runbook — KR Analytics Dashboard
# Usage: .\scripts\docker-runbook.ps1 -Command <command> [options]
# Commands: start, stop, logs, health, check-rows, backup, restore, refresh-summary, status, build, up-build, help

param(
    [ValidateSet('start','stop','logs','health','check-rows','backup','restore','refresh-summary','status','build','up-build','help')]
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
  help              Show this help message

Options:
  -BackupFile <path>  Path to backup file (required for restore)

Examples:
  .\scripts\docker-runbook.ps1 -Command start
  .\scripts\docker-runbook.ps1 -Command status
  .\scripts\docker-runbook.ps1 -Command logs
  .\scripts\docker-runbook.ps1 -Command health
  .\scripts\docker-runbook.ps1 -Command check-rows
  .\scripts\docker-runbook.ps1 -Command backup
  .\scripts\docker-runbook.ps1 -Command restore -BackupFile backups\analytics_db_20260529_120000.sql
  .\scripts\docker-runbook.ps1 -Command refresh-summary
  .\scripts\docker-runbook.ps1 -Command build
  .\scripts\docker-runbook.ps1 -Command up-build
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
        default {
            Write-Host ">>> Unknown command: $Command" -ForegroundColor Red
            Show-Help
        }
    }
} catch {
    Write-Host ">>> Error: $_" -ForegroundColor Red
    exit 1
}
