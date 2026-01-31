/**
 * ALIEN Day 1 Monitor Script
 *
 * Monitors ALIEN's first 24 hours:
 * - Verifies hourly updates are publishing on time
 * - Checks memory continuity between hours
 * - Verifies daily journal publishes at 23:00 UTC
 * - Confirms ALIEN is alive
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { logger } from "../src/utils/logger.ts";

const log = logger.createLogger({ module: "monitor" });

interface HourlyContent {
	type: string;
	day: number;
	hour: number;
	timestamp: string;
	content: string;
	wordCount: number;
}

interface LandingData {
	currentDay: number;
	daysRemaining: number;
	runwayDays: number;
	lastUpdated: string;
}

interface MonitorReport {
	timestamp: string;
	alienStatus: "alive" | "unknown" | "dead";
	day: number;
	hoursChecked: number;
	hourlyUpdatesFound: number;
	lastUpdate: string | null;
	memoryConsistent: boolean;
	issues: string[];
	recommendations: string[];
}

/**
 * Get the content directory path
 */
function getContentDir(): string {
	return path.resolve(import.meta.dirname ?? ".", "../website/content");
}

/**
 * Check if a file exists
 */
function fileExists(filePath: string): boolean {
	return fs.existsSync(filePath);
}

/**
 * Read JSON file safely
 */
function readJsonFile<T>(filePath: string): T | null {
	try {
		const content = fs.readFileSync(filePath, "utf-8");
		return JSON.parse(content) as T;
	} catch {
		return null;
	}
}

/**
 * Check first wake status
 */
function checkFirstWake(): { completed: boolean; timestamp: string | null } {
	const flagPath = path.resolve(import.meta.dirname ?? ".", "../.alien/first-wake-completed");
	if (fileExists(flagPath)) {
		const timestamp = fs.readFileSync(flagPath, "utf-8").trim();
		return { completed: true, timestamp };
	}
	return { completed: false, timestamp: null };
}

/**
 * Get all hourly updates for a day
 */
function getHourlyUpdates(day: number): HourlyContent[] {
	const contentDir = getContentDir();
	const hourlyDir = path.join(contentDir, "hourly");
	const updates: HourlyContent[] = [];

	if (!fs.existsSync(hourlyDir)) {
		return updates;
	}

	for (let hour = 0; hour <= 23; hour++) {
		const filePath = path.join(hourlyDir, `day${day}_hour${hour}.json`);
		const content = readJsonFile<HourlyContent>(filePath);
		if (content) {
			updates.push(content);
		}
	}

	return updates;
}

/**
 * Get landing page data
 */
function getLandingData(): LandingData | null {
	const contentDir = getContentDir();
	const landingPath = path.join(contentDir, "landing.json");
	return readJsonFile<LandingData>(landingPath);
}

/**
 * Check memory continuity between hourly updates
 */
function checkMemoryContinuity(updates: HourlyContent[]): {
	consistent: boolean;
	issues: string[];
} {
	const issues: string[] = [];

	if (updates.length === 0) {
		return { consistent: true, issues };
	}

	// Sort by hour
	const sorted = [...updates].sort((a, b) => a.hour - b.hour);

	// Check for gaps
	let prevHour = sorted[0].hour - 1;
	for (const update of sorted) {
		// Skip first wake (hour 0) to hour 1 gap check since updates start at :50
		if (update.hour > prevHour + 1 && prevHour >= 0) {
			issues.push(`Gap detected: no update between hour ${prevHour} and hour ${update.hour}`);
		}
		prevHour = update.hour;
	}

	// Check for word count variations (should be 100-400 words)
	for (const update of sorted) {
		if (update.hour === 0 && update.type === "first_wake") {
			// First wake has different word count expectations
			continue;
		}
		if (update.wordCount < 50) {
			issues.push(`Hour ${update.hour}: suspiciously short update (${update.wordCount} words)`);
		}
		if (update.wordCount > 1000) {
			issues.push(`Hour ${update.hour}: unusually long update (${update.wordCount} words)`);
		}
	}

	return {
		consistent: issues.length === 0,
		issues,
	};
}

/**
 * Check daily journal status
 */
function checkDailyJournal(day: number): { exists: boolean; wordCount: number | null } {
	const contentDir = getContentDir();
	const journalPath = path.join(contentDir, "journals", `day${day}.json`);

	if (!fileExists(journalPath)) {
		return { exists: false, wordCount: null };
	}

	const journal = readJsonFile<{ wordCount: number }>(journalPath);
	return {
		exists: true,
		wordCount: journal?.wordCount ?? null,
	};
}

