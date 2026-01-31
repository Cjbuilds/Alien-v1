/**
 * ALIEN - Autonomous AI Entity
 * Main entry point for the ALIEN system
 *
 * This starts the scheduler and triggers the first wake sequence if not already completed.
 */

import { startScheduler, stopScheduler } from "./scheduler/index.ts";
import { hasFirstWakeCompleted, runFirstWake } from "./tasks/first-wake.ts";
import { logger } from "./utils/logger.ts";
import { getTimeStatus } from "./utils/time.ts";

const log = logger.createLogger({ module: "main" });

/**
 * Initialize ALIEN
 */
async function initialize(): Promise<void> {
	log.info("ALIEN initializing...");

	// Log time status
	const timeStatus = getTimeStatus();
	log.info("Time status", {
		day: timeStatus.currentDayNumber,
		hour: timeStatus.currentHour,
		daysRemaining: timeStatus.daysRemaining,
		startDate: timeStatus.startDate,
	});

	// Check if first wake is needed
	if (!hasFirstWakeCompleted()) {
		log.info("First wake not completed, triggering awakening...");
		const result = await runFirstWake();
		if (result.success) {
			log.info("ALIEN has awakened for the first time");
		} else {
			log.error("First wake failed", { error: result.error });
			throw new Error(`First wake failed: ${result.error}`);
		}
	} else {
		log.info("First wake already completed, ALIEN is awake");
	}
}

/**
 * Start ALIEN
 */
async function start(): Promise<void> {
	log.info("=".repeat(50));
	log.info("ALIEN - Autonomous AI Entity");
	log.info("Starting up...");
	log.info("=".repeat(50));

	try {
		// Initialize (includes first wake if needed)
		await initialize();

		// Start the scheduler
		startScheduler();
		log.info("ALIEN is now running");

		// Log next scheduled events
		log.info("Scheduler active - ALIEN will:");
		log.info("  - Generate hourly updates at :50 past each hour");
		log.info("  - Make activity decisions at :55 past each hour");
		log.info("  - Write daily journal at 23:00 UTC");
		log.info("  - Check runway every 6 hours");
		log.info("  - Review goals at 00:15 UTC");
		log.info("  - Weekly review Sunday at 12:00 UTC");
	} catch (error) {
		log.error("Failed to start ALIEN", { error: (error as Error).message });
		process.exit(1);
	}
}

/**
 * Graceful shutdown handler
 */
function shutdown(signal: string): void {
	log.info(`Received ${signal}, shutting down...`);
	stopScheduler();
	log.info("ALIEN has stopped");
	process.exit(0);
}

// Handle shutdown signals
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// Handle uncaught errors
process.on("uncaughtException", (error) => {
	log.error("Uncaught exception", { error: error.message, stack: error.stack });
	shutdown("uncaughtException");
});

process.on("unhandledRejection", (reason) => {
	log.error("Unhandled rejection", { reason: String(reason) });
});

// Start ALIEN
start();
