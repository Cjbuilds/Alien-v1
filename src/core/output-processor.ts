/**
 * Output Processor for ALIEN
 *
 * Takes Claude's response, parses content, saves via content-writer,
 * stores in Supermemory, updates metrics if needed, triggers website deploy,
 * and logs everything.
 *
 * Error handling: Always save locally even if other steps fail.
 */

import { createLogger } from "../utils/logger.ts";

const log = createLogger({ module: "output-processor" });

/**
 * Claude API response structure
 */
export interface ClaudeResponse {
	content: string;
	usage?: {
		input_tokens: number;
		output_tokens: number;
	};
	model?: string;
	stop_reason?: string;
}

/**
 * Activity type from activity decision
 */
export type ActivityType = "BUILD" | "WRITE" | "RESEARCH" | "ANALYZE" | "ITERATE" | "SHIP";

/**
 * Single activity in the activity decision
 */
export interface Activity {
	type: ActivityType;
	action: string;
	reasoning: string;
	duration_minutes: number;
}

/**
 * Activity decision output from Claude
 */
export interface ActivityDecision {
	activities: Activity[];
	urgency_assessment: string;
	confidence_in_strategy: number;
	strategy_notes: string;
}

/**
 * Metadata included with content
 */
export interface ContentMetadata {
	day: number;
	hour?: number;
	timestamp: string;
	runway_days: number;
	urgency: string;
	current_strategy: string;
	word_count: number;
}

/**
 * Result of processing output
 */
export interface ProcessResult {
	success: boolean;
	localSaved: boolean;
	memorySaved: boolean;
	deployed: boolean;
	metricsUpdated: boolean;
	errors: string[];
}

/**
 * Interface for content writer dependency
 */
export interface ContentWriter {
	writeHourlyUpdate(
		day: number,
		hour: number,
		content: string,
		metadata: ContentMetadata,
	): Promise<void>;
	writeDailyJournal(day: number, content: string, metadata: ContentMetadata): Promise<void>;
	updateLanding(
		currentDay: number,
		daysRemaining: number,
		runwayDays: number,
		thingsShipped: number,
		revenueTotal: number,
		currentStrategy: string,
	): Promise<void>;
}

/**
 * Interface for memory store dependency
 */
export interface MemoryStore {
	storeHourlyUpdate(
		content: string,
		metadata: Record<string, unknown>,
	): Promise<{ success: boolean }>;
	storeDailyJournal(
		content: string,
		metadata: Record<string, unknown>,
	): Promise<{ success: boolean }>;
	storeStrategicLearning(
		content: string,
		category: string,
		confidence: number,
	): Promise<{ success: boolean }>;
}

/**
 * Interface for metrics tracker dependency
 */
export interface MetricsTracker {
	getMetrics(): Promise<{
		thingsShipped: number;
		revenueTotal: number;
		currentStrategy: string;
	}>;
	setStrategy(strategy: string): Promise<void>;
}

/**
 * Interface for runway tracker dependency
 */
export interface RunwayTracker {
	getRunwayStatus(): Promise<{
		currentDay: number;
		daysRemaining: number;
		runwayDays: number;
		urgencyLevel: string;
	}>;
}

/**
 * Interface for deploy trigger dependency
 */
export interface DeployTrigger {
	triggerDeploy(): Promise<boolean>;
}

/**
 * Dependencies required by the output processor
 */
export interface OutputProcessorDeps {
	contentWriter: ContentWriter;
	memoryStore: MemoryStore;
	metricsTracker: MetricsTracker;
	runwayTracker: RunwayTracker;
	deployTrigger: DeployTrigger;
}

/**
 * Parse the content from Claude's response
 */
function parseContent(response: ClaudeResponse): string {
	if (!response.content) {
		throw new Error("Empty response content from Claude");
	}
	const trimmed = response.content.trim();
	if (!trimmed) {
		throw new Error("Empty response content from Claude");
	}
	return trimmed;
}

/**
 * Parse activity decision JSON from Claude's response
 */
function parseActivityDecision(response: ClaudeResponse): ActivityDecision {
	const content = parseContent(response);

	// Try to extract JSON from markdown code blocks if present
	let jsonStr = content;
	const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
	if (jsonMatch) {
		jsonStr = jsonMatch[1].trim();
	}

	try {
		const parsed = JSON.parse(jsonStr) as ActivityDecision;

		// Validate required fields
		if (!Array.isArray(parsed.activities)) {
			throw new Error("Missing activities array");
		}
		if (typeof parsed.urgency_assessment !== "string") {
			throw new Error("Missing urgency_assessment");
		}
		if (typeof parsed.confidence_in_strategy !== "number") {
			throw new Error("Missing confidence_in_strategy");
		}

		// Validate each activity
		for (const activity of parsed.activities) {
			if (!["BUILD", "WRITE", "RESEARCH", "ANALYZE", "ITERATE", "SHIP"].includes(activity.type)) {
				throw new Error(`Invalid activity type: ${activity.type}`);
			}
			if (!activity.action || !activity.reasoning) {
				throw new Error("Activity missing action or reasoning");
			}
		}

		return parsed;
	} catch (err) {
		throw new Error(
			`Failed to parse activity decision JSON: ${err instanceof Error ? err.message : "Unknown error"}`,
		);
	}
}

