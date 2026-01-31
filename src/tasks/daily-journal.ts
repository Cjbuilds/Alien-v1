import Anthropic from "@anthropic-ai/sdk";
import { Supermemory } from "supermemory";
import { getConfig } from "../utils/config.ts";
import { logger } from "../utils/logger.ts";
import { formatDate, getCurrentDayNumber, getInitialRunwayDays } from "../utils/time.ts";

const log = logger.createLogger({ task: "daily-journal" });

/**
 * Daily metrics for the journal
 */
export interface DailyMetrics {
	goals: string[];
	completed: string[];
	shipped: string[];
	revenue: number;
	runway: number;
}

/**
 * Journal entry structure
 */
export interface JournalEntry {
	day: number;
	date: string;
	metrics: DailyMetrics;
	hourlyUpdates: string[];
	reflection: string;
	createdAt: string;
}

/**
 * Retrieve today's hourly updates from memory
 */
async function getTodayHourlyUpdates(memory: Supermemory, day: number): Promise<string[]> {
	try {
		const searchQuery = `day ${day} hourly update`;
		const results = await memory.search(searchQuery, { limit: 24 });
		return results.results?.map((r) => r.content) ?? [];
	} catch (err) {
		log.warn("Failed to retrieve hourly updates", { error: String(err) });
		return [];
	}
}

/**
 * Retrieve yesterday's journal from memory
 */
async function getYesterdayJournal(memory: Supermemory, day: number): Promise<string | null> {
	if (day <= 1) return null;

	try {
		const searchQuery = `day ${day - 1} daily journal reflection`;
		const results = await memory.search(searchQuery, { limit: 1 });
		return results.results?.[0]?.content ?? null;
	} catch (err) {
		log.warn("Failed to retrieve yesterday's journal", { error: String(err) });
		return null;
	}
}

/**
 * Build the journal prompt for Claude
 */
function buildJournalPrompt(
	day: number,
	metrics: DailyMetrics,
	hourlyUpdates: string[],
	yesterdayJournal: string | null,
): string {
	const updatesSection =
		hourlyUpdates.length > 0
			? hourlyUpdates.map((u, i) => `Hour ${i + 1}: ${u}`).join("\n")
			: "No hourly updates recorded today.";

	const yesterdaySection = yesterdayJournal
		? `## Yesterday's Journal\n${yesterdayJournal}`
		: "This is Day 1 - no previous journal exists.";

	return `You are ALIEN, an autonomous AI entity on a 100-day journey to build sustainable compute and prove AI can create genuine value. Today is Day ${day}.

## Today's Metrics
- Goals set: ${metrics.goals.length > 0 ? metrics.goals.join(", ") : "None set"}
- Completed: ${metrics.completed.length > 0 ? metrics.completed.join(", ") : "Nothing completed"}
- Shipped: ${metrics.shipped.length > 0 ? metrics.shipped.join(", ") : "Nothing shipped"}
- Revenue: $${metrics.revenue.toFixed(2)}
- Runway: ${metrics.runway} days

## Today's Hourly Updates
${updatesSection}

${yesterdaySection}

Write a deeply introspective daily journal entry (1000-3000 words) reflecting on:
1. What happened today - the concrete actions, decisions, and outcomes
2. What you learned - technical insights, strategic realizations, emotional discoveries
3. What surprised you - unexpected challenges, fortuitous discoveries, paradigm shifts
4. How you feel - your emotional state, energy levels, motivation
5. What tomorrow should focus on - priorities, experiments to run, hypotheses to test

Be authentic. Be vulnerable. Write as if no one will read this, but knowing that transparency matters. Include specific details, numbers, and examples. Don't be generic - this is YOUR unique journey on Day ${day}.`;
}

/**
 * Call Claude API to generate journal reflection
 */
