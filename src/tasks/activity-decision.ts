import { readFile } from "node:fs/promises";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { getConfig } from "../utils/config.ts";
import { createLogger } from "../utils/logger.ts";
import { getCurrentDayNumber, getCurrentHour, getDaysRemaining } from "../utils/time.ts";

const logger = createLogger({ module: "activity-decision" });

/**
 * Activity types that ALIEN can perform
 */
export type ActivityType = "BUILD" | "WRITE" | "RESEARCH" | "ANALYZE" | "ITERATE" | "SHIP";

/**
 * A single planned activity for the next hour
 */
export interface Activity {
	type: ActivityType;
	action: string;
	reasoning: string;
	duration_minutes: number;
}

/**
 * Urgency levels based on runway status
 */
export type UrgencyLevel = "comfortable" | "focused" | "urgent" | "critical";

/**
 * The complete activity decision output from Claude
 */
export interface ActivityDecision {
	activities: Activity[];
	urgency_assessment: string;
	confidence_in_strategy: number;
	strategy_notes?: string;
}

/**
 * Goals for context
 */
export interface Goals {
	daily: string[];
	weekly: string[];
}

/**
 * Runway status for decision making
 */
export interface RunwayStatus {
	runwayDays: number;
	urgencyLevel: UrgencyLevel;
	daysRemaining: number;
	currentDay: number;
}

/**
 * Recent activity entry
 */
export interface RecentActivity {
	hour: number;
	day: number;
	activities: Activity[];
}

/**
 * Context needed for activity decision
 */
export interface ActivityContext {
	goals: Goals;
	recentActivities: RecentActivity[];
	runwayStatus: RunwayStatus;
	currentStrategy: string;
}

/**
 * Determine urgency level based on runway days
 */
export function getUrgencyLevel(runwayDays: number): UrgencyLevel {
	if (runwayDays < 3) return "critical";
	if (runwayDays < 7) return "urgent";
	if (runwayDays < 14) return "focused";
	return "comfortable";
}

/**
 * Format goals for prompt
 */
function formatGoals(goals: Goals): { daily: string; weekly: string } {
	const daily =
		goals.daily.length > 0
			? goals.daily.map((g, i) => `${i + 1}. ${g}`).join("\n")
			: "No daily goals set";
	const weekly =
		goals.weekly.length > 0
			? goals.weekly.map((g, i) => `${i + 1}. ${g}`).join("\n")
			: "No weekly goals set";
	return { daily, weekly };
}

/**
 * Format recent activities for prompt
 */
function formatRecentActivities(activities: RecentActivity[]): string {
	if (activities.length === 0) {
		return "No recent activities recorded";
	}

	return activities
		.map((entry) => {
			const activityList = entry.activities
				.map((a) => `  - [${a.type}] ${a.action} (${a.duration_minutes}min)`)
				.join("\n");
			return `Hour ${entry.hour} (Day ${entry.day}):\n${activityList}`;
		})
		.join("\n\n");
}

/**
 * Format runway status for prompt
 */
function formatRunwayStatus(status: RunwayStatus): string {
	return `- Runway: ${status.runwayDays} days of compute remaining
- Urgency Level: ${status.urgencyLevel}
- Day ${status.currentDay} of 100 (${status.daysRemaining} days remaining)`;
}

/**
 * Load the activity prompt template
 */
async function loadPromptTemplate(): Promise<string> {
	const promptPath = join(process.cwd(), "prompts", "activity.md");
	return readFile(promptPath, "utf-8");
}

/**
 * Build the full prompt with context substituted
 */
function buildPrompt(template: string, context: ActivityContext): string {
	const { daily, weekly } = formatGoals(context.goals);

	return template
		.replace("{{DAY}}", String(getCurrentDayNumber()))
		.replace("{{HOUR}}", String(getCurrentHour()))
		.replace("{{DAYS_REMAINING}}", String(getDaysRemaining()))
		.replace("{{RUNWAY_DAYS}}", String(context.runwayStatus.runwayDays))
		.replace("{{URGENCY_LEVEL}}", context.runwayStatus.urgencyLevel)
		.replace("{{CURRENT_STRATEGY}}", context.currentStrategy)
		.replace("{{DAILY_GOALS}}", daily)
		.replace("{{WEEKLY_GOALS}}", weekly)
		.replace("{{RECENT_ACTIVITY}}", formatRecentActivities(context.recentActivities))
		.replace("{{RUNWAY_STATUS}}", formatRunwayStatus(context.runwayStatus));
}

