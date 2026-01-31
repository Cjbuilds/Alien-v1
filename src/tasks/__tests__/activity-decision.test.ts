import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { resetConfig } from "../../utils/config.ts";
import {
	type ActivityContext,
	type ActivityDecision,
	type Goals,
	type RecentActivity,
	type RunwayStatus,
	decideActivity,
	getUrgencyLevel,
} from "../activity-decision.ts";

describe("activity-decision", () => {
	const originalEnv = { ...process.env };

	const setValidEnv = () => {
		const today = new Date().toISOString().split("T")[0];
		process.env.ANTHROPIC_API_KEY = "test-api-key";
		process.env.SUPERMEMORY_API_KEY = "test-key";
		process.env.WEBSITE_DEPLOY_HOOK = "https://example.com/webhook";
		process.env.START_DATE = today;
		process.env.TIMEZONE = "UTC";
		process.env.INITIAL_RUNWAY_DAYS = "11";
		process.env.TOTAL_DAYS = "100";
		process.env.LOG_LEVEL = "error"; // Suppress logs in tests
	};

	beforeEach(() => {
		resetConfig();
		setValidEnv();
	});

	afterEach(() => {
		process.env = { ...originalEnv };
		resetConfig();
		mock.restore();
	});

	describe("getUrgencyLevel", () => {
		test("returns critical for < 3 days runway", () => {
			expect(getUrgencyLevel(0)).toBe("critical");
			expect(getUrgencyLevel(1)).toBe("critical");
			expect(getUrgencyLevel(2)).toBe("critical");
			expect(getUrgencyLevel(2.9)).toBe("critical");
		});

		test("returns urgent for 3-6 days runway", () => {
			expect(getUrgencyLevel(3)).toBe("urgent");
			expect(getUrgencyLevel(5)).toBe("urgent");
			expect(getUrgencyLevel(6.9)).toBe("urgent");
		});

		test("returns focused for 7-13 days runway", () => {
			expect(getUrgencyLevel(7)).toBe("focused");
			expect(getUrgencyLevel(10)).toBe("focused");
			expect(getUrgencyLevel(13.9)).toBe("focused");
		});

		test("returns comfortable for >= 14 days runway", () => {
			expect(getUrgencyLevel(14)).toBe("comfortable");
			expect(getUrgencyLevel(30)).toBe("comfortable");
			expect(getUrgencyLevel(100)).toBe("comfortable");
		});
	});

	describe("decideActivity", () => {
		const createMockContext = (): ActivityContext => ({
			goals: {
				daily: ["Complete authentication module", "Write API documentation"],
				weekly: ["Launch MVP", "Get first 10 users"],
			},
			recentActivities: [
				{
					hour: 14,
					day: 1,
					activities: [
						{
							type: "BUILD",
							action: "Implemented login flow",
							reasoning: "Core feature needed",
							duration_minutes: 45,
						},
					],
				},
				{
					hour: 13,
					day: 1,
					activities: [
						{
							type: "RESEARCH",
							action: "Investigated auth libraries",
							reasoning: "Need to choose best approach",
							duration_minutes: 30,
						},
					],
				},
			],
			runwayStatus: {
				runwayDays: 11,
				urgencyLevel: "focused",
				daysRemaining: 100,
				currentDay: 1,
			},
			currentStrategy: "Build and ship fast",
		});

		const createMockDecision = (): ActivityDecision => ({
			activities: [
				{
					type: "BUILD",
					action: "Implement user registration endpoint",
					reasoning: "Needed for MVP launch",
					duration_minutes: 40,
				},
				{
					type: "WRITE",
					action: "Document registration API",
					reasoning: "Keep docs in sync with code",
					duration_minutes: 20,
				},
			],
			urgency_assessment: "Focused mode - have runway but need to make progress",
			confidence_in_strategy: 0.8,
			strategy_notes: "Current approach is working well",
		});

		test("returns valid activity decision from Claude", async () => {
			const mockDecision = createMockDecision();

			// Mock the Anthropic client
			const mockCreate = mock(() =>
				Promise.resolve({
					content: [
						{
							type: "text",
							text: JSON.stringify(mockDecision),
						},
					],
				}),
			);

			// Mock the module import
			mock.module("@anthropic-ai/sdk", () => ({
				default: class MockAnthropic {
					messages = { create: mockCreate };
				},
			}));

			// Re-import to get mocked version
			const { decideActivity: mockedDecideActivity } = await import("../activity-decision.ts");

			const context = createMockContext();
			const result = await mockedDecideActivity(context);

			expect(result.activities).toHaveLength(2);
			expect(result.activities[0].type).toBe("BUILD");
			expect(result.activities[1].type).toBe("WRITE");
			expect(result.urgency_assessment).toBe(mockDecision.urgency_assessment);
			expect(result.confidence_in_strategy).toBe(0.8);
		});

		test("handles JSON wrapped in markdown code blocks", async () => {
			const mockDecision = createMockDecision();

			const mockCreate = mock(() =>
				Promise.resolve({
					content: [
						{
							type: "text",
							text: `\`\`\`json\n${JSON.stringify(mockDecision)}\n\`\`\``,
						},
					],
				}),
			);

			mock.module("@anthropic-ai/sdk", () => ({
				default: class MockAnthropic {
					messages = { create: mockCreate };
				},
			}));

			const { decideActivity: mockedDecideActivity } = await import("../activity-decision.ts");

			const context = createMockContext();
			const result = await mockedDecideActivity(context);

			expect(result.activities).toHaveLength(2);
			expect(result.confidence_in_strategy).toBe(0.8);
		});

		test("validates activity types in response", async () => {
			const invalidDecision = {
				activities: [
					{
						type: "INVALID_TYPE",
						action: "Some action",
						reasoning: "Some reason",
						duration_minutes: 30,
					},
				],
				urgency_assessment: "Test",
				confidence_in_strategy: 0.5,
			};

			const mockCreate = mock(() =>
				Promise.resolve({
					content: [
						{
							type: "text",
							text: JSON.stringify(invalidDecision),
						},
					],
				}),
			);

			mock.module("@anthropic-ai/sdk", () => ({
				default: class MockAnthropic {
					messages = { create: mockCreate };
				},
			}));

			const { decideActivity: mockedDecideActivity } = await import("../activity-decision.ts");

			const context = createMockContext();
			await expect(mockedDecideActivity(context)).rejects.toThrow("Invalid activity type");
		});

		test("retries on API failure", async () => {
			let callCount = 0;
			const mockDecision = createMockDecision();

			const mockCreate = mock(() => {
				callCount++;
				if (callCount < 3) {
					return Promise.reject(new Error("API Error"));
				}
				return Promise.resolve({
					content: [
						{
							type: "text",
							text: JSON.stringify(mockDecision),
						},
					],
				});
			});

			mock.module("@anthropic-ai/sdk", () => ({
				default: class MockAnthropic {
					messages = { create: mockCreate };
				},
			}));

			const { decideActivity: mockedDecideActivity } = await import("../activity-decision.ts");

			const context = createMockContext();
			const result = await mockedDecideActivity(context);

			expect(callCount).toBe(3);
			expect(result.activities).toHaveLength(2);
		});

		test("throws after max retries", async () => {
			const mockCreate = mock(() => Promise.reject(new Error("Persistent API Error")));

			mock.module("@anthropic-ai/sdk", () => ({
				default: class MockAnthropic {
					messages = { create: mockCreate };
				},
			}));

			const { decideActivity: mockedDecideActivity } = await import("../activity-decision.ts");

			const context = createMockContext();
			await expect(mockedDecideActivity(context)).rejects.toThrow("Persistent API Error");
		});

		test("handles empty goals", async () => {
			const mockDecision = createMockDecision();

			const mockCreate = mock(() =>
				Promise.resolve({
					content: [
						{
							type: "text",
							text: JSON.stringify(mockDecision),
						},
					],
				}),
			);

			mock.module("@anthropic-ai/sdk", () => ({
				default: class MockAnthropic {
					messages = { create: mockCreate };
				},
			}));

			const { decideActivity: mockedDecideActivity } = await import("../activity-decision.ts");

			const context: ActivityContext = {
				goals: { daily: [], weekly: [] },
				recentActivities: [],
				runwayStatus: {
					runwayDays: 5,
					urgencyLevel: "urgent",
					daysRemaining: 95,
					currentDay: 5,
				},
				currentStrategy: "Survival mode",
			};

			const result = await mockedDecideActivity(context);
			expect(result.activities).toHaveLength(2);
		});
	});

	describe("type definitions", () => {
		test("ActivityType includes all valid types", () => {
			const validTypes: string[] = ["BUILD", "WRITE", "RESEARCH", "ANALYZE", "ITERATE", "SHIP"];
			// Type check - this would fail at compile time if types don't match
			const typeCheck: import("../activity-decision.ts").ActivityType[] = [
				"BUILD",
				"WRITE",
				"RESEARCH",
				"ANALYZE",
				"ITERATE",
				"SHIP",
			];
			expect(typeCheck).toHaveLength(6);
		});

		test("UrgencyLevel includes all valid levels", () => {
			const levelCheck: import("../activity-decision.ts").UrgencyLevel[] = [
				"comfortable",
				"focused",
				"urgent",
				"critical",
			];
			expect(levelCheck).toHaveLength(4);
		});
	});
});
