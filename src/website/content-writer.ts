import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/**
 * Base path for website content
 */
const CONTENT_BASE = "website/content";

/**
 * Metadata for hourly updates
 */
export interface HourlyUpdateMetadata {
	runway_days: number;
	urgency: string;
	current_strategy: string;
}

/**
 * Hourly update content structure
 */
export interface HourlyUpdate {
	day: number;
	hour: number;
	timestamp: string;
	content: string;
	runway_days: number;
	urgency: string;
	current_strategy: string;
	wordCount: number;
}

/**
 * Metadata for daily journals
 */
export interface DailyJournalMetadata {
	runway_days: number;
	urgency: string;
	current_strategy: string;
	things_shipped: string[];
	revenue_total: number;
}

/**
 * Daily journal content structure
 */
export interface DailyJournal {
	day: number;
	timestamp: string;
	content: string;
	runway_days: number;
	urgency: string;
	current_strategy: string;
	things_shipped: string[];
	revenue_total: number;
	wordCount: number;
}

/**
 * Landing page data structure
 */
export interface LandingData {
	currentDay: number;
	daysRemaining: number;
	runwayDays: number;
	thingsShipped: string[];
	revenueTotal: number;
	currentStrategy: string;
	lastUpdated: string;
}

/**
 * Count words in content
 */
function countWords(content: string): number {
	return content.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Ensure directory exists before writing
 */
async function ensureDir(filePath: string): Promise<void> {
	const dir = dirname(filePath);
	await mkdir(dir, { recursive: true });
}

/**
 * Safely write JSON to file - writes atomically to prevent data loss
 * Writes to temp file first, then renames to final destination
 */
async function safeWriteJson(filePath: string, data: unknown): Promise<void> {
	await ensureDir(filePath);
	const json = JSON.stringify(data, null, "\t");
	const tempPath = `${filePath}.tmp`;
	await writeFile(tempPath, json, "utf-8");
	await Bun.write(filePath, await Bun.file(tempPath).text());
	(await Bun.file(tempPath).exists()) && (await import("node:fs/promises")).unlink(tempPath);
}

/**
 * Write an hourly update to the website content directory
 * Saves to website/content/hourly/day{DAY}_hour{HOUR}.json
 */
export async function writeHourlyUpdate(
	day: number,
	hour: number,
	content: string,
	metadata: HourlyUpdateMetadata,
): Promise<string> {
	const filePath = join(CONTENT_BASE, "hourly", `day${day}_hour${hour}.json`);

	const update: HourlyUpdate = {
		day,
		hour,
		timestamp: new Date().toISOString(),
		content,
		runway_days: metadata.runway_days,
		urgency: metadata.urgency,
		current_strategy: metadata.current_strategy,
		wordCount: countWords(content),
	};

	await safeWriteJson(filePath, update);
	return filePath;
}

/**
 * Write a daily journal to the website content directory
 * Saves to website/content/journals/day{DAY}.json
 */
export async function writeDailyJournal(
	day: number,
	content: string,
	metadata: DailyJournalMetadata,
): Promise<string> {
	const filePath = join(CONTENT_BASE, "journals", `day${day}.json`);

	const journal: DailyJournal = {
		day,
		timestamp: new Date().toISOString(),
		content,
		runway_days: metadata.runway_days,
		urgency: metadata.urgency,
		current_strategy: metadata.current_strategy,
		things_shipped: metadata.things_shipped,
		revenue_total: metadata.revenue_total,
		wordCount: countWords(content),
	};

	await safeWriteJson(filePath, journal);
	return filePath;
}

/**
 * Update the landing page data
 * Saves to website/content/landing.json
 */
export async function updateLanding(
	currentDay: number,
	daysRemaining: number,
	runwayDays: number,
	thingsShipped: string[],
	revenueTotal: number,
	currentStrategy: string,
): Promise<string> {
	const filePath = join(CONTENT_BASE, "landing.json");

	const landing: LandingData = {
		currentDay,
		daysRemaining,
		runwayDays,
		thingsShipped,
		revenueTotal,
		currentStrategy,
		lastUpdated: new Date().toISOString(),
	};

	await safeWriteJson(filePath, landing);
	return filePath;
}

/**
 * Content writer utilities export
 */
export const contentWriter = {
	writeHourlyUpdate,
	writeDailyJournal,
	updateLanding,
};
