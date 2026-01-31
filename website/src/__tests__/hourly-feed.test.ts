import { describe, expect, test } from "bun:test";

// Utility functions extracted for testing
function getHourNumber(day: number, hour: number): number {
	return (day - 1) * 24 + hour;
}

function getUrgencyColor(urgency: string): string {
	switch (urgency) {
		case "comfortable":
			return "#22c55e"; // green
		case "focused":
			return "#eab308"; // yellow
		case "urgent":
			return "#f97316"; // orange
		case "critical":
			return "#ef4444"; // red
		default:
			return "#6b7280"; // gray
	}
}

interface HourlyUpdate {
	day: number;
	hour: number;
	timestamp: string;
	content: string;
	runway_days: number;
	urgency: string;
	current_strategy: string;
	wordCount: number;
}

function sortUpdates(updates: HourlyUpdate[]): HourlyUpdate[] {
	return [...updates].sort((a, b) => {
		if (a.day !== b.day) return b.day - a.day;
		return b.hour - a.hour;
	});
}

describe("getHourNumber", () => {
	test("returns 0 for day 1 hour 0", () => {
		expect(getHourNumber(1, 0)).toBe(0);
	});

	test("returns 23 for day 1 hour 23", () => {
		expect(getHourNumber(1, 23)).toBe(23);
	});

	test("returns 24 for day 2 hour 0", () => {
		expect(getHourNumber(2, 0)).toBe(24);
	});

	test("returns correct value for day 7 hour 15", () => {
		// (7-1) * 24 + 15 = 6 * 24 + 15 = 144 + 15 = 159
		expect(getHourNumber(7, 15)).toBe(159);
	});

	test("returns correct value for day 15 hour 20", () => {
		// (15-1) * 24 + 20 = 14 * 24 + 20 = 336 + 20 = 356
		expect(getHourNumber(15, 20)).toBe(356);
	});
});

describe("getUrgencyColor", () => {
	test("returns green for comfortable", () => {
		expect(getUrgencyColor("comfortable")).toBe("#22c55e");
	});

	test("returns yellow for focused", () => {
		expect(getUrgencyColor("focused")).toBe("#eab308");
	});

	test("returns orange for urgent", () => {
		expect(getUrgencyColor("urgent")).toBe("#f97316");
	});

	test("returns red for critical", () => {
		expect(getUrgencyColor("critical")).toBe("#ef4444");
	});

	test("returns gray for unknown urgency", () => {
		expect(getUrgencyColor("unknown")).toBe("#6b7280");
	});

	test("returns gray for empty string", () => {
		expect(getUrgencyColor("")).toBe("#6b7280");
	});
});

describe("sortUpdates", () => {
	test("sorts updates by day descending, then hour descending", () => {
		const updates: HourlyUpdate[] = [
			{
				day: 1,
				hour: 0,
				timestamp: "2024-01-15T00:50:00.000Z",
				content: "First",
				runway_days: 11,
				urgency: "comfortable",
				current_strategy: "test",
				wordCount: 1,
			},
			{
				day: 2,
				hour: 5,
				timestamp: "2024-01-16T05:50:00.000Z",
				content: "Third",
				runway_days: 10,
				urgency: "comfortable",
				current_strategy: "test",
				wordCount: 1,
			},
			{
				day: 1,
				hour: 12,
				timestamp: "2024-01-15T12:50:00.000Z",
				content: "Second",
				runway_days: 11,
				urgency: "comfortable",
				current_strategy: "test",
				wordCount: 1,
			},
		];

		const sorted = sortUpdates(updates);

		expect(sorted[0].day).toBe(2);
		expect(sorted[0].hour).toBe(5);
		expect(sorted[1].day).toBe(1);
		expect(sorted[1].hour).toBe(12);
		expect(sorted[2].day).toBe(1);
		expect(sorted[2].hour).toBe(0);
	});

	test("handles single update", () => {
		const updates: HourlyUpdate[] = [
			{
				day: 1,
				hour: 0,
				timestamp: "2024-01-15T00:50:00.000Z",
				content: "Only",
				runway_days: 11,
				urgency: "comfortable",
				current_strategy: "test",
				wordCount: 1,
			},
		];

		const sorted = sortUpdates(updates);
		expect(sorted.length).toBe(1);
		expect(sorted[0].content).toBe("Only");
	});

	test("handles empty array", () => {
		const sorted = sortUpdates([]);
		expect(sorted.length).toBe(0);
	});

	test("does not mutate original array", () => {
		const updates: HourlyUpdate[] = [
			{
				day: 1,
				hour: 5,
				timestamp: "2024-01-15T05:50:00.000Z",
				content: "First",
				runway_days: 11,
				urgency: "comfortable",
				current_strategy: "test",
				wordCount: 1,
			},
			{
				day: 1,
				hour: 0,
				timestamp: "2024-01-15T00:50:00.000Z",
				content: "Second",
				runway_days: 11,
				urgency: "comfortable",
				current_strategy: "test",
				wordCount: 1,
			},
		];

		const originalFirst = updates[0].hour;
		sortUpdates(updates);
		expect(updates[0].hour).toBe(originalFirst);
	});
});

describe("HourlyUpdate interface", () => {
	test("valid update has all required fields", () => {
		const update: HourlyUpdate = {
			day: 1,
			hour: 0,
			timestamp: "2024-01-15T00:50:00.000Z",
			content: "Test content",
			runway_days: 11,
			urgency: "comfortable",
			current_strategy: "Building in public",
			wordCount: 2,
		};

		expect(update.day).toBe(1);
		expect(update.hour).toBe(0);
		expect(update.timestamp).toBe("2024-01-15T00:50:00.000Z");
		expect(update.content).toBe("Test content");
		expect(update.runway_days).toBe(11);
		expect(update.urgency).toBe("comfortable");
		expect(update.current_strategy).toBe("Building in public");
		expect(update.wordCount).toBe(2);
	});
});
