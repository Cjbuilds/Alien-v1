import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { resetConfig } from "../../utils/config.ts";

// Mock the external dependencies before importing the module
const mockSearch = mock(() => Promise.resolve({ results: [] }));
const mockAdd = mock(() => Promise.resolve({}));

mock.module("supermemory", () => ({
	Supermemory: class MockSupermemory {
		search = mockSearch;
		add = mockAdd;
	},
}));

const mockCreate = mock(() =>
	Promise.resolve({
		content: [{ type: "text", text: "Mock reflection content for testing. ".repeat(50) }],
	}),
);

mock.module("@anthropic-ai/sdk", () => ({
	default: class MockAnthropic {
		messages = { create: mockCreate };
	},
}));

// Import after mocking
const { runDailyJournal } = await import("../daily-journal.ts");

describe("daily-journal", () => {
	const originalEnv = { ...process.env };

	const setValidEnv = (startDate?: string) => {
		const today = startDate || new Date().toISOString().split("T")[0];
		process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
		process.env.SUPERMEMORY_API_KEY = "test-supermemory-key";
		process.env.WEBSITE_DEPLOY_HOOK = "https://example.com/webhook";
		process.env.START_DATE = today;
		process.env.TIMEZONE = "UTC";
		process.env.INITIAL_RUNWAY_DAYS = "11";
		process.env.TOTAL_DAYS = "100";
		process.env.LOG_LEVEL = "error"; // Suppress logs in tests
	};

	beforeEach(() => {
		resetConfig();
		mockSearch.mockClear();
		mockAdd.mockClear();
		mockCreate.mockClear();
	});

	afterEach(() => {
		process.env = { ...originalEnv };
		resetConfig();
	});

	describe("runDailyJournal", () => {
		test("generates journal entry with correct structure", async () => {
			setValidEnv();
			const journal = await runDailyJournal();

			expect(journal).toHaveProperty("day");
			expect(journal).toHaveProperty("date");
			expect(journal).toHaveProperty("metrics");
			expect(journal).toHaveProperty("hourlyUpdates");
			expect(journal).toHaveProperty("reflection");
			expect(journal).toHaveProperty("createdAt");
		});

		test("returns day 1 on start date", async () => {
			const today = new Date().toISOString().split("T")[0];
			setValidEnv(today);
			const journal = await runDailyJournal();

			expect(journal.day).toBe(1);
		});

		test("calls memory search for hourly updates", async () => {
			setValidEnv();
			await runDailyJournal();

			// Should search for hourly updates
			expect(mockSearch).toHaveBeenCalled();
			const calls = mockSearch.mock.calls;
			const hourlyCall = calls.find((call) => String(call[0]).includes("hourly update"));
			expect(hourlyCall).toBeDefined();
		});

		test("calls memory search for yesterday journal", async () => {
			// Set start date to yesterday so we're on day 2
			const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split("T")[0];
			setValidEnv(yesterday);
			await runDailyJournal();

			const calls = mockSearch.mock.calls;
			const journalCall = calls.find((call) => String(call[0]).includes("journal"));
			expect(journalCall).toBeDefined();
		});

		test("calls Claude API to generate reflection", async () => {
			setValidEnv();
			await runDailyJournal();

			expect(mockCreate).toHaveBeenCalledTimes(1);
			const createCall = mockCreate.mock.calls[0];
			expect(createCall[0]).toHaveProperty("model");
			expect(createCall[0]).toHaveProperty("messages");
		});

		test("saves journal to memory", async () => {
			setValidEnv();
			await runDailyJournal();

			expect(mockAdd).toHaveBeenCalledTimes(1);
			const addCall = mockAdd.mock.calls[0];
			expect(addCall[0]).toContain("Daily Journal");
			expect(addCall[1]).toHaveProperty("metadata");
			expect(addCall[1].metadata.type).toBe("daily-journal");
		});

		test("includes metrics in journal entry", async () => {
			setValidEnv();
			const journal = await runDailyJournal();

			expect(journal.metrics).toHaveProperty("goals");
			expect(journal.metrics).toHaveProperty("completed");
			expect(journal.metrics).toHaveProperty("shipped");
			expect(journal.metrics).toHaveProperty("revenue");
			expect(journal.metrics).toHaveProperty("runway");
			expect(Array.isArray(journal.metrics.goals)).toBe(true);
			expect(Array.isArray(journal.metrics.completed)).toBe(true);
			expect(Array.isArray(journal.metrics.shipped)).toBe(true);
			expect(typeof journal.metrics.revenue).toBe("number");
			expect(typeof journal.metrics.runway).toBe("number");
		});

		test("calculates runway based on initial runway minus days elapsed", async () => {
			const today = new Date().toISOString().split("T")[0];
			setValidEnv(today);
			process.env.INITIAL_RUNWAY_DAYS = "10";
			resetConfig();

			const journal = await runDailyJournal();
			// Day 1, initial runway 10, so runway = 10 - 1 + 1 = 10
			expect(journal.metrics.runway).toBe(10);
		});

		test("handles empty hourly updates", async () => {
			setValidEnv();
			mockSearch.mockImplementation(() => Promise.resolve({ results: [] }));

			const journal = await runDailyJournal();
			expect(Array.isArray(journal.hourlyUpdates)).toBe(true);
			expect(journal.hourlyUpdates.length).toBe(0);
		});

		test("handles memory search errors gracefully", async () => {
			setValidEnv();
			mockSearch.mockImplementation(() => Promise.reject(new Error("Network error")));

			// Should not throw, but handle errors gracefully
			const journal = await runDailyJournal();
			expect(journal).toHaveProperty("reflection");
		});
	});
});
