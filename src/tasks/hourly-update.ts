import * as fs from "node:fs";
import * as path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { getConfig } from "../utils/config.ts";
import { logger } from "../utils/logger.ts";
import {
	formatDate,
	getCurrentDayNumber,
	getCurrentHour,
	getDaysRemaining,
	getInitialRunwayDays,
} from "../utils/time.ts";

/**
 * Result of an hourly update run
 */
export interface HourlyUpdateResult {
	success: boolean;
	day: number;
	hour: number;
	content?: string;
	error?: string;
}

/**
 * Metadata for hourly update content
 */
interface HourlyUpdateMetadata {
	type: "hourly_update";
	day: number;
	hour: number;
	timestamp: string;
	runwayDays: number;
	currentStrategy: string;
	wordCount: number;
}

/**
 * Calculate urgency level based on runway days
 */
export function getUrgencyLevel(runwayDays: number): string {
	if (runwayDays <= 3) return "critical";
	if (runwayDays <= 7) return "high";
	if (runwayDays <= 14) return "medium";
	return "low";
}

/**
 * Load a prompt template from the prompts directory
 */
export function loadPromptTemplate(templateName: string): string {
	const promptsDir = path.resolve(import.meta.dirname ?? ".", "../../prompts");
	const templatePath = path.join(promptsDir, `${templateName}.md`);

	try {
		return fs.readFileSync(templatePath, "utf-8");
	} catch (error) {
		throw new Error(`Failed to load prompt template ${templateName}: ${error}`);
	}
}

/**
 * Substitute template variables in a prompt
 */
export function substituteVariables(
	template: string,
	variables: Record<string, string | number>,
): string {
	let result = template;
	for (const [key, value] of Object.entries(variables)) {
		result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), String(value));
	}
	return result;
}

/**
 * Build the system prompt from master.md template
 */
export function buildSystemPrompt(
	day: number,
	runwayDays: number,
	currentStrategy: string,
): string {
	const template = loadPromptTemplate("master");
	return substituteVariables(template, {
		DAY: day,
		RUNWAY_DAYS: runwayDays,
		CURRENT_STRATEGY: currentStrategy,
	});
}

/**
 * Build the user prompt from hourly.md template
 */
export function buildUserPrompt(
	day: number,
	hour: number,
	runwayDays: number,
	currentStrategy: string,
	activityLog: string,
	recentMemories: string,
): string {
	const template = loadPromptTemplate("hourly");
	const urgencyLevel = getUrgencyLevel(runwayDays);
	return substituteVariables(template, {
		DAY: day,
		HOUR: hour,
		RUNWAY_DAYS: runwayDays,
		CURRENT_STRATEGY: currentStrategy,
		URGENCY_LEVEL: urgencyLevel,
		ACTIVITY_LOG: activityLog || "No recent activity logged.",
		RECENT_MEMORIES: recentMemories || "No recent memories available.",
	});
}

/**
 * Call Claude API with retry logic
 */
async function callClaudeAPI(
	systemPrompt: string,
	userPrompt: string,
	maxRetries = 3,
): Promise<string> {
	const config = getConfig();
	const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });

	let lastError: Error | null = null;
	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			logger.debug("Calling Claude API", { attempt, maxRetries });
			const response = await client.messages.create({
				model: "claude-sonnet-4-5-20250929",
				max_tokens: 1024,
				system: systemPrompt,
				messages: [{ role: "user", content: userPrompt }],
			});

			const textContent = response.content.find((block) => block.type === "text");
			if (!textContent || textContent.type !== "text") {
				throw new Error("No text content in Claude response");
			}

			logger.debug("Claude API response received", {
				inputTokens: response.usage.input_tokens,
				outputTokens: response.usage.output_tokens,
			});

			return textContent.text;
		} catch (error) {
			lastError = error as Error;
			logger.warn("Claude API call failed", {
				attempt,
				error: lastError.message,
			});
			if (attempt < maxRetries) {
				const delay = 1000 * 2 ** (attempt - 1);
				await new Promise((resolve) => setTimeout(resolve, delay));
			}
		}
	}

	throw new Error(`Claude API failed after ${maxRetries} attempts: ${lastError?.message}`);
}

/**
 * Save hourly update content to local file
 */
function saveContent(
	day: number,
	hour: number,
	content: string,
	metadata: HourlyUpdateMetadata,
): void {
	const contentDir = path.resolve(import.meta.dirname ?? ".", "../../website/content/hourly");

	fs.mkdirSync(contentDir, { recursive: true });

	const fileName = `day${day}_hour${hour}.json`;
	const filePath = path.join(contentDir, fileName);

	const data = {
		...metadata,
		content,
	};

	fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
	logger.debug("Content saved locally", { path: filePath });
}

