import { beforeEach, describe, expect, mock, test } from "bun:test";
import {
	type ClaudeResponse,
	type ContentWriter,
	type DeployTrigger,
	type MemoryStore,
	type MetricsTracker,
	type OutputProcessorDeps,
	type RunwayTracker,
	processActivityOutput,
	processHourlyOutput,
	processJournalOutput,
} from "../output-processor.ts";

// Mock implementations
function createMockContentWriter(): ContentWriter {
	return {
		writeHourlyUpdate: mock(() => Promise.resolve()),
		writeDailyJournal: mock(() => Promise.resolve()),
		updateLanding: mock(() => Promise.resolve()),
	};
}

function createMockMemoryStore(): MemoryStore {
	return {
		storeHourlyUpdate: mock(() => Promise.resolve({ success: true })),
		storeDailyJournal: mock(() => Promise.resolve({ success: true })),
		storeStrategicLearning: mock(() => Promise.resolve({ success: true })),
	};
}

function createMockMetricsTracker(): MetricsTracker {
	return {
		getMetrics: mock(() =>
			Promise.resolve({
				thingsShipped: 5,
				revenueTotal: 100,
				currentStrategy: "Build valuable tools",
			}),
		),
		setStrategy: mock(() => Promise.resolve()),
	};
}

function createMockRunwayTracker(): RunwayTracker {
	return {
		getRunwayStatus: mock(() =>
			Promise.resolve({
				currentDay: 10,
				daysRemaining: 90,
				runwayDays: 8,
				urgencyLevel: "focused",
			}),
		),
	};
}

function createMockDeployTrigger(): DeployTrigger {
	return {
		triggerDeploy: mock(() => Promise.resolve(true)),
	};
}

function createMockDeps(): OutputProcessorDeps {
	return {
		contentWriter: createMockContentWriter(),
		memoryStore: createMockMemoryStore(),
		metricsTracker: createMockMetricsTracker(),
		runwayTracker: createMockRunwayTracker(),
		deployTrigger: createMockDeployTrigger(),
	};
}

describe("processHourlyOutput", () => {
	let deps: OutputProcessorDeps;

	beforeEach(() => {
		deps = createMockDeps();
	});

	test("successfully processes hourly output", async () => {
		const response: ClaudeResponse = {
			content: "This is my hourly update. I've been working on building a tool.",
		};

		const result = await processHourlyOutput(response, 10, 14, deps);

		expect(result.success).toBe(true);
		expect(result.localSaved).toBe(true);
		expect(result.memorySaved).toBe(true);
		expect(result.deployed).toBe(true);
		expect(result.metricsUpdated).toBe(true);
		expect(result.errors).toHaveLength(0);
	});

	test("calls contentWriter.writeHourlyUpdate with correct args", async () => {
		const response: ClaudeResponse = {
			content: "Test content for hourly update",
		};

		await processHourlyOutput(response, 5, 10, deps);

		expect(deps.contentWriter.writeHourlyUpdate).toHaveBeenCalledTimes(1);
		const calls = (deps.contentWriter.writeHourlyUpdate as ReturnType<typeof mock>).mock.calls;
		expect(calls[0][0]).toBe(5); // day
		expect(calls[0][1]).toBe(10); // hour
		expect(calls[0][2]).toBe("Test content for hourly update"); // content
		expect(calls[0][3].day).toBe(5);
		expect(calls[0][3].hour).toBe(10);
	});

	test("returns failure for empty content", async () => {
		const response: ClaudeResponse = {
			content: "",
		};

		const result = await processHourlyOutput(response, 10, 14, deps);

		expect(result.success).toBe(false);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]).toContain("Empty response");
	});

	test("continues processing even if memory store fails", async () => {
		deps.memoryStore.storeHourlyUpdate = mock(() =>
			Promise.reject(new Error("Memory unavailable")),
		);

		const response: ClaudeResponse = {
			content: "Test hourly update",
		};

		const result = await processHourlyOutput(response, 10, 14, deps);

		expect(result.success).toBe(true);
		expect(result.localSaved).toBe(true);
		expect(result.memorySaved).toBe(false);
		expect(result.errors).toContain("Memory store failed: Memory unavailable");
	});

	test("continues processing even if deploy fails", async () => {
		deps.deployTrigger.triggerDeploy = mock(() => Promise.reject(new Error("Deploy error")));

		const response: ClaudeResponse = {
			content: "Test hourly update",
		};

		const result = await processHourlyOutput(response, 10, 14, deps);

		expect(result.success).toBe(true);
		expect(result.localSaved).toBe(true);
		expect(result.deployed).toBe(false);
		expect(result.errors.some((e) => e.includes("Deploy failed"))).toBe(true);
	});

	test("reports errors when local save fails but still tries other steps", async () => {
		deps.contentWriter.writeHourlyUpdate = mock(() => Promise.reject(new Error("Disk full")));

		const response: ClaudeResponse = {
			content: "Test hourly update",
		};

		const result = await processHourlyOutput(response, 10, 14, deps);

		expect(result.success).toBe(false);
		expect(result.localSaved).toBe(false);
		expect(result.errors.some((e) => e.includes("Local save failed"))).toBe(true);
	});

	test("returns failure when runway tracker fails", async () => {
		deps.runwayTracker.getRunwayStatus = mock(() =>
			Promise.reject(new Error("Status unavailable")),
		);

		const response: ClaudeResponse = {
			content: "Test hourly update",
		};

		const result = await processHourlyOutput(response, 10, 14, deps);

		expect(result.success).toBe(false);
		expect(result.errors[0]).toContain("Status unavailable");
	});

	test("handles whitespace-only content as empty", async () => {
		const response: ClaudeResponse = {
			content: "   \n\t  ",
		};

		const result = await processHourlyOutput(response, 10, 14, deps);

		expect(result.success).toBe(false);
		expect(result.errors[0]).toContain("Empty response");
	});
});

