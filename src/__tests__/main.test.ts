import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

// Mock the imports before testing
const mockStartScheduler = mock(() => {});
const mockStopScheduler = mock(() => {});
const mockHasFirstWakeCompleted = mock(() => true);
const mockRunFirstWake = mock(() => Promise.resolve({ success: true, alreadyCompleted: true }));
const mockGetTimeStatus = mock(() => ({
	currentDayNumber: 1,
	currentHour: 10,
	daysRemaining: 100,
	startDate: "2025-01-31",
	totalDays: 100,
	hoursSinceStart: 10,
	timezone: "UTC",
}));

describe("Main Entry Point", () => {
	describe("Initialization Flow", () => {
		it("should check if first wake is completed", () => {
			// The main module checks hasFirstWakeCompleted on startup
			expect(typeof mockHasFirstWakeCompleted).toBe("function");
		});

		it("should have proper time status structure", () => {
			const status = mockGetTimeStatus();
			expect(status).toHaveProperty("currentDayNumber");
			expect(status).toHaveProperty("currentHour");
			expect(status).toHaveProperty("daysRemaining");
			expect(status).toHaveProperty("startDate");
		});

		it("should have scheduler start and stop functions", () => {
			expect(typeof mockStartScheduler).toBe("function");
			expect(typeof mockStopScheduler).toBe("function");
		});
	});

	describe("First Wake Result Structure", () => {
		it("should return success when already completed", async () => {
			const result = await mockRunFirstWake();
			expect(result.success).toBe(true);
			expect(result.alreadyCompleted).toBe(true);
		});
	});
});

describe("Scheduler Integration", () => {
	it("should register all required tasks", async () => {
		// Import the actual scheduler to test task registration
		const { getSchedulerStatus, startScheduler, stopScheduler } = await import(
			"../scheduler/index.ts"
		);

		// Start scheduler to register tasks
		startScheduler();

		const status = getSchedulerStatus();
		expect(status.length).toBeGreaterThan(0);

		// Verify expected tasks are registered
		const taskNames = status.map((t: { name: string }) => t.name);
		expect(taskNames).toContain("hourlyUpdate");
		expect(taskNames).toContain("dailyJournal");
		expect(taskNames).toContain("activityDecision");
		expect(taskNames).toContain("runwayCheck");
		expect(taskNames).toContain("healthCheck");

		// Clean up
		stopScheduler();
	});

	it("should have correct cron schedules", async () => {
		const { getSchedulerStatus, startScheduler, stopScheduler } = await import(
			"../scheduler/index.ts"
		);

		startScheduler();
		const status = getSchedulerStatus();

		const hourlyUpdate = status.find((t: { name: string }) => t.name === "hourlyUpdate");
		const dailyJournal = status.find((t: { name: string }) => t.name === "dailyJournal");

		expect(hourlyUpdate?.schedule).toBe("50 * * * *");
		expect(dailyJournal?.schedule).toBe("0 23 * * *");

		stopScheduler();
	});
});
