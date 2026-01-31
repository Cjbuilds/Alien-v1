import Supermemory from "supermemory";
import { getConfig } from "../utils/config.ts";
import { logger } from "../utils/logger.ts";

let _client: Supermemory | null = null;

/**
 * Get or create the Supermemory client instance
 */
export function getSupermemoryClient(): Supermemory {
	if (!_client) {
		const config = getConfig();
		_client = new Supermemory({
			apiKey: config.SUPERMEMORY_API_KEY,
		});
		logger.debug("Supermemory client initialized");
	}
	return _client;
}

/**
 * Reset the client (useful for testing)
 */
export function resetSupermemoryClient(): void {
	_client = null;
}
