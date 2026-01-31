import { afterEach, beforeEach, describe, expect, mock, setSystemTime, test } from "bun:test";
import { resetConfig } from "../../utils/config.ts";
import {
	getTodaysUpdates,
	getYesterdaysJournal,
	searchByStrategy,
	searchCreations,
	searchLearnings,
	searchRecentUpdates,
} from "../retrieve.ts";
import { resetSupermemoryClient } from "../supermemory.ts";

describe("retrieve", () => {
	const originalEnv = { ...process.env };

	beforeEach(() => {
		resetSupermemoryClient();
		resetConfig();
		process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
		process.env.SUPERMEMORY_API_KEY = "test-supermemory-key";
		process.env.WEBSITE_DEPLOY_HOOK = "https://example.com/webhook";
		process.env.START_DATE = "2025-01-01";
		process.env.LOG_LEVEL = "error";
	});

	afterEach(() => {
		process.env = { ...originalEnv };
		resetSupermemoryClient();
		resetConfig();
		setSystemTime();
	});

	const mockSearchResult = {
		documentId: "doc-1",
		title: "Test Memory",
		documentSummary: "Test summary",
		metadata: { type: "hourly_update" },
		score: 0.9,
		createdAt: "2025-01-01T10:00:00Z",
		updatedAt: "2025-01-01T10:00:00Z",
		chunks: [{ content: "Test content", isRelevant: true }],
	};

	describe("searchRecentUpdates", () => {
		test("searches for recent updates with default limit", async () => {
			const mockExecute = mock(() =>
				Promise.resolve({
					results: [mockSearchResult],
					timing: 100,
					total: 1,
				}),
			);
			const { getSupermemoryClient } = await import("../supermemory.ts");
			const client = getSupermemoryClient();
			client.search.execute = mockExecute;

			const results = await searchRecentUpdates();

			expect(results).toHaveLength(1);
			expect(mockExecute).toHaveBeenCalledTimes(1);
			const callArgs = mockExecute.mock.calls[0][0];
			expect(callArgs.limit).toBe(10);
			expect(callArgs.filters.OR).toBeDefined();
		});

		test("respects custom limit", async () => {
			const mockExecute = mock(() =>
				Promise.resolve({
					results: [],
					timing: 100,
					total: 0,
				}),
			);
			const { getSupermemoryClient } = await import("../supermemory.ts");
			const client = getSupermemoryClient();
			client.search.execute = mockExecute;

			await searchRecentUpdates(5);

			const callArgs = mockExecute.mock.calls[0][0];
			expect(callArgs.limit).toBe(5);
		});
	});

	describe("searchByStrategy", () => {
		test("searches by strategy name", async () => {
			const mockExecute = mock(() =>
				Promise.resolve({
					results: [mockSearchResult],
					timing: 100,
					total: 1,
				}),
			);
			const { getSupermemoryClient } = await import("../supermemory.ts");
			const client = getSupermemoryClient();
			client.search.execute = mockExecute;

			const results = await searchByStrategy("growth-focus");

			expect(results).toHaveLength(1);
			const callArgs = mockExecute.mock.calls[0][0];
			expect(callArgs.q).toBe("growth-focus");
			expect(callArgs.filters.AND).toContainEqual({
				key: "current_strategy",
				value: "growth-focus",
			});
		});
	});

	describe("searchLearnings", () => {
		test("searches learnings by category", async () => {
			const mockExecute = mock(() =>
				Promise.resolve({
					results: [mockSearchResult],
					timing: 100,
					total: 1,
				}),
			);
			const { getSupermemoryClient } = await import("../supermemory.ts");
			const client = getSupermemoryClient();
			client.search.execute = mockExecute;

			const results = await searchLearnings("technical");

			expect(results).toHaveLength(1);
			const callArgs = mockExecute.mock.calls[0][0];
			expect(callArgs.filters.AND).toContainEqual({ key: "type", value: "strategic_learning" });
			expect(callArgs.filters.AND).toContainEqual({ key: "category", value: "technical" });
		});
	});

	describe("searchCreations", () => {
		test("searches creations by status", async () => {
			const mockExecute = mock(() =>
				Promise.resolve({
					results: [mockSearchResult],
					timing: 100,
					total: 1,
				}),
			);
			const { getSupermemoryClient } = await import("../supermemory.ts");
			const client = getSupermemoryClient();
			client.search.execute = mockExecute;

			const results = await searchCreations("launched");

			expect(results).toHaveLength(1);
			const callArgs = mockExecute.mock.calls[0][0];
			expect(callArgs.filters.AND).toContainEqual({ key: "type", value: "creation" });
			expect(callArgs.filters.AND).toContainEqual({ key: "status", value: "launched" });
		});
	});

	describe("getYesterdaysJournal", () => {
		test("returns journal from yesterday", async () => {
			const mockExecute = mock(() =>
				Promise.resolve({
					results: [mockSearchResult],
					timing: 100,
					total: 1,
				}),
			);
			const { getSupermemoryClient } = await import("../supermemory.ts");
			const client = getSupermemoryClient();
			client.search.execute = mockExecute;

			// Set date to day 2 so yesterday (day 1) exists
			setSystemTime(new Date("2025-01-02T10:00:00Z"));

			const result = await getYesterdaysJournal();

			expect(result).toEqual(mockSearchResult);
			const callArgs = mockExecute.mock.calls[0][0];
			expect(callArgs.filters.AND).toContainEqual({ key: "type", value: "daily_journal" });
		});

		test("returns null on first day", async () => {
			// Mock the date to be on day 1 (same as START_DATE)
			setSystemTime(new Date("2025-01-01T10:00:00Z"));

			// On day 1, there is no yesterday
			const result = await getYesterdaysJournal();

			expect(result).toBeNull();
		});
	});

	describe("getTodaysUpdates", () => {
		test("returns updates from today", async () => {
			const mockExecute = mock(() =>
				Promise.resolve({
					results: [mockSearchResult, mockSearchResult],
					timing: 100,
					total: 2,
				}),
			);
			const { getSupermemoryClient } = await import("../supermemory.ts");
			const client = getSupermemoryClient();
			client.search.execute = mockExecute;

			const results = await getTodaysUpdates();

			expect(results).toHaveLength(2);
			const callArgs = mockExecute.mock.calls[0][0];
			expect(callArgs.filters.AND).toContainEqual({ key: "type", value: "hourly_update" });
		});
	});
});
