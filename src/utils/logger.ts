import pc from "picocolors";

/**
 * Log levels in order of severity
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
};

/**
 * Get the current log level from LOG_LEVEL environment variable
 */
function getCurrentLogLevel(): LogLevel {
	const level = process.env.LOG_LEVEL?.toLowerCase();
	if (level && level in LOG_LEVELS) {
		return level as LogLevel;
	}
	return "info";
}

/**
 * Check if a log level should be displayed
 */
function shouldLog(level: LogLevel): boolean {
	const currentLevel = getCurrentLogLevel();
	return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

/**
 * Format a timestamp for log output
 */
function formatTimestamp(): string {
	return new Date().toISOString();
}

/**
 * Structured log entry
 */
interface LogEntry {
	timestamp: string;
	level: LogLevel;
	message: string;
	context?: Record<string, unknown>;
}

/**
 * Format a log entry for output
 */
function formatLogEntry(entry: LogEntry): string {
	const { timestamp, level, message, context } = entry;
	const levelColors: Record<LogLevel, (s: string) => string> = {
		debug: pc.dim,
		info: pc.blue,
		warn: pc.yellow,
		error: pc.red,
	};
	const colorFn = levelColors[level];
	const levelStr = colorFn(`[${level.toUpperCase()}]`);
	const timestampStr = pc.dim(timestamp);

	let output = `${timestampStr} ${levelStr} ${message}`;
	if (context && Object.keys(context).length > 0) {
		output += ` ${pc.dim(JSON.stringify(context))}`;
	}
	return output;
}

/**
 * Log a debug message
 */
export function debug(message: string, context?: Record<string, unknown>): void {
	if (!shouldLog("debug")) return;
	const entry: LogEntry = { timestamp: formatTimestamp(), level: "debug", message, context };
	console.log(formatLogEntry(entry));
}

/**
 * Log an info message
 */
export function info(message: string, context?: Record<string, unknown>): void {
	if (!shouldLog("info")) return;
	const entry: LogEntry = { timestamp: formatTimestamp(), level: "info", message, context };
	console.log(formatLogEntry(entry));
}

/**
 * Log a warning message
 */
export function warn(message: string, context?: Record<string, unknown>): void {
	if (!shouldLog("warn")) return;
	const entry: LogEntry = { timestamp: formatTimestamp(), level: "warn", message, context };
	console.warn(formatLogEntry(entry));
}

/**
 * Log an error message
 */
export function error(message: string, context?: Record<string, unknown>): void {
	if (!shouldLog("error")) return;
	const entry: LogEntry = { timestamp: formatTimestamp(), level: "error", message, context };
	console.error(formatLogEntry(entry));
}

/**
 * Create a child logger with preset context
 */
export function createLogger(baseContext: Record<string, unknown>) {
	return {
		debug: (message: string, context?: Record<string, unknown>) =>
			debug(message, { ...baseContext, ...context }),
		info: (message: string, context?: Record<string, unknown>) =>
			info(message, { ...baseContext, ...context }),
		warn: (message: string, context?: Record<string, unknown>) =>
			warn(message, { ...baseContext, ...context }),
		error: (message: string, context?: Record<string, unknown>) =>
			error(message, { ...baseContext, ...context }),
	};
}

/**
 * Logger instance for convenience
 */
export const logger = {
	debug,
	info,
	warn,
	error,
	createLogger,
};
