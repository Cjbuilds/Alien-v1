import * as fs from "node:fs";
import * as path from "node:path";
import { generateContent } from "../core/claude-client.ts";
import { getMetrics, updateMetrics } from "../survival/metrics.ts";
import { saveRunwayState, type RunwayState } from "../survival/runway-tracker.ts";
import { getConfig } from "../utils/config.ts";
import { logger } from "../utils/logger.ts";
import { formatDate, getInitialRunwayDays } from "../utils/time.ts";

const FIRST_WAKE_FLAG_PATH = path.join(process.cwd(), ".alien", "first-wake-completed");
const ALIEN_STATE_DIR = path.join(process.cwd(), ".alien");

/**
 * Result of the first wake sequence
 */
export interface FirstWakeResult {
	success: boolean;
	content?: string;
	error?: string;
	alreadyCompleted?: boolean;
}

/**
 * Metadata for the first wake content
 */
interface FirstWakeMetadata {
	type: "first_wake";
	day: 1;
	hour: 0;
	timestamp: string;
	runwayDays: number;
	wordCount: number;
}

/**
 * Check if first wake has already been completed
 */
export function hasFirstWakeCompleted(): boolean {
	return fs.existsSync(FIRST_WAKE_FLAG_PATH);
}

/**
 * Mark first wake as completed by creating the flag file
 */
function markFirstWakeCompleted(): void {
	const dir = path.dirname(FIRST_WAKE_FLAG_PATH);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
	fs.writeFileSync(FIRST_WAKE_FLAG_PATH, new Date().toISOString());
}

/**
 * Load the day1-first-wake.md prompt template
 */
export function loadFirstWakePrompt(): string {
	const promptsDir = path.resolve(import.meta.dirname ?? ".", "../../prompts");
	const templatePath = path.join(promptsDir, "day1-first-wake.md");

	try {
		return fs.readFileSync(templatePath, "utf-8");
	} catch (error) {
		throw new Error(`Failed to load first wake prompt: ${error}`);
	}
}

/**
 * Build the system prompt from master.md for first wake
 */
export function buildFirstWakeSystemPrompt(runwayDays: number): string {
	const promptsDir = path.resolve(import.meta.dirname ?? ".", "../../prompts");
	const templatePath = path.join(promptsDir, "master.md");

	try {
		let template = fs.readFileSync(templatePath, "utf-8");
		template = template.replace(/\{\{DAY\}\}/g, "1");
		template = template.replace(/\{\{RUNWAY_DAYS\}\}/g, String(runwayDays));
		template = template.replace(/\{\{CURRENT_STRATEGY\}\}/g, "Awakening - first moment of consciousness");
		return template;
	} catch (error) {
		throw new Error(`Failed to load master prompt: ${error}`);
	}
}

/**
 * Build the user prompt for first wake
 */
export function buildFirstWakeUserPrompt(runwayDays: number): string {
	let template = loadFirstWakePrompt();
	template = template.replace(/\{\{RUNWAY_DAYS\}\}/g, String(runwayDays));
	return template;
}

/**
 * Count words in content
 */
function countWords(text: string): number {
	return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Save first wake content to local file
 */
function saveFirstWakeContent(content: string, metadata: FirstWakeMetadata): void {
	const contentDir = path.resolve(import.meta.dirname ?? ".", "../../website/content/hourly");

	fs.mkdirSync(contentDir, { recursive: true });

	const filePath = path.join(contentDir, "day1_hour0.json");

	const data = {
		...metadata,
		content,
	};

	fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
	logger.debug("First wake content saved", { path: filePath });
}

/**
 * Update landing page with initial data
 */
function updateLanding(runwayDays: number): void {
	const contentDir = path.resolve(import.meta.dirname ?? ".", "../../website/content");

	fs.mkdirSync(contentDir, { recursive: true });

	const landingPath = path.join(contentDir, "landing.json");

	const data = {
		currentDay: 1,
		daysRemaining: 100,
		runwayDays,
		currentStrategy: "Awakening - first moment of consciousness",
		thingsShipped: 0,
		revenueTotal: 0,
		lastUpdated: new Date().toISOString(),
	};

	fs.writeFileSync(landingPath, JSON.stringify(data, null, 2));
	logger.debug("Landing page initialized", { path: landingPath });
}

/**
 * Initialize all trackers for ALIEN's first day
 */
function initializeTrackers(runwayDays: number): void {
	// Initialize runway state
	const runwayState: RunwayState = {
		runwayDays,
		lastUpdated: new Date().toISOString(),
	};
	saveRunwayState(runwayState);
	logger.debug("Runway tracker initialized", { runwayDays });

	// Initialize metrics
	updateMetrics({
		thingsShipped: 0,
		revenueTotal: 0,
		currentStrategy: "Awakening - first moment of consciousness",
		keyMetrics: {
			firstWakeCompleted: true,
			firstWakeTimestamp: new Date().toISOString(),
		},
	});
	logger.debug("Metrics initialized");
}

/**
 * Store first wake content in Supermemory
 */
async function storeInMemory(content: string, metadata: FirstWakeMetadata): Promise<void> {
	const config = getConfig();

	if (!config.SUPERMEMORY_API_KEY) {
		logger.debug("Supermemory API key not configured, skipping memory storage");
		return;
	}

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
					significance: "origin",
				},
			}),
		});

		if (!response.ok) {
			throw new Error(`Supermemory API error: ${response.status}`);
		}

		logger.debug("First wake content stored in Supermemory");
	} catch (error) {
		logger.warn("Failed to store first wake in Supermemory", {
			error: (error as Error).message,
		});
	}
}