describe("processJournalOutput", () => {
	let deps: OutputProcessorDeps;

	beforeEach(() => {
		deps = createMockDeps();
	});

	test("successfully processes journal output", async () => {
		const longContent = "This is a daily journal entry. ".repeat(100);
		const response: ClaudeResponse = {
			content: longContent,
		};

		const result = await processJournalOutput(response, 10, deps);

		expect(result.success).toBe(true);
		expect(result.localSaved).toBe(true);
		expect(result.memorySaved).toBe(true);
		expect(result.deployed).toBe(true);
		expect(result.metricsUpdated).toBe(true);
		expect(result.errors).toHaveLength(0);
	});

	test("calls contentWriter.writeDailyJournal with correct args", async () => {
		const response: ClaudeResponse = {
			content: "Daily reflection content",
		};

		await processJournalOutput(response, 7, deps);

		expect(deps.contentWriter.writeDailyJournal).toHaveBeenCalledTimes(1);
		const calls = (deps.contentWriter.writeDailyJournal as ReturnType<typeof mock>).mock.calls;
		expect(calls[0][0]).toBe(7); // day
		expect(calls[0][1]).toBe("Daily reflection content"); // content
		expect(calls[0][2].day).toBe(7);
	});

	test("stores journal in Supermemory", async () => {
		const response: ClaudeResponse = {
			content: "Journal for memory storage",
		};

		await processJournalOutput(response, 5, deps);

		expect(deps.memoryStore.storeDailyJournal).toHaveBeenCalledTimes(1);
		const calls = (deps.memoryStore.storeDailyJournal as ReturnType<typeof mock>).mock.calls;
		expect(calls[0][0]).toBe("Journal for memory storage");
		expect(calls[0][1].type).toBe("daily_journal");
		expect(calls[0][1].day).toBe(5);
	});

	test("returns failure for empty content", async () => {
		const response: ClaudeResponse = {
			content: "",
		};

		const result = await processJournalOutput(response, 10, deps);

		expect(result.success).toBe(false);
		expect(result.errors[0]).toContain("Empty response");
	});

	test("continues processing even if memory store fails", async () => {
		deps.memoryStore.storeDailyJournal = mock(() => Promise.reject(new Error("Memory full")));

		const response: ClaudeResponse = {
			content: "Test journal content",
		};

		const result = await processJournalOutput(response, 10, deps);

		expect(result.success).toBe(true);
		expect(result.localSaved).toBe(true);
		expect(result.memorySaved).toBe(false);
	});

	test("updates landing page with current metrics", async () => {
		const response: ClaudeResponse = {
			content: "Journal content",
		};

		await processJournalOutput(response, 10, deps);

		expect(deps.contentWriter.updateLanding).toHaveBeenCalledTimes(1);
		const calls = (deps.contentWriter.updateLanding as ReturnType<typeof mock>).mock.calls;
		expect(calls[0][0]).toBe(10); // currentDay
		expect(calls[0][1]).toBe(90); // daysRemaining
		expect(calls[0][2]).toBe(8); // runwayDays
		expect(calls[0][3]).toBe(5); // thingsShipped
		expect(calls[0][4]).toBe(100); // revenueTotal
		expect(calls[0][5]).toBe("Build valuable tools"); // currentStrategy
	});
});

