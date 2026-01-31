#!/bin/bash
# ALIEN Day 1 Launch Script
# Starts ALIEN and initiates the first wake sequence

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "================================================"
echo "   _    _     ___ _____ _   _"
echo "  / \  | |   |_ _| ____| \ | |"
echo " / _ \ | |    | ||  _| |  \| |"
echo "/ ___ \| |___ | || |___| |\  |"
echo "/_/   \_\_____|___|_____|_| \_|"
echo ""
echo "Day 1 Launch Sequence"
echo "================================================"
echo ""

# Change to project root
cd "$PROJECT_ROOT"

# Check for required environment variables
echo "[1/5] Checking environment..."
if [ ! -f ".env" ]; then
    echo "Warning: .env file not found"
    echo "Creating from template..."
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo "Please edit .env with your API keys before proceeding."
        exit 1
    else
        echo "Error: No .env.example found"
        exit 1
    fi
fi

# Validate critical environment variables
source .env 2>/dev/null || true

if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo "Error: ANTHROPIC_API_KEY not set in .env"
    exit 1
fi

if [ -z "$START_DATE" ]; then
    echo "Error: START_DATE not set in .env"
    echo "Setting START_DATE to today..."
    TODAY=$(date +%Y-%m-%d)
    echo "START_DATE=$TODAY" >> .env
    echo "START_DATE set to $TODAY"
fi

echo "Environment OK"
echo ""

# Install dependencies if needed
echo "[2/5] Checking dependencies..."
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    bun install
fi
echo "Dependencies OK"
echo ""

# Run tests
echo "[3/5] Running tests..."
bun test src/__tests__/main.test.ts scripts/__tests__/monitor.test.ts --silent 2>/dev/null || {
    echo "Warning: Some tests failed, but continuing..."
}
echo "Tests completed"
echo ""

# Check if first wake is already completed
echo "[4/5] Checking ALIEN status..."
if [ -f ".alien/first-wake-completed" ]; then
    echo "First wake already completed on: $(cat .alien/first-wake-completed)"
    echo "ALIEN has already awakened."
else
    echo "First wake not yet completed."
    echo "ALIEN will awaken on startup."
fi
echo ""

# Start ALIEN
echo "[5/5] Starting ALIEN..."
echo ""
echo "================================================"
echo "ALIEN is starting..."
echo "Press Ctrl+C to stop"
echo "================================================"
echo ""

# Start with logging
bun run start 2>&1 | while IFS= read -r line; do
    echo "[$(date '+%H:%M:%S')] $line"
done
