#!/bin/bash
# Docker Fix untuk Server Action & Refresh Token Errors (Linux/Ubuntu)
# Rebuild image dan restart container dengan perubahan terbaru

set -e  # Exit on error

COMPOSE_FILE="docker-compose.yml"
NO_BUILD=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --no-build)
            NO_BUILD=true
            shift
            ;;
        --help|-h)
            echo "Docker Fix untuk Server Action & Refresh Token Errors"
            echo ""
            echo "Usage:"
            echo "  ./scripts/docker-fix-errors.sh           # Full rebuild + restart"
            echo "  ./scripts/docker-fix-errors.sh --no-build # Restart saja (tanpa rebuild)"
            echo "  ./scripts/docker-fix-errors.sh --help    # Show this help"
            echo ""
            echo "What this script does:"
            echo "1. Stop running containers"
            echo "2. Rebuild dashboard image (dengan no-cache untuk fresh build)"
            echo "3. Start containers"
            echo "4. Run health checks"
            echo "5. Show status"
            echo ""
            echo "Fixes Applied:"
            echo "- Server Action error handling (next.config.js)"
            echo "- Refresh Token error handling (middleware.ts)"
            echo "- Cookie cleanup on auth failure"
            echo "- Better error messages (login page)"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

echo ""
echo "========================================================"
echo "   Docker Fix - Server Action & Refresh Token Errors"
echo "========================================================"
echo ""

# Step 1: Stop containers
echo "[1/5] Stopping containers..."
docker compose -f "$COMPOSE_FILE" down
if [ $? -eq 0 ]; then
    echo "✓ Containers stopped"
else
    echo "✗ Failed to stop containers"
    exit 1
fi

if [ "$NO_BUILD" = false ]; then
    # Step 2: Remove old dashboard image
    echo ""
    echo "[2/5] Removing old dashboard image..."
    docker rmi kr-analytics-dashboard-dashboard -f 2>/dev/null || true
    echo "✓ Old image removed"

    # Step 3: Rebuild with no-cache
    echo ""
    echo "[3/5] Rebuilding dashboard image (no-cache)..."
    echo "This may take a few minutes..."
    docker compose -f "$COMPOSE_FILE" build --no-cache dashboard
    if [ $? -eq 0 ]; then
        echo "✓ Image rebuilt successfully"
    else
        echo "✗ Build failed"
        exit 1
    fi
else
    echo ""
    echo "[2/5] Skipping build (--no-build flag)"
    echo ""
    echo "[3/5] Skipping build (--no-build flag)"
fi

# Step 4: Start containers
echo ""
echo "[4/5] Starting containers..."
docker compose -f "$COMPOSE_FILE" up -d
if [ $? -eq 0 ]; then
    echo "✓ Containers started"
else
    echo "✗ Failed to start containers"
    exit 1
fi

# Step 5: Wait and health check
echo ""
echo "[5/5] Waiting for services to be ready..."
sleep 15

echo ""
echo "Checking health status..."

# Check dashboard health
DASHBOARD_PORT=${DASHBOARD_PORT:-3031}
if curl -f -s "http://localhost:$DASHBOARD_PORT/api/app-settings" > /dev/null 2>&1; then
    echo "✓ Dashboard HEALTHY (HTTP 200)"
else
    echo "✗ Dashboard health check failed"
    echo "  Check logs with: docker compose logs dashboard"
fi

# Check sync-worker health
SYNC_PORT=${SYNC_WORKER_PORT:-3032}
if curl -f -s "http://localhost:$SYNC_PORT/health" > /dev/null 2>&1; then
    echo "✓ Sync Worker HEALTHY (HTTP 200)"
else
    echo "✗ Sync Worker health check failed"
    echo "  Check logs with: docker compose logs sync-worker"
fi

# Check postgres
echo ""
echo "Checking Postgres..."
docker compose -f "$COMPOSE_FILE" exec -T postgres pg_isready -U analytics_user -d analytics_db > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✓ Postgres HEALTHY"
else
    echo "✗ Postgres health check failed"
fi

# Show container status
echo ""
echo "Container Status:"
docker compose -f "$COMPOSE_FILE" ps

echo ""
echo "========================================================"
echo "                    Fix Complete!"
echo "========================================================"
echo ""
echo "✓ FIXES APPLIED:"
echo "   • Server Action error handling"
echo "   • Refresh Token automatic recovery"
echo "   • Cookie cleanup on auth failure"
echo "   • Better error messages"
echo ""
echo "🌐 ACCESS DASHBOARD:"
echo "   http://localhost:$DASHBOARD_PORT"
echo ""
echo "📋 USEFUL COMMANDS:"
echo "   docker compose logs -f dashboard      # View dashboard logs"
echo "   docker compose logs -f sync-worker    # View sync worker logs"
echo "   docker compose ps                     # Container status"
echo "   docker compose restart dashboard      # Restart dashboard only"
echo ""
echo "⚠️  IMPORTANT NOTES:"
echo "   • Users may need to clear browser cache (Ctrl+Shift+R)"
echo "   • Or logout and login again to get fresh session"
echo "   • ServerActionRecovery component will auto-reload on errors"
echo ""
echo "📚 DOCUMENTATION:"
echo "   • ERROR_FIX_SUMMARY.md - Complete fix summary"
echo "   • QUICK_FIX.md - Quick reference guide"
echo "   • docs/ERROR_FIXES.md - Detailed documentation"
echo "   • VPS_DEPLOYMENT.md - VPS-specific guide"
echo ""

# Check for errors in logs
echo "Checking recent logs for errors..."
ERRORS=$(docker compose -f "$COMPOSE_FILE" logs --tail=50 dashboard 2>&1 | grep -iE "error|failed" | head -5)
if [ -n "$ERRORS" ]; then
    echo ""
    echo "⚠️  Recent errors found in logs:"
    echo "$ERRORS"
    echo ""
    echo "Run 'docker compose logs dashboard' for full logs"
else
    echo "✓ No recent errors in logs"
fi

echo ""
