import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { getSchedulerStatus, startScheduler, stopScheduler } from "../index.ts";

describe("scheduler", () => {
	let consoleLogSpy: ReturnType<typeof spyOn>;
	let consoleWarnSpy: ReturnType<typeof spyOn>;
	let consoleErrorSpy: ReturnType<typeof spyOn>;

	beforeEach(() => {
		consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
		consoleWarnSpy = spyOn(console, "warn").mockImplementation(() => {});
		consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		stopScheduler();
		consoleLogSpy.mockRestore();
		consoleWarnSpy.mockRestore();
		consoleErrorSpy.mockRestore();
	});

	describe("startScheduler", () => {
		test("starts all cron jobs", () => {
			startScheduler();
			const status = getSchedulerStatus();

			expect(status.length).toBe(7);
		});

		test("registers activityDecision task at minute 55", () => {
			startScheduler();
			const status = getSchedulerStatus();

			const activityTask = status.find((t) => t.name === "activityDecision");
			expect(activityTask).toBeDefined();
			expect(activityTask?.schedule).toBe("55 * * * *");
		});

		test("registers hourlyUpdate task at minute 50", () => {
			startScheduler();
			const status = getSchedulerStatus();

			const hourlyTask = status.find((t) => t.name === "hourlyUpdate");
			expect(hourlyTask).toBeDefined();
			expect(hourlyTask?.schedule).toBe("50 * * * *");
		});

		test("registers dailyJournal task at 23:00 UTC", () => {
			startScheduler();
			const status = getSchedulerStatus();

			const journalTask = status.find((t) => t.name === "dailyJournal");
			expect(journalTask).toBeDefined();
			expect(journalTask?.schedule).toBe("0 23 * * *");
		});

		test("registers runwayCheck task every 6 hours", () => {
			startScheduler();
			const status = getSchedulerStatus();

			const runwayTask = status.find((t) => t.name === "runwayCheck");
			expect(runwayTask).toBeDefined();
			expect(runwayTask?.schedule).toBe("0 */6 * * *");
		});

		test("registers goalReview task at 00:15 UTC", () => {
			startScheduler();
			const status = getSchedulerStatus();

			const goalTask = status.find((t) => t.name === "goalReview");
			expect(goalTask).toBeDefined();
			expect(goalTask?.schedule).toBe("15 0 * * *");
		});

		test("registers weeklyReview task on Sunday at 12:00 UTC", () => {
			startScheduler();
			const status = getSchedulerStatus();

			const weeklyTask = status.find((t) => t.name === "weeklyReview");
			expect(weeklyTask).toBeDefined();
			expect(weeklyTask?.schedule).toBe("0 12 * * 0");
		});

		test("registers healthCheck task every 5 minutes", () => {
			startScheduler();
			const status = getSchedulerStatus();

			const healthTask = status.find((t) => t.name === "healthCheck");
			expect(healthTask).toBeDefined();
			expect(healthTask?.schedule).toBe("*/5 * * * *");
		});

		test("logs scheduler start", () => {
			startScheduler();

			expect(consoleLogSpy).toHaveBeenCalled();
			const calls = consoleLogSpy.mock.calls.map((c) => c[0] as string);
			expect(calls.some((c) => c.includes("Starting scheduler"))).toBe(true);
			expect(calls.some((c) => c.includes("Scheduler started"))).toBe(true);
		});
	});

	describe("stopScheduler", () => {
		test("stops all cron jobs", () => {
			startScheduler();
			expect(getSchedulerStatus().length).toBe(7);

			stopScheduler();
			expect(getSchedulerStatus().length).toBe(0);
		});

		test("logs scheduler stop", () => {
			startScheduler();
			consoleLogSpy.mockClear();

			stopScheduler();

			expect(consoleLogSpy).toHaveBeenCalled();
			const calls = consoleLogSpy.mock.calls.map((c) => c[0] as string);
			expect(calls.some((c) => c.includes("Stopping scheduler"))).toBe(true);
			expect(calls.some((c) => c.includes("Scheduler stopped"))).toBe(true);
		});
	});

	describe("getSchedulerStatus", () => {
		test("returns empty array when scheduler not started", () => {
			const status = getSchedulerStatus();
			expect(status).toEqual([]);
		});

		test("returns task status after scheduler starts", () => {
			startScheduler();
			const status = getSchedulerStatus();

			expect(status.length).toBeGreaterThan(0);
			for (const task of status) {
				expect(task).toHaveProperty("name");
				expect(task).toHaveProperty("schedule");
			}
		});
	});
});
