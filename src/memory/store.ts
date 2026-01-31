import type { MemoryCreateResponse } from "supermemory";
import { logger } from "../utils/logger.ts";
import { getSupermemoryClient } from "./supermemory.ts";

/**
 * Memory types stored in Supermemory
 */
export type MemoryType = "hourly_update" | "daily_journal" | "strategic_learning" | "creation";

/**
 * Base metadata included with all memory entries
 */
export interface BaseMetadata {
	type: MemoryType;
	day: number;
	hour: number;
	timestamp: string;
	runway_days: number;
	current_strategy: string;
}

/**
 * Metadata for hourly updates
 */
export interface HourlyUpdateMetadata extends BaseMetadata {
	type: "hourly_update";
}

/**
 * Metadata for daily journals
 */
export interface DailyJournalMetadata extends BaseMetadata {
	type: "daily_journal";
}

/**
 * Metadata for strategic learnings
 */
export interface StrategicLearningMetadata extends BaseMetadata {
	type: "strategic_learning";
	category: string;
	confidence: number;
}

/**
 * Metadata for creations
 */
export interface CreationMetadata extends BaseMetadata {
	type: "creation";
	name: string;
	status: string;
}

/**
 * Creation metrics
 */
export interface CreationMetrics {
	[key: string]: string | number | boolean;
}

/**
 * Store an hourly update in memory
 */
export async function storeHourlyUpdate(
	content: string,
	metadata: HourlyUpdateMetadata,
): Promise<MemoryCreateResponse> {
	const client = getSupermemoryClient();
	const result = await client.memory.create({
		content,
		metadata: {
			type: metadata.type,
			day: metadata.day,
			hour: metadata.hour,
			timestamp: metadata.timestamp,
			runway_days: metadata.runway_days,
			current_strategy: metadata.current_strategy,
		},
	});
	logger.debug("Stored hourly update", { id: result.id, day: metadata.day, hour: metadata.hour });
	return result;
}

/**
 * Store a daily journal in memory
 */
export async function storeDailyJournal(
	content: string,
	metadata: DailyJournalMetadata,
): Promise<MemoryCreateResponse> {
	const client = getSupermemoryClient();
	const result = await client.memory.create({
		content,
		metadata: {
			type: metadata.type,
			day: metadata.day,
			hour: metadata.hour,
			timestamp: metadata.timestamp,
			runway_days: metadata.runway_days,
			current_strategy: metadata.current_strategy,
		},
	});
	logger.debug("Stored daily journal", { id: result.id, day: metadata.day });
	return result;
}

/**
 * Store a strategic learning in memory
 */
export async function storeStrategicLearning(
	content: string,
	category: string,
	confidence: number,
	metadata: Omit<StrategicLearningMetadata, "type" | "category" | "confidence">,
): Promise<MemoryCreateResponse> {
	const client = getSupermemoryClient();
	const result = await client.memory.create({
		content,
		metadata: {
			type: "strategic_learning",
			category,
			confidence,
			day: metadata.day,
			hour: metadata.hour,
			timestamp: metadata.timestamp,
			runway_days: metadata.runway_days,
			current_strategy: metadata.current_strategy,
		},
	});
	logger.debug("Stored strategic learning", { id: result.id, category, confidence });
	return result;
}

/**
 * Store a creation in memory
 */
export async function storeCreation(
	name: string,
	description: string,
	status: string,
	metrics: CreationMetrics,
	metadata: Omit<CreationMetadata, "type" | "name" | "status">,
): Promise<MemoryCreateResponse> {
	const client = getSupermemoryClient();
	const content = `Creation: ${name}\n\nDescription: ${description}\n\nMetrics: ${JSON.stringify(metrics)}`;
	const result = await client.memory.create({
		content,
		metadata: {
			type: "creation",
			name,
			status,
			day: metadata.day,
			hour: metadata.hour,
			timestamp: metadata.timestamp,
			runway_days: metadata.runway_days,
			current_strategy: metadata.current_strategy,
			...metrics,
		},
	});
	logger.debug("Stored creation", { id: result.id, name, status });
	return result;
}
