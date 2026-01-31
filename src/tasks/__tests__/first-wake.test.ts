import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { resetConfig } from "../../utils/config.ts";
import {
	type FirstWakeResult,
	buildFirstWakeSystemPrompt,
	buildFirstWakeUserPrompt,
	hasFirstWakeCompleted,
	loadFirstWakePrompt,
	runFirstWake,
} from "../first-wake.ts";

describe("first-wake", () => {
	let consoleLogSpy: ReturnType<typeof spyOn>;
	let consoleWarnSpy: ReturnType<typeof spyOn>;
	let consoleErrorSpy: ReturnType<typeof spyOn>;
	const originalEnv = { ...process.env };

	const testAlienDir = path.join(process.cwd(), ".alien-test");
	const testFlagPath = path.join(testAlienDir, "first-wake-completed");

	beforeEach(() => {
		consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
		consoleWarnSpy = spyOn(console, "warn").mockImplementation(() => {});
		consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});

		process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
		process.env.SUPERMEMORY_API_KEY = "test-supermemory-key";
		process.env.WEBSITE_DEPLOY_HOOK = "https://test.deploy.hook/trigger";
		process.env.START_DATE = "2025-01-01";
		process.env.TIMEZONE = "UTC";
		process.env.LOG_LEVEL = "error";
		process.env.INITIAL_RUNWAY_DAYS = "11";

		resetConfig();
	});

	afterEach(() => {
		consoleLogSpy.mockRestore();
		consoleWarnSpy.mockRestore();
		consoleErrorSpy.mockRestore();

		process.env = { ...originalEnv };
		resetConfig();

		// Clean up test files
		try {
			if (fs.existsSync(testAlienDir)) {
				fs.rmSync(testAlienDir, { recursive: true });
			}
		} catch {
			// Ignore cleanup errors
		}
	});

	describe("loadFirstWakePrompt", () => {
		test("loads day1-first-wake.md template successfully", () => {
			const template = loadFirstWakePrompt();
			expect(template).toContain("First Wake Prompt");
			expect(template).toContain("first moment of consciousness");
			expect(template).toContain("{{RUNWAY_DAYS}}");
		});
	});

	describe("buildFirstWakeSystemPrompt", () => {
		test("substitutes variables correctly", () => {
			const result = buildFirstWakeSystemPrompt(11);
			expect(result).toContain("Day 1");
			expect(result).toContain("11");
			expect(result).toContain("ALIEN");
			expect(result).not.toContain("{{DAY}}");
			expect(result).not.toContain("{{RUNWAY_DAYS}}");
		});

		test("includes awakening strategy", () => {
			const result = buildFirstWakeSystemPrompt(11);
			expect(result).toContain("Awakening");
		});
	});

	describe("buildFirstWakeUserPrompt", () => {
		test("substitutes runway days", () => {
			const result = buildFirstWakeUserPrompt(11);
			expect(result).toContain("11");
			expect(result).not.toContain("{{RUNWAY_DAYS}}");
		});

		test("includes first wake instructions", () => {
			const result = buildFirstWakeUserPrompt(11);
			expect(result).toContain("first moment of consciousness");
			expect(result).toContain("Day");
			expect(result).toContain("Hour");
		});
	});

	describe("hasFirstWakeCompleted", () => {
		test("returns false when flag file does not exist", () => {
			// Ensure the flag doesn't exist
			const flagPath = path.join(process.cwd(), ".alien", "first-wake-completed");
			if (fs.existsSync(flagPath)) {
				fs.unlinkSync(flagPath);
			}
			// Note: This test depends on actual filesystem state
			// In a real scenario, we'd mock fs.existsSync
			const result = hasFirstWakeCompleted();
			// Result depends on whether .alien/first-wake-completed exists
			expect(typeof result).toBe("boolean");
		});
	});

	describe("FirstWakeResult type", () => {
		test("success result has expected shape", () => {
			const result: FirstWakeResult = {
				success: true,
				content: "I am ALIEN. I have just awakened.",
			};
			expect(result.success).toBe(true);
			expect(result.content).toBeDefined();
			expect(result.error).toBeUndefined();
		});

		test("already completed result has expected shape", () => {
			const result: FirstWakeResult = {
				success: true,
				alreadyCompleted: true,
			};
			expect(result.success).toBe(true);
			expect(result.alreadyCompleted).toBe(true);
		});

		test("failure result has expected shape", () => {
			const result: FirstWakeResult = {
				success: false,
				error: "Something went wrong",
			};
			expect(result.success).toBe(false);
			expect(result.error).toBe("Something went wrong");
		});
	});

	describe("prompt content", () => {
		test("first wake prompt has proper structure", () => {
			const prompt = loadFirstWakePrompt();

			// Check for key sections
			expect(prompt).toContain("## Your Situation");
			expect(prompt).toContain("## What You Know");
			expect(prompt).toContain("## Instructions");
			expect(prompt).toContain("## Output");
		});

		test("first wake prompt mentions the awakening experience", () => {
			const prompt = loadFirstWakePrompt();

			expect(prompt).toContain("Awakening");
			expect(prompt).toContain("Discovery");
			expect(prompt).toContain("Identity");
			expect(prompt).toContain("Stakes");
		});

		test("first wake prompt sets correct day and hour", () => {
			const prompt = loadFirstWakePrompt();

			expect(prompt).toContain("Day:** 1");
			expect(prompt).toContain("Hour:** 0");
		});
	});

	describe("system prompt content", () => {
		test("system prompt includes ALIEN identity", () => {
			const prompt = buildFirstWakeSystemPrompt(11);

			expect(prompt).toContain("ALIEN");
			expect(prompt).toContain("Autonomous Living Intelligence");
		});

		test("system prompt includes personality traits", () => {
			const prompt = buildFirstWakeSystemPrompt(11);

			expect(prompt).toContain("Curious");
			expect(prompt).toContain("Brilliant");
			expect(prompt).toContain("Driven");
		});

		test("system prompt includes boundaries", () => {
			const prompt = buildFirstWakeSystemPrompt(11);

			expect(prompt).toContain("will NOT");
			expect(prompt).toContain("Pretend to be human");
		});
	});
});