describe("processActivityOutput", () => {
	let deps: OutputProcessorDeps;

	beforeEach(() => {
		deps = createMockDeps();
	});

	test("successfully parses valid activity decision JSON", async () => {
		const response: ClaudeResponse = {
			content: JSON.stringify({
				activities: [
					{
						type: "BUILD",
						action: "Implement API endpoint",
						reasoning: "Need to ship features",
						duration_minutes: 45,
					},
				],
				urgency_assessment: "Runway is stable",
				confidence_in_strategy: 0.8,
				strategy_notes: "Current approach is working well",
			}),
		};

		const result = await processActivityOutput(response, deps);

		expect(result.success).toBe(true);
		expect(result.decision).toBeDefined();
		expect(result.decision?.activities).toHaveLength(1);
		expect(result.decision?.activities[0].type).toBe("BUILD");
		expect(result.decision?.confidence_in_strategy).toBe(0.8);
	});

	test("extracts JSON from markdown code blocks", async () => {
		const response: ClaudeResponse = {
			content: `Here is my decision:
\`\`\`json
{
  "activities": [
    {
      "type": "WRITE",
      "action": "Write blog post",
      "reasoning": "Content creation",
      "duration_minutes": 60
    }
  ],
  "urgency_assessment": "All good",
  "confidence_in_strategy": 0.9,
  "strategy_notes": ""
}
\`\`\``,
		};

		const result = await processActivityOutput(response, deps);

		expect(result.success).toBe(true);
		expect(result.decision?.activities[0].type).toBe("WRITE");
	});

	test("returns failure for invalid JSON", async () => {
		const response: ClaudeResponse = {
			content: "This is not JSON at all",
		};

		const result = await processActivityOutput(response, deps);

		expect(result.success).toBe(false);
		expect(result.decision).toBeUndefined();
		expect(result.errors[0]).toContain("Failed to parse activity decision");
	});

	test("validates activity types", async () => {
		const response: ClaudeResponse = {
			content: JSON.stringify({
				activities: [
					{
						type: "INVALID_TYPE",
						action: "Do something",
						reasoning: "Because",
						duration_minutes: 30,
					},
				],
				urgency_assessment: "Test",
				confidence_in_strategy: 0.5,
				strategy_notes: "",
			}),
		};

		const result = await processActivityOutput(response, deps);

		expect(result.success).toBe(false);
		expect(result.errors[0]).toContain("Invalid activity type");
	});

	test("validates required fields in activities", async () => {
		const response: ClaudeResponse = {
			content: JSON.stringify({
				activities: [
					{
						type: "BUILD",
						// missing action and reasoning
						duration_minutes: 30,
					},
				],
				urgency_assessment: "Test",
				confidence_in_strategy: 0.5,
				strategy_notes: "",
			}),
		};

		const result = await processActivityOutput(response, deps);

		expect(result.success).toBe(false);
		expect(result.errors[0]).toContain("missing action or reasoning");
	});

	test("stores strategic learning when confidence is low", async () => {
		const response: ClaudeResponse = {
			content: JSON.stringify({
				activities: [
					{
						type: "ANALYZE",
						action: "Review strategy",
						reasoning: "Something is off",
						duration_minutes: 60,
					},
				],
				urgency_assessment: "Need to reassess",
				confidence_in_strategy: 0.3,
				strategy_notes: "Current strategy may not be working",
			}),
		};

		const result = await processActivityOutput(response, deps);

		expect(result.success).toBe(true);
		expect(deps.memoryStore.storeStrategicLearning).toHaveBeenCalledTimes(1);
		const calls = (deps.memoryStore.storeStrategicLearning as ReturnType<typeof mock>).mock.calls;
		expect(calls[0][0]).toBe("Current strategy may not be working");
		expect(calls[0][1]).toBe("strategy_concern");
		expect(calls[0][2]).toBe(0.3);
	});

	test("does not store strategic learning when confidence is high", async () => {
		const response: ClaudeResponse = {
			content: JSON.stringify({
				activities: [
					{
						type: "BUILD",
						action: "Continue building",
						reasoning: "On track",
						duration_minutes: 60,
					},
				],
				urgency_assessment: "Good progress",
				confidence_in_strategy: 0.9,
				strategy_notes: "All is well",
			}),
		};

		await processActivityOutput(response, deps);

		expect(deps.memoryStore.storeStrategicLearning).not.toHaveBeenCalled();
	});

	test("updates strategy when pivot is mentioned with low confidence", async () => {
		const response: ClaudeResponse = {
			content: JSON.stringify({
				activities: [
					{
						type: "ANALYZE",
						action: "Plan pivot",
						reasoning: "Current approach failing",
						duration_minutes: 60,
					},
				],
				urgency_assessment: "Must change direction immediately",
				confidence_in_strategy: 0.2,
				strategy_notes: "Need to pivot to new approach",
			}),
		};

		const result = await processActivityOutput(response, deps);

		expect(result.success).toBe(true);
		expect(result.metricsUpdated).toBe(true);
		expect(deps.metricsTracker.setStrategy).toHaveBeenCalledTimes(1);
	});

	test("does not update strategy for pivot mention with high confidence", async () => {
		const response: ClaudeResponse = {
			content: JSON.stringify({
				activities: [
					{
						type: "BUILD",
						action: "Keep building",
						reasoning: "Good progress",
						duration_minutes: 60,
					},
				],
				urgency_assessment: "Steady",
				confidence_in_strategy: 0.8,
				strategy_notes: "No need to pivot",
			}),
		};

		await processActivityOutput(response, deps);

		expect(deps.metricsTracker.setStrategy).not.toHaveBeenCalled();
	});

	test("localSaved is always false for activity decisions", async () => {
		const response: ClaudeResponse = {
			content: JSON.stringify({
				activities: [
					{
						type: "BUILD",
						action: "Build feature",
						reasoning: "Need it",
						duration_minutes: 60,
					},
				],
				urgency_assessment: "Normal",
				confidence_in_strategy: 0.7,
				strategy_notes: "",
			}),
		};

		const result = await processActivityOutput(response, deps);

		expect(result.localSaved).toBe(false);
		expect(result.deployed).toBe(false);
	});

	test("handles all valid activity types", async () => {
		const activityTypes = ["BUILD", "WRITE", "RESEARCH", "ANALYZE", "ITERATE", "SHIP"];

		for (const type of activityTypes) {
			const response: ClaudeResponse = {
				content: JSON.stringify({
					activities: [
						{
							type,
							action: `Do ${type.toLowerCase()} task`,
							reasoning: "Testing",
							duration_minutes: 30,
						},
					],
					urgency_assessment: "Test",
					confidence_in_strategy: 0.5,
					strategy_notes: "",
				}),
			};

			const result = await processActivityOutput(response, deps);
			expect(result.success).toBe(true);
			expect(result.decision?.activities[0].type).toBe(type);
		}
	});
});

