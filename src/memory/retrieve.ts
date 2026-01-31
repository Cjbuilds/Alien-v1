import type { SearchExecuteResponse } from "supermemory";
import { logger } from "../utils/logger.ts";
import { getCurrentDayNumber } from "../utils/time.ts";
import { getSupermemoryClient } from "./supermemory.ts";

/**
 * Search result from Supermemory
 */
export type SearchResult = SearchExecuteResponse["results"][number];

/**
 * Search for recent updates with optional limit
 */
export async function searchRecentUpdates(limit = 10): Promise<SearchResult[]> {
	const client = getSupermemoryClient();
	const response = await client.search.execute({
		q: "hourly update daily progress",
		limit,
		filters: {
			OR: [
				{ key: "type", value: "hourly_update" },
				{ key: "type", value: "daily_journal" },
			],
		},
	});
	logger.debug("Searched recent updates", { count: response.results.length });
	return response.results;
}

/**
 * Search memories by strategy
 */
export async function searchByStrategy(strategy: string): Promise<SearchResult[]> {
	const client = getSupermemoryClient();
	const response = await client.search.execute({
		q: strategy,
		filters: {
			AND: [{ key: "current_strategy", value: strategy }],
		},
	});
	logger.debug("Searched by strategy", { strategy, count: response.results.length });
	return response.results;
}

/**
 * Search learnings by category
 */
export async function searchLearnings(category: string): Promise<SearchResult[]> {
	const client = getSupermemoryClient();
	const response = await client.search.execute({
		q: `strategic learning ${category}`,
		filters: {
			AND: [
				{ key: "type", value: "strategic_learning" },
				{ key: "category", value: category },
			],
		},
	});
	logger.debug("Searched learnings", { category, count: response.results.length });
	return response.results;
}

/**
 * Search creations by status
 */
export async function searchCreations(status: string): Promise<SearchResult[]> {
	const client = getSupermemoryClient();
	const response = await client.search.execute({
		q: `creation ${status}`,
		filters: {
			AND: [
				{ key: "type", value: "creation" },
				{ key: "status", value: status },
			],
		},
	});
	logger.debug("Searched creations", { status, count: response.results.length });
	return response.results;
}

/**
 * Get yesterday's journal entry
 */
export async function getYesterdaysJournal(): Promise<SearchResult | null> {
	const currentDay = getCurrentDayNumber();
	const yesterdayDay = currentDay - 1;

	if (yesterdayDay < 1) {
		logger.debug("No yesterday journal - first day");
		return null;
	}

	const client = getSupermemoryClient();

	const response = await client.search.execute({
		q: "daily journal reflection",
		limit: 1,
		filters: {
			AND: [
				{ key: "type", value: "daily_journal" },
				{ key: "day", value: String(yesterdayDay) },
			],
		},
	});

	const result = response.results[0] ?? null;
	logger.debug("Got yesterday's journal", { day: yesterdayDay, found: !!result });
	return result;
}

/**
 * Get today's hourly updates
 */
export async function getTodaysUpdates(): Promise<SearchResult[]> {
	const client = getSupermemoryClient();
	const currentDay = getCurrentDayNumber();

	const response = await client.search.execute({
		q: "hourly update progress",
		filters: {
			AND: [
				{ key: "type", value: "hourly_update" },
				{ key: "day", value: String(currentDay) },
			],
		},
	});

	logger.debug("Got today's updates", { day: currentDay, count: response.results.length });
	return response.results;
}
