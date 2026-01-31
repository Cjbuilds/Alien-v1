import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { existsSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { resetConfig } from "../../utils/config.ts";
import {
	getCurrentGoals,
	resetGoalsCache,
	type Goal,
	type GoalsStore,
} from "../goal-setting.ts";

describe("goal-setting", () => {
	const originalEnv = { ...process.env };
	const alienDir = join(process.cwd(), ".alien");
	const goalsFile = join(alienDir, "goals.json");

	const setValidEnv = () => {
		process.env.ANTHROPIC_API_KEY = "test-key";
		process.env.SUPERMEMORY_API_KEY = "test-key";
		process.env.WEBSITE_DEPLOY_HOOK = "https://example.com/webhook";
		process.env.START_DATE = new Date().toISOString().split("T")[0];
		process.env.TIMEZONE = "UTC";
		process.env.INITIAL_RUNWAY_DAYS = "11";
		process.env.TOTAL_DAYS = "100";
		process.env.LOG_LEVEL = "error"; // Suppress logs in tests
	};

	beforeEach(() => {
		setValidEnv();
		resetConfig();
		resetGoalsCache();
		// Clean up any existing goals file
		if (existsSync(goalsFile)) {
			rmSync(goalsFile);
		}
	});

	afterEach(() => {
		process.env = { ...originalEnv };
		resetConfig();
		resetGoalsCache();
		// Clean up after tests
		if (existsSync(goalsFile)) {
			rmSync(goalsFile);
		}
	});

	describe("getCurrentGoals", () => {
		test("returns empty store when no goals exist", () => {
			const goals = getCurrentGoals();
			expect(goals).toEqual({
				dailyGoals: [],
				weeklyGoals: [],
				lastDailyUpdate: null,
				lastWeeklyUpdate: null,
			});
		});

		test("returns same instance on repeated calls (caching)", () => {
			const goals1 = getCurrentGoals();
			const goals2 = getCurrentGoals();
			expect(goals1).toBe(goals2);
		});

		test("returns fresh data after resetGoalsCache", () => {
			const goals1 = getCurrentGoals();
			resetGoalsCache();
			const goals2 = getCurrentGoals();
			expect(goals1).not.toBe(goals2);
			expect(goals1).toEqual(goals2);
		});
	});

	describe("GoalsStore structure", () => {
		test("has correct shape", () => {
			const store: GoalsStore = {
				dailyGoals: [],
				weeklyGoals: [],
				lastDailyUpdate: null,
				lastWeeklyUpdate: null,
			};
			expect(store.dailyGoals).toBeInstanceOf(Array);
			expect(store.weeklyGoals).toBeInstanceOf(Array);
		});

		test("Goal type has correct shape", () => {
			const goal: Goal = {
				id: "daily-123-abc",
				type: "daily",
				content: "Test goal",
				measurable: "Test metric",
				createdAt: new Date().toISOString(),
				targetDate: new Date().toISOString(),
				completed: false,
			};
			expect(goal.id).toContain("daily");
			expect(goal.type).toBe("daily");
			expect(goal.content).toBe("Test goal");
			expect(goal.measurable).toBe("Test metric");
			expect(goal.completed).toBe(false);
		});
	});

	describe("resetGoalsCache", () => {
		test("clears the cache", () => {
			// Get goals to populate cache
			const goals1 = getCurrentGoals();
			// Reset the cache
			resetGoalsCache();
			// Get goals again - should create a new object
			const goals2 = getCurrentGoals();
			// They should be equal in content but different objects
			expect(goals1).not.toBe(goals2);
		});
	});
});
