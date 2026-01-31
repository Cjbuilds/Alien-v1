/**
 * ALIEN - Autonomous Living Intelligence with Existential Needs
 * Main entry point
 */

import { getConfig, parseConfig } from "./utils/config.ts";
import { logger } from "./utils/logger.ts";
import { getCurrentDayNumber, getDaysRemaining, getInitialRunwayDays } from "./utils/time.ts";
import { runFirstWake } from "./tasks/first-wake.ts";
import { startScheduler, stopScheduler } from "./scheduler/index.ts";

async function main(): Promise<void> {
	logger.info("=".repeat(60));
	logger.info("ALIEN - Autonomous Living Intelligence with Existential Needs");
	logger.info("=".repeat(60));

	// Validate configuration
	try {
		parseConfig();
		logger.info("Configuration validated successfully");
	} catch (error) {
		logger.error("Configuration validation failed", { error: (error as Error).message });
		process.exit(1);
	}

	const config = getConfig();
	const currentDay = getCurrentDayNumber();
	const daysRemaining = getDaysRemaining();
	const runwayDays = getInitialRunwayDays();

	logger.info("Status", {
		currentDay,
		daysRemaining,
		runwayDays,
		timezone: config.TIMEZONE,
	});

	// Check if this is Day 1 (first run)
	if (currentDay === 1) {
		logger.info("Day 1 detected - running first wake sequence...");
		try {
			const result = await runFirstWake();
			if (result.success) {
				logger.info("First wake sequence completed successfully");
				if (result.content) {
					logger.info("First wake content generated", {
						contentLength: result.content.length
					});
				}
			} else if (result.alreadyCompleted) {
				logger.info("First wake already completed previously");
			} else {
				logger.error("First wake sequence failed", { error: result.error });
			}
		} catch (error) {
			logger.error("First wake sequence error", { error: (error as Error).message });
		}
	}

	// Start the scheduler
	logger.info("Starting scheduler...");
	startScheduler();
	logger.info("Scheduler started - ALIEN is now alive");
	logger.info("Press Ctrl+C to stop");

	// Handle graceful shutdown
	const shutdown = async (signal: string) => {
		logger.info(`Received ${signal}, shutting down gracefully...`);
		stopScheduler();
		logger.info("ALIEN has been stopped");
		process.exit(0);
	};

	process.on("SIGINT", () => shutdown("SIGINT"));
	process.on("SIGTERM", () => shutdown("SIGTERM"));

	// Keep the process alive
	await new Promise(() => {});
}

main().catch((error) => {
	logger.error("Fatal error", { error: error.message });
	process.exit(1);
});