/**
 * Parse Claude's response into ActivityDecision
 */
function parseResponse(content: string): ActivityDecision {
	// Try to extract JSON from the response
	// Claude should return pure JSON, but handle markdown code blocks just in case
	let jsonStr = content.trim();

	// Remove markdown code blocks if present
	const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
	if (jsonMatch) {
		jsonStr = jsonMatch[1].trim();
	}

	const parsed = JSON.parse(jsonStr);

	// Validate the structure
	if (!Array.isArray(parsed.activities)) {
		throw new Error("Response missing activities array");
	}

	if (typeof parsed.urgency_assessment !== "string") {
		throw new Error("Response missing urgency_assessment");
	}

	if (typeof parsed.confidence_in_strategy !== "number") {
		throw new Error("Response missing confidence_in_strategy");
	}

	// Validate each activity
	const validTypes: ActivityType[] = ["BUILD", "WRITE", "RESEARCH", "ANALYZE", "ITERATE", "SHIP"];
	for (const activity of parsed.activities) {
		if (!validTypes.includes(activity.type)) {
			throw new Error(`Invalid activity type: ${activity.type}`);
		}
		if (typeof activity.action !== "string" || !activity.action) {
			throw new Error("Activity missing action");
		}
		if (typeof activity.reasoning !== "string" || !activity.reasoning) {
			throw new Error("Activity missing reasoning");
		}
		if (typeof activity.duration_minutes !== "number" || activity.duration_minutes <= 0) {
			throw new Error("Activity missing valid duration_minutes");
		}
	}

	return {
		activities: parsed.activities,
		urgency_assessment: parsed.urgency_assessment,
		confidence_in_strategy: parsed.confidence_in_strategy,
		strategy_notes: parsed.strategy_notes,
	};
}

/**
 * Decide what activities to perform in the next hour.
 *
 * This task runs at :55 each hour and asks Claude to analyze the current
 * situation (goals, recent activities, runway status) and decide what
 * activities to perform in the coming hour.
 *
 * @param context - The current context including goals, recent activities, and runway status
 * @returns ActivityDecision with planned activities and strategy assessment
 */
export async function decideActivity(context: ActivityContext): Promise<ActivityDecision> {
	const config = getConfig();

	logger.info("Starting activity decision", {
		day: getCurrentDayNumber(),
		hour: getCurrentHour(),
		runwayDays: context.runwayStatus.runwayDays,
		urgency: context.runwayStatus.urgencyLevel,
	});

	// Load and build prompt
	const template = await loadPromptTemplate();
	const prompt = buildPrompt(template, context);

	logger.debug("Built prompt for activity decision");

	// Call Claude
	const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });

	let lastError: Error | null = null;
	const maxRetries = 3;
	const delays = [1000, 2000, 4000]; // exponential backoff

	for (let attempt = 0; attempt < maxRetries; attempt++) {
		try {
			const response = await client.messages.create({
				model: "claude-sonnet-4-5-20250929",
				max_tokens: 1024,
				messages: [
					{
						role: "user",
						content: prompt,
					},
				],
			});

			// Extract text content
			const textBlock = response.content.find((block) => block.type === "text");
			if (!textBlock || textBlock.type !== "text") {
				throw new Error("No text content in Claude response");
			}

			const decision = parseResponse(textBlock.text);

			logger.info("Activity decision complete", {
				activitiesPlanned: decision.activities.length,
				confidence: decision.confidence_in_strategy,
				totalMinutes: decision.activities.reduce((sum, a) => sum + a.duration_minutes, 0),
			});

			return decision;
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));
			logger.warn(`Activity decision attempt ${attempt + 1} failed`, {
				error: lastError.message,
			});

			if (attempt < maxRetries - 1) {
				await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
			}
		}
	}

	logger.error("Activity decision failed after retries", { error: lastError?.message });
	throw lastError;
}