/**
 * Update landing page data
 */
function updateLanding(
	currentDay: number,
	daysRemaining: number,
	runwayDays: number,
	currentStrategy: string,
): void {
	const contentDir = path.resolve(import.meta.dirname ?? ".", "../../website/content");

	fs.mkdirSync(contentDir, { recursive: true });

	const landingPath = path.join(contentDir, "landing.json");

	const data = {
		currentDay,
		daysRemaining,
		runwayDays,
		currentStrategy,
		thingsShipped: 0,
		revenueTotal: 0,
		lastUpdated: new Date().toISOString(),
	};

	fs.writeFileSync(landingPath, JSON.stringify(data, null, 2));
	logger.debug("Landing page updated", { path: landingPath });
}

/**
 * Store content in Supermemory
 */
async function storeInMemory(content: string, metadata: HourlyUpdateMetadata): Promise<void> {
	const config = getConfig();

	try {
		const response = await fetch("https://api.supermemory.ai/v1/memories", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${config.SUPERMEMORY_API_KEY}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				content,
				metadata: {
					type: metadata.type,
					day: metadata.day,
					hour: metadata.hour,
					timestamp: metadata.timestamp,
					runwayDays: metadata.runwayDays,
					currentStrategy: metadata.currentStrategy,
				},
			}),
		});

		if (!response.ok) {
			throw new Error(`Supermemory API error: ${response.status}`);
		}

		logger.debug("Content stored in Supermemory");
	} catch (error) {
		logger.warn("Failed to store in Supermemory", {
			error: (error as Error).message,
		});
	}
}

/**
 * Trigger website deploy via webhook
 */
async function triggerDeploy(): Promise<boolean> {
	const config = getConfig();
	const maxRetries = 3;

	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			const response = await fetch(config.WEBSITE_DEPLOY_HOOK, {
				method: "POST",
			});

			if (response.ok) {
				logger.debug("Deploy triggered successfully");
				return true;
			}

			logger.warn("Deploy webhook returned error", {
				status: response.status,
				attempt,
			});
		} catch (error) {
			logger.warn("Deploy webhook failed", {
				attempt,
				error: (error as Error).message,
			});
		}

		if (attempt < maxRetries) {
			const delay = 1000 * 2 ** (attempt - 1);
			await new Promise((resolve) => setTimeout(resolve, delay));
		}
	}

	logger.error("Deploy failed after all retries");
	return false;
}

/**
 * Count words in content
 */
export function countWords(text: string): number {
	return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Run the hourly update task
 *
 * @param activityLog - Recent activity log to include in context
 * @returns Result of the hourly update
 */
export async function runHourlyUpdate(activityLog: string): Promise<HourlyUpdateResult> {
	const taskLogger = logger.createLogger({ task: "hourly-update" });

	const day = getCurrentDayNumber();
	const hour = getCurrentHour();
	const daysRemaining = getDaysRemaining();
	const runwayDays = getInitialRunwayDays();
	const currentStrategy = "Building in public - shipping daily";
	const timestamp = formatDate(new Date());

	taskLogger.info("Starting hourly update", {
		day,
		hour,
		runwayDays,
		daysRemaining,
	});

	try {
		const systemPrompt = buildSystemPrompt(day, runwayDays, currentStrategy);
		const userPrompt = buildUserPrompt(day, hour, runwayDays, currentStrategy, activityLog, "");

		taskLogger.debug("Prompts built", {
			systemPromptLength: systemPrompt.length,
			userPromptLength: userPrompt.length,
		});

		const content = await callClaudeAPI(systemPrompt, userPrompt);
		const wordCount = countWords(content);

		taskLogger.debug("Content generated", { wordCount });

		const metadata: HourlyUpdateMetadata = {
			type: "hourly_update",
			day,
			hour,
			timestamp,
			runwayDays,
			currentStrategy,
			wordCount,
		};

		saveContent(day, hour, content, metadata);

		await storeInMemory(content, metadata);

		updateLanding(day, daysRemaining, runwayDays, currentStrategy);

		await triggerDeploy();

		taskLogger.info("Hourly update completed", {
			day,
			hour,
			wordCount,
		});

		return {
			success: true,
			day,
			hour,
			content,
		};
	} catch (error) {
		const errorMessage = (error as Error).message;
		taskLogger.error("Hourly update failed", { error: errorMessage });

		return {
			success: false,
			day,
			hour,
			error: errorMessage,
		};
	}
}