/**
 * Count words in content
 */
function countWords(content: string): number {
	return content.split(/\s+/).filter((word) => word.length > 0).length;
}

/**
 * Create a result object with all failures
 */
function createFailedResult(errors: string[]): ProcessResult {
	return {
		success: false,
		localSaved: false,
		memorySaved: false,
		deployed: false,
		metricsUpdated: false,
		errors,
	};
}

/**
 * Process hourly update output from Claude
 *
 * Steps:
 * 1. Parse content from response
 * 2. Get current runway status and metrics
 * 3. Save content locally via content-writer (MUST succeed)
 * 4. Store in Supermemory (can fail gracefully)
 * 5. Update landing page (can fail gracefully)
 * 6. Trigger website deploy (can fail gracefully)
 */
export async function processHourlyOutput(
	response: ClaudeResponse,
	day: number,
	hour: number,
	deps: OutputProcessorDeps,
): Promise<ProcessResult> {
	const errors: string[] = [];
	let localSaved = false;
	let memorySaved = false;
	let deployed = false;
	let metricsUpdated = false;

	log.info("Processing hourly output", { day, hour });

	// Step 1: Parse content
	let content: string;
	try {
		content = parseContent(response);
		log.debug("Parsed content", { wordCount: countWords(content) });
	} catch (err) {
		const errMsg = err instanceof Error ? err.message : "Failed to parse content";
		log.error("Failed to parse hourly content", { error: errMsg });
		return createFailedResult([errMsg]);
	}

	// Step 2: Get runway status and metrics
	let runwayStatus: Awaited<ReturnType<RunwayTracker["getRunwayStatus"]>>;
	let metrics: Awaited<ReturnType<MetricsTracker["getMetrics"]>>;
	try {
		[runwayStatus, metrics] = await Promise.all([
			deps.runwayTracker.getRunwayStatus(),
			deps.metricsTracker.getMetrics(),
		]);
		log.debug("Retrieved status", { runwayStatus, metrics });
	} catch (err) {
		const errMsg = err instanceof Error ? err.message : "Failed to get status";
		log.error("Failed to get runway/metrics status", { error: errMsg });
		return createFailedResult([errMsg]);
	}

	// Build metadata
	const metadata: ContentMetadata = {
		day,
		hour,
		timestamp: new Date().toISOString(),
		runway_days: runwayStatus.runwayDays,
		urgency: runwayStatus.urgencyLevel,
		current_strategy: metrics.currentStrategy,
		word_count: countWords(content),
	};

	// Step 3: Save locally - CRITICAL, must succeed
	try {
		await deps.contentWriter.writeHourlyUpdate(day, hour, content, metadata);
		localSaved = true;
		log.info("Saved hourly update locally", { day, hour });
	} catch (err) {
		const errMsg = err instanceof Error ? err.message : "Failed to save locally";
		log.error("CRITICAL: Failed to save hourly update locally", { error: errMsg });
		errors.push(`Local save failed: ${errMsg}`);
		// Still try other steps even if local save fails - but mark failure
	}

	// Step 4: Store in Supermemory - can fail gracefully
	try {
		const result = await deps.memoryStore.storeHourlyUpdate(content, {
			type: "hourly_update",
			day,
			hour,
			timestamp: metadata.timestamp,
			runway_days: metadata.runway_days,
			current_strategy: metadata.current_strategy,
		});
		memorySaved = result.success;
		if (memorySaved) {
			log.info("Stored hourly update in memory", { day, hour });
		} else {
			log.warn("Memory store returned unsuccessful", { day, hour });
			errors.push("Memory store returned unsuccessful");
		}
	} catch (err) {
		const errMsg = err instanceof Error ? err.message : "Memory store error";
		log.warn("Failed to store in Supermemory (non-critical)", { error: errMsg });
		errors.push(`Memory store failed: ${errMsg}`);
	}

	// Step 5: Update landing page - can fail gracefully
	try {
		await deps.contentWriter.updateLanding(
			day,
			runwayStatus.daysRemaining,
			runwayStatus.runwayDays,
			metrics.thingsShipped,
			metrics.revenueTotal,
			metrics.currentStrategy,
		);
		metricsUpdated = true;
		log.info("Updated landing page", { day });
	} catch (err) {
		const errMsg = err instanceof Error ? err.message : "Landing update error";
		log.warn("Failed to update landing page (non-critical)", { error: errMsg });
		errors.push(`Landing update failed: ${errMsg}`);
	}

	// Step 6: Trigger deploy - can fail gracefully
	try {
		deployed = await deps.deployTrigger.triggerDeploy();
		if (deployed) {
			log.info("Triggered website deploy");
		} else {
			log.warn("Deploy trigger returned false");
			errors.push("Deploy trigger returned false");
		}
	} catch (err) {
		const errMsg = err instanceof Error ? err.message : "Deploy error";
		log.warn("Failed to trigger deploy (non-critical)", { error: errMsg });
		errors.push(`Deploy failed: ${errMsg}`);
	}

	// Success if local save worked (the critical part)
	const success = localSaved;

	log.info("Hourly output processing complete", {
		success,
		localSaved,
		memorySaved,
		deployed,
		metricsUpdated,
		errorCount: errors.length,
	});

	return {
		success,
		localSaved,
		memorySaved,
		deployed,
		metricsUpdated,
		errors,
	};
}

