#!/bin/bash
# Health check script for ALIEN
# Checks if process is running and last update was recent

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
HEALTH_FILE="$PROJECT_DIR/.alien/health.json"

# Default staleness threshold: 5 minutes (300 seconds)
STALE_THRESHOLD=${STALE_THRESHOLD:-300}

# Check if health file exists
if [ ! -f "$HEALTH_FILE" ]; then
    echo "UNHEALTHY: Health file not found at $HEALTH_FILE"
    exit 1
fi

# Read health data
HEALTH_DATA=$(cat "$HEALTH_FILE")
PID=$(echo "$HEALTH_DATA" | grep -o '"pid":[0-9]*' | grep -o '[0-9]*')
LAST_UPDATE=$(echo "$HEALTH_DATA" | grep -o '"lastUpdate":"[^"]*"' | cut -d'"' -f4)
SHUTDOWN_AT=$(echo "$HEALTH_DATA" | grep -o '"shutdownAt":"[^"]*"' | cut -d'"' -f4 || echo "")

# Check if process was cleanly shut down
if [ -n "$SHUTDOWN_AT" ]; then
    echo "STOPPED: Process was cleanly shut down at $SHUTDOWN_AT"
    exit 2
fi

# Check if PID is running
if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
    PROCESS_RUNNING=true
else
    echo "UNHEALTHY: Process (PID: $PID) is not running"
    exit 1
fi

# Check if last update is recent
if [ -n "$LAST_UPDATE" ]; then
    # Convert ISO timestamp to epoch seconds
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        LAST_UPDATE_EPOCH=$(date -j -f "%Y-%m-%dT%H:%M:%S" "${LAST_UPDATE%%.*}" "+%s" 2>/dev/null || echo "0")
    else
        # Linux
        LAST_UPDATE_EPOCH=$(date -d "$LAST_UPDATE" "+%s" 2>/dev/null || echo "0")
    fi

    NOW_EPOCH=$(date "+%s")
    AGE=$((NOW_EPOCH - LAST_UPDATE_EPOCH))

    if [ "$AGE" -gt "$STALE_THRESHOLD" ]; then
        echo "UNHEALTHY: Last update was ${AGE}s ago (threshold: ${STALE_THRESHOLD}s)"
        exit 1
    fi

    echo "HEALTHY: Process (PID: $PID) running, last update ${AGE}s ago"
    exit 0
else
    echo "UNHEALTHY: Could not parse lastUpdate from health file"
    exit 1
fi
