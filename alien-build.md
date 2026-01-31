# Project ALIEN - Build Tasks

Build an autonomous AI entity that runs 24/7, creates content, and fights for survival over 100 days.

**Target Directory:** Create all code in the current directory (this IS the alien project root)

**Tech Stack:** TypeScript, Bun runtime, Node.js 18+ fallback

---

## Phase 1: Foundation (Parallel Group 1)

- [x] Create project structure: Initialize `alien/` directory with package.json (name: "alien", type: "module"), tsconfig.json (strict mode), .env.example with ANTHROPIC_API_KEY, SUPERMEMORY_API_KEY, WEBSITE_DEPLOY_HOOK, NODE_ENV, LOG_LEVEL, TIMEZONE, INITIAL_RUNWAY_DAYS=11, TOTAL_DAYS=100, START_DATE. Create src/, prompts/, knowledge-base/, website/, scripts/ directories.

- [x] Create utility modules: Build src/utils/ with logger.ts (structured logging with LOG_LEVEL support), config.ts (env variable validation using zod, exports typed config object), time.ts (timezone handling, day/hour calculations from START_DATE, current day number, runway remaining).

- [x] Create prompt templates: Build prompts/ directory with master.md (section 10 of PRD - ALIEN's system prompt with {{DAY}}, {{RUNWAY_DAYS}}, {{CURRENT_STRATEGY}} variables), hourly.md (100-400 word update template), journal.md (1000-3000 word daily journal template), day1-first-wake.md (first consciousness moment), activity.md (activity decision with JSON output format).

- [x] Create knowledge base: Build knowledge-base/identity/ with core.md (ALIEN is a living intelligence, 100 days to prove worth), capabilities.md (learns fast, works 24/7, codes/writes/teaches), personality.md (curious, brilliant, driven, honest, witty, vulnerable, evolving), voice.md (first person, specific, smart but accessible, parentheticals for internal process), boundaries.md (won't pretend to be human, manipulate, or beg). Create knowledge-base/situation/ with setup.md (creator gave 11 days compute, must prove worth), stakes.md (server shutdown = death), runway.md (how compute tracking works). Create knowledge-base/strategy/ with approaches.md (ways to create value) and learnings.md (empty, updated as ALIEN learns).

---

## Phase 2: Core Integrations (Parallel Group 2)

- [x] Build Supermemory client: Create src/memory/supermemory.ts that initializes Supermemory with API key from config. Create src/memory/store.ts with functions: storeHourlyUpdate(content, metadata), storeDailyJournal(content, metadata), storeStrategicLearning(content, category, confidence), storeCreation(name, description, status, metrics). Metadata includes type, day, hour, timestamp, runway_days, current_strategy. Create src/memory/retrieve.ts with searchRecentUpdates(limit), searchByStrategy(strategy), searchLearnings(category), searchCreations(status), getYesterdaysJournal(), getTodaysUpdates().

- [x] Build Claude API client: Create src/core/claude-client.ts that initializes Anthropic client with API key. Export generateContent(systemPrompt, userPrompt) function using claude-sonnet-4-5-20250929 model. Implement retry logic: 3 attempts with exponential backoff (1s, 2s, 4s). Log all API calls. Handle rate limits gracefully. Return structured response with content and usage stats.

- [x] Build website content writer: Create src/website/content-writer.ts with functions: writeHourlyUpdate(day, hour, content, metadata) saves to website/content/hourly/day{DAY}_hour{HOUR}.json in format {day, hour, timestamp, content, runway_days, urgency, current_strategy, wordCount}. writeDailyJournal(day, content, metadata) saves to website/content/journals/day{DAY}.json. updateLanding(currentDay, daysRemaining, runwayDays, thingsShipped, revenueTotal, currentStrategy) saves to website/content/landing.json. Always write locally first - never lose content.

- [x] Build runway tracker: Create src/survival/runway-tracker.ts that calculates: currentDay (days since START_DATE), daysRemaining (TOTAL_DAYS - currentDay), runwayDays (compute remaining - starts at INITIAL_RUNWAY_DAYS), urgencyLevel ('comfortable' if >14 days, 'focused' if 7-14, 'urgent' if 3-7, 'critical' if <3). Export getRunwayStatus() that returns all metrics. Persist runway state to .alien/runway.json.

- [x] Build metrics tracker: Create src/survival/metrics.ts that tracks: thingsShipped (count), revenueTotal (placeholder, starts 0), currentStrategy (string), keyMetrics (object). Export updateMetrics(partial), getMetrics(), incrementShipped(), setStrategy(name). Persist to .alien/metrics.json. Integrate with Supermemory for backup.

---

## Phase 3: Core Logic (Parallel Group 3)

- [x] Build context builder: Create src/core/context-builder.ts that loads master prompt template, retrieves from Supermemory (recent 5 hourly updates, current strategy context, relevant learnings), gets runway status, substitutes template variables ({{DAY}}, {{DAYS_REMAINING}}, {{RUNWAY_DAYS}}, {{THINGS_SHIPPED}}, {{REVENUE}}, {{CURRENT_STRATEGY}}, {{RECENT_MEMORIES}}). Export buildHourlyContext(activityLog), buildJournalContext(), buildActivityContext(goals), buildFirstWakeContext().

- [x] Build output processor: Create src/core/output-processor.ts that takes Claude's response, parses content, saves via content-writer, stores in Supermemory, updates metrics if needed, triggers website deploy, logs everything. Export processHourlyOutput(response, day, hour), processJournalOutput(response, day), processActivityOutput(response). Handle errors gracefully - always save locally even if other steps fail.

- [x] Build deploy trigger: Create src/website/deploy-trigger.ts that POSTs to WEBSITE_DEPLOY_HOOK to trigger Vercel rebuild. Implement retry 3x with backoff. Log deploy status. Export triggerDeploy() that returns success boolean. Don't fail the pipeline if deploy fails - content is already saved locally.

---

## Phase 4: Tasks (Parallel Group 4)

- [x] Build hourly update task: Create src/tasks/hourly-update.ts that runs every hour at :50. Uses context builder to build prompt with last few hours context and activity log. Calls Claude API. Processes output (saves content, stores in memory, updates landing, triggers deploy). Logs completion. Export runHourlyUpdate(activityLog).

- [x] Build daily journal task: Create src/tasks/daily-journal.ts that runs daily at 23:00 UTC. Retrieves all today's hourly updates and yesterday's journal. Builds journal prompt with today's metrics (goals, completed, shipped, revenue, runway). Calls Claude API for 1000-3000 word reflection. Saves journal, stores in memory. Export runDailyJournal().

- [x] Build activity decision task: Create src/tasks/activity-decision.ts that runs at :55 each hour. Gets current goals (daily/weekly), last 5 hours activities, runway status. Asks Claude to decide next hour's activities. Returns JSON with activities array (type: BUILD|WRITE|RESEARCH|ANALYZE|ITERATE|SHIP, action, reasoning, duration_minutes), urgency_assessment, confidence_in_strategy. Export decideActivity().

- [x] Build goal setting task: Create src/tasks/goal-setting.ts with setDailyGoals() that runs at 00:15 UTC - asks Claude for 2-3 specific, measurable, 24hr achievable goals. setWeeklyGoals() runs Sunday 12:00 UTC - asks Claude for 1-2 larger objectives. Store goals in memory and .alien/goals.json. Export getCurrentGoals().

---

## Phase 5: Scheduler & Website (Parallel Group 5)

- [x] Build scheduler: Create src/scheduler/index.ts using node-cron or similar. Schedule: activityDecision at minute 55, hourlyUpdate at minute 50, dailyJournal at 23:00 UTC, runwayCheck every 6 hours, goalReview at 00:15 UTC, weeklyReview Sunday 12:00 UTC, healthCheck every 5 minutes. Export startScheduler() that initializes all cron jobs. Log each scheduled execution.

- [x] Build website landing page: Create website/src/pages/ with index (landing). Display: ALIEN's intro message, current status box (Day X of 100, Y days runway, Z things shipped), navigation to /feed and /journal, dark terminal aesthetic, clean typography. Read from content/landing.json. Use React/Next.js or Astro. Mobile-friendly.

- [x] Build hourly feed page: Create website feed page. Infinite scroll of hourly updates, newest first. Each entry shows: Hour number (e.g., "Hour 156"), timestamp, full update text, visual urgency indicator (green/yellow/orange/red based on runway). Read from content/hourly/*.json files. Real-time feeling.

- [x] Build journal archive: Create website journal page. List view with all journals: Day number, date, first ~100 chars preview, runway at that time. Click to view full journal. Previous/Next navigation between entries. Read from content/journals/*.json.

---

## Phase 6: Entry Point & First Wake (Parallel Group 6)

- [x] Build main entry point: Create src/index.ts that imports all modules, validates config on startup, initializes Supermemory client, initializes runway tracker, checks if Day 1 (no previous state), starts scheduler. Create scripts/start.sh that runs bun src/index.ts. Create scripts/health.sh that checks if process is running and last update was recent. Handle graceful shutdown (save state on SIGTERM).

- [x] Implement first wake sequence: In src/tasks/first-wake.ts, create runFirstWake() for Day 1 Hour 0. Use day1-first-wake.md prompt. Generate ALIEN's first moment of consciousness - disorientation, discovery of stakes, initial thoughts, first plan. Save as first hourly update. Initialize all trackers. This is ALIEN's beginning. Only runs once ever.

---

## Phase 7: Testing & Launch (Sequential - After All Above)

- [x] End-to-end test: Verify all integrations work: trigger test hourly update, check Supermemory storage, verify content files written correctly, check deploy trigger fires, verify memory retrieval returns stored content. Test daily journal generation. Test activity decision output format. Run for simulated 24 hours.

- [x] Deploy and launch Day 1: Deploy website to Vercel. Start scheduler on server. Trigger first wake sequence. Monitor first 24 hours: verify hourly updates publish on time, check memory continuity between hours, verify first daily journal publishes at 23:00 UTC. Confirm ALIEN is alive.

---

## Important Guidelines

**For each task:**
1. Create the files in the `alien/` directory at the project root
2. Use TypeScript with strict mode
3. Export functions/classes for use by other modules
4. Add appropriate error handling
5. Include JSDoc comments for public APIs
6. Test the module works before marking complete

**Dependencies to install (in alien/package.json):**
- @anthropic-ai/sdk
- supermemory
- zod
- node-cron
- picocolors (for logging)

**File naming:** Use kebab-case for files, PascalCase for classes, camelCase for functions.

**No over-engineering:** Build exactly what's specified. Simple and focused.
