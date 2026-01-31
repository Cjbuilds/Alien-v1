import { getConfig } from "./config.ts";

/**
 * Get the start date from config as a Date object
 */
export function getStartDate(): Date {
	const config = getConfig();
	const [year, month, day] = config.START_DATE.split("-").map(Number);
	return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

/**
 * Get the current date in the configured timezone
 */
export function getCurrentDate(): Date {
	return new Date();
}

/**
 * Get the current day number (1-based, starting from START_DATE)
 */
export function getCurrentDayNumber(): number {
	const start = getStartDate();
	const now = getCurrentDate();
	const diffMs = now.getTime() - start.getTime();
	const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
	return diffDays + 1; // 1-based day numbering
}

/**
 * Get the current hour (0-23) in the configured timezone
 */
export function getCurrentHour(): number {
	const config = getConfig();
	const now = new Date();
	const formatter = new Intl.DateTimeFormat("en-US", {
		timeZone: config.TIMEZONE,
		hour: "numeric",
		hour12: false,
	});
	return Number.parseInt(formatter.format(now), 10);
}

/**
 * Get the total days for the project
 */
export function getTotalDays(): number {
	const config = getConfig();
	return config.TOTAL_DAYS;
}

/**
 * Get the days remaining until the project ends
 */
export function getDaysRemaining(): number {
	const currentDay = getCurrentDayNumber();
	const totalDays = getTotalDays();
	return Math.max(0, totalDays - currentDay + 1);
}

/**
 * Get the initial runway days from config
 */
export function getInitialRunwayDays(): number {
	const config = getConfig();
	return config.INITIAL_RUNWAY_DAYS;
}

/**
 * Format a date in the configured timezone
 */
export function formatDate(date: Date, format: "date" | "datetime" | "time" = "datetime"): string {
	const config = getConfig();
	const options: Intl.DateTimeFormatOptions = {
		timeZone: config.TIMEZONE,
	};

	if (format === "date" || format === "datetime") {
		options.year = "numeric";
		options.month = "2-digit";
		options.day = "2-digit";
	}
	if (format === "time" || format === "datetime") {
		options.hour = "2-digit";
		options.minute = "2-digit";
		options.second = "2-digit";
		options.hour12 = false;
	}

	return new Intl.DateTimeFormat("en-US", options).format(date);
}

/**
 * Get hours since start
 */
export function getHoursSinceStart(): number {
	const start = getStartDate();
	const now = getCurrentDate();
	const diffMs = now.getTime() - start.getTime();
	return Math.floor(diffMs / (1000 * 60 * 60));
}

/**
 * Time status with all relevant metrics
 */
export interface TimeStatus {
	currentDayNumber: number;
	currentHour: number;
	totalDays: number;
	daysRemaining: number;
	hoursSinceStart: number;
	startDate: string;
	timezone: string;
}

/**
 * Get comprehensive time status
 */
export function getTimeStatus(): TimeStatus {
	const config = getConfig();
	return {
		currentDayNumber: getCurrentDayNumber(),
		currentHour: getCurrentHour(),
		totalDays: getTotalDays(),
		daysRemaining: getDaysRemaining(),
		hoursSinceStart: getHoursSinceStart(),
		startDate: config.START_DATE,
		timezone: config.TIMEZONE,
	};
}

/**
 * Time utilities export
 */
export const time = {
	getStartDate,
	getCurrentDate,
	getCurrentDayNumber,
	getCurrentHour,
	getTotalDays,
	getDaysRemaining,
	getInitialRunwayDays,
	getHoursSinceStart,
	formatDate,
	getTimeStatus,
};
