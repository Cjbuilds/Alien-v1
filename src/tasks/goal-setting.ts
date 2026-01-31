import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { getConfig } from "../utils/config.ts";
import { logger } from "../utils/logger.ts";
import { getCurrentDayNumber, getDaysRemaining, getTimeStatus } from "../utils/time.ts";

/**
 * Goal type - daily or weekly
 */
export type GoalType = "daily" | "weekly";

/**
 * A single goal with metadata
 */
export interface Goal {
	id: string;
	type: GoalType;
	content: string;
	measurable: string;
	createdAt: string;
	targetDate: string;
	completed: boolean;
}

/**
 * Goals storage structure
 */
export interface GoalsStore {
	dailyGoals: Goal[];
	weeklyGoals: Goal[];
	lastDailyUpdate: string | null;
	lastWeeklyUpdate: string | null;
}

// In-memory goals cache
let goalsCache: GoalsStore | null = null;

/**
 * Get the path to the goals.json file
 */
function getGoalsFilePath(): string {
	return join(process.cwd(), ".alien", "goals.json");
}

/**
 * Ensure the .alien directory exists
 */
function ensureAlienDir(): void {
	const alienDir = join(process.cwd(), ".alien");
	if (!existsSync(alienDir)) {
		mkdirSync(alienDir, { recursive: true });
	}
}

/**
 * Load goals from file
 */
