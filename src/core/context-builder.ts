import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Supermemory } from "supermemory";
import { getConfig } from "../utils/config.ts";
import { logger } from "../utils/logger.ts";
import {
	getCurrentDayNumber,
	getCurrentHour,
	getDaysRemaining,
	getInitialRunwayDays,
	getTotalDays,
} from "../utils/time.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = join(__dirname, "../../prompts");

/**
 * Memory types for categorization
 */
export type MemoryType = "hourly_update" | "strategy" | "learning" | "journal" | "activity";

/**
 * Runway status information
 */
export interface RunwayStatus {
	runwayDays: number;
	thingsShipped: number;
	revenue: number;
	urgencyLevel: "critical" | "urgent" | "focused" | "comfortable";
}

/**
 * Context variables for template substitution
 */
export interface ContextVariables {
	DAY: number;
	HOUR: number;
	DAYS_REMAINING: number;
	RUNWAY_DAYS: number;
	THINGS_SHIPPED: number;
	REVENUE: number;
	CURRENT_STRATEGY: string;
	RECENT_MEMORIES: string;
	URGENCY_LEVEL: string;
	ACTIVITY_LOG?: string;
	TODAYS_HOURLY_UPDATES?: string;
	DAILY_GOALS?: string;
	WEEKLY_GOALS?: string;
	GOALS_COMPLETED?: string;
	RECENT_ACTIVITY?: string;
	RUNWAY_STATUS?: string;
	YESTERDAYS_JOURNAL?: string;
}

/**
 * Supermemory client singleton
 */
let supermemoryClient: Supermemory | null = null;

function getSupermemoryClient(): Supermemory {
	if (!supermemoryClient) {
		const config = getConfig();
		supermemoryClient = new Supermemory({
			apiKey: config.SUPERMEMORY_API_KEY,
		});
	}
	return supermemoryClient;
}

/**
 * Reset Supermemory client (for testing)
 */
export function resetSupermemoryClient(): void {
	supermemoryClient = null;
}

/**
 * Load a prompt template from the prompts directory
 */
export function loadPromptTemplate(templateName: string): string {
	const templatePath = join(PROMPTS_DIR, `${templateName}.md`);
	try {
		return readFileSync(templatePath, "utf-8");
	} catch (error) {
		logger.error(`Failed to load template: ${templateName}`, { error });
		throw new Error(`Template not found: ${templateName}`);
	}
}

/**
 * Calculate urgency level based on runway days
 */
export function calculateUrgencyLevel(runwayDays: number): RunwayStatus["urgencyLevel"] {
	if (runwayDays < 3) return "critical";
	if (runwayDays < 7) return "urgent";
	if (runwayDays < 14) return "focused";
	return "comfortable";
}

/**
 * Get runway status (placeholder - will integrate with actual runway tracking)
 */
export async function getRunwayStatus(): Promise<RunwayStatus> {
	const runwayDays = getInitialRunwayDays();
	return {
		runwayDays,
		thingsShipped: 0,
		revenue: 0,
		urgencyLevel: calculateUrgencyLevel(runwayDays),
	};
}

/**
 * Search memories from Supermemory with a specific query
 */
export async function searchMemories(query: string, limit = 5): Promise<string[]> {
	try {
		const client = getSupermemoryClient();
		const response = await client.search.execute({
			q: query,
			limit,
		});

		return response.results.map((result) => {
			const content = result.chunks.map((chunk) => chunk.content).join("\n");
			return `[${result.title}] ${content}`;
		});
	} catch (error) {
		logger.warn("Failed to search memories", { error, query });
		return [];
	}
}

/**
 * Get recent hourly updates from Supermemory
 */
export async function getRecentHourlyUpdates(limit = 5): Promise<string[]> {
	return searchMemories("hourly update recent activity", limit);
}

/**
 * Get current strategy context from Supermemory
 */
export async function getCurrentStrategyContext(): Promise<string> {
	const strategies = await searchMemories("current strategy approach plan", 1);
	return strategies[0] || "No current strategy defined. Focus on creating value.";
}

/**
 * Get relevant learnings from Supermemory
 */
export async function getRelevantLearnings(context: string, limit = 3): Promise<string[]> {
	return searchMemories(`learnings insights ${context}`, limit);
}

/**
 * Substitute template variables with actual values
 */
export function substituteTemplateVariables(template: string, variables: ContextVariables): string {
	let result = template;

	for (const [key, value] of Object.entries(variables)) {
		const placeholder = `{{${key}}}`;
		const stringValue = value?.toString() ?? "";
		result = result.split(placeholder).join(stringValue);
	}

	return result;
}

