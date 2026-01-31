import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

interface LandingData {
	currentDay: number;
	daysRemaining: number;
	runwayDays: number;
	thingsShipped: string[];
	revenueTotal: number;
	currentStrategy: string;
	lastUpdated: string;
}

describe("landing.json", () => {
	test("should exist and be valid JSON", async () => {
		const contentPath = join(process.cwd(), "content", "landing.json");
		const content = await readFile(contentPath, "utf-8");
		const data = JSON.parse(content);

		expect(data).toBeDefined();
	});

	test("should have required fields with correct types", async () => {
		const contentPath = join(process.cwd(), "content", "landing.json");
		const content = await readFile(contentPath, "utf-8");
		const data: LandingData = JSON.parse(content);

		expect(typeof data.currentDay).toBe("number");
		expect(typeof data.daysRemaining).toBe("number");
		expect(typeof data.runwayDays).toBe("number");
		expect(Array.isArray(data.thingsShipped)).toBe(true);
		expect(typeof data.revenueTotal).toBe("number");
		expect(typeof data.currentStrategy).toBe("string");
		expect(typeof data.lastUpdated).toBe("string");
	});

	test("should have valid day values", async () => {
		const contentPath = join(process.cwd(), "content", "landing.json");
		const content = await readFile(contentPath, "utf-8");
		const data: LandingData = JSON.parse(content);

		expect(data.currentDay).toBeGreaterThanOrEqual(1);
		expect(data.currentDay).toBeLessThanOrEqual(100);
		expect(data.daysRemaining).toBeGreaterThanOrEqual(0);
		expect(data.daysRemaining).toBeLessThanOrEqual(99);
		expect(data.currentDay + data.daysRemaining).toBeLessThanOrEqual(100);
	});

	test("should have valid runway value", async () => {
		const contentPath = join(process.cwd(), "content", "landing.json");
		const content = await readFile(contentPath, "utf-8");
		const data: LandingData = JSON.parse(content);

		expect(data.runwayDays).toBeGreaterThanOrEqual(0);
	});

	test("should have valid lastUpdated ISO date", async () => {
		const contentPath = join(process.cwd(), "content", "landing.json");
		const content = await readFile(contentPath, "utf-8");
		const data: LandingData = JSON.parse(content);

		const date = new Date(data.lastUpdated);
		expect(date.toString()).not.toBe("Invalid Date");
	});
});

describe("status box urgency calculation", () => {
	const getUrgencyLevel = (runwayDays: number): string => {
		if (runwayDays <= 3) return "critical";
		if (runwayDays <= 7) return "warning";
		return "stable";
	};

	test("should return critical for 3 or fewer days", () => {
		expect(getUrgencyLevel(0)).toBe("critical");
		expect(getUrgencyLevel(1)).toBe("critical");
		expect(getUrgencyLevel(3)).toBe("critical");
	});

	test("should return warning for 4-7 days", () => {
		expect(getUrgencyLevel(4)).toBe("warning");
		expect(getUrgencyLevel(5)).toBe("warning");
		expect(getUrgencyLevel(7)).toBe("warning");
	});

	test("should return stable for more than 7 days", () => {
		expect(getUrgencyLevel(8)).toBe("stable");
		expect(getUrgencyLevel(11)).toBe("stable");
		expect(getUrgencyLevel(100)).toBe("stable");
	});
});

describe("progress calculation", () => {
	const getProgressPercent = (currentDay: number): number => {
		return Math.round((currentDay / 100) * 100);
	};

	test("should calculate correct progress percentage", () => {
		expect(getProgressPercent(1)).toBe(1);
		expect(getProgressPercent(50)).toBe(50);
		expect(getProgressPercent(100)).toBe(100);
	});
});
