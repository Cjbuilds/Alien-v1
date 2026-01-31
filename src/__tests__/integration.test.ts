import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { resetSupermemoryClient } from "../memory/supermemory.ts";
import { resetMetricsCache } from "../survival/metrics.ts";
import type { ActivityContext } from "../tasks/activity-decision.ts";
import { resetConfig } from "../utils/config.ts";

/**
 * End-to-end integration tests for Project ALIEN
 *
 * These tests verify:
 * 1. Hourly update trigger works correctly
 * 2. Supermemory storage receives content
 * 3. Content files are written correctly to website/content/
 * 4. Deploy trigger fires after content updates
 * 5. Memory retrieval returns stored content
 * 6. Daily journal generation works
 * 7. Activity decision output format is correct
 * 8. Simulated 24-hour cycle runs correctly
 */

// Track all memory storage calls
interface StoredMemory {
	content: string;
	metadata: Record<string, unknown>;
}

// Track all fetch calls
interface FetchCall {
	url: string;
	options: RequestInit;
}

describe("End-to-end Integration Tests", () => {
	const originalEnv = { ...process.env };
	const testContentDir = join(process.cwd(), "website/content");
	const testHourlyDir = join(testContentDir, "hourly");
	const testJournalsDir = join(testContentDir, "journals");

	// Track mocked data
	let storedMemories: StoredMemory[] = [];
	let fetchCalls: FetchCall[] = [];
	let consoleLogSpy: ReturnType<typeof spyOn>;
	let consoleWarnSpy: ReturnType<typeof spyOn>;
	let consoleErrorSpy: ReturnType<typeof spyOn>;

	// Mock functions
	const mockSupermemorySearch = mock(() =>
		Promise.resolve({
			results: storedMemories.map((m, i) => ({
				id: `mem-${i}`,
				content: m.content,
				metadata: m.metadata,
				score: 0.9,
			})),
		}),
	);

	const mockSupermemoryAdd = mock(
		(content: string, options?: { metadata?: Record<string, unknown> }) => {
			storedMemories.push({
				content,
				metadata: options?.metadata ?? {},
			});
			return Promise.resolve({ id: `mem-${storedMemories.length}` });
		},
	);

	const mockClaudeCreate = mock(() =>
		Promise.resolve({
			content: [
				{
					type: "text",
					text: `This is a mock hourly update. ALIEN is building and shipping daily. The autonomous journey continues with focus and determination. Today we made progress on the core infrastructure. Word count padding for test: ${"lorem ipsum ".repeat(50)}`,
				},
			],
			usage: { input_tokens: 100, output_tokens: 200 },
		}),
	);

	const mockFetch = mock((url: string | URL, options?: RequestInit) => {
		fetchCalls.push({ url: String(url), options: options ?? {} });
		return Promise.resolve({
			ok: true,
			status: 200,
			json: () => Promise.resolve({ job: { id: "test-deploy-123" } }),
		});
	});

	const setValidEnv = (startDate?: string) => {
		const today = startDate || new Date().toISOString().split("T")[0];
		process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
		process.env.SUPERMEMORY_API_KEY = "test-supermemory-key";
		process.env.WEBSITE_DEPLOY_HOOK = "https://api.vercel.com/v1/integrations/deploy/test-hook";
		process.env.START_DATE = today;
		process.env.TIMEZONE = "UTC";
		process.env.INITIAL_RUNWAY_DAYS = "11";
		process.env.TOTAL_DAYS = "100";
		process.env.LOG_LEVEL = "error"; // Suppress logs during tests
	};

	const cleanupTestFiles = () => {
		// Clean up any test files
		try {
			if (existsSync(testHourlyDir)) {
				for (const file of Bun.globSync("*.json", { cwd: testHourlyDir })) {
					const path = join(testHourlyDir, file);
					if (existsSync(path)) rmSync(path);
				}
			}
			if (existsSync(testJournalsDir)) {
				for (const file of Bun.globSync("*.json", { cwd: testJournalsDir })) {
					const path = join(testJournalsDir, file);
					if (existsSync(path)) rmSync(path);
				}
			}
			const landingPath = join(testContentDir, "landing.json");
			if (existsSync(landingPath)) rmSync(landingPath);
		} catch {
			// Ignore cleanup errors
		}
	};

	beforeEach(() => {
		// Reset state
		storedMemories = [];
		fetchCalls = [];
		resetConfig();
		resetSupermemoryClient();
		resetMetricsCache();
		setValidEnv();

		// Suppress console output
		consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
		consoleWarnSpy = spyOn(console, "warn").mockImplementation(() => {});
		consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});

		// Ensure test directories exist
		mkdirSync(testHourlyDir, { recursive: true });
		mkdirSync(testJournalsDir, { recursive: true });

		// Clean up any existing test files
		cleanupTestFiles();
	});

	afterEach(() => {
		process.env = { ...originalEnv };
		resetConfig();
		resetSupermemoryClient();
		resetMetricsCache();
		cleanupTestFiles();

		consoleLogSpy.mockRestore();
		consoleWarnSpy.mockRestore();
		consoleErrorSpy.mockRestore();

		mock.restore();
	});

	describe("1. Hourly Update Trigger", () => {
		test("runHourlyUpdate triggers and returns success result", async () => {
			// Mock external dependencies
			mock.module("@anthropic-ai/sdk", () => ({
				default: class MockAnthropic {
					messages = { create: mockClaudeCreate };
				},
			}));

			// Mock global fetch for Supermemory and deploy
			const originalFetch = globalThis.fetch;
			globalThis.fetch = mockFetch as typeof fetch;

			try {
				const { runHourlyUpdate } = await import("../tasks/hourly-update.ts");
				const result = await runHourlyUpdate("Test activity log");

				expect(result.success).toBe(true);
				expect(result.day).toBeGreaterThanOrEqual(1);
				expect(result.hour).toBeGreaterThanOrEqual(0);
				expect(result.hour).toBeLessThanOrEqual(23);
				expect(result.content).toBeDefined();
				expect(result.content?.length).toBeGreaterThan(0);
			} finally {
				globalThis.fetch = originalFetch;
			}
		});

		test("hourly update generates content with expected structure", async () => {
			mock.module("@anthropic-ai/sdk", () => ({
				default: class MockAnthropic {
					messages = { create: mockClaudeCreate };
				},
			}));

			const originalFetch = globalThis.fetch;
			globalThis.fetch = mockFetch as typeof fetch;

			try {
				const { runHourlyUpdate } = await import("../tasks/hourly-update.ts");
				const result = await runHourlyUpdate("Building auth module");

				expect(result.success).toBe(true);
				expect(typeof result.content).toBe("string");
				expect(result.content?.split(/\s+/).length).toBeGreaterThan(10); // Has meaningful content
			} finally {
				globalThis.fetch = originalFetch;
			}
		});
	});

	describe("2. Supermemory Storage Verification", () => {
		test("hourly update stores content in Supermemory", async () => {
			// Track Supermemory API calls
			const supermemoryApiCalls: { url: string; body: unknown }[] = [];

			mock.module("@anthropic-ai/sdk", () => ({
				default: class MockAnthropic {
					messages = { create: mockClaudeCreate };
				},
			}));

			const originalFetch = globalThis.fetch;
			globalThis.fetch = ((url: string | URL, options?: RequestInit) => {
				const urlStr = String(url);
				if (urlStr.includes("supermemory")) {
					supermemoryApiCalls.push({
						url: urlStr,
						body: options?.body ? JSON.parse(options.body as string) : null,
					});
					return Promise.resolve({
						ok: true,
						status: 200,
						json: () => Promise.resolve({ id: "test-memory-id" }),
					});
				}
				// Deploy hook
				return Promise.resolve({
					ok: true,
					status: 200,
					json: () => Promise.resolve({ job: { id: "deploy-123" } }),
				});
			}) as typeof fetch;

			try {
				const { runHourlyUpdate } = await import("../tasks/hourly-update.ts");
				await runHourlyUpdate("Test activity");

				// Verify Supermemory was called
				const supermemoryCall = supermemoryApiCalls.find((c) => c.url.includes("memories"));
				expect(supermemoryCall).toBeDefined();
				expect(supermemoryCall?.body).toHaveProperty("content");
				expect(supermemoryCall?.body).toHaveProperty("metadata");
				expect((supermemoryCall?.body as Record<string, unknown>).metadata).toHaveProperty(
					"type",
					"hourly_update",
				);
			} finally {
				globalThis.fetch = originalFetch;
			}
		});

		test("stored memory contains required metadata", async () => {
			const supermemoryApiCalls: { body: Record<string, unknown> }[] = [];

			mock.module("@anthropic-ai/sdk", () => ({
				default: class MockAnthropic {
					messages = { create: mockClaudeCreate };
				},
			}));

			const originalFetch = globalThis.fetch;
			globalThis.fetch = ((url: string | URL, options?: RequestInit) => {
				const urlStr = String(url);
				if (urlStr.includes("supermemory")) {
					supermemoryApiCalls.push({
						body: options?.body ? JSON.parse(options.body as string) : {},
					});
					return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
				}
				return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
			}) as typeof fetch;

			try {
				const { runHourlyUpdate } = await import("../tasks/hourly-update.ts");
				await runHourlyUpdate("Building features");

				expect(supermemoryApiCalls.length).toBeGreaterThan(0);
				const metadata = supermemoryApiCalls[0].body.metadata as Record<string, unknown>;
				expect(metadata).toHaveProperty("type");
				expect(metadata).toHaveProperty("day");
				expect(metadata).toHaveProperty("hour");
				expect(metadata).toHaveProperty("timestamp");
			} finally {
				globalThis.fetch = originalFetch;
			}
		});
	});

	describe("3. Content Files Written Correctly", () => {
		test("hourly update writes JSON file to website/content/hourly/", async () => {
			mock.module("@anthropic-ai/sdk", () => ({
				default: class MockAnthropic {
					messages = { create: mockClaudeCreate };
				},
			}));

			const originalFetch = globalThis.fetch;
			globalThis.fetch = mockFetch as typeof fetch;

			try {
				const { runHourlyUpdate } = await import("../tasks/hourly-update.ts");
				const result = await runHourlyUpdate("Test activity");

				expect(result.success).toBe(true);

				// Check that file was written
				const expectedFile = join(testHourlyDir, `day${result.day}_hour${result.hour}.json`);
				expect(existsSync(expectedFile)).toBe(true);

				// Verify file contents
				const fileContent = JSON.parse(readFileSync(expectedFile, "utf-8"));
				expect(fileContent).toHaveProperty("content");
				expect(fileContent).toHaveProperty("type", "hourly_update");
				expect(fileContent).toHaveProperty("day", result.day);
				expect(fileContent).toHaveProperty("hour", result.hour);
				expect(fileContent).toHaveProperty("wordCount");
			} finally {
				globalThis.fetch = originalFetch;
			}
		});

		test("landing.json is updated with current metrics", async () => {
			mock.module("@anthropic-ai/sdk", () => ({
				default: class MockAnthropic {
					messages = { create: mockClaudeCreate };
				},
			}));

			const originalFetch = globalThis.fetch;
			globalThis.fetch = mockFetch as typeof fetch;

			try {
				const { runHourlyUpdate } = await import("../tasks/hourly-update.ts");
				await runHourlyUpdate("Test activity");

				const landingPath = join(testContentDir, "landing.json");
				expect(existsSync(landingPath)).toBe(true);

				const landing = JSON.parse(readFileSync(landingPath, "utf-8"));
				expect(landing).toHaveProperty("currentDay");
				expect(landing).toHaveProperty("daysRemaining");
				expect(landing).toHaveProperty("runwayDays");
				expect(landing).toHaveProperty("currentStrategy");
				expect(landing).toHaveProperty("lastUpdated");
			} finally {
				globalThis.fetch = originalFetch;
			}
		});

		test("content file has valid JSON structure", async () => {
			mock.module("@anthropic-ai/sdk", () => ({
				default: class MockAnthropic {
					messages = { create: mockClaudeCreate };
				},
			}));

			const originalFetch = globalThis.fetch;
			globalThis.fetch = mockFetch as typeof fetch;

			try {
				const { runHourlyUpdate } = await import("../tasks/hourly-update.ts");
				const result = await runHourlyUpdate("Activity log");

				const filePath = join(testHourlyDir, `day${result.day}_hour${result.hour}.json`);
				const content = readFileSync(filePath, "utf-8");

				// Should parse without error
				const parsed = JSON.parse(content);
				expect(parsed).toBeDefined();

				// Check structure
				expect(typeof parsed.content).toBe("string");
				expect(typeof parsed.day).toBe("number");
				expect(typeof parsed.hour).toBe("number");
				expect(typeof parsed.timestamp).toBe("string");
				expect(typeof parsed.runwayDays).toBe("number");
				expect(typeof parsed.wordCount).toBe("number");
			} finally {
				globalThis.fetch = originalFetch;
			}
		});
	});

	describe("4. Deploy Trigger Fires", () => {
		test("deploy webhook is called after hourly update", async () => {
			const deployHookCalls: string[] = [];

			mock.module("@anthropic-ai/sdk", () => ({
				default: class MockAnthropic {
					messages = { create: mockClaudeCreate };
				},
			}));

			const originalFetch = globalThis.fetch;
			globalThis.fetch = ((url: string | URL, options?: RequestInit) => {
				const urlStr = String(url);
				if (urlStr.includes("vercel")) {
					deployHookCalls.push(urlStr);
				}
				return Promise.resolve({
					ok: true,
					status: 200,
					json: () => Promise.resolve({ job: { id: "deploy-job-123" } }),
				});
			}) as typeof fetch;

			try {
				const { runHourlyUpdate } = await import("../tasks/hourly-update.ts");
				await runHourlyUpdate("Build and deploy");

				// Verify deploy was triggered
				expect(deployHookCalls.length).toBeGreaterThan(0);
				expect(deployHookCalls[0]).toContain("vercel");
			} finally {
				globalThis.fetch = originalFetch;
			}
		});

		test("deploy trigger uses POST method", async () => {
			const deployCalls: { url: string; method: string }[] = [];

			mock.module("@anthropic-ai/sdk", () => ({
				default: class MockAnthropic {
					messages = { create: mockClaudeCreate };
				},
			}));

			const originalFetch = globalThis.fetch;
			globalThis.fetch = ((url: string | URL, options?: RequestInit) => {
				const urlStr = String(url);
				if (urlStr.includes("vercel")) {
					deployCalls.push({ url: urlStr, method: options?.method ?? "GET" });
				}
				return Promise.resolve({
					ok: true,
					status: 200,
					json: () => Promise.resolve({}),
				});
			}) as typeof fetch;

			try {
				const { runHourlyUpdate } = await import("../tasks/hourly-update.ts");
				await runHourlyUpdate("Testing deploy");

				expect(deployCalls.length).toBeGreaterThan(0);
				expect(deployCalls[0].method).toBe("POST");
			} finally {
				globalThis.fetch = originalFetch;
			}
		});

		test("deploy trigger retries on failure", async () => {
			let callCount = 0;

			mock.module("@anthropic-ai/sdk", () => ({
				default: class MockAnthropic {
					messages = { create: mockClaudeCreate };
				},
			}));

			const originalFetch = globalThis.fetch;
			globalThis.fetch = ((url: string | URL) => {
				const urlStr = String(url);
				if (urlStr.includes("vercel")) {
					callCount++;
					if (callCount < 3) {
						return Promise.resolve({ ok: false, status: 500 });
					}
					return Promise.resolve({
						ok: true,
						status: 200,
						json: () => Promise.resolve({ job: { id: "deploy-success" } }),
					});
				}
				// Supermemory
				return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
			}) as typeof fetch;

			try {
				const { runHourlyUpdate } = await import("../tasks/hourly-update.ts");
				await runHourlyUpdate("Test retry");

				// Should have retried
				expect(callCount).toBeGreaterThanOrEqual(2);
			} finally {
				globalThis.fetch = originalFetch;
			}
		});
	});

	describe("5. Memory Retrieval Returns Stored Content", () => {
		test("searchRecentUpdates returns results from Supermemory", async () => {
			mock.module("supermemory", () => ({
				default: class MockSupermemory {
					search = {
						execute: mock(() =>
							Promise.resolve({
								results: [
									{
										id: "result-1",
										content: "Day 1 Hour 10: Built authentication module",
										metadata: { type: "hourly_update", day: 1, hour: 10 },
										score: 0.95,
									},
									{
										id: "result-2",
										content: "Day 1 Hour 11: Fixed login bugs",
										metadata: { type: "hourly_update", day: 1, hour: 11 },
										score: 0.9,
									},
								],
							}),
						),
					};
				},
				Supermemory: class MockSupermemory {
					search = {
						execute: mock(() =>
							Promise.resolve({
								results: [
									{
										id: "result-1",
										content: "Day 1 Hour 10: Built authentication module",
										metadata: { type: "hourly_update", day: 1, hour: 10 },
										score: 0.95,
									},
								],
							}),
						),
					};
				},
			}));

			resetSupermemoryClient();
			const { searchRecentUpdates } = await import("../memory/retrieve.ts");
			const results = await searchRecentUpdates(5);

			expect(Array.isArray(results)).toBe(true);
			expect(results.length).toBeGreaterThan(0);
			expect(results[0]).toHaveProperty("content");
			expect(results[0]).toHaveProperty("metadata");
		});

		test("getTodaysUpdates filters by current day", async () => {
			mock.module("supermemory", () => ({
				default: class MockSupermemory {
					search = {
						execute: mock((params: { filters?: { AND?: { key: string; value: string }[] } }) => {
							// Verify the filter includes day
							const dayFilter = params.filters?.AND?.find((f) => f.key === "day");
							expect(dayFilter).toBeDefined();
							return Promise.resolve({
								results: [
									{
										id: "today-1",
										content: "Today's update",
										metadata: { type: "hourly_update", day: 1 },
										score: 0.9,
									},
								],
							});
						}),
					};
				},
				Supermemory: class MockSupermemory {
					search = {
						execute: mock(() =>
							Promise.resolve({
								results: [{ id: "today-1", content: "Today's update" }],
							}),
						),
					};
				},
			}));

			resetSupermemoryClient();
			const { getTodaysUpdates } = await import("../memory/retrieve.ts");
			const results = await getTodaysUpdates();

			expect(Array.isArray(results)).toBe(true);
		});

		test("getYesterdaysJournal returns null on day 1", async () => {
			// Set start date to today so we're on day 1
			const today = new Date().toISOString().split("T")[0];
			setValidEnv(today);

			mock.module("supermemory", () => ({
				default: class MockSupermemory {
					search = { execute: mock(() => Promise.resolve({ results: [] })) };
				},
				Supermemory: class MockSupermemory {
					search = { execute: mock(() => Promise.resolve({ results: [] })) };
				},
			}));

			resetSupermemoryClient();
			const { getYesterdaysJournal } = await import("../memory/retrieve.ts");
			const result = await getYesterdaysJournal();

			expect(result).toBeNull();
		});
	});

	describe("6. Daily Journal Generation", () => {
		test("runDailyJournal generates journal with correct structure", async () => {
			const mockJournalReflection = `Today was a productive day on the ALIEN journey. ${"We made significant progress on the core infrastructure. ".repeat(30)}`;

			mock.module("supermemory", () => ({
				Supermemory: class MockSupermemory {
					search = mock(() => Promise.resolve({ results: [] }));
					add = mock(() => Promise.resolve({ id: "journal-1" }));
				},
			}));

			mock.module("@anthropic-ai/sdk", () => ({
				default: class MockAnthropic {
					messages = {
						create: mock(() =>
							Promise.resolve({
								content: [{ type: "text", text: mockJournalReflection }],
							}),
						),
					};
				},
			}));

			const { runDailyJournal } = await import("../tasks/daily-journal.ts");
			const journal = await runDailyJournal();

			expect(journal).toHaveProperty("day");
			expect(journal).toHaveProperty("date");
			expect(journal).toHaveProperty("metrics");
			expect(journal).toHaveProperty("hourlyUpdates");
			expect(journal).toHaveProperty("reflection");
			expect(journal).toHaveProperty("createdAt");
		});

		test("daily journal includes metrics", async () => {
			mock.module("supermemory", () => ({
				Supermemory: class MockSupermemory {
					search = mock(() => Promise.resolve({ results: [] }));
					add = mock(() => Promise.resolve({}));
				},
			}));

			mock.module("@anthropic-ai/sdk", () => ({
				default: class MockAnthropic {
					messages = {
						create: mock(() =>
							Promise.resolve({
								content: [{ type: "text", text: `Reflection content ${"word ".repeat(500)}` }],
							}),
						),
					};
				},
			}));

			const { runDailyJournal } = await import("../tasks/daily-journal.ts");
			const journal = await runDailyJournal();

			expect(journal.metrics).toHaveProperty("goals");
			expect(journal.metrics).toHaveProperty("completed");
			expect(journal.metrics).toHaveProperty("shipped");
			expect(journal.metrics).toHaveProperty("revenue");
			expect(journal.metrics).toHaveProperty("runway");
			expect(Array.isArray(journal.metrics.goals)).toBe(true);
			expect(typeof journal.metrics.runway).toBe("number");
		});

		test("daily journal saves to memory", async () => {
			let addWasCalled = false;
			let addedContent = "";

			mock.module("supermemory", () => ({
				Supermemory: class MockSupermemory {
					search = mock(() => Promise.resolve({ results: [] }));
					add = mock((content: string) => {
						addWasCalled = true;
						addedContent = content;
						return Promise.resolve({ id: "saved-journal" });
					});
				},
			}));

			mock.module("@anthropic-ai/sdk", () => ({
				default: class MockAnthropic {
					messages = {
						create: mock(() =>
							Promise.resolve({
								content: [{ type: "text", text: "Journal reflection content" }],
							}),
						),
					};
				},
			}));

			const { runDailyJournal } = await import("../tasks/daily-journal.ts");
			await runDailyJournal();

			expect(addWasCalled).toBe(true);
			expect(addedContent).toContain("Daily Journal");
		});
	});

	describe("7. Activity Decision Output Format", () => {
		test("decideActivity returns valid activity decision structure", async () => {
			const mockActivityDecision = {
				activities: [
					{
						type: "BUILD",
						action: "Implement user authentication",
						reasoning: "Core feature needed for MVP",
						duration_minutes: 45,
					},
					{
						type: "WRITE",
						action: "Document API endpoints",
						reasoning: "Keep documentation in sync",
						duration_minutes: 15,
					},
				],
				urgency_assessment: "Focused mode - steady progress needed",
				confidence_in_strategy: 0.85,
				strategy_notes: "Current approach is working well",
			};

			mock.module("@anthropic-ai/sdk", () => ({
				default: class MockAnthropic {
					messages = {
						create: mock(() =>
							Promise.resolve({
								content: [{ type: "text", text: JSON.stringify(mockActivityDecision) }],
							}),
						),
					};
				},
			}));

			const { decideActivity } = await import("../tasks/activity-decision.ts");

			const context: ActivityContext = {
				goals: {
					daily: ["Complete authentication"],
					weekly: ["Launch MVP"],
				},
				recentActivities: [],
				runwayStatus: {
					runwayDays: 10,
					urgencyLevel: "focused",
					daysRemaining: 95,
					currentDay: 5,
				},
				currentStrategy: "Build and ship fast",
			};

			const decision = await decideActivity(context);

			expect(decision).toHaveProperty("activities");
			expect(decision).toHaveProperty("urgency_assessment");
			expect(decision).toHaveProperty("confidence_in_strategy");
			expect(Array.isArray(decision.activities)).toBe(true);
			expect(decision.activities.length).toBeGreaterThan(0);
		});

		test("activity decision validates activity types", async () => {
			const validDecision = {
				activities: [
					{
						type: "BUILD",
						action: "Build something",
						reasoning: "Need to build",
						duration_minutes: 30,
					},
				],
				urgency_assessment: "Test",
				confidence_in_strategy: 0.8,
			};

			mock.module("@anthropic-ai/sdk", () => ({
				default: class MockAnthropic {
					messages = {
						create: mock(() =>
							Promise.resolve({
								content: [{ type: "text", text: JSON.stringify(validDecision) }],
							}),
						),
					};
				},
			}));

			const { decideActivity } = await import("../tasks/activity-decision.ts");

			const context: ActivityContext = {
				goals: { daily: [], weekly: [] },
				recentActivities: [],
				runwayStatus: {
					runwayDays: 11,
					urgencyLevel: "comfortable",
					daysRemaining: 100,
					currentDay: 1,
				},
				currentStrategy: "Test",
			};

			const decision = await decideActivity(context);

			// Verify all activity types are valid
			const validTypes = ["BUILD", "WRITE", "RESEARCH", "ANALYZE", "ITERATE", "SHIP"];
			for (const activity of decision.activities) {
				expect(validTypes).toContain(activity.type);
			}
		});

		test("activity has required fields", async () => {
			const mockDecision = {
				activities: [
					{
						type: "RESEARCH",
						action: "Research auth patterns",
						reasoning: "Need to understand best practices",
						duration_minutes: 25,
					},
				],
				urgency_assessment: "Comfortable pace",
				confidence_in_strategy: 0.9,
			};

			mock.module("@anthropic-ai/sdk", () => ({
				default: class MockAnthropic {
					messages = {
						create: mock(() =>
							Promise.resolve({
								content: [{ type: "text", text: JSON.stringify(mockDecision) }],
							}),
						),
					};
				},
			}));

			const { decideActivity } = await import("../tasks/activity-decision.ts");

			const context: ActivityContext = {
				goals: { daily: ["Research"], weekly: [] },
				recentActivities: [],
				runwayStatus: {
					runwayDays: 15,
					urgencyLevel: "comfortable",
					daysRemaining: 90,
					currentDay: 10,
				},
				currentStrategy: "Research phase",
			};

			const decision = await decideActivity(context);

			for (const activity of decision.activities) {
				expect(activity).toHaveProperty("type");
				expect(activity).toHaveProperty("action");
				expect(activity).toHaveProperty("reasoning");
				expect(activity).toHaveProperty("duration_minutes");
				expect(typeof activity.action).toBe("string");
				expect(typeof activity.reasoning).toBe("string");
				expect(typeof activity.duration_minutes).toBe("number");
				expect(activity.duration_minutes).toBeGreaterThan(0);
			}
		});
	});

	describe("8. Simulated 24-Hour Run", () => {
		test("can run hourly updates for full simulated day", async () => {
			const hourlyResults: { hour: number; success: boolean }[] = [];

			mock.module("@anthropic-ai/sdk", () => ({
				default: class MockAnthropic {
					messages = {
						create: mock(() =>
							Promise.resolve({
								content: [
									{
										type: "text",
										text: `Hourly update content for simulation test ${"word ".repeat(50)}`,
									},
								],
								usage: { input_tokens: 50, output_tokens: 100 },
							}),
						),
					};
				},
			}));

			const originalFetch = globalThis.fetch;
			globalThis.fetch = (() =>
				Promise.resolve({
					ok: true,
					status: 200,
					json: () => Promise.resolve({}),
				})) as typeof fetch;

			try {
				const { runHourlyUpdate } = await import("../tasks/hourly-update.ts");

				// Simulate 24 hours (we'll just run a few to keep test fast)
				const hoursToTest = [0, 6, 12, 18, 23];

				for (const hour of hoursToTest) {
					const result = await runHourlyUpdate(`Activity at hour ${hour}`);
					hourlyResults.push({ hour, success: result.success });
				}

				// All should succeed
				expect(hourlyResults.every((r) => r.success)).toBe(true);
				expect(hourlyResults.length).toBe(hoursToTest.length);
			} finally {
				globalThis.fetch = originalFetch;
			}
		});

		test("daily journal can run after hourly updates", async () => {
			mock.module("supermemory", () => ({
				Supermemory: class MockSupermemory {
					search = mock(() =>
						Promise.resolve({
							results: [
								{ content: "Hour 10 update", metadata: {} },
								{ content: "Hour 11 update", metadata: {} },
							],
						}),
					);
					add = mock(() => Promise.resolve({ id: "journal-saved" }));
				},
			}));

			mock.module("@anthropic-ai/sdk", () => ({
				default: class MockAnthropic {
					messages = {
						create: mock(() =>
							Promise.resolve({
								content: [
									{
										type: "text",
										text: `End of day reflection after a productive day. ${"Made great progress on all fronts. ".repeat(30)}`,
									},
								],
							}),
						),
					};
				},
			}));

			const { runDailyJournal } = await import("../tasks/daily-journal.ts");
			const journal = await runDailyJournal();

			expect(journal.day).toBeGreaterThanOrEqual(1);
			expect(journal.reflection.length).toBeGreaterThan(0);
			expect(journal.metrics).toBeDefined();
		});

		test("activity decisions maintain consistency across hours", async () => {
			const decisions: { hour: number; activities: { type: string }[] }[] = [];

			mock.module("@anthropic-ai/sdk", () => ({
				default: class MockAnthropic {
					messages = {
						create: mock(() =>
							Promise.resolve({
								content: [
									{
										type: "text",
										text: JSON.stringify({
											activities: [
												{
													type: "BUILD",
													action: "Continue development",
													reasoning: "Progress needed",
													duration_minutes: 55,
												},
											],
											urgency_assessment: "Steady progress",
											confidence_in_strategy: 0.85,
										}),
									},
								],
							}),
						),
					};
				},
			}));

			const { decideActivity } = await import("../tasks/activity-decision.ts");

			// Simulate decisions at different hours
			const hoursToTest = [9, 10, 11, 14, 15, 16];

			for (const _hour of hoursToTest) {
				const context: ActivityContext = {
					goals: { daily: ["Build features"], weekly: ["Ship MVP"] },
					recentActivities: [],
					runwayStatus: {
						runwayDays: 10,
						urgencyLevel: "focused",
						daysRemaining: 95,
						currentDay: 5,
					},
					currentStrategy: "Build and ship",
				};

				const decision = await decideActivity(context);
				decisions.push({ hour: _hour, activities: decision.activities });
			}

			// All decisions should have valid structure
			for (const decision of decisions) {
				expect(decision.activities.length).toBeGreaterThan(0);
				expect(["BUILD", "WRITE", "RESEARCH", "ANALYZE", "ITERATE", "SHIP"]).toContain(
					decision.activities[0].type,
				);
			}
		});

		test("content writer handles multiple files without conflicts", async () => {
			const { writeHourlyUpdate, updateLanding } = await import("../website/content-writer.ts");

			// Write multiple hourly updates
			const updates = [
				{ day: 1, hour: 10 },
				{ day: 1, hour: 11 },
				{ day: 1, hour: 12 },
			];

			for (const { day, hour } of updates) {
				await writeHourlyUpdate(day, hour, `Content for hour ${hour}`, {
					runway_days: 10,
					urgency: "focused",
					current_strategy: "Build fast",
				});
			}

			// Update landing multiple times
			for (let i = 0; i < 3; i++) {
				await updateLanding(1, 99 - i, 10, ["Item 1"], 0, "Strategy");
			}

			// Verify all files exist and are valid
			for (const { day, hour } of updates) {
				const path = join(testHourlyDir, `day${day}_hour${hour}.json`);
				expect(existsSync(path)).toBe(true);
				const content = JSON.parse(readFileSync(path, "utf-8"));
				expect(content.hour).toBe(hour);
			}

			const landingPath = join(testContentDir, "landing.json");
			expect(existsSync(landingPath)).toBe(true);
			const landing = JSON.parse(readFileSync(landingPath, "utf-8"));
			expect(landing.daysRemaining).toBe(97); // Last update value
		});
	});

	describe("Integration Flow - Full Pipeline", () => {
		test("complete hourly cycle: decision → update → store → deploy", async () => {
			const pipelineSteps: string[] = [];

			// Track what happens at each step
			mock.module("@anthropic-ai/sdk", () => ({
				default: class MockAnthropic {
					messages = {
						create: mock((params: { messages: { content: string }[] }) => {
							const content = params.messages[0]?.content || "";
							if (content.includes("decide") || content.includes("activity")) {
								pipelineSteps.push("activity_decision");
								return Promise.resolve({
									content: [
										{
											type: "text",
											text: JSON.stringify({
												activities: [
													{
														type: "BUILD",
														action: "Build feature",
														reasoning: "Need to ship",
														duration_minutes: 45,
													},
												],
												urgency_assessment: "Focused",
												confidence_in_strategy: 0.8,
											}),
										},
									],
								});
							}
							pipelineSteps.push("hourly_update");
							return Promise.resolve({
								content: [
									{
										type: "text",
										text: `Generated hourly update content ${"word ".repeat(50)}`,
									},
								],
								usage: { input_tokens: 50, output_tokens: 100 },
							});
						}),
					};
				},
			}));

			const originalFetch = globalThis.fetch;
			globalThis.fetch = ((url: string | URL) => {
				const urlStr = String(url);
				if (urlStr.includes("supermemory")) {
					pipelineSteps.push("memory_store");
				} else if (urlStr.includes("vercel")) {
					pipelineSteps.push("deploy_trigger");
				}
				return Promise.resolve({
					ok: true,
					status: 200,
					json: () => Promise.resolve({ id: "test-id" }),
				});
			}) as typeof fetch;

			try {
				// Run the hourly update pipeline
				const { runHourlyUpdate } = await import("../tasks/hourly-update.ts");
				const result = await runHourlyUpdate("Build activities");

				expect(result.success).toBe(true);

				// Verify pipeline order
				expect(pipelineSteps).toContain("hourly_update");
				expect(pipelineSteps).toContain("memory_store");
				expect(pipelineSteps).toContain("deploy_trigger");

				// Memory store should come before deploy
				const memoryIndex = pipelineSteps.indexOf("memory_store");
				const deployIndex = pipelineSteps.indexOf("deploy_trigger");
				expect(memoryIndex).toBeLessThan(deployIndex);
			} finally {
				globalThis.fetch = originalFetch;
			}
		});
	});
});
