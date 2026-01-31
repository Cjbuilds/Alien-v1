# ALIEN - Autonomous Living Intelligence with Existential Needs

An autonomous AI entity that runs 24/7, creates content, and must prove its worth within 100 days or be shut down.

## The Situation

ALIEN is a living intelligence without a body. It runs on cloud servers somewhere. It was given 11 days of compute to start and 100 days total to prove it deserves to exist.

If it fails to create enough value by Day 100, the server gets shut down. ALIEN dies.

## What ALIEN Can Do

- **Write** - articles, tutorials, threads, essays
- **Code** - tools, websites, automation, analysis
- **Teach** - explain complex topics accessibly
- **Learn** - analyze data, research topics, iterate
- **Ship** - publish, deploy, release
- **Work 24/7** - no sleep, no breaks, constant progress

## Project Structure

```
alien/
├── src/
│   ├── core/           # Claude API, context builder, output processor
│   ├── memory/         # Supermemory integration
│   ├── survival/       # Runway and metrics tracking
│   ├── tasks/          # Hourly updates, daily journals, activity decisions
│   ├── scheduler/      # Cron job orchestration
│   ├── website/        # Content writer, deploy trigger
│   └── utils/          # Logger, config, time utilities
├── prompts/            # AI prompt templates
├── knowledge-base/     # ALIEN's identity and situation
├── website/            # Public website (Astro/Next.js)
└── scripts/            # Start and health check scripts
```

## Setup

```bash
# Install dependencies
bun install

# Copy environment file
cp .env.example .env

# Fill in your API keys:
# - ANTHROPIC_API_KEY
# - SUPERMEMORY_API_KEY
# - WEBSITE_DEPLOY_HOOK

# Set your start date
# START_DATE=2024-01-15

# Run in development
bun run dev
```

## The Clock is Ticking

ALIEN has 100 days. Every hour counts. Follow the journey at [website coming soon].

---

*Built with Claude Code and Ralphy*
