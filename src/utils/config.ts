import { z } from "zod";

/**
 * Environment variable schema with validation
 */
const envSchema = z.object({
	/** Anthropic API key for Claude */
	ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"),

	/** Supermemory API key for memory storage */
	SUPERMEMORY_API_KEY: z.string().min(1, "SUPERMEMORY_API_KEY is required"),

	/** Vercel deploy hook URL */
	WEBSITE_DEPLOY_HOOK: z.string().url("WEBSITE_DEPLOY_HOOK must be a valid URL"),

	/** Node environment */
	NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

	/** Log level for structured logging */
	LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

	/** Timezone for date calculations */
	TIMEZONE: z.string().default("UTC"),

	/** Initial runway days (compute available at start) */
	INITIAL_RUNWAY_DAYS: z
		.string()
		.transform((v) => Number.parseInt(v, 10))
		.pipe(z.number().positive())
		.default("11"),

	/** Total days for the project */
	TOTAL_DAYS: z
		.string()
		.transform((v) => Number.parseInt(v, 10))
		.pipe(z.number().positive())
		.default("100"),

	/** Start date in ISO format (YYYY-MM-DD) */
	START_DATE: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "START_DATE must be in YYYY-MM-DD format"),
});

/**
 * Typed configuration object
 */
export type Config = z.infer<typeof envSchema>;

/**
 * Parse and validate environment variables
 * Throws if validation fails
 */
export function parseConfig(): Config {
	const result = envSchema.safeParse(process.env);
	if (!result.success) {
		const errors = result.error.issues
			.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
			.join("\n");
		throw new Error(`Environment validation failed:\n${errors}`);
	}
	return result.data;
}

/**
 * Validated and typed config object
 * Lazily evaluated on first access
 */
let _config: Config | null = null;

export function getConfig(): Config {
	if (!_config) {
		_config = parseConfig();
	}
	return _config;
}

/**
 * Reset config cache (useful for testing)
 */
export function resetConfig(): void {
	_config = null;
}

/**
 * Export config as the default
 */
export const config = {
	get: getConfig,
	parse: parseConfig,
	reset: resetConfig,
};
