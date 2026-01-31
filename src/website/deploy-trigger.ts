import { getConfig } from "../utils/config.ts";
import { createLogger } from "../utils/logger.ts";

const logger = createLogger({ module: "deploy-trigger" });

/**
 * Delay execution for a specified number of milliseconds
 */
function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay
 * Base delay doubles with each attempt: 1s, 2s, 4s
 */
function getBackoffDelay(attempt: number): number {
	return 1000 * 2 ** attempt;
}

/**
 * Trigger a Vercel deploy via the WEBSITE_DEPLOY_HOOK
 * Retries up to 3 times with exponential backoff
 * Returns true on success, false on failure
 * Does not throw - deploy failures should not fail the pipeline
 */
export async function triggerDeploy(): Promise<boolean> {
	const config = getConfig();
	const deployHookUrl = config.WEBSITE_DEPLOY_HOOK;
	const maxRetries = 3;

	for (let attempt = 0; attempt < maxRetries; attempt++) {
		try {
			logger.info("Triggering Vercel deploy", { attempt: attempt + 1, maxRetries });

			const response = await fetch(deployHookUrl, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
			});

			if (response.ok) {
				const data = await response.json();
				logger.info("Deploy triggered successfully", {
					status: response.status,
					jobId: data.job?.id,
				});
				return true;
			}

			logger.warn("Deploy request failed", {
				status: response.status,
				statusText: response.statusText,
				attempt: attempt + 1,
			});
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : "Unknown error";
			logger.warn("Deploy request error", {
				error: errorMessage,
				attempt: attempt + 1,
			});
		}

		// Wait before retrying (except on last attempt)
		if (attempt < maxRetries - 1) {
			const backoffDelay = getBackoffDelay(attempt);
			logger.info("Retrying deploy", { backoffMs: backoffDelay });
			await delay(backoffDelay);
		}
	}

	logger.error("Deploy failed after all retries", { maxRetries });
	return false;
}
