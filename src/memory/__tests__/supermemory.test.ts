import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { resetConfig } from "../../utils/config.ts";
import { getSupermemoryClient, resetSupermemoryClient } from "../supermemory.ts";

describe("supermemory client", () => {
	const originalEnv = { ...process.env };

	beforeEach(() => {
		resetSupermemoryClient();
		resetConfig();
		process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
		process.env.SUPERMEMORY_API_KEY = "test-supermemory-key";
		process.env.WEBSITE_DEPLOY_HOOK = "https://example.com/webhook";
		process.env.START_DATE = "2025-01-01";
		process.env.LOG_LEVEL = "error";
	});

	afterEach(() => {
		process.env = { ...originalEnv };
		resetSupermemoryClient();
		resetConfig();
	});

	describe("getSupermemoryClient", () => {
		test("creates a client instance", () => {
			const client = getSupermemoryClient();
			expect(client).toBeDefined();
			expect(client.memory).toBeDefined();
			expect(client.search).toBeDefined();
		});

		test("returns the same instance on subsequent calls", () => {
			const client1 = getSupermemoryClient();
			const client2 = getSupermemoryClient();
			expect(client1).toBe(client2);
		});

		test("creates new instance after reset", () => {
			const client1 = getSupermemoryClient();
			resetSupermemoryClient();
			const client2 = getSupermemoryClient();
			expect(client1).not.toBe(client2);
		});
	});
});
