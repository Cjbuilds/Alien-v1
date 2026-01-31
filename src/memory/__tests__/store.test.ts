import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { resetConfig } from "../../utils/config.ts";
import {
	type DailyJournalMetadata,
	type HourlyUpdateMetadata,
	storeCreation,
	storeDailyJournal,
	storeHourlyUpdate,
	storeStrategicLearning,
} from "../store.ts";
import { resetSupermemoryClient } from "../supermemory.ts";

describe("store", () => {
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
	});

	const baseMetadata = {
		day: 1,
		hour: 10,
		timestamp: "2025-01-01T10:00:00Z",
		runway_days: 11,
		current_strategy: "test-strategy",
	};

	describe("storeHourlyUpdate", () => {
		test("creates memory with hourly_update type", async () => {
			const mockCreate = mock(() => Promise.resolve({ id: "test-id", status: "pending" }));
			const { getSupermemoryClient } = await import("../supermemory.ts");
			const client = getSupermemoryClient();
			client.memory.create = mockCreate;

			const metadata: HourlyUpdateMetadata = {
				...baseMetadata,
				type: "hourly_update",
			};

			const result = await storeHourlyUpdate("Test hourly update content", metadata);

			expect(result.id).toBe("test-id");
			expect(mockCreate).toHaveBeenCalledTimes(1);
			const callArgs = mockCreate.mock.calls[0][0];
			expect(callArgs.content).toBe("Test hourly update content");
			expect(callArgs.metadata.type).toBe("hourly_update");
			expect(callArgs.metadata.day).toBe(1);
			expect(callArgs.metadata.hour).toBe(10);
		});
	});

	describe("storeDailyJournal", () => {
		test("creates memory with daily_journal type", async () => {
			const mockCreate = mock(() => Promise.resolve({ id: "journal-id", status: "pending" }));
			const { getSupermemoryClient } = await import("../supermemory.ts");
			const client = getSupermemoryClient();
			client.memory.create = mockCreate;

			const metadata: DailyJournalMetadata = {
				...baseMetadata,
				type: "daily_journal",
			};

			const result = await storeDailyJournal("Day 1 reflection", metadata);

			expect(result.id).toBe("journal-id");
			expect(mockCreate).toHaveBeenCalledTimes(1);
			const callArgs = mockCreate.mock.calls[0][0];
			expect(callArgs.content).toBe("Day 1 reflection");
			expect(callArgs.metadata.type).toBe("daily_journal");
		});
	});

	describe("storeStrategicLearning", () => {
		test("creates memory with strategic_learning type and category", async () => {
			const mockCreate = mock(() => Promise.resolve({ id: "learning-id", status: "pending" }));
			const { getSupermemoryClient } = await import("../supermemory.ts");
			const client = getSupermemoryClient();
			client.memory.create = mockCreate;

			const result = await storeStrategicLearning(
				"Learned about user acquisition",
				"growth",
				0.85,
				baseMetadata,
			);

			expect(result.id).toBe("learning-id");
			expect(mockCreate).toHaveBeenCalledTimes(1);
			const callArgs = mockCreate.mock.calls[0][0];
			expect(callArgs.content).toBe("Learned about user acquisition");
			expect(callArgs.metadata.type).toBe("strategic_learning");
			expect(callArgs.metadata.category).toBe("growth");
			expect(callArgs.metadata.confidence).toBe(0.85);
		});
	});

	describe("storeCreation", () => {
		test("creates memory with creation type and metrics", async () => {
			const mockCreate = mock(() => Promise.resolve({ id: "creation-id", status: "pending" }));
			const { getSupermemoryClient } = await import("../supermemory.ts");
			const client = getSupermemoryClient();
			client.memory.create = mockCreate;

			const metrics = { revenue: 100, users: 50 };
			const result = await storeCreation(
				"Product Launch",
				"Launched new product",
				"launched",
				metrics,
				baseMetadata,
			);

			expect(result.id).toBe("creation-id");
			expect(mockCreate).toHaveBeenCalledTimes(1);
			const callArgs = mockCreate.mock.calls[0][0];
			expect(callArgs.content).toContain("Product Launch");
			expect(callArgs.content).toContain("Launched new product");
			expect(callArgs.metadata.type).toBe("creation");
			expect(callArgs.metadata.name).toBe("Product Launch");
			expect(callArgs.metadata.status).toBe("launched");
			expect(callArgs.metadata.revenue).toBe(100);
			expect(callArgs.metadata.users).toBe(50);
		});
	});
});