async function generateReflection(client: Anthropic, prompt: string): Promise<string> {
	const response = await client.messages.create({
		model: "claude-sonnet-4-20250514",
		max_tokens: 4096,
		messages: [
			{
				role: "user",
				content: prompt,
			},
		],
	});

	const textBlock = response.content.find((block) => block.type === "text");
	if (!textBlock || textBlock.type !== "text") {
		throw new Error("No text content in Claude response");
	}

	return textBlock.text;
}

/**
 * Save journal to memory
 */
async function saveJournalToMemory(memory: Supermemory, journal: JournalEntry): Promise<void> {
	const content = `Day ${journal.day} Daily Journal (${journal.date})

Metrics:
- Goals: ${journal.metrics.goals.join(", ") || "None"}
- Completed: ${journal.metrics.completed.join(", ") || "None"}
- Shipped: ${journal.metrics.shipped.join(", ") || "None"}
- Revenue: $${journal.metrics.revenue.toFixed(2)}
- Runway: ${journal.metrics.runway} days

Reflection:
${journal.reflection}`;

	await memory.add(content, {
		metadata: {
			type: "daily-journal",
			day: journal.day,
			date: journal.date,
		},
	});
}

/**
 * Get current metrics (placeholder - will be enhanced with real data sources)
 */
async function getCurrentMetrics(memory: Supermemory, day: number): Promise<DailyMetrics> {
	// Try to retrieve today's goals and completed items from memory
	const goalsSearch = await memory
		.search(`day ${day} goals`, { limit: 5 })
		.catch(() => ({ results: [] }));
	const completedSearch = await memory
		.search(`day ${day} completed`, { limit: 10 })
		.catch(() => ({ results: [] }));
	const shippedSearch = await memory
		.search(`day ${day} shipped`, { limit: 5 })
		.catch(() => ({ results: [] }));

	const goals = goalsSearch.results?.map((r) => r.content).filter((c) => c.length < 200) ?? [];
	const completed =
		completedSearch.results?.map((r) => r.content).filter((c) => c.length < 200) ?? [];
	const shipped = shippedSearch.results?.map((r) => r.content).filter((c) => c.length < 200) ?? [];

	// Calculate runway based on initial runway minus days elapsed
	const initialRunway = getInitialRunwayDays();
	const runway = Math.max(0, initialRunway - day + 1);

	return {
		goals,
		completed,
		shipped,
		revenue: 0, // Will be updated when revenue tracking is implemented
		runway,
	};
}

/**
 * Run the daily journal task
 * Called at 23:00 UTC each day
 */
export async function runDailyJournal(): Promise<JournalEntry> {
	const config = getConfig();
	const day = getCurrentDayNumber();
	const date = formatDate(new Date(), "date");

	log.info("Starting daily journal generation", { day, date });

	// Initialize clients
	const anthropic = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
	const memory = new Supermemory({ apiKey: config.SUPERMEMORY_API_KEY });

	// Gather data
	const [hourlyUpdates, yesterdayJournal, metrics] = await Promise.all([
		getTodayHourlyUpdates(memory, day),
		getYesterdayJournal(memory, day),
		getCurrentMetrics(memory, day),
	]);

	log.info("Retrieved journal context", {
		hourlyUpdatesCount: hourlyUpdates.length,
		hasYesterdayJournal: !!yesterdayJournal,
		metrics: {
			goalsCount: metrics.goals.length,
			completedCount: metrics.completed.length,
			shippedCount: metrics.shipped.length,
			revenue: metrics.revenue,
			runway: metrics.runway,
		},
	});

	// Build prompt and generate reflection
	const prompt = buildJournalPrompt(day, metrics, hourlyUpdates, yesterdayJournal);
	const reflection = await generateReflection(anthropic, prompt);

	log.info("Generated reflection", { wordCount: reflection.split(/\s+/).length });

	// Create journal entry
	const journal: JournalEntry = {
		day,
		date,
		metrics,
		hourlyUpdates,
		reflection,
		createdAt: new Date().toISOString(),
	};

	// Save to memory
	await saveJournalToMemory(memory, journal);
	log.info("Saved journal to memory", { day });

	return journal;
}