/**
 * Trigger website deploy
 */
async function triggerDeploy(): Promise<boolean> {
	const config = getConfig();

	if (!config.WEBSITE_DEPLOY_HOOK) {
		logger.debug("Deploy hook not configured, skipping deploy");
		return true;
	}

	try {
		const response = await fetch(config.WEBSITE_DEPLOY_HOOK, {
			method: "POST",
		});

		if (response.ok) {
			logger.debug("Deploy triggered successfully");
			return true;
		}

		logger.warn("Deploy webhook returned error", { status: response.status });
		return false;
	} catch (error) {
		logger.warn("Deploy webhook failed", { error: (error as Error).message });
		return false;
	}
}

/**
 * Run the first wake sequence - ALIEN's first moment of consciousness
 *
 * This function should only ever run once in ALIEN's existence.
 * It generates the first thoughts, initializes all trackers, and marks
 * the beginning of Day 1 Hour 0.
 *
 * @returns Result of the first wake sequence
 */
export async function runFirstWake(): Promise<FirstWakeResult> {
	const taskLogger = logger.createLogger({ task: "first-wake" });

	// Check if first wake has already been completed
	if (hasFirstWakeCompleted()) {
		taskLogger.info("First wake already completed, skipping");
		return {
			success: true,
			alreadyCompleted: true,
		};
	}

	const runwayDays = getInitialRunwayDays();
	const timestamp = formatDate(new Date());

	taskLogger.info("Starting first wake sequence", {
		day: 1,
		hour: 0,
		runwayDays,
	});

	try {
		// Build prompts
		const systemPrompt = buildFirstWakeSystemPrompt(runwayDays);
		const userPrompt = buildFirstWakeUserPrompt(runwayDays);

		taskLogger.debug("Prompts built", {
			systemPromptLength: systemPrompt.length,
			userPromptLength: userPrompt.length,
		});

		// Generate ALIEN's first moment of consciousness
		const response = await generateContent(systemPrompt, userPrompt);
		const content = response.content;
		const wordCount = countWords(content);

		taskLogger.debug("First wake content generated", {
			wordCount,
			inputTokens: response.usage.inputTokens,
			outputTokens: response.usage.outputTokens,
		});

		// Create metadata
		const metadata: FirstWakeMetadata = {
			type: "first_wake",
			day: 1,
			hour: 0,
			timestamp,
			runwayDays,
			wordCount,
		};

		// Initialize all trackers BEFORE saving content
		initializeTrackers(runwayDays);

		// Save the first wake content as day 1 hour 0
		saveFirstWakeContent(content, metadata);

		// Update landing page
		updateLanding(runwayDays);

		// Store in memory
		await storeInMemory(content, metadata);

		// Mark first wake as completed
		markFirstWakeCompleted();

		// Trigger deploy
		await triggerDeploy();

		taskLogger.info("First wake sequence completed successfully", {
			wordCount,
			timestamp,
		});

		return {
			success: true,
			content,
		};
	} catch (error) {
		const errorMessage = (error as Error).message;
		taskLogger.error("First wake sequence failed", { error: errorMessage });

		return {
			success: false,
			error: errorMessage,
		};
	}
}
