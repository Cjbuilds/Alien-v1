import cron from "node-cron";
import { createLogger } from "../utils/logger.ts";

const logger = createLogger({ module: "scheduler" });

/**
 * Scheduled task configuration
 */
interface ScheduledTask {
	name: string;
	schedule: string;
	handler: () => Promise<void> | void;
	job?: cron.ScheduledTask;
}

/**
 * Registry of all scheduled tasks
 */
const tasks: ScheduledTask[] = [];

/**
 * Wrap a task handler with logging
 */
function wrapWithLogging(name: string, handler: () => Promise<void> | void): () => Promise<void> {
	return async () => {
		const startTime = Date.now();
		logger.info(`Executing scheduled task: ${name}`);
		try {
			await handler();
			const duration = Date.now() - startTime;
			logger.info(`Completed scheduled task: ${name}`, { durationMs: duration });
		} catch (error) {
			const duration = Date.now() - startTime;
			logger.error(`Failed scheduled task: ${name}`, {
				durationMs: duration,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	};
}

/**
 * Activity decision task - runs at minute 55 of each hour
 * Decides what activities to perform in the coming hour
 */
async function activityDecisionTask(): Promise<void> {
	const { decideActivity } = await import("../tasks/activity-decision.ts");
	const { getRunwayStatus } = await import("../survival/runway-tracker.ts");

	const runwayStatus = getRunwayStatus();
	await decideActivity({
		goals: { daily: [], weekly: [] },
		recentActivities: [],
		runwayStatus,
		currentStrategy: "Building in public - shipping daily",
	});
}

/**
 * Hourly update task - runs at minute 50 of each hour
 * Generates hourly status updates
 */
async function hourlyUpdateTask(): Promise<void> {
	const { runHourlyUpdate } = await import("../tasks/hourly-update.ts");
	await runHourlyUpdate("");
}

/**
 * Daily journal task - runs at 23:00 UTC
 * Generates daily reflection and journal entry
 */
async function dailyJournalTask(): Promise<void> {
	const { runDailyJournal } = await import("../tasks/daily-journal.ts");
	await runDailyJournal();
}

/**
 * Runway check task - runs every 6 hours
 * Monitors compute runway and alerts on critical levels
 */
async function runwayCheckTask(): Promise<void> {
	const { getRunwayStatus } = await import("../survival/runway-tracker.ts");

	const status = getRunwayStatus();
	logger.info("Runway status check", {
		runwayDays: status.runwayDays,
		urgencyLevel: status.urgencyLevel,
		currentDay: status.currentDay,
		daysRemaining: status.daysRemaining,
	});

	if (status.urgencyLevel === "critical") {
		logger.warn("CRITICAL: Runway is critically low!", { runwayDays: status.runwayDays });
	} else if (status.urgencyLevel === "urgent") {
		logger.warn("WARNING: Runway is getting low", { runwayDays: status.runwayDays });
	}
}

/**
 * Goal review task - runs at 00:15 UTC
 * Sets daily goals for the new day
 */
async function goalReviewTask(): Promise<void> {
	const { setDailyGoals } = await import("../tasks/goal-setting.ts");
	await setDailyGoals();
}

/**
 * Weekly review task - runs Sunday at 12:00 UTC
 * Sets weekly objectives and reviews progress
 */
async function weeklyReviewTask(): Promise<void> {
	const { setWeeklyGoals } = await import("../tasks/goal-setting.ts");
	await setWeeklyGoals();
}

/**
 * Health check task - runs every 5 minutes
 * Monitors system health and connectivity
 */
async function healthCheckTask(): Promise<void> {
	const { getMetrics } = await import("../survival/metrics.ts");

	const metrics = getMetrics();
	logger.debug("Health check", {
		thingsShipped: metrics.thingsShipped,
		revenueTotal: metrics.revenueTotal,
		currentStrategy: metrics.currentStrategy,
	});
}

/**
 * Register a scheduled task
 */
function registerTask(name: string, schedule: string, handler: () => Promise<void> | void): void {
	if (!cron.validate(schedule)) {
		logger.error(`Invalid cron schedule for task: ${name}`, { schedule });
		return;
	}

	tasks.push({
		name,
		schedule,
		handler,
	});

	logger.debug(`Registered task: ${name}`, { schedule });
}

/**
 * Start all scheduled tasks
 */
export function startScheduler(): void {
	logger.info("Starting scheduler");

	// Register all tasks
	// Activity decision at minute 55 of each hour
	registerTask("activityDecision", "55 * * * *", activityDecisionTask);

	// Hourly update at minute 50 of each hour
	registerTask("hourlyUpdate", "50 * * * *", hourlyUpdateTask);

	// Daily journal at 23:00 UTC
	registerTask("dailyJournal", "0 23 * * *", dailyJournalTask);

	// Runway check every 6 hours (at minute 0)
	registerTask("runwayCheck", "0 */6 * * *", runwayCheckTask);

	// Goal review at 00:15 UTC
	registerTask("goalReview", "15 0 * * *", goalReviewTask);

	// Weekly review Sunday at 12:00 UTC
	registerTask("weeklyReview", "0 12 * * 0", weeklyReviewTask);

	// Health check every 5 minutes
	registerTask("healthCheck", "*/5 * * * *", healthCheckTask);

	// Start all cron jobs
	for (const task of tasks) {
		const wrappedHandler = wrapWithLogging(task.name, task.handler);
		task.job = cron.schedule(task.schedule, wrappedHandler, {
			timezone: "UTC",
		});
		logger.info(`Started cron job: ${task.name}`, { schedule: task.schedule });
	}

	logger.info("Scheduler started", { taskCount: tasks.length });
}

/**
 * Stop all scheduled tasks
 */
export function stopScheduler(): void {
	logger.info("Stopping scheduler");

	for (const task of tasks) {
		if (task.job) {
			task.job.stop();
			logger.debug(`Stopped cron job: ${task.name}`);
		}
	}

	tasks.length = 0;
	logger.info("Scheduler stopped");
}

/**
 * Get the status of all scheduled tasks
 */
export function getSchedulerStatus(): { name: string; schedule: string }[] {
	return tasks.map((task) => ({
		name: task.name,
		schedule: task.schedule,
	}));
}

/**
 * Exported scheduler module
 */
export const scheduler = {
	startScheduler,
	stopScheduler,
	getSchedulerStatus,
};
