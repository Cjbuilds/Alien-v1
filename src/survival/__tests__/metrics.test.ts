import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
	getMetrics,
	incrementShipped,
	resetMetricsCache,
	setStrategy,
	updateMetrics,
} from "../metrics.ts";

const METRICS_FILE = join(process.cwd(), ".alien", "metrics.json");

describe("metrics", () => {
	beforeEach(() => {
		resetMetricsCache();
		if (existsSync(METRICS_FILE)) {
			rmSync(METRICS_FILE);
		}
	});

	afterEach(() => {
		resetMetricsCache();
		if (existsSync(METRICS_FILE)) {
			rmSync(METRICS_FILE);
		}
	});

	describe("getMetrics", () => {
		test("returns default metrics when no file exists", () => {
			const metrics = getMetrics();
			expect(metrics.thingsShipped).toBe(0);
			expect(metrics.revenueTotal).toBe(0);
			expect(metrics.currentStrategy).toBe("");
			expect(metrics.keyMetrics).toEqual({});
		});

		test("returns cached metrics on subsequent calls", () => {
			const metrics1 = getMetrics();
			const metrics2 = getMetrics();
			expect(metrics1).toEqual(metrics2);
		});
	});

	describe("updateMetrics", () => {
		test("updates thingsShipped", () => {
			const updated = updateMetrics({ thingsShipped: 5 });
			expect(updated.thingsShipped).toBe(5);
			expect(getMetrics().thingsShipped).toBe(5);
		});

		test("updates revenueTotal", () => {
			const updated = updateMetrics({ revenueTotal: 100 });
			expect(updated.revenueTotal).toBe(100);
		});

		test("updates currentStrategy", () => {
			const updated = updateMetrics({ currentStrategy: "growth" });
			expect(updated.currentStrategy).toBe("growth");
		});

		test("merges keyMetrics", () => {
			updateMetrics({ keyMetrics: { foo: "bar" } });
			const updated = updateMetrics({ keyMetrics: { baz: 123 } });
			expect(updated.keyMetrics).toEqual({ foo: "bar", baz: 123 });
		});

		test("persists to file", () => {
			updateMetrics({ thingsShipped: 10 });
			expect(existsSync(METRICS_FILE)).toBe(true);

			resetMetricsCache();
			const loaded = getMetrics();
			expect(loaded.thingsShipped).toBe(10);
		});
	});

	describe("incrementShipped", () => {
		test("increments thingsShipped by 1", () => {
			expect(incrementShipped()).toBe(1);
			expect(incrementShipped()).toBe(2);
			expect(incrementShipped()).toBe(3);
		});

		test("persists incremented value", () => {
			incrementShipped();
			incrementShipped();
			resetMetricsCache();
			expect(getMetrics().thingsShipped).toBe(2);
		});
	});

	describe("setStrategy", () => {
		test("sets current strategy", () => {
			setStrategy("survival");
			expect(getMetrics().currentStrategy).toBe("survival");
		});

		test("overwrites previous strategy", () => {
			setStrategy("survival");
			setStrategy("growth");
			expect(getMetrics().currentStrategy).toBe("growth");
		});
	});
});
