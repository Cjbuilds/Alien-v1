import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { resetConfig } from "../../utils/config.ts";
import {
	getRunwayDays,
	getRunwayStatus,
	getUrgencyLevel,
	loadRunwayState,
	saveRunwayState,
	updateRunwayDays,
} from "../runway-tracker.ts";

describe("runway-tracker", () => {
	const originalEnv = { ...process.env };
	const testAlienDir = join(process.cwd(), ".alien");

	const setValidEnv = (startDate?: string) => {
		const today = startDate || new Date().toISOString().split("T")[0];
		process.env.ANTHROPIC_API_KEY = "test-key";
		process.env.SUPERMEMORY_API_KEY = "test-key";
		process.env.WEBSITE_DEPLOY_HOOK = "https://example.com/webhook";
		process.env.START_DATE = today;
		process.env.TIMEZONE = "UTC";
		process.env.INITIAL_RUNWAY_DAYS = "11";
		process.env.TOTAL_DAYS = "100";
	};

	const cleanupRunwayState = () => {
		const runwayPath = join(testAlienDir, "runway.json");
		if (existsSync(runwayPath)) {
			rmSync(runwayPath);
		}
	};

	beforeEach(() => {
		resetConfig();
		cleanupRunwayState();
	});

	afterEach(() => {
		process.env = { ...originalEnv };
		resetConfig();
		cleanupRunwayState();
	});

	describe("getUrgencyLevel", () => {
		test("returns critical for < 3 days", () => {
			expect(getUrgencyLevel(0)).toBe("critical");
			expect(getUrgencyLevel(1)).toBe("critical");
			expect(getUrgencyLevel(2)).toBe("critical");
			expect(getUrgencyLevel(2.9)).toBe("critical");
		});

		test("returns urgent for 3-6 days", () => {
			expect(getUrgencyLevel(3)).toBe("urgent");
			expect(getUrgencyLevel(4)).toBe("urgent");
			expect(getUrgencyLevel(6)).toBe("urgent");
			expect(getUrgencyLevel(6.9)).toBe("urgent");
		});

		test("returns focused for 7-14 days", () => {
			expect(getUrgencyLevel(7)).toBe("focused");
			expect(getUrgencyLevel(10)).toBe("focused");
			expect(getUrgencyLevel(14)).toBe("focused");
		});

		test("returns comfortable for > 14 days", () => {
			expect(getUrgencyLevel(15)).toBe("comfortable");
			expect(getUrgencyLevel(30)).toBe("comfortable");
			expect(getUrgencyLevel(100)).toBe("comfortable");
		});
	});

	describe("saveRunwayState and loadRunwayState", () => {
		test("saves and loads runway state correctly", () => {
			const state = {
				runwayDays: 15,
				lastUpdated: "2025-01-15T10:00:00.000Z",
			};
			saveRunwayState(state);
			const loaded = loadRunwayState();
			expect(loaded).toEqual(state);
		});

		test("returns null when no state exists", () => {
			const loaded = loadRunwayState();
			expect(loaded).toBeNull();
		});
	});

	describe("getRunwayDays", () => {
		test("returns initial runway days when no state exists", () => {
			setValidEnv();
			const days = getRunwayDays();
			expect(days).toBe(11);
		});

		test("returns saved runway days when state exists", () => {
			setValidEnv();
			saveRunwayState({ runwayDays: 20, lastUpdated: new Date().toISOString() });
			const days = getRunwayDays();
			expect(days).toBe(20);
		});
	});

	describe("updateRunwayDays", () => {
		test("updates runway days and persists to disk", () => {
			setValidEnv();
			updateRunwayDays(25);
			const state = loadRunwayState();
			expect(state).not.toBeNull();
			expect(state?.runwayDays).toBe(25);
			expect(state?.lastUpdated).toBeDefined();
		});
	});

	describe("getRunwayStatus", () => {
		test("returns complete runway status", () => {
			setValidEnv();
			const status = getRunwayStatus();
			expect(status).toHaveProperty("currentDay");
			expect(status).toHaveProperty("daysRemaining");
			expect(status).toHaveProperty("runwayDays");
			expect(status).toHaveProperty("urgencyLevel");
			expect(status.currentDay).toBe(1);
			expect(status.daysRemaining).toBe(100);
			expect(status.runwayDays).toBe(11);
			expect(status.urgencyLevel).toBe("focused");
		});

		test("reflects updated runway state", () => {
			setValidEnv();
			updateRunwayDays(5);
			const status = getRunwayStatus();
			expect(status.runwayDays).toBe(5);
			expect(status.urgencyLevel).toBe("urgent");
		});

		test("shows critical urgency for low runway", () => {
			setValidEnv();
			updateRunwayDays(2);
			const status = getRunwayStatus();
			expect(status.runwayDays).toBe(2);
			expect(status.urgencyLevel).toBe("critical");
		});

		test("shows comfortable urgency for high runway", () => {
			setValidEnv();
			updateRunwayDays(30);
			const status = getRunwayStatus();
			expect(status.runwayDays).toBe(30);
			expect(status.urgencyLevel).toBe("comfortable");
		});
	});
});
