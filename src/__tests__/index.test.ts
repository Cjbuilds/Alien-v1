import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { resetSupermemoryClient } from "../memory/supermemory.ts";
import { resetMetricsCache } from "../survival/metrics.ts";
import { resetConfig } from "../utils/config.ts";

describe("index (main entry point)", () => {
	const originalEnv = { ...process.env };
	const testAlienDir = join(process.cwd(), ".alien");

	const setValidEnv = () => {
		const today = new Date().toISOString().split("T")[0];
		process.env.ANTHROPIC_API_KEY = "test-key";
		process.env.SUPERMEMORY_API_KEY = "test-key";
		process.env.WEBSITE_DEPLOY_HOOK = "https://example.com/webhook";
		process.env.START_DATE = today;
		process.env.TIMEZONE = "UTC";
		process.env.INITIAL_RUNWAY_DAYS = "11";
		process.env.TOTAL_DAYS = "100";
		process.env.LOG_LEVEL = "error"; // Suppress logs during tests
	};

	const cleanup = () => {
		const files = ["health.json", "runway.json", "metrics.json"];
		for (const file of files) {
			const path = join(testAlienDir, file);
			if (existsSync(path)) {
				rmSync(path);
			}
		}
	};

	beforeEach(() => {
		resetConfig();
		resetSupermemoryClient();
		resetMetricsCache();
		cleanup();
	});

	afterEach(() => {
		process.env = { ...originalEnv };
		resetConfig();
		resetSupermemoryClient();
		resetMetricsCache();
		cleanup();
	});

	describe("health file management", () => {
		test("health file structure is correct", () => {
			setValidEnv();

			// Simulate writing a health status (without running full main)
			const healthFile = join(testAlienDir, "health.json");
			const status = {
				pid: process.pid,
				startedAt: new Date().toISOString(),
				lastUpdate: new Date().toISOString(),
			};

			// Create dir if needed
			const { mkdirSync } = require("node:fs");
			const { dirname } = require("node:path");
			if (!existsSync(dirname(healthFile))) {
				mkdirSync(dirname(healthFile), { recursive: true });
			}

			const { writeFileSync } = require("node:fs");
			writeFileSync(healthFile, JSON.stringify(status, null, "\t"));

			expect(existsSync(healthFile)).toBe(true);

			const loaded = JSON.parse(readFileSync(healthFile, "utf-8"));
			expect(loaded).toHaveProperty("pid");
			expect(loaded).toHaveProperty("startedAt");
			expect(loaded).toHaveProperty("lastUpdate");
			expect(typeof loaded.pid).toBe("number");
		});
	});

	describe("Day 1 detection", () => {
		test("detects Day 1 when no runway state exists", () => {
			setValidEnv();

			// No runway.json means Day 1
			const { loadRunwayState } = require("../survival/runway-tracker.ts");
			const state = loadRunwayState();
			expect(state).toBeNull();
		});

		test("detects existing state when runway state exists", () => {
			setValidEnv();

			// Create runway state
			const { saveRunwayState, loadRunwayState } = require("../survival/runway-tracker.ts");
			saveRunwayState({
				runwayDays: 11,
				lastUpdated: new Date().toISOString(),
			});

			const state = loadRunwayState();
			expect(state).not.toBeNull();
			expect(state?.runwayDays).toBe(11);
		});
	});

	describe("config validation", () => {
		test("parseConfig throws on missing required fields", () => {
			process.env = {};
			const { parseConfig } = require("../utils/config.ts");
			expect(() => parseConfig()).toThrow();
		});

		test("parseConfig succeeds with valid env", () => {
			setValidEnv();
			const { parseConfig } = require("../utils/config.ts");
			const config = parseConfig();
			expect(config.ANTHROPIC_API_KEY).toBe("test-key");
			expect(config.SUPERMEMORY_API_KEY).toBe("test-key");
		});
	});

	describe("initialization modules", () => {
		test("getSupermemoryClient initializes without error", () => {
			setValidEnv();
			const { getSupermemoryClient } = require("../memory/supermemory.ts");
			const client = getSupermemoryClient();
			expect(client).toBeDefined();
		});

		test("getRunwayStatus returns valid status", () => {
			setValidEnv();
			const { getRunwayStatus } = require("../survival/runway-tracker.ts");
			const status = getRunwayStatus();
			expect(status).toHaveProperty("currentDay");
			expect(status).toHaveProperty("daysRemaining");
			expect(status).toHaveProperty("runwayDays");
			expect(status).toHaveProperty("urgencyLevel");
		});

		test("getTimeStatus returns valid time info", () => {
			setValidEnv();
			const { getTimeStatus } = require("../utils/time.ts");
			const status = getTimeStatus();
			expect(status).toHaveProperty("currentDayNumber");
			expect(status).toHaveProperty("currentHour");
			expect(status).toHaveProperty("totalDays");
			expect(status).toHaveProperty("daysRemaining");
		});
	});

	describe("metrics initialization", () => {
		test("initializes metrics with defaults", () => {
			setValidEnv();
			const { getMetrics, updateMetrics } = require("../survival/metrics.ts");

			// Initialize with default strategy
			updateMetrics({
				thingsShipped: 0,
				revenueTotal: 0,
				currentStrategy: "Building in public - shipping daily",
				keyMetrics: {},
			});

			const metrics = getMetrics();
			expect(metrics.thingsShipped).toBe(0);
			expect(metrics.revenueTotal).toBe(0);
			expect(metrics.currentStrategy).toBe("Building in public - shipping daily");
		});
	});
});
