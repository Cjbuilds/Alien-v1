import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { getConfig, parseConfig, resetConfig } from "../config.ts";

describe("config", () => {
	const originalEnv = { ...process.env };

	beforeEach(() => {
		resetConfig();
	});

	afterEach(() => {
		process.env = { ...originalEnv };
		resetConfig();
	});

	const setValidEnv = () => {
		process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
		process.env.SUPERMEMORY_API_KEY = "test-supermemory-key";
		process.env.WEBSITE_DEPLOY_HOOK = "https://example.com/webhook";
		process.env.START_DATE = "2025-01-01";
		process.env.NODE_ENV = "development";
	};

	describe("parseConfig", () => {
		test("parses valid environment variables", () => {
			setValidEnv();
			const config = parseConfig();
			expect(config.ANTHROPIC_API_KEY).toBe("test-anthropic-key");
			expect(config.SUPERMEMORY_API_KEY).toBe("test-supermemory-key");
			expect(config.WEBSITE_DEPLOY_HOOK).toBe("https://example.com/webhook");
			expect(config.START_DATE).toBe("2025-01-01");
		});

		test("uses default values for optional fields", () => {
			setValidEnv();
			const config = parseConfig();
			expect(config.NODE_ENV).toBe("development");
			expect(config.LOG_LEVEL).toBe("info");
			expect(config.TIMEZONE).toBe("UTC");
			expect(config.INITIAL_RUNWAY_DAYS).toBe(11);
			expect(config.TOTAL_DAYS).toBe(100);
		});

		test("throws on missing ANTHROPIC_API_KEY", () => {
			process.env = {};
			expect(() => parseConfig()).toThrow("ANTHROPIC_API_KEY");
		});

		test("throws on missing SUPERMEMORY_API_KEY", () => {
			process.env = { ANTHROPIC_API_KEY: "key" };
			expect(() => parseConfig()).toThrow("SUPERMEMORY_API_KEY");
		});

		test("throws on invalid WEBSITE_DEPLOY_HOOK URL", () => {
			process.env = {
				ANTHROPIC_API_KEY: "key",
				SUPERMEMORY_API_KEY: "key",
				WEBSITE_DEPLOY_HOOK: "not-a-url",
				START_DATE: "2025-01-01",
			};
			expect(() => parseConfig()).toThrow("WEBSITE_DEPLOY_HOOK must be a valid URL");
		});

		test("throws on invalid START_DATE format", () => {
			process.env = {
				ANTHROPIC_API_KEY: "key",
				SUPERMEMORY_API_KEY: "key",
				WEBSITE_DEPLOY_HOOK: "https://example.com",
				START_DATE: "invalid-date",
			};
			expect(() => parseConfig()).toThrow("START_DATE must be in YYYY-MM-DD format");
		});

		test("validates NODE_ENV values", () => {
			setValidEnv();
			process.env.NODE_ENV = "production";
			let config = parseConfig();
			expect(config.NODE_ENV).toBe("production");

			resetConfig();
			process.env.NODE_ENV = "test";
			config = parseConfig();
			expect(config.NODE_ENV).toBe("test");
		});

		test("validates LOG_LEVEL values", () => {
			setValidEnv();
			process.env.LOG_LEVEL = "debug";
			let config = parseConfig();
			expect(config.LOG_LEVEL).toBe("debug");

			resetConfig();
			setValidEnv();
			process.env.LOG_LEVEL = "error";
			config = parseConfig();
			expect(config.LOG_LEVEL).toBe("error");
		});

		test("transforms numeric string values", () => {
			setValidEnv();
			process.env.INITIAL_RUNWAY_DAYS = "30";
			process.env.TOTAL_DAYS = "200";
			const config = parseConfig();
			expect(config.INITIAL_RUNWAY_DAYS).toBe(30);
			expect(config.TOTAL_DAYS).toBe(200);
		});
	});

	describe("getConfig", () => {
		test("caches config after first call", () => {
			setValidEnv();
			const config1 = getConfig();
			process.env.ANTHROPIC_API_KEY = "changed-key";
			const config2 = getConfig();
			expect(config1).toBe(config2);
			expect(config2.ANTHROPIC_API_KEY).toBe("test-anthropic-key");
		});

		test("returns fresh config after reset", () => {
			setValidEnv();
			const config1 = getConfig();
			resetConfig();
			process.env.ANTHROPIC_API_KEY = "changed-key";
			const config2 = getConfig();
			expect(config2.ANTHROPIC_API_KEY).toBe("changed-key");
		});
	});
});