describe("error handling edge cases", () => {
	let deps: OutputProcessorDeps;

	beforeEach(() => {
		deps = createMockDeps();
	});

	test("handles undefined response content", async () => {
		const response = {} as ClaudeResponse;

		const result = await processHourlyOutput(response, 10, 14, deps);

		expect(result.success).toBe(false);
		expect(result.errors[0]).toContain("Empty response");
	});

	test("handles metrics tracker failure", async () => {
		deps.metricsTracker.getMetrics = mock(() => Promise.reject(new Error("Metrics unavailable")));

		const response: ClaudeResponse = {
			content: "Test content",
		};

		const result = await processHourlyOutput(response, 10, 14, deps);

		expect(result.success).toBe(false);
		expect(result.errors[0]).toContain("Metrics unavailable");
	});

	test("handles memory store returning unsuccessful", async () => {
		deps.memoryStore.storeHourlyUpdate = mock(() => Promise.resolve({ success: false }));

		const response: ClaudeResponse = {
			content: "Test content",
		};

		const result = await processHourlyOutput(response, 10, 14, deps);

		expect(result.success).toBe(true); // Still succeeds because local save worked
		expect(result.memorySaved).toBe(false);
		expect(result.errors).toContain("Memory store returned unsuccessful");
	});

	test("handles deploy trigger returning false", async () => {
		deps.deployTrigger.triggerDeploy = mock(() => Promise.resolve(false));

		const response: ClaudeResponse = {
			content: "Test content",
		};

		const result = await processHourlyOutput(response, 10, 14, deps);

		expect(result.success).toBe(true);
		expect(result.deployed).toBe(false);
		expect(result.errors).toContain("Deploy trigger returned false");
	});

	test("handles landing update failure", async () => {
		deps.contentWriter.updateLanding = mock(() => Promise.reject(new Error("Landing error")));

		const response: ClaudeResponse = {
			content: "Test content",
		};

		const result = await processHourlyOutput(response, 10, 14, deps);

		expect(result.success).toBe(true);
		expect(result.metricsUpdated).toBe(false);
		expect(result.errors.some((e) => e.includes("Landing update failed"))).toBe(true);
	});
});
