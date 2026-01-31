#!/bin/bash
# ALIEN Website Deployment Script
# Deploys the static website to Vercel

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
WEBSITE_DIR="$PROJECT_ROOT/website"

echo "==================================="
echo "ALIEN Website Deployment"
echo "==================================="
echo ""

# Check if vercel is available
if ! command -v npx &> /dev/null; then
    echo "Error: npx is not available. Please install Node.js/npm."
    exit 1
fi

# Change to website directory
cd "$WEBSITE_DIR"

# Check if token is provided
if [ -n "$VERCEL_TOKEN" ]; then
    echo "Deploying with token..."

    # Deploy to production
    npx vercel deploy --prod --yes --token="$VERCEL_TOKEN" \
        --name alien-website \
        --build-env NODE_ENV=production
else
    echo "No VERCEL_TOKEN found."
    echo ""
    echo "To deploy interactively, run:"
    echo "  cd $WEBSITE_DIR && npx vercel"
    echo ""
    echo "To deploy with a token, run:"
    echo "  VERCEL_TOKEN=your_token ./scripts/deploy-website.sh"
    echo ""
    echo "To get a token:"
    echo "  1. Go to https://vercel.com/account/tokens"
    echo "  2. Create a new token"
    echo "  3. Set it as VERCEL_TOKEN environment variable"
    exit 1
fi

echo ""
echo "==================================="
echo "Deployment complete!"
echo "==================================="
