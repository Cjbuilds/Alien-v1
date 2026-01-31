import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { resetConfig } from "../../utils/config.ts";
import { triggerDeploy } from "../deploy-trigger.ts";

describe("deploy-trigger", () => {
	let consoleLogSpy: ReturnType<typeof spyOn>;
	let consoleWarnSpy: ReturnType<typeof spyOn>;
	let consoleErrorSpy: ReturnType<typeof spyOn>;
	let originalFetch: typeof global.fetch;
	const originalEnv = { ...process.env };

	const mockDeployHook = "https://api.vercel.com/v1/integrations/deploy/test-hook";

	beforeEach(() => {
		// Suppress log output during tests
		consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
		consoleWarnSpy = spyOn(console, "warn").mockImplementation(() => {});
		consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});

		// Store original fetch
		originalFetch = global.fetch;

		// Reset config cache and set test env vars
		resetConfig();
		process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
		process.env.SUPERMEMORY_API_KEY = "test-supermemory-key";
		process.env.WEBSITE_DEPLOY_HOOK = mockDeployHook;
		process.env.START_DATE = "2025-01-01";
		process.env.LOG_LEVEL = "debug";
	});

	afterEach(() => {
		consoleLogSpy.mockRestore();
		consoleWarnSpy.mockRestore();
		consoleErrorSpy.mockRestore();
		global.fetch = originalFetch;
		process.env = { ...originalEnv };
		resetConfig();
	});

	describe("triggerDeploy", () => {
		test("returns true on successful deploy", async () => {
			global.fetch = mock(() =>
				Promise.resolve(
					new Response(JSON.stringify({ job: { id: "test-job-123" } }), {
						status: 200,
						headers: { "Content-Type": "application/json" },
					}),
				),
			);

			const result = await triggerDeploy();

			expect(result).toBe(true);
			expect(global.fetch).toHaveBeenCalledTimes(1);
		});

		test("POSTs to the correct deploy hook URL", async () => {
			let capturedUrl = "";
			let capturedOptions: RequestInit | undefined;

			global.fetch = mock((url: string | URL | Request, options?: RequestInit) => {
				capturedUrl = url.toString();
				capturedOptions = options;
				return Promise.resolve(
					new Response(JSON.stringify({ job: { id: "test-job" } }), {
						status: 200,
						headers: { "Content-Type": "application/json" },
					}),
				);
			});

			await triggerDeploy();

			expect(capturedUrl).toBe(mockDeployHook);
			expect(capturedOptions?.method).toBe("POST");
		});

		test("retries on failure and succeeds on second attempt", async () => {
			let callCount = 0;

			global.fetch = mock(() => {
				callCount++;
				if (callCount === 1) {
					return Promise.resolve(new Response("", { status: 500 }));
				}
				return Promise.resolve(
					new Response(JSON.stringify({ job: { id: "test-job" } }), {
						status: 200,
						headers: { "Content-Type": "application/json" },
					}),
				);
			});

			const result = await triggerDeploy();

			expect(result).toBe(true);
			expect(callCount).toBe(2);
		});

		test("retries 3 times on network error then returns false", async () => {
			let callCount = 0;

			global.fetch = mock(() => {
				callCount++;
				return Promise.reject(new Error("Network error"));
			});

			const result = await triggerDeploy();

			expect(result).toBe(false);
			expect(callCount).toBe(3);
		});

		test("returns false after 3 failed HTTP responses", async () => {
			global.fetch = mock(() => Promise.resolve(new Response("", { status: 500 })));

			const result = await triggerDeploy();

			expect(result).toBe(false);
			expect(global.fetch).toHaveBeenCalledTimes(3);
		});

		test("does not throw on failure", async () => {
			global.fetch = mock(() => Promise.reject(new Error("Connection refused")));

			const result = await triggerDeploy();

			expect(result).toBe(false);
		});

		test("logs success with job ID", async () => {
			global.fetch = mock(() =>
				Promise.resolve(
					new Response(JSON.stringify({ job: { id: "deploy-abc123" } }), {
						status: 200,
						headers: { "Content-Type": "application/json" },
					}),
				),
			);

			await triggerDeploy();

			const logCalls = consoleLogSpy.mock.calls.map((c) => c[0] as string);
			const successLog = logCalls.find((l) => l.includes("Deploy triggered successfully"));
			expect(successLog).toBeDefined();
			expect(successLog).toContain("deploy-abc123");
		});

		test("logs error after all retries fail", async () => {
			global.fetch = mock(() => Promise.resolve(new Response("", { status: 500 })));

			await triggerDeploy();

			const errorCalls = consoleErrorSpy.mock.calls.map((c) => c[0] as string);
			const errorLog = errorCalls.find((l) => l.includes("Deploy failed after all retries"));
			expect(errorLog).toBeDefined();
		});
	});
});