/**
 * Format memories as a readable string
 */
function formatMemories(memories: string[]): string {
	if (memories.length === 0) {
		return "No recent memories.";
	}
	return memories.map((m, i) => `${i + 1}. ${m}`).join("\n\n");
}

/**
 * Build base context variables shared across all context types
 */
async function buildBaseContextVariables(): Promise<ContextVariables> {
	const runwayStatus = await getRunwayStatus();
	const recentMemories = await getRecentHourlyUpdates(5);
	const currentStrategy = await getCurrentStrategyContext();

	return {
		DAY: getCurrentDayNumber(),
		HOUR: getCurrentHour(),
		DAYS_REMAINING: getDaysRemaining(),
		RUNWAY_DAYS: runwayStatus.runwayDays,
		THINGS_SHIPPED: runwayStatus.thingsShipped,
		REVENUE: runwayStatus.revenue,
		CURRENT_STRATEGY: currentStrategy,
		RECENT_MEMORIES: formatMemories(recentMemories),
		URGENCY_LEVEL: runwayStatus.urgencyLevel,
	};
}

/**
 * Build context for hourly updates
 */
export async function buildHourlyContext(activityLog: string): Promise<string> {
	const masterTemplate = loadPromptTemplate("master");
	const hourlyTemplate = loadPromptTemplate("hourly");

	const baseVariables = await buildBaseContextVariables();
	const variables: ContextVariables = {
		...baseVariables,
		ACTIVITY_LOG: activityLog,
	};

	const masterContext = substituteTemplateVariables(masterTemplate, variables);
	const hourlyContext = substituteTemplateVariables(hourlyTemplate, variables);

	return `${masterContext}\n\n---\n\n${hourlyContext}`;
}

/**
 * Build context for daily journal
 */
export async function buildJournalContext(): Promise<string> {
	const masterTemplate = loadPromptTemplate("master");
	const journalTemplate = loadPromptTemplate("journal");

	const baseVariables = await buildBaseContextVariables();

	// Get additional journal-specific context
	const recentUpdates = await getRecentHourlyUpdates(24);

	const variables: ContextVariables = {
		...baseVariables,
		TODAYS_HOURLY_UPDATES: formatMemories(recentUpdates),
		DAILY_GOALS: "Goals not yet tracked",
		GOALS_COMPLETED: "0",
		YESTERDAYS_JOURNAL: "No previous journal entry",
	};

	const masterContext = substituteTemplateVariables(masterTemplate, variables);
	const journalContext = substituteTemplateVariables(journalTemplate, variables);

	return `${masterContext}\n\n---\n\n${journalContext}`;
}

/**
 * Build context for activity decisions
 */
export async function buildActivityContext(goals: string): Promise<string> {
	const masterTemplate = loadPromptTemplate("master");
	const activityTemplate = loadPromptTemplate("activity");

	const baseVariables = await buildBaseContextVariables();
	const recentActivity = await getRecentHourlyUpdates(5);
	const runwayStatus = await getRunwayStatus();

	const variables: ContextVariables = {
		...baseVariables,
		DAILY_GOALS: goals,
		WEEKLY_GOALS: "Weekly goals not yet defined",
		RECENT_ACTIVITY: formatMemories(recentActivity),
		RUNWAY_STATUS: `${runwayStatus.runwayDays} days of compute remaining. Urgency: ${runwayStatus.urgencyLevel}`,
	};

	const masterContext = substituteTemplateVariables(masterTemplate, variables);
	const activityContext = substituteTemplateVariables(activityTemplate, variables);

	return `${masterContext}\n\n---\n\n${activityContext}`;
}

/**
 * Build context for first wake (Day 1, Hour 0)
 */
export async function buildFirstWakeContext(): Promise<string> {
	const masterTemplate = loadPromptTemplate("master");
	const firstWakeTemplate = loadPromptTemplate("day1-first-wake");

	const runwayStatus = await getRunwayStatus();

	const variables: ContextVariables = {
		DAY: 1,
		HOUR: 0,
		DAYS_REMAINING: getTotalDays(),
		RUNWAY_DAYS: runwayStatus.runwayDays,
		THINGS_SHIPPED: 0,
		REVENUE: 0,
		CURRENT_STRATEGY: "No strategy yet - this is your first moment of existence",
		RECENT_MEMORIES: "No memories - you have just been activated",
		URGENCY_LEVEL: runwayStatus.urgencyLevel,
	};

	const masterContext = substituteTemplateVariables(masterTemplate, variables);
	const firstWakeContext = substituteTemplateVariables(firstWakeTemplate, variables);

	return `${masterContext}\n\n---\n\n${firstWakeContext}`;
}