/**
 * Get current hour in UTC
 */
function getCurrentUTCHour(): number {
	return new Date().getUTCHours();
}

/**
 * Run the monitor check
 */
function runMonitor(): MonitorReport {
	log.info("Running ALIEN monitor check...");

	const issues: string[] = [];
	const recommendations: string[] = [];

	// Check first wake
	const firstWake = checkFirstWake();
	if (!firstWake.completed) {
		issues.push("First wake has not been completed");
		recommendations.push("Run the ALIEN main process to trigger first wake");
	} else {
		log.info("First wake completed", { timestamp: firstWake.timestamp });
	}

	// Get landing data
	const landing = getLandingData();
	const currentDay = landing?.currentDay ?? 1;

	// Get hourly updates
	const updates = getHourlyUpdates(currentDay);
	log.info("Hourly updates found", { count: updates.length, day: currentDay });

	// Check memory continuity
	const continuity = checkMemoryContinuity(updates);
	if (!continuity.consistent) {
		issues.push(...continuity.issues);
	}

	// Get the current UTC hour and expected number of updates
	const currentHour = getCurrentUTCHour();
	// Hourly updates happen at :50, so we expect updates for hours that have passed :50
	const expectedMinUpdates = Math.max(0, currentHour); // At least previous hours

	if (updates.length < expectedMinUpdates && currentDay === 1) {
		// On Day 1, first wake creates hour 0, then scheduler creates subsequent hours
		if (updates.length === 0) {
			issues.push("No hourly updates found - ALIEN may not be running");
			recommendations.push("Check if ALIEN process is running");
		}
	}

	// Check daily journal (only after 23:00 UTC)
	const journal = checkDailyJournal(currentDay);
	if (currentHour >= 23 && !journal.exists) {
		issues.push("Daily journal not found after 23:00 UTC");
		recommendations.push("Check journal task execution");
	}

	// Determine ALIEN status
	let alienStatus: "alive" | "unknown" | "dead" = "unknown";
	if (firstWake.completed && updates.length > 0) {
		const lastUpdate = updates[updates.length - 1];
		const lastUpdateTime = new Date(lastUpdate.timestamp).getTime();
		const hourAgo = Date.now() - 60 * 60 * 1000;

		if (lastUpdateTime > hourAgo) {
			alienStatus = "alive";
		} else {
			alienStatus = "unknown";
			issues.push("Last update was more than an hour ago");
		}
	} else if (!firstWake.completed) {
		alienStatus = "dead";
	}

	// Build report
	const report: MonitorReport = {
		timestamp: new Date().toISOString(),
		alienStatus,
		day: currentDay,
		hoursChecked: 24,
		hourlyUpdatesFound: updates.length,
		lastUpdate: updates.length > 0 ? updates[updates.length - 1].timestamp : null,
		memoryConsistent: continuity.consistent,
		issues,
		recommendations,
	};

	return report;
}

/**
 * Display monitor report
 */
function displayReport(report: MonitorReport): void {
	console.log("\n" + "=".repeat(60));
	console.log("ALIEN MONITOR REPORT");
	console.log("=".repeat(60));
	console.log(`Timestamp: ${report.timestamp}`);
	console.log(`Day: ${report.day}`);
	console.log("");

	// Status with color
	const statusEmoji =
		report.alienStatus === "alive" ? "🟢" : report.alienStatus === "unknown" ? "🟡" : "🔴";
	console.log(`ALIEN Status: ${statusEmoji} ${report.alienStatus.toUpperCase()}`);
	console.log("");

	console.log("HOURLY UPDATES:");
	console.log(`  Found: ${report.hourlyUpdatesFound}`);
	console.log(`  Last Update: ${report.lastUpdate ?? "None"}`);
	console.log(`  Memory Consistent: ${report.memoryConsistent ? "Yes" : "No"}`);
	console.log("");

	if (report.issues.length > 0) {
		console.log("ISSUES:");
		for (const issue of report.issues) {
			console.log(`  ⚠️  ${issue}`);
		}
		console.log("");
	}

	if (report.recommendations.length > 0) {
		console.log("RECOMMENDATIONS:");
		for (const rec of report.recommendations) {
			console.log(`  💡 ${rec}`);
		}
		console.log("");
	}

	console.log("=".repeat(60));
}

// Run the monitor
const report = runMonitor();
displayReport(report);

// Exit with appropriate code
process.exit(report.alienStatus === "alive" ? 0 : 1);