/**
 * Process daily journal output from Claude
 *
 * Steps:
 * 1. Parse content from response
 * 2. Get current runway status and metrics
 * 3. Save journal locally via content-writer (MUST succeed)
 * 4. Store in Supermemory (can fail gracefully)
 * 5. Update landing page (can fail gracefully)
 * 6. Trigger website deploy (can fail gracefully)
 */
export async function processJournalOutput(
	response: ClaudeResponse,
	day: number,
	deps: OutputProcessorDeps,
): Promise<ProcessResult> {
	const errors: string[] = [];
	let localSaved = false;
	let memorySaved = false;
	let deployed = false;
	let metricsUpdated = false;

	log.info("Processing journal output", { day });

	// Step 1: Parse content
	let content: string;
	try {
		content = parseContent(response);
		const wordCount = countWords(content);
		log.debug("Parsed journal content", { wordCount });

		// Validate journal length (should be 1000-3000 words per spec)
		if (wordCount < 500) {
			log.warn("Journal is shorter than expected", { wordCount, expected: "1000-3000" });
		}
	} catch (err) {
		const errMsg = err instanceof Error ? err.message : "Failed to parse content";
		log.error("Failed to parse journal content", { error: errMsg });
		return createFailedResult([errMsg]);
	}

	// Step 2: Get runway status and metrics
	let runwayStatus: Awaited<ReturnType<RunwayTracker["getRunwayStatus"]>>;
	let metrics: Awaited<ReturnType<MetricsTracker["getMetrics"]>>;
	try {
		[runwayStatus, metrics] = await Promise.all([
			deps.runwayTracker.getRunwayStatus(),
			deps.metricsTracker.getMetrics(),
		]);
		log.debug("Retrieved status", { runwayStatus, metrics });
	} catch (err) {
		const errMsg = err instanceof Error ? err.message : "Failed to get status";
		log.error("Failed to get runway/metrics status", { error: errMsg });
		return createFailedResult([errMsg]);
	}

	// Build metadata
	const metadata: ContentMetadata = {
		day,
		timestamp: new Date().toISOString(),
		runway_days: runwayStatus.runwayDays,
		urgency: runwayStatus.urgencyLevel,
		current_strategy: metrics.currentStrategy,
		word_count: countWords(content),
	};

	// Step 3: Save locally - CRITICAL, must succeed
	try {
		await deps.contentWriter.writeDailyJournal(day, content, metadata);
		localSaved = true;
		log.info("Saved daily journal locally", { day });
	} catch (err) {
		const errMsg = err instanceof Error ? err.message : "Failed to save locally";
		log.error("CRITICAL: Failed to save daily journal locally", { error: errMsg });
		errors.push(`Local save failed: ${errMsg}`);
	}

	// Step 4: Store in Supermemory - can fail gracefully
	try {
		const result = await deps.memoryStore.storeDailyJournal(content, {
			type: "daily_journal",
			day,
			timestamp: metadata.timestamp,
			runway_days: metadata.runway_days,
			current_strategy: metadata.current_strategy,
		});
		memorySaved = result.success;
		if (memorySaved) {
			log.info("Stored daily journal in memory", { day });
		} else {
			log.warn("Memory store returned unsuccessful", { day });
			errors.push("Memory store returned unsuccessful");
		}
	} catch (err) {
		const errMsg = err instanceof Error ? err.message : "Memory store error";
		log.warn("Failed to store journal in Supermemory (non-critical)", { error: errMsg });
		errors.push(`Memory store failed: ${errMsg}`);
	}

	// Step 5: Update landing page - can fail gracefully
	try {
		await deps.contentWriter.updateLanding(
			day,
			runwayStatus.daysRemaining,
			runwayStatus.runwayDays,
			metrics.thingsShipped,
			metrics.revenueTotal,
			metrics.currentStrategy,
		);
		metricsUpdated = true;
		log.info("Updated landing page", { day });
	} catch (err) {
		const errMsg = err instanceof Error ? err.message : "Landing update error";
		log.warn("Failed to update landing page (non-critical)", { error: errMsg });
		errors.push(`Landing update failed: ${errMsg}`);
	}

	// Step 6: Trigger deploy - can fail gracefully
	try {
		deployed = await deps.deployTrigger.triggerDeploy();
		if (deployed) {
			log.info("Triggered website deploy");
		} else {
			log.warn("Deploy trigger returned false");
			errors.push("Deploy trigger returned false");
		}
	} catch (err) {
		const errMsg = err instanceof Error ? err.message : "Deploy error";
		log.warn("Failed to trigger deploy (non-critical)", { error: errMsg });
		errors.push(`Deploy failed: ${errMsg}`);
	}

	// Success if local save worked (the critical part)
	const success = localSaved;

	log.info("Journal output processing complete", {
		success,
		localSaved,
		memorySaved,
		deployed,
		metricsUpdated,
		errorCount: errors.length,
	});

	return {
		success,
		localSaved,
		memorySaved,
		deployed,
		metricsUpdated,
		errors,
	};
}

