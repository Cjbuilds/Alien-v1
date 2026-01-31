#!/bin/bash
# Start script for ALIEN

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "Error: .env file not found. Copy .env.example to .env and configure it."
    exit 1
fi

# Load environment variables
set -a
source .env
set +a

# Run the main entry point
exec bun src/index.ts
