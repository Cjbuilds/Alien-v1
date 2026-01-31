import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import Anthropic from "@anthropic-ai/sdk";
import { resetConfig } from "../../utils/config.ts";
import {
	ClaudeClientError,
	type GenerateContentResponse,
	generateContent,
	resetClient,
} from "../claude-client.ts";

// Mock the Anthropic SDK
const mockCreate = mock(() => Promise.resolve({}));

mock.module("@anthropic-ai/sdk", () => ({
	default: class MockAnthropic {
		messages = {
			create: mockCreate,
		};
	},
	RateLimitError: class extends Error {
		constructor(message: string) {
			super(message);
			this.name = "RateLimitError";
		}
	},
}));

describe("claude-client", () => {
	const originalEnv = { ...process.env };

	const setValidEnv = () => {
		process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
		process.env.SUPERMEMORY_API_KEY = "test-supermemory-key";
		process.env.WEBSITE_DEPLOY_HOOK = "https://example.com/webhook";
		process.env.START_DATE = "2025-01-01";
		process.env.LOG_LEVEL = "error"; // Reduce log noise in tests
	};

	beforeEach(() => {
		resetConfig();
		resetClient();
		mockCreate.mockClear();
		setValidEnv();
	});

	afterEach(() => {
		process.env = { ...originalEnv };
		resetConfig();
		resetClient();
	});

	describe("generateContent", () => {
		test("returns structured response on success", async () => {
			mockCreate.mockResolvedValueOnce({
				content: [{ type: "text", text: "Hello, world!" }],
				usage: { input_tokens: 10, output_tokens: 5 },
			});

			const result = await generateContent("You are helpful.", "Say hello");

			expect(result.content).toBe("Hello, world!");
			expect(result.usage.inputTokens).toBe(10);
			expect(result.usage.outputTokens).toBe(5);
		});

		test("calls API with correct parameters", async () => {
			mockCreate.mockResolvedValueOnce({
				content: [{ type: "text", text: "Response" }],
				usage: { input_tokens: 10, output_tokens: 5 },
			});

			await generateContent("System prompt", "User prompt");

			expect(mockCreate).toHaveBeenCalledTimes(1);
			expect(mockCreate).toHaveBeenCalledWith({
				model: "claude-sonnet-4-5-20250929",
				max_tokens: 8192,
				system: "System prompt",
				messages: [{ role: "user", content: "User prompt" }],
			});
		});

		test("handles response with empty content", async () => {
			mockCreate.mockResolvedValueOnce({
				content: [],
				usage: { input_tokens: 10, output_tokens: 0 },
			});

			const result = await generateContent("System", "User");

			expect(result.content).toBe("");
			expect(result.usage.inputTokens).toBe(10);
			expect(result.usage.outputTokens).toBe(0);
		});

		test("retries on failure with exponential backoff", async () => {
			const startTime = Date.now();

			mockCreate
				.mockRejectedValueOnce(new Error("Network error"))
				.mockRejectedValueOnce(new Error("Network error"))
				.mockResolvedValueOnce({
					content: [{ type: "text", text: "Success!" }],
					usage: { input_tokens: 10, output_tokens: 5 },
				});

			const result = await generateContent("System", "User");

			const elapsed = Date.now() - startTime;

			expect(result.content).toBe("Success!");
			expect(mockCreate).toHaveBeenCalledTimes(3);
			// Should have waited at least 1s + 2s = 3s
			expect(elapsed).toBeGreaterThanOrEqual(2900);
		});

		test("throws ClaudeClientError after max retries", async () => {
			mockCreate.mockRejectedValue(new Error("Persistent error"));

			try {
				await generateContent("System", "User");
				expect(true).toBe(false); // Should not reach here
			} catch (error) {
				expect(error).toBeInstanceOf(ClaudeClientError);
				expect((error as ClaudeClientError).message).toContain("Failed after 3 attempts");
				expect((error as ClaudeClientError).message).toContain("Persistent error");
			}

			expect(mockCreate).toHaveBeenCalledTimes(3);
		});

		test("identifies rate limit errors", async () => {
			const rateLimitError = new Error("rate limit exceeded");
			mockCreate.mockRejectedValue(rateLimitError);

			try {
				await generateContent("System", "User");
				expect(true).toBe(false);
			} catch (error) {
				expect(error).toBeInstanceOf(ClaudeClientError);
				expect((error as ClaudeClientError).isRateLimitError).toBe(true);
			}
		});

		test("handles non-rate-limit errors correctly", async () => {
			mockCreate.mockRejectedValue(new Error("Some other error"));

			try {
				await generateContent("System", "User");
				expect(true).toBe(false);
			} catch (error) {
				expect(error).toBeInstanceOf(ClaudeClientError);
				expect((error as ClaudeClientError).isRateLimitError).toBe(false);
			}
		});
	});

	describe("ClaudeClientError", () => {
		test("stores cause and rate limit flag", () => {
			const cause = new Error("Original error");
			const error = new ClaudeClientError("Wrapped error", cause, true);

			expect(error.message).toBe("Wrapped error");
			expect(error.cause).toBe(cause);
			expect(error.isRateLimitError).toBe(true);
			expect(error.name).toBe("ClaudeClientError");
		});

		test("defaults isRateLimitError to false", () => {
			const error = new ClaudeClientError("Error message");

			expect(error.isRateLimitError).toBe(false);
			expect(error.cause).toBeUndefined();
		});
	});
});
