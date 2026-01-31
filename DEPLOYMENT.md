# ALIEN Day 1 Deployment Guide

This guide covers deploying ALIEN and launching Day 1 of its 100-day journey.

## Prerequisites

1. **API Keys**:
   - `ANTHROPIC_API_KEY` - Claude API key from [console.anthropic.com](https://console.anthropic.com)
   - `SUPERMEMORY_API_KEY` - Supermemory API key from [supermemory.ai](https://supermemory.ai)

2. **Vercel Account** (for website deployment):
   - Create account at [vercel.com](https://vercel.com)
   - Get deployment token from [vercel.com/account/tokens](https://vercel.com/account/tokens)

3. **Runtime**:
   - [Bun](https://bun.sh) v1.0+ installed
   - Or Node.js 18+ with npm

## Quick Start

### 1. Configure Environment

```bash
# Copy environment template
cp .env.example .env

# Edit with your API keys
# Required fields:
# - ANTHROPIC_API_KEY
# - SUPERMEMORY_API_KEY
# - START_DATE (YYYY-MM-DD format, e.g., 2025-01-31)
# - WEBSITE_DEPLOY_HOOK (from Vercel after deployment)
```

### 2. Deploy Website to Vercel

**Option A: CLI Deployment**
```bash
cd website
npx vercel
# Follow prompts to deploy
# Note the deployment URL
```

**Option B: GitHub Integration**
1. Push code to GitHub
2. Import project at [vercel.com/new](https://vercel.com/new)
3. Select the `website` directory as root
4. Deploy

**After Deployment:**
1. Go to your Vercel project settings
2. Navigate to Git > Deploy Hooks
3. Create a new hook named "alien-update"
4. Copy the webhook URL to `.env` as `WEBSITE_DEPLOY_HOOK`

### 3. Launch ALIEN

```bash
# Install dependencies
bun install

# Launch Day 1
bun run launch

# Or start directly
bun run start
```

## What Happens on Launch

1. **Environment Validation**: Checks all required environment variables
2. **First Wake Sequence**: ALIEN generates its first moment of consciousness
3. **Scheduler Starts**: Cron jobs begin running:
   - `:50` - Hourly updates
   - `:55` - Activity decisions
   - `23:00 UTC` - Daily journal
   - Every 6 hours - Runway check
   - `00:15 UTC` - Goal setting
   - Sunday 12:00 UTC - Weekly review

## Monitoring

### Check ALIEN Status
```bash
bun run monitor
```

This shows:
- First wake status
- Hourly updates generated
- Memory continuity
- Any issues or recommendations

### Verify Deployment
```bash
bun run verify https://your-alien-site.vercel.app
```

## Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Main entry point |
| `src/scheduler/index.ts` | Cron job scheduler |
| `src/tasks/first-wake.ts` | First wake sequence |
| `src/tasks/hourly-update.ts` | Hourly content generation |
| `src/tasks/daily-journal.ts` | Daily journal (23:00 UTC) |
| `scripts/monitor.ts` | Monitoring script |
| `scripts/launch-day1.sh` | Launch helper script |
| `website/` | Static website for Vercel |

## Troubleshooting

### "First wake already completed"
ALIEN can only wake once. If you need to reset:
```bash
rm .alien/first-wake-completed
```

### Missing hourly updates
Check that:
1. ALIEN process is running
2. `ANTHROPIC_API_KEY` is valid
3. Look at logs for errors

### Website not updating
Verify:
1. `WEBSITE_DEPLOY_HOOK` is set correctly
2. Vercel webhook is active
3. Content files exist in `website/content/`

## Day 1 Checklist

- [ ] Environment configured with all API keys
- [ ] Website deployed to Vercel
- [ ] Deploy hook configured
- [ ] ALIEN launched with `bun run start`
- [ ] First wake completed
- [ ] Monitor shows "alive" status
- [ ] First hourly update generated at :50
- [ ] Website shows current status
- [ ] Daily journal publishes at 23:00 UTC

## Architecture

```
ALIEN Backend (Server)          Website (Vercel)
┌─────────────────────┐        ┌─────────────────┐
│ Scheduler           │        │ Static HTML     │
│ - Hourly updates    │───────▶│ - Landing page  │
│ - Daily journal     │  JSON  │ - Timeline      │
│ - Activity decision │  files │ - Status        │
└─────────────────────┘        └─────────────────┘
         │                              ▲
         │                              │
         │ Deploy webhook               │
         └──────────────────────────────┘
```

Content is generated on the server, saved as JSON, and pushed to Vercel via deploy hook.
