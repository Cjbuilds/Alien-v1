import Anthropic from "@anthropic-ai/sdk";
import { getConfig } from "../utils/config.ts";
import { createLogger } from "../utils/logger.ts";

const log = createLogger({ module: "claude-client" });

const MODEL = "claude-sonnet-4-5-20250929";
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

/**
 * Response from generateContent with content and usage stats
 */
export interface GenerateContentResponse {
	content: string;
	usage: {
		inputTokens: number;
		outputTokens: number;
	};
}

/**
 * Error thrown when all retry attempts are exhausted
 */
export class ClaudeClientError extends Error {
	constructor(
		message: string,
		public readonly cause?: Error,
		public readonly isRateLimitError: boolean = false,
	) {
		super(message);
		this.name = "ClaudeClientError";
	}
}

let client: Anthropic | null = null;

/**
 * Get or initialize the Anthropic client
 */
function getClient(): Anthropic {
	if (!client) {
		const config = getConfig();
		client = new Anthropic({
			apiKey: config.ANTHROPIC_API_KEY,
		});
		log.info("Anthropic client initialized");
	}
	return client;
}

/**
 * Reset the client (useful for testing)
 */
export function resetClient(): void {
	client = null;
}

/**
 * Check if an error is a rate limit error
 */
function isRateLimitError(error: unknown): boolean {
	if (error instanceof Error) {
		// Check for Anthropic RateLimitError by name or status
		if (error.name === "RateLimitError") {
			return true;
		}
		// Check for rate limit in message
		if (error.message.toLowerCase().includes("rate limit")) {
			return true;
		}
		// Check for 429 status code (common pattern in API errors)
		if ("status" in error && (error as { status: number }).status === 429) {
			return true;
		}
	}
	return false;
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generate content using Claude API with retry logic
 *
 * @param systemPrompt - System prompt to guide Claude's behavior
 * @param userPrompt - User message/prompt to respond to
 * @returns Structured response with content and usage stats
 * @throws ClaudeClientError if all retries are exhausted
 */
export async function generateContent(
	systemPrompt: string,
	userPrompt: string,
): Promise<GenerateContentResponse> {
	const anthropic = getClient();
	let lastError: Error | undefined;

	for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
		try {
			log.info("Making API call", {
				attempt,
				model: MODEL,
				systemPromptLength: systemPrompt.length,
				userPromptLength: userPrompt.length,
			});

			const response = await anthropic.messages.create({
				model: MODEL,
				max_tokens: 8192,
				system: systemPrompt,
				messages: [{ role: "user", content: userPrompt }],
			});

			const textContent = response.content.find((block) => block.type === "text");
			const content = textContent?.type === "text" ? textContent.text : "";

			const result: GenerateContentResponse = {
				content,
				usage: {
					inputTokens: response.usage.input_tokens,
					outputTokens: response.usage.output_tokens,
				},
			};

			log.info("API call successful", {
				attempt,
				inputTokens: result.usage.inputTokens,
				outputTokens: result.usage.outputTokens,
			});

			return result;
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));
			const isRateLimit = isRateLimitError(error);

			log.warn("API call failed", {
				attempt,
				error: lastError.message,
				isRateLimit,
			});

			if (attempt < MAX_RETRIES) {
				const delayMs = BASE_DELAY_MS * 2 ** (attempt - 1);
				log.info("Retrying after delay", { delayMs, nextAttempt: attempt + 1 });
				await sleep(delayMs);
			}
		}
	}

	const isRateLimit = isRateLimitError(lastError);
	throw new ClaudeClientError(
		`Failed after ${MAX_RETRIES} attempts: ${lastError?.message}`,
		lastError,
		isRateLimit,
	);
}
