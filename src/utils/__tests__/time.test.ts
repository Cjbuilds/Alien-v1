import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { resetConfig } from "../config.ts";
import {
	formatDate,
	getCurrentDayNumber,
	getCurrentHour,
	getDaysRemaining,
	getHoursSinceStart,
	getInitialRunwayDays,
	getStartDate,
	getTimeStatus,
	getTotalDays,
} from "../time.ts";

describe("time", () => {
	const originalEnv = { ...process.env };

	const setValidEnv = (startDate = "2025-01-01") => {
		process.env.ANTHROPIC_API_KEY = "test-key";
		process.env.SUPERMEMORY_API_KEY = "test-key";
		process.env.WEBSITE_DEPLOY_HOOK = "https://example.com/webhook";
		process.env.START_DATE = startDate;
		process.env.TIMEZONE = "UTC";
		process.env.INITIAL_RUNWAY_DAYS = "11";
		process.env.TOTAL_DAYS = "100";
	};

	beforeEach(() => {
		resetConfig();
	});

	afterEach(() => {
		process.env = { ...originalEnv };
		resetConfig();
	});

	describe("getStartDate", () => {
		test("returns correct start date", () => {
			setValidEnv("2025-06-15");
			const startDate = getStartDate();
			expect(startDate.getUTCFullYear()).toBe(2025);
			expect(startDate.getUTCMonth()).toBe(5); // 0-indexed
			expect(startDate.getUTCDate()).toBe(15);
		});
	});

	describe("getCurrentDayNumber", () => {
		test("returns 1 on start date", () => {
			const today = new Date().toISOString().split("T")[0];
			setValidEnv(today);
			expect(getCurrentDayNumber()).toBe(1);
		});

		test("returns correct day after start", () => {
			const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
			setValidEnv(twoDaysAgo);
			expect(getCurrentDayNumber()).toBe(3);
		});
	});

	describe("getTotalDays", () => {
		test("returns configured total days", () => {
			setValidEnv();
			process.env.TOTAL_DAYS = "50";
			resetConfig();
			expect(getTotalDays()).toBe(50);
		});
	});

	describe("getDaysRemaining", () => {
		test("returns correct days remaining", () => {
			const today = new Date().toISOString().split("T")[0];
			setValidEnv(today);
			process.env.TOTAL_DAYS = "100";
			resetConfig();
			expect(getDaysRemaining()).toBe(100);
		});

		test("returns 0 when past total days", () => {
			const pastDate = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
			setValidEnv(pastDate);
			process.env.TOTAL_DAYS = "100";
			resetConfig();
			expect(getDaysRemaining()).toBe(0);
		});
	});

	describe("getInitialRunwayDays", () => {
		test("returns configured initial runway days", () => {
			setValidEnv();
			process.env.INITIAL_RUNWAY_DAYS = "15";
			resetConfig();
			expect(getInitialRunwayDays()).toBe(15);
		});
	});

	describe("getCurrentHour", () => {
		test("returns hour between 0 and 23", () => {
			setValidEnv();
			const hour = getCurrentHour();
			expect(hour).toBeGreaterThanOrEqual(0);
			expect(hour).toBeLessThanOrEqual(23);
		});
	});

	describe("getHoursSinceStart", () => {
		test("returns positive hours for past start date", () => {
			const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split("T")[0];
			setValidEnv(yesterday);
			const hours = getHoursSinceStart();
			expect(hours).toBeGreaterThanOrEqual(24);
		});
	});

	describe("formatDate", () => {
		test("formats date only", () => {
			setValidEnv();
			const date = new Date("2025-06-15T14:30:00Z");
			const formatted = formatDate(date, "date");
			expect(formatted).toContain("2025");
			expect(formatted).toContain("06");
			expect(formatted).toContain("15");
		});

		test("formats time only", () => {
			setValidEnv();
			const date = new Date("2025-06-15T14:30:45Z");
			const formatted = formatDate(date, "time");
			expect(formatted).toContain("14");
			expect(formatted).toContain("30");
			expect(formatted).toContain("45");
		});
	});

	describe("getTimeStatus", () => {
		test("returns complete time status object", () => {
			const today = new Date().toISOString().split("T")[0];
			setValidEnv(today);
			const status = getTimeStatus();
			expect(status).toHaveProperty("currentDayNumber");
			expect(status).toHaveProperty("currentHour");
			expect(status).toHaveProperty("totalDays");
			expect(status).toHaveProperty("daysRemaining");
			expect(status).toHaveProperty("hoursSinceStart");
			expect(status).toHaveProperty("startDate");
			expect(status).toHaveProperty("timezone");
			expect(status.startDate).toBe(today);
			expect(status.timezone).toBe("UTC");
		});
	});
});