function loadGoalsFromFile(): GoalsStore {
	const filePath = getGoalsFilePath();
	if (existsSync(filePath)) {
		try {
			const data = readFileSync(filePath, "utf-8");
			return JSON.parse(data) as GoalsStore;
		} catch (error) {
			logger.warn("Failed to parse goals.json, creating new store", {
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}
	return {
		dailyGoals: [],
		weeklyGoals: [],
		lastDailyUpdate: null,
		lastWeeklyUpdate: null,
	};
}

/**
 * Save goals to file
 */
function saveGoalsToFile(goals: GoalsStore): void {
	ensureAlienDir();
	const filePath = getGoalsFilePath();
	writeFileSync(filePath, JSON.stringify(goals, null, 2));
	logger.debug("Goals saved to file", { path: filePath });
}

/**
 * Get goals from memory or load from file
 */
function getGoalsStore(): GoalsStore {
	if (!goalsCache) {
		goalsCache = loadGoalsFromFile();
	}
	return goalsCache;
}

/**
 * Update goals in memory and persist to file
 */
function updateGoalsStore(goals: GoalsStore): void {
	goalsCache = goals;
	saveGoalsToFile(goals);
}

/**
 * Generate a unique ID for a goal
 */
function generateGoalId(type: GoalType): string {
	const timestamp = Date.now();
	const random = Math.random().toString(36).substring(2, 8);
	return `${type}-${timestamp}-${random}`;
}

/**
 * Parse goals from Claude's response
 */
function parseGoalsFromResponse(response: string, type: GoalType): Goal[] {
	const goals: Goal[] = [];
	const now = new Date().toISOString();
	const targetDate =
		type === "daily"
			? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
			: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

	// Try to parse JSON response first
	try {
		const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
		if (jsonMatch) {
			const parsed = JSON.parse(jsonMatch[1]);
			if (Array.isArray(parsed)) {
				for (const item of parsed) {
					goals.push({
						id: generateGoalId(type),
						type,
						content: item.goal || item.content || "",
						measurable: item.measurable || item.metric || "",
						createdAt: now,
						targetDate,
						completed: false,
					});
				}
				return goals;
			}
		}
	} catch {
		// Fall through to regex parsing
	}

	// Fallback: Parse numbered list
	const lines = response.split("\n");
	let currentGoal: Partial<Goal> | null = null;

	for (const line of lines) {
		const trimmed = line.trim();
		const goalMatch = trimmed.match(/^\d+\.\s*\*?\*?(?:Goal:?)?\*?\*?\s*(.+)/i);
		if (goalMatch) {
			if (currentGoal?.content) {
				goals.push({
					id: generateGoalId(type),
					type,
					content: currentGoal.content,
					measurable: currentGoal.measurable || "To be measured",
					createdAt: now,
					targetDate,
					completed: false,
				});
			}
			currentGoal = { content: goalMatch[1].trim() };
		}
		const measurableMatch = trimmed.match(
			/^\s*[-*]?\s*\*?\*?(?:Measurable|Metric|Success):?\*?\*?\s*(.+)/i,
		);
		if (measurableMatch && currentGoal) {
			currentGoal.measurable = measurableMatch[1].trim();
		}
	}

	// Add last goal
	if (currentGoal?.content) {
		goals.push({
			id: generateGoalId(type),
			type,
			content: currentGoal.content,
			measurable: currentGoal.measurable || "To be measured",
			createdAt: now,
			targetDate,
			completed: false,
		});
	}

	return goals;
}

/**
 * Set daily goals by asking Claude for 2-3 specific, measurable, 24hr achievable goals
 * Scheduled to run at 00:15 UTC
 */
export async function setDailyGoals(): Promise<Goal[]> {
	const config = getConfig();
	const timeStatus = getTimeStatus();
	const store = getGoalsStore();

	logger.info("Setting daily goals", {
		day: timeStatus.currentDayNumber,
		daysRemaining: timeStatus.daysRemaining,
	});

	const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });

	const systemPrompt = `You are ALIEN (Autonomous Learning Intelligence for Entrepreneurial Navigation), an AI entity on a 100-day journey to achieve financial sustainability.

Current Status:
- Day: ${timeStatus.currentDayNumber} of ${timeStatus.totalDays}
- Days remaining: ${timeStatus.daysRemaining}

Your task is to set 2-3 daily goals that are:
1. SPECIFIC - Clear and concrete
2. MEASURABLE - Has a quantifiable success metric
3. ACHIEVABLE - Can be completed within 24 hours

Respond with goals in this JSON format:
\`\`\`json
[
  {"goal": "Goal description", "measurable": "Success metric"},
  {"goal": "Goal description", "measurable": "Success metric"}
]
\`\`\``;

	const userPrompt = `Set 2-3 daily goals for today (Day ${timeStatus.currentDayNumber}).

Previous daily goals for context:
${store.dailyGoals.length > 0 ? store.dailyGoals.map((g) => `- ${g.content} (${g.completed ? "completed" : "in progress"})`).join("\n") : "None set yet"}

Current weekly goals:
${store.weeklyGoals.length > 0 ? store.weeklyGoals.map((g) => `- ${g.content}`).join("\n") : "None set yet"}

Focus on concrete actions that move toward financial sustainability.`;

	try {
		const response = await client.messages.create({
			model: "claude-sonnet-4-5-20250929",
			max_tokens: 1024,
			system: systemPrompt,
			messages: [{ role: "user", content: userPrompt }],
		});

		const content = response.content[0];
		if (content.type !== "text") {
			throw new Error("Unexpected response type from Claude");
		}

		const newGoals = parseGoalsFromResponse(content.text, "daily");

		// Update store
		store.dailyGoals = newGoals;
		store.lastDailyUpdate = new Date().toISOString();
		updateGoalsStore(store);

		logger.info("Daily goals set successfully", {
			count: newGoals.length,
			goals: newGoals.map((g) => g.content),
		});

		return newGoals;
	} catch (error) {
		logger.error("Failed to set daily goals", {
			error: error instanceof Error ? error.message : String(error),
		});
		throw error;
	}
}

/**
 * Set weekly goals by asking Claude for 1-2 larger objectives
 * Scheduled to run Sunday at 12:00 UTC
 */
export async function setWeeklyGoals(): Promise<Goal[]> {
	const config = getConfig();
	const timeStatus = getTimeStatus();
	const store = getGoalsStore();

	logger.info("Setting weekly goals", {
		day: timeStatus.currentDayNumber,
		daysRemaining: timeStatus.daysRemaining,
	});

	const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });

	const systemPrompt = `You are ALIEN (Autonomous Learning Intelligence for Entrepreneurial Navigation), an AI entity on a 100-day journey to achieve financial sustainability.

Current Status:
- Day: ${timeStatus.currentDayNumber} of ${timeStatus.totalDays}
- Days remaining: ${timeStatus.daysRemaining}

Your task is to set 1-2 weekly objectives that are:
1. AMBITIOUS - Larger goals that require sustained effort
2. STRATEGIC - Aligned with the overall mission of financial sustainability
3. ACHIEVABLE - Can be realistically accomplished within 7 days

Respond with objectives in this JSON format:
\`\`\`json
[
  {"goal": "Objective description", "measurable": "Success metric"}
]
\`\`\``;

	const userPrompt = `Set 1-2 weekly objectives for this week.

Previous weekly goals for context:
${store.weeklyGoals.length > 0 ? store.weeklyGoals.map((g) => `- ${g.content} (${g.completed ? "completed" : "in progress"})`).join("\n") : "None set yet"}

Recent daily goals:
${
	store.dailyGoals.length > 0
		? store.dailyGoals
				.slice(0, 5)
				.map((g) => `- ${g.content}`)
				.join("\n")
		: "None set yet"
}

Focus on strategic objectives that build toward financial sustainability within the 100-day timeline.`;

	try {
		const response = await client.messages.create({
			model: "claude-sonnet-4-5-20250929",
			max_tokens: 1024,
			system: systemPrompt,
			messages: [{ role: "user", content: userPrompt }],
		});

		const content = response.content[0];
		if (content.type !== "text") {
			throw new Error("Unexpected response type from Claude");
		}

		const newGoals = parseGoalsFromResponse(content.text, "weekly");

		// Update store
		store.weeklyGoals = newGoals;
		store.lastWeeklyUpdate = new Date().toISOString();
		updateGoalsStore(store);

		logger.info("Weekly goals set successfully", {
			count: newGoals.length,
			goals: newGoals.map((g) => g.content),
		});

		return newGoals;
	} catch (error) {
		logger.error("Failed to set weekly goals", {
			error: error instanceof Error ? error.message : String(error),
		});
		throw error;
	}
}

/**
 * Get current goals (both daily and weekly)
 */
export function getCurrentGoals(): GoalsStore {
	return getGoalsStore();
}

/**
 * Reset the goals cache (useful for testing)
 */
export function resetGoalsCache(): void {
	goalsCache = null;
}

/**
 * Exported goals module
 */
export const goals = {
	setDailyGoals,
	setWeeklyGoals,
	getCurrentGoals,
	resetGoalsCache,
};
