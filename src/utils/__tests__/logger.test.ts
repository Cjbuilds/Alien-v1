import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { createLogger, debug, error, info, warn } from "../logger.ts";

describe("logger", () => {
	let consoleLogSpy: ReturnType<typeof spyOn>;
	let consoleWarnSpy: ReturnType<typeof spyOn>;
	let consoleErrorSpy: ReturnType<typeof spyOn>;
	const originalEnv = process.env.LOG_LEVEL;

	beforeEach(() => {
		consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
		consoleWarnSpy = spyOn(console, "warn").mockImplementation(() => {});
		consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		consoleLogSpy.mockRestore();
		consoleWarnSpy.mockRestore();
		consoleErrorSpy.mockRestore();
		process.env.LOG_LEVEL = originalEnv;
	});

	describe("log levels", () => {
		test("debug logs when LOG_LEVEL is debug", () => {
			process.env.LOG_LEVEL = "debug";
			debug("test message");
			expect(consoleLogSpy).toHaveBeenCalled();
		});

		test("debug does not log when LOG_LEVEL is info", () => {
			process.env.LOG_LEVEL = "info";
			debug("test message");
			expect(consoleLogSpy).not.toHaveBeenCalled();
		});

		test("info logs when LOG_LEVEL is info", () => {
			process.env.LOG_LEVEL = "info";
			info("test message");
			expect(consoleLogSpy).toHaveBeenCalled();
		});

		test("info does not log when LOG_LEVEL is warn", () => {
			process.env.LOG_LEVEL = "warn";
			info("test message");
			expect(consoleLogSpy).not.toHaveBeenCalled();
		});

		test("warn logs when LOG_LEVEL is warn", () => {
			process.env.LOG_LEVEL = "warn";
			warn("test message");
			expect(consoleWarnSpy).toHaveBeenCalled();
		});

		test("error logs when LOG_LEVEL is error", () => {
			process.env.LOG_LEVEL = "error";
			error("test message");
			expect(consoleErrorSpy).toHaveBeenCalled();
		});

		test("defaults to info level when LOG_LEVEL is not set", () => {
			process.env.LOG_LEVEL = undefined;
			info("test message");
			expect(consoleLogSpy).toHaveBeenCalled();
		});
	});

	describe("structured logging", () => {
		test("logs with context", () => {
			process.env.LOG_LEVEL = "info";
			info("test message", { key: "value" });
			expect(consoleLogSpy).toHaveBeenCalled();
			const call = consoleLogSpy.mock.calls[0][0] as string;
			expect(call).toContain("test message");
			expect(call).toContain('"key":"value"');
		});
	});

	describe("createLogger", () => {
		test("creates a child logger with base context", () => {
			process.env.LOG_LEVEL = "info";
			const childLogger = createLogger({ module: "test" });
			childLogger.info("child message", { extra: "data" });
			expect(consoleLogSpy).toHaveBeenCalled();
			const call = consoleLogSpy.mock.calls[0][0] as string;
			expect(call).toContain("child message");
			expect(call).toContain('"module":"test"');
			expect(call).toContain('"extra":"data"');
		});
	});
});
