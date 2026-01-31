import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getCurrentDayNumber, getDaysRemaining, getInitialRunwayDays } from "../utils/time.ts";

/**
 * Urgency levels based on runway days remaining
 */
export type UrgencyLevel = "comfortable" | "focused" | "urgent" | "critical";

/**
 * Runway state persisted to disk
 */
export interface RunwayState {
	runwayDays: number;
	lastUpdated: string;
}

/**
 * Complete runway status metrics
 */
export interface RunwayStatus {
	currentDay: number;
	daysRemaining: number;
	runwayDays: number;
	urgencyLevel: UrgencyLevel;
}

const RUNWAY_STATE_PATH = join(process.cwd(), ".alien", "runway.json");

/**
 * Determine urgency level based on runway days
 */
export function getUrgencyLevel(runwayDays: number): UrgencyLevel {
	if (runwayDays < 3) return "critical";
	if (runwayDays < 7) return "urgent";
	if (runwayDays <= 14) return "focused";
	return "comfortable";
}

/**
 * Load runway state from disk
 */
export function loadRunwayState(): RunwayState | null {
	if (!existsSync(RUNWAY_STATE_PATH)) {
		return null;
	}
	try {
		const data = readFileSync(RUNWAY_STATE_PATH, "utf-8");
		return JSON.parse(data) as RunwayState;
	} catch {
		return null;
	}
}

/**
 * Save runway state to disk
 */
export function saveRunwayState(state: RunwayState): void {
	const dir = dirname(RUNWAY_STATE_PATH);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
	writeFileSync(RUNWAY_STATE_PATH, JSON.stringify(state, null, "\t"));
}

/**
 * Get current runway days, initializing from config if no state exists
 */
export function getRunwayDays(): number {
	const state = loadRunwayState();
	if (state) {
		return state.runwayDays;
	}
	return getInitialRunwayDays();
}

/**
 * Update runway days (e.g., when earning or spending compute)
 */
export function updateRunwayDays(newRunwayDays: number): void {
	const state: RunwayState = {
		runwayDays: newRunwayDays,
		lastUpdated: new Date().toISOString(),
	};
	saveRunwayState(state);
}

/**
 * Get complete runway status with all metrics
 */
export function getRunwayStatus(): RunwayStatus {
	const currentDay = getCurrentDayNumber();
	const daysRemaining = getDaysRemaining();
	const runwayDays = getRunwayDays();
	const urgencyLevel = getUrgencyLevel(runwayDays);

	return {
		currentDay,
		daysRemaining,
		runwayDays,
		urgencyLevel,
	};
}

/**
 * Runway tracker exports
 */
export const runwayTracker = {
	getRunwayStatus,
	getRunwayDays,
	updateRunwayDays,
	getUrgencyLevel,
	loadRunwayState,
	saveRunwayState,
};
