import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getSupermemoryClient } from "./memory/supermemory.ts";
import { startScheduler, stopScheduler } from "./scheduler/index.ts";
import { getMetrics, updateMetrics } from "./survival/metrics.ts";
import { getRunwayStatus, loadRunwayState, saveRunwayState } from "./survival/runway-tracker.ts";
import { parseConfig } from "./utils/config.ts";
import { createLogger, logger } from "./utils/logger.ts";
import { getTimeStatus } from "./utils/time.ts";

const log = createLogger({ module: "main" });
const HEALTH_FILE = join(process.cwd(), ".alien", "health.json");

interface HealthStatus {
	pid: number;
	startedAt: string;
	lastUpdate: string;
	shutdownAt?: string;
}

function writeHealthStatus(): void {
	const dir = dirname(HEALTH_FILE);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
	const status: HealthStatus = {
		pid: process.pid,
		startedAt: new Date().toISOString(),
		lastUpdate: new Date().toISOString(),
	};
	writeFileSync(HEALTH_FILE, JSON.stringify(status, null, "\t"));
}

function updateHealthTimestamp(): void {
	if (!existsSync(HEALTH_FILE)) {
		writeHealthStatus();
		return;
	}
	try {
		const data = JSON.parse(readFileSync(HEALTH_FILE, "utf-8")) as HealthStatus;
		data.lastUpdate = new Date().toISOString();
		writeFileSync(HEALTH_FILE, JSON.stringify(data, null, "\t"));
	} catch {
		writeHealthStatus();
	}
}

async function saveState(): Promise<void> {
	log.info("Saving state before shutdown");

	// Force a metrics save (it auto-saves, but ensure it's written)
	const metrics = getMetrics();
	updateMetrics(metrics);

	// Update health file to indicate clean shutdown
	if (existsSync(HEALTH_FILE)) {
		try {
			const data = JSON.parse(readFileSync(HEALTH_FILE, "utf-8")) as HealthStatus;
			data.shutdownAt = new Date().toISOString();
			writeFileSync(HEALTH_FILE, JSON.stringify(data, null, "\t"));
		} catch {
			// Ignore errors during shutdown
		}
	}

	log.info("State saved successfully");
}

function isDay1(): boolean {
	const runwayState = loadRunwayState();
	return runwayState === null;
}

async function initializeDay1(): Promise<void> {
	log.info("Day 1 detected - initializing fresh state");

	const timeStatus = getTimeStatus();

	// Initialize runway state with initial runway days from config
	saveRunwayState({
		runwayDays: 11,
		lastUpdated: new Date().toISOString(),
	});

	// Initialize metrics with default strategy
	updateMetrics({
		thingsShipped: 0,
		revenueTotal: 0,
		currentStrategy: "Building in public - shipping daily",
		keyMetrics: {},
	});

	log.info("Day 1 initialization complete", {
		currentDay: timeStatus.currentDayNumber,
		totalDays: timeStatus.totalDays,
	});
}

async function main(): Promise<void> {
	log.info("Starting ALIEN...");

	// Step 1: Validate config
	log.info("Validating configuration...");
	try {
		parseConfig();
		log.info("Configuration validated successfully");
	} catch (error) {
		logger.error("Configuration validation failed", {
			error: error instanceof Error ? error.message : String(error),
		});
		process.exit(1);
	}

	// Step 2: Initialize Supermemory client
	log.info("Initializing Supermemory client...");
	try {
		getSupermemoryClient();
		log.info("Supermemory client initialized");
	} catch (error) {
		logger.error("Failed to initialize Supermemory client", {
			error: error instanceof Error ? error.message : String(error),
		});
		process.exit(1);
	}

	// Step 3: Initialize runway tracker (check for Day 1)
	log.info("Initializing runway tracker...");
	if (isDay1()) {
		await initializeDay1();
	} else {
		const status = getRunwayStatus();
		log.info("Existing state loaded", {
			currentDay: status.currentDay,
			runwayDays: status.runwayDays,
			urgencyLevel: status.urgencyLevel,
		});
	}

	// Step 4: Write initial health status
	writeHealthStatus();

	// Step 5: Set up health update interval (every minute)
	const healthInterval = setInterval(updateHealthTimestamp, 60 * 1000);

	// Step 6: Start scheduler
	log.info("Starting scheduler...");
	startScheduler();

	// Log startup summary
	const timeStatus = getTimeStatus();
	const runwayStatus = getRunwayStatus();
	log.info("ALIEN started successfully", {
		pid: process.pid,
		currentDay: timeStatus.currentDayNumber,
		daysRemaining: timeStatus.daysRemaining,
		runwayDays: runwayStatus.runwayDays,
		urgencyLevel: runwayStatus.urgencyLevel,
		timezone: timeStatus.timezone,
	});

	// Set up graceful shutdown handlers
	const shutdown = async (signal: string): Promise<void> => {
		log.info(`Received ${signal}, initiating graceful shutdown...`);

		// Clear health interval
		clearInterval(healthInterval);

		// Stop scheduler
		stopScheduler();

		// Save state
		await saveState();

		log.info("Shutdown complete");
		process.exit(0);
	};

	process.on("SIGTERM", () => shutdown("SIGTERM"));
	process.on("SIGINT", () => shutdown("SIGINT"));

	// Keep the process running
	log.info("ALIEN is running. Press Ctrl+C to stop.");
}

// Run main
main().catch((error) => {
	logger.error("Fatal error during startup", {
		error: error instanceof Error ? error.message : String(error),
		stack: error instanceof Error ? error.stack : undefined,
	});
	process.exit(1);
});
