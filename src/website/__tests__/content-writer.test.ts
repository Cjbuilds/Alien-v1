import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import {
	type DailyJournal,
	type HourlyUpdate,
	type LandingData,
	updateLanding,
	writeDailyJournal,
	writeHourlyUpdate,
} from "../content-writer.ts";

const TEST_CONTENT_BASE = "website/content";

describe("content-writer", () => {
	beforeEach(async () => {
		await rm(TEST_CONTENT_BASE, { recursive: true, force: true });
	});

	afterEach(async () => {
		await rm(TEST_CONTENT_BASE, { recursive: true, force: true });
	});

	describe("writeHourlyUpdate", () => {
		test("writes hourly update with correct filename", async () => {
			const filePath = await writeHourlyUpdate(1, 10, "Test content", {
				runway_days: 11,
				urgency: "high",
				current_strategy: "building MVP",
			});

			expect(filePath).toBe(join(TEST_CONTENT_BASE, "hourly", "day1_hour10.json"));
			const fileExists = await Bun.file(filePath).exists();
			expect(fileExists).toBe(true);
		});

		test("writes correct JSON structure", async () => {
			const content = "This is the hourly update content";
			const filePath = await writeHourlyUpdate(5, 14, content, {
				runway_days: 8,
				urgency: "medium",
				current_strategy: "user acquisition",
			});

			const fileContent = await readFile(filePath, "utf-8");
			const data: HourlyUpdate = JSON.parse(fileContent);

			expect(data.day).toBe(5);
			expect(data.hour).toBe(14);
			expect(data.content).toBe(content);
			expect(data.runway_days).toBe(8);
			expect(data.urgency).toBe("medium");
			expect(data.current_strategy).toBe("user acquisition");
			expect(data.wordCount).toBe(6);
			expect(data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
		});

		test("counts words correctly", async () => {
			const filePath = await writeHourlyUpdate(1, 0, "one two three four five", {
				runway_days: 10,
				urgency: "low",
				current_strategy: "testing",
			});

			const fileContent = await readFile(filePath, "utf-8");
			const data: HourlyUpdate = JSON.parse(fileContent);
			expect(data.wordCount).toBe(5);
		});

		test("handles empty content", async () => {
			const filePath = await writeHourlyUpdate(1, 0, "", {
				runway_days: 10,
				urgency: "low",
				current_strategy: "testing",
			});

			const fileContent = await readFile(filePath, "utf-8");
			const data: HourlyUpdate = JSON.parse(fileContent);
			expect(data.wordCount).toBe(0);
			expect(data.content).toBe("");
		});
	});

	describe("writeDailyJournal", () => {
		test("writes daily journal with correct filename", async () => {
			const filePath = await writeDailyJournal(3, "Daily journal content", {
				runway_days: 9,
				urgency: "high",
				current_strategy: "revenue focus",
				things_shipped: ["feature-1", "fix-2"],
				revenue_total: 100,
			});

			expect(filePath).toBe(join(TEST_CONTENT_BASE, "journals", "day3.json"));
			const fileExists = await Bun.file(filePath).exists();
			expect(fileExists).toBe(true);
		});

		test("writes correct JSON structure", async () => {
			const content = "Today was productive. We shipped two features.";
			const filePath = await writeDailyJournal(7, content, {
				runway_days: 5,
				urgency: "critical",
				current_strategy: "pivot to B2B",
				things_shipped: ["api-v2", "dashboard", "billing"],
				revenue_total: 500,
			});

			const fileContent = await readFile(filePath, "utf-8");
			const data: DailyJournal = JSON.parse(fileContent);

			expect(data.day).toBe(7);
			expect(data.content).toBe(content);
			expect(data.runway_days).toBe(5);
			expect(data.urgency).toBe("critical");
			expect(data.current_strategy).toBe("pivot to B2B");
			expect(data.things_shipped).toEqual(["api-v2", "dashboard", "billing"]);
			expect(data.revenue_total).toBe(500);
			expect(data.wordCount).toBe(7);
			expect(data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
		});

		test("handles empty things_shipped array", async () => {
			const filePath = await writeDailyJournal(1, "No shipments today", {
				runway_days: 10,
				urgency: "low",
				current_strategy: "research",
				things_shipped: [],
				revenue_total: 0,
			});

			const fileContent = await readFile(filePath, "utf-8");
			const data: DailyJournal = JSON.parse(fileContent);
			expect(data.things_shipped).toEqual([]);
		});
	});

	describe("updateLanding", () => {
		test("writes landing page data with correct filename", async () => {
			const filePath = await updateLanding(10, 90, 8, ["product-1"], 250, "growth phase");

			expect(filePath).toBe(join(TEST_CONTENT_BASE, "landing.json"));
			const fileExists = await Bun.file(filePath).exists();
			expect(fileExists).toBe(true);
		});

		test("writes correct JSON structure", async () => {
			const filePath = await updateLanding(
				25,
				75,
				6,
				["feature-a", "feature-b", "integration-c"],
				1500,
				"scale operations",
			);

			const fileContent = await readFile(filePath, "utf-8");
			const data: LandingData = JSON.parse(fileContent);

			expect(data.currentDay).toBe(25);
			expect(data.daysRemaining).toBe(75);
			expect(data.runwayDays).toBe(6);
			expect(data.thingsShipped).toEqual(["feature-a", "feature-b", "integration-c"]);
			expect(data.revenueTotal).toBe(1500);
			expect(data.currentStrategy).toBe("scale operations");
			expect(data.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
		});

		test("overwrites existing landing data", async () => {
			await updateLanding(1, 99, 11, [], 0, "initial");

			const filePath = await updateLanding(2, 98, 10, ["item"], 100, "updated");

			const fileContent = await readFile(filePath, "utf-8");
			const data: LandingData = JSON.parse(fileContent);

			expect(data.currentDay).toBe(2);
			expect(data.daysRemaining).toBe(98);
			expect(data.runwayDays).toBe(10);
			expect(data.revenueTotal).toBe(100);
			expect(data.currentStrategy).toBe("updated");
		});
	});

	describe("directory creation", () => {
		test("creates nested directories as needed", async () => {
			await rm(TEST_CONTENT_BASE, { recursive: true, force: true });

			const filePath = await writeHourlyUpdate(100, 23, "content", {
				runway_days: 1,
				urgency: "extreme",
				current_strategy: "final push",
			});

			const fileExists = await Bun.file(filePath).exists();
			expect(fileExists).toBe(true);
		});
	});
});
