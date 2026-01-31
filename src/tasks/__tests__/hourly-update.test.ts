import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { resetConfig } from "../../utils/config.ts";
import {
	type HourlyUpdateResult,
	buildSystemPrompt,
	buildUserPrompt,
	countWords,
	getUrgencyLevel,
	loadPromptTemplate,
	substituteVariables,
} from "../hourly-update.ts";

describe("hourly-update", () => {
	let consoleLogSpy: ReturnType<typeof spyOn>;
	let consoleWarnSpy: ReturnType<typeof spyOn>;
	let consoleErrorSpy: ReturnType<typeof spyOn>;
	const originalEnv = { ...process.env };

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

		resetConfig();
	});

	afterEach(() => {
		consoleLogSpy.mockRestore();
		consoleWarnSpy.mockRestore();
		consoleErrorSpy.mockRestore();

		process.env = { ...originalEnv };
		resetConfig();
	});

	describe("getUrgencyLevel", () => {
		test("returns critical for runway <= 3 days", () => {
			expect(getUrgencyLevel(1)).toBe("critical");
			expect(getUrgencyLevel(2)).toBe("critical");
			expect(getUrgencyLevel(3)).toBe("critical");
		});

		test("returns high for runway 4-7 days", () => {
			expect(getUrgencyLevel(4)).toBe("high");
			expect(getUrgencyLevel(5)).toBe("high");
			expect(getUrgencyLevel(7)).toBe("high");
		});

		test("returns medium for runway 8-14 days", () => {
			expect(getUrgencyLevel(8)).toBe("medium");
			expect(getUrgencyLevel(10)).toBe("medium");
			expect(getUrgencyLevel(14)).toBe("medium");
		});

		test("returns low for runway > 14 days", () => {
			expect(getUrgencyLevel(15)).toBe("low");
			expect(getUrgencyLevel(30)).toBe("low");
			expect(getUrgencyLevel(100)).toBe("low");
		});
	});

	describe("substituteVariables", () => {
		test("replaces single variable", () => {
			const template = "Hello {{NAME}}!";
			const result = substituteVariables(template, { NAME: "World" });
			expect(result).toBe("Hello World!");
		});

		test("replaces multiple variables", () => {
			const template = "Day {{DAY}} of {{TOTAL}}";
			const result = substituteVariables(template, { DAY: 5, TOTAL: 100 });
			expect(result).toBe("Day 5 of 100");
		});

		test("replaces same variable multiple times", () => {
			const template = "{{X}} + {{X}} = 2{{X}}";
			const result = substituteVariables(template, { X: "a" });
			expect(result).toBe("a + a = 2a");
		});

		test("handles numeric values", () => {
			const template = "Runway: {{DAYS}} days";
			const result = substituteVariables(template, { DAYS: 11 });
			expect(result).toBe("Runway: 11 days");
		});

		test("leaves unmatched variables unchanged", () => {
			const template = "{{KNOWN}} and {{UNKNOWN}}";
			const result = substituteVariables(template, { KNOWN: "yes" });
			expect(result).toBe("yes and {{UNKNOWN}}");
		});
	});

	describe("loadPromptTemplate", () => {
		test("loads master template successfully", () => {
			const template = loadPromptTemplate("master");
			expect(template).toContain("ALIEN");
			expect(template).toContain("{{DAY}}");
			expect(template).toContain("{{RUNWAY_DAYS}}");
		});

		test("loads hourly template successfully", () => {
			const template = loadPromptTemplate("hourly");
			expect(template).toContain("Hourly Update");
			expect(template).toContain("{{ACTIVITY_LOG}}");
		});

		test("throws error for non-existent template", () => {
			expect(() => loadPromptTemplate("nonexistent")).toThrow("Failed to load prompt template");
		});
	});

	describe("buildSystemPrompt", () => {
		test("substitutes all variables in system prompt", () => {
			const result = buildSystemPrompt(5, 10, "Test Strategy");
			expect(result).toContain("Day 5");
			expect(result).toContain("10");
			expect(result).toContain("Test Strategy");
			expect(result).not.toContain("{{DAY}}");
			expect(result).not.toContain("{{RUNWAY_DAYS}}");
			expect(result).not.toContain("{{CURRENT_STRATEGY}}");
		});
	});

	describe("buildUserPrompt", () => {
		test("substitutes all variables in user prompt", () => {
			const result = buildUserPrompt(
				5,
				14,
				10,
				"Build Strategy",
				"Did some coding",
				"Previous memory",
			);
			expect(result).toContain("5");
			expect(result).toContain("14");
			expect(result).toContain("10");
			expect(result).toContain("Build Strategy");
			expect(result).toContain("Did some coding");
			expect(result).toContain("Previous memory");
		});

		test("uses default text when activity log is empty", () => {
			const result = buildUserPrompt(1, 0, 11, "Strategy", "", "");
			expect(result).toContain("No recent activity logged");
		});

		test("uses default text when memories are empty", () => {
			const result = buildUserPrompt(1, 0, 11, "Strategy", "Activity", "");
			expect(result).toContain("No recent memories available");
		});

		test("includes urgency level based on runway", () => {
			const lowUrgency = buildUserPrompt(1, 0, 20, "Strategy", "", "");
			expect(lowUrgency).toContain("low");

			const criticalUrgency = buildUserPrompt(1, 0, 2, "Strategy", "", "");
			expect(criticalUrgency).toContain("critical");
		});
	});

	describe("countWords", () => {
		test("counts words in simple sentence", () => {
			expect(countWords("Hello world")).toBe(2);
		});

		test("handles multiple spaces", () => {
			expect(countWords("Hello    world")).toBe(2);
		});

		test("handles leading and trailing whitespace", () => {
			expect(countWords("  Hello world  ")).toBe(2);
		});

		test("handles newlines and tabs", () => {
			expect(countWords("Hello\nworld\there")).toBe(3);
		});

		test("returns 0 for empty string", () => {
			expect(countWords("")).toBe(0);
		});

		test("returns 0 for whitespace only", () => {
			expect(countWords("   \n\t  ")).toBe(0);
		});

		test("counts complex content correctly", () => {
			const content =
				"This is a test of the word counting function. It should handle various cases including punctuation!";
			expect(countWords(content)).toBe(16);
		});
	});

	describe("HourlyUpdateResult type", () => {
		test("success result has expected shape", () => {
			const result: HourlyUpdateResult = {
				success: true,
				day: 1,
				hour: 10,
				content: "Test content",
			};
			expect(result.success).toBe(true);
			expect(result.day).toBe(1);
			expect(result.hour).toBe(10);
			expect(result.content).toBe("Test content");
		});

		test("failure result has expected shape", () => {
			const result: HourlyUpdateResult = {
				success: false,
				day: 1,
				hour: 10,
				error: "Something went wrong",
			};
			expect(result.success).toBe(false);
			expect(result.error).toBe("Something went wrong");
		});
	});
});
