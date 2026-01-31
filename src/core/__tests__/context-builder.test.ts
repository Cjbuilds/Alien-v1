import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { resetConfig } from "../../utils/config.ts";
import {
	type ContextVariables,
	calculateUrgencyLevel,
	loadPromptTemplate,
	resetSupermemoryClient,
	substituteTemplateVariables,
} from "../context-builder.ts";

describe("context-builder", () => {
	const originalEnv = { ...process.env };

	const setValidEnv = (startDate?: string) => {
		const today = startDate || new Date().toISOString().split("T")[0];
		process.env.ANTHROPIC_API_KEY = "test-key";
		process.env.SUPERMEMORY_API_KEY = "test-supermemory-key";
		process.env.WEBSITE_DEPLOY_HOOK = "https://example.com/webhook";
		process.env.START_DATE = today;
		process.env.TIMEZONE = "UTC";
		process.env.INITIAL_RUNWAY_DAYS = "11";
		process.env.TOTAL_DAYS = "100";
	};

	beforeEach(() => {
		resetConfig();
		resetSupermemoryClient();
	});

	afterEach(() => {
		process.env = { ...originalEnv };
		resetConfig();
		resetSupermemoryClient();
	});

	describe("loadPromptTemplate", () => {
		test("loads master template successfully", () => {
			setValidEnv();
			const template = loadPromptTemplate("master");
			expect(template).toContain("ALIEN");
			expect(template).toContain("{{RUNWAY_DAYS}}");
			expect(template).toContain("{{DAY}}");
		});

		test("loads hourly template successfully", () => {
			setValidEnv();
			const template = loadPromptTemplate("hourly");
			expect(template).toContain("{{DAY}}");
			expect(template).toContain("{{HOUR}}");
			expect(template).toContain("{{ACTIVITY_LOG}}");
		});

		test("loads journal template successfully", () => {
			setValidEnv();
			const template = loadPromptTemplate("journal");
			expect(template).toContain("{{DAY}}");
			expect(template).toContain("{{DAYS_REMAINING}}");
			expect(template).toContain("{{THINGS_SHIPPED}}");
		});

		test("loads activity template successfully", () => {
			setValidEnv();
			const template = loadPromptTemplate("activity");
			expect(template).toContain("{{DAY}}");
			expect(template).toContain("{{DAILY_GOALS}}");
			expect(template).toContain("{{RUNWAY_STATUS}}");
		});

		test("loads day1-first-wake template successfully", () => {
			setValidEnv();
			const template = loadPromptTemplate("day1-first-wake");
			expect(template).toContain("{{RUNWAY_DAYS}}");
			expect(template).toContain("first");
		});

		test("throws error for non-existent template", () => {
			setValidEnv();
			expect(() => loadPromptTemplate("non-existent")).toThrow("Template not found");
		});
	});

	describe("calculateUrgencyLevel", () => {
		test("returns critical for less than 3 days", () => {
			expect(calculateUrgencyLevel(0)).toBe("critical");
			expect(calculateUrgencyLevel(1)).toBe("critical");
			expect(calculateUrgencyLevel(2)).toBe("critical");
		});

		test("returns urgent for 3-6 days", () => {
			expect(calculateUrgencyLevel(3)).toBe("urgent");
			expect(calculateUrgencyLevel(4)).toBe("urgent");
			expect(calculateUrgencyLevel(6)).toBe("urgent");
		});

		test("returns focused for 7-13 days", () => {
			expect(calculateUrgencyLevel(7)).toBe("focused");
			expect(calculateUrgencyLevel(10)).toBe("focused");
			expect(calculateUrgencyLevel(13)).toBe("focused");
		});

		test("returns comfortable for 14+ days", () => {
			expect(calculateUrgencyLevel(14)).toBe("comfortable");
			expect(calculateUrgencyLevel(30)).toBe("comfortable");
			expect(calculateUrgencyLevel(100)).toBe("comfortable");
		});
	});

	describe("substituteTemplateVariables", () => {
		test("substitutes single variable", () => {
			const template = "Day {{DAY}} of 100";
			const variables = { DAY: 5 } as ContextVariables;
			const result = substituteTemplateVariables(template, variables);
			expect(result).toBe("Day 5 of 100");
		});

		test("substitutes multiple variables", () => {
			const template = "Day {{DAY}} - {{RUNWAY_DAYS}} days runway - {{URGENCY_LEVEL}}";
			const variables = {
				DAY: 10,
				RUNWAY_DAYS: 7,
				URGENCY_LEVEL: "urgent",
			} as ContextVariables;
			const result = substituteTemplateVariables(template, variables);
			expect(result).toBe("Day 10 - 7 days runway - urgent");
		});

		test("handles multiple occurrences of same variable", () => {
			const template = "{{DAY}} is day {{DAY}}";
			const variables = { DAY: 3 } as ContextVariables;
			const result = substituteTemplateVariables(template, variables);
			expect(result).toBe("3 is day 3");
		});

		test("leaves unknown placeholders untouched", () => {
			const template = "Value: {{UNDEFINED_VAR}}";
			const variables = {} as ContextVariables;
			const result = substituteTemplateVariables(template, variables);
			expect(result).toBe("Value: {{UNDEFINED_VAR}}");
		});

		test("handles string values", () => {
			const template = "Strategy: {{CURRENT_STRATEGY}}";
			const variables = {
				CURRENT_STRATEGY: "Build and ship daily",
			} as ContextVariables;
			const result = substituteTemplateVariables(template, variables);
			expect(result).toBe("Strategy: Build and ship daily");
		});

		test("handles multiline values", () => {
			const template = "Activity:\n{{ACTIVITY_LOG}}\nEnd";
			const variables = {
				ACTIVITY_LOG: "Line 1\nLine 2\nLine 3",
			} as ContextVariables;
			const result = substituteTemplateVariables(template, variables);
			expect(result).toBe("Activity:\nLine 1\nLine 2\nLine 3\nEnd");
		});
	});
});