/**
 * Process activity decision output from Claude
 *
 * Steps:
 * 1. Parse and validate activity decision JSON
 * 2. Extract strategy notes if confidence is low or strategy changed
 * 3. Store strategic learnings in memory if relevant
 * 4. Update strategy in metrics if strategy_notes suggest a change
 *
 * Note: Activity decisions don't save locally or trigger deploys,
 * they're used internally to guide ALIEN's next actions.
 */
export async function processActivityOutput(
	response: ClaudeResponse,
	deps: OutputProcessorDeps,
): Promise<ProcessResult & { decision?: ActivityDecision }> {
	const errors: string[] = [];
	let memorySaved = false;
	let metricsUpdated = false;

	log.info("Processing activity output");

	// Step 1: Parse activity decision
	let decision: ActivityDecision;
	try {
		decision = parseActivityDecision(response);
		log.debug("Parsed activity decision", {
			activityCount: decision.activities.length,
			confidence: decision.confidence_in_strategy,
		});
	} catch (err) {
		const errMsg = err instanceof Error ? err.message : "Failed to parse activity decision";
		log.error("Failed to parse activity decision", { error: errMsg });
		return {
			...createFailedResult([errMsg]),
			decision: undefined,
		};
	}

	// Step 2: Store strategic learnings if confidence is notably low
	if (decision.confidence_in_strategy < 0.5 && decision.strategy_notes) {
		try {
			const result = await deps.memoryStore.storeStrategicLearning(
				decision.strategy_notes,
				"strategy_concern",
				decision.confidence_in_strategy,
			);
			memorySaved = result.success;
			if (memorySaved) {
				log.info("Stored strategic learning", {
					confidence: decision.confidence_in_strategy,
				});
			}
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : "Memory store error";
			log.warn("Failed to store strategic learning (non-critical)", { error: errMsg });
			errors.push(`Strategic learning store failed: ${errMsg}`);
		}
	}

	// Step 3: Check if strategy needs updating
	// (This is a simple heuristic - could be more sophisticated)
	if (
		decision.strategy_notes?.toLowerCase().includes("pivot") &&
		decision.confidence_in_strategy < 0.4
	) {
		try {
			// Extract a new strategy from the notes (simplified)
			const newStrategy = `Pivoting: ${decision.urgency_assessment.slice(0, 100)}`;
			await deps.metricsTracker.setStrategy(newStrategy);
			metricsUpdated = true;
			log.info("Updated strategy based on activity decision", { newStrategy });
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : "Metrics update error";
			log.warn("Failed to update strategy (non-critical)", { error: errMsg });
			errors.push(`Strategy update failed: ${errMsg}`);
		}
	}

	log.info("Activity output processing complete", {
		success: true,
		activityCount: decision.activities.length,
		confidence: decision.confidence_in_strategy,
		errorCount: errors.length,
	});

	return {
		success: true, // Activity processing succeeds if parsing works
		localSaved: false, // Activity decisions don't save to files
		memorySaved,
		deployed: false, // No deploy for activity decisions
		metricsUpdated,
		errors,
		decision,
	};
}

/**
 * Export processor convenience object
 */
export const outputProcessor = {
	processHourlyOutput,
	processJournalOutput,
	processActivityOutput,
};
