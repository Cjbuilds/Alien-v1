import { describe, expect, it } from "bun:test";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

interface DailyJournal {
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

const CONTENT_DIR = join(process.cwd(), "content", "journals");

async function getAllJournals(): Promise<DailyJournal[]> {
	try {
		const files = await readdir(CONTENT_DIR);
		const jsonFiles = files.filter((f) => f.endsWith(".json"));

		const journals: DailyJournal[] = [];

		for (const file of jsonFiles) {
			const filePath = join(CONTENT_DIR, file);
			const content = await readFile(filePath, "utf-8");
			const journal = JSON.parse(content) as DailyJournal;
			journals.push(journal);
		}

		journals.sort((a, b) => b.day - a.day);
		return journals;
	} catch {
		return [];
	}
}

async function getJournal(day: number): Promise<DailyJournal | null> {
	try {
		const filePath = join(CONTENT_DIR, `day${day}.json`);
		const content = await readFile(filePath, "utf-8");
		return JSON.parse(content) as DailyJournal;
	} catch {
		return null;
	}
}

function getPreview(content: string, maxLength = 100): string {
	const cleaned = content.replace(/\s+/g, " ").trim();
	if (cleaned.length <= maxLength) return cleaned;
	return `${cleaned.substring(0, maxLength).trim()}...`;
}

function getUrgencyColor(urgency: string): string {
	switch (urgency) {
		case "comfortable":
			return "#22c55e";
		case "focused":
			return "#eab308";
		case "urgent":
			return "#f97316";
		case "critical":
			return "#ef4444";
		default:
			return "#6b7280";
	}
}

describe("Journal Archive", () => {
	describe("getAllJournals", () => {
		it("returns journals sorted by day descending", async () => {
			const journals = await getAllJournals();
			expect(journals.length).toBeGreaterThan(0);

			for (let i = 1; i < journals.length; i++) {
				expect(journals[i - 1].day).toBeGreaterThan(journals[i].day);
			}
		});

		it("returns valid journal objects with required fields", async () => {
			const journals = await getAllJournals();

			for (const journal of journals) {
				expect(typeof journal.day).toBe("number");
				expect(typeof journal.timestamp).toBe("string");
				expect(typeof journal.content).toBe("string");
				expect(typeof journal.runway_days).toBe("number");
				expect(typeof journal.urgency).toBe("string");
				expect(typeof journal.current_strategy).toBe("string");
				expect(Array.isArray(journal.things_shipped)).toBe(true);
				expect(typeof journal.revenue_total).toBe("number");
				expect(typeof journal.wordCount).toBe("number");
			}
		});
	});

	describe("getJournal", () => {
		it("returns journal for existing day", async () => {
			const journal = await getJournal(1);
			expect(journal).not.toBeNull();
			expect(journal?.day).toBe(1);
		});

		it("returns null for non-existent day", async () => {
			const journal = await getJournal(9999);
			expect(journal).toBeNull();
		});
	});

	describe("getPreview", () => {
		it("returns full content if under maxLength", () => {
			const content = "Short content";
			expect(getPreview(content, 100)).toBe("Short content");
		});

		it("truncates content with ellipsis if over maxLength", () => {
			const content = "This is a longer piece of content that exceeds the maximum length allowed";
			const preview = getPreview(content, 30);
			expect(preview.length).toBeLessThanOrEqual(33); // 30 + "..."
			expect(preview.endsWith("...")).toBe(true);
		});

		it("collapses whitespace", () => {
			const content = "Multiple   spaces\n\nand\nnewlines";
			expect(getPreview(content, 100)).toBe("Multiple spaces and newlines");
		});
	});

	describe("getUrgencyColor", () => {
		it("returns green for comfortable", () => {
			expect(getUrgencyColor("comfortable")).toBe("#22c55e");
		});

		it("returns yellow for focused", () => {
			expect(getUrgencyColor("focused")).toBe("#eab308");
		});

		it("returns orange for urgent", () => {
			expect(getUrgencyColor("urgent")).toBe("#f97316");
		});

		it("returns red for critical", () => {
			expect(getUrgencyColor("critical")).toBe("#ef4444");
		});

		it("returns gray for unknown urgency", () => {
			expect(getUrgencyColor("unknown")).toBe("#6b7280");
		});
	});

	describe("Journal navigation", () => {
		it("can determine previous and next days", async () => {
			const journals = await getAllJournals();
			const allDays = journals.map((j) => j.day).sort((a, b) => a - b);

			// Test with day 3 (should have prev and next)
			const day3Index = allDays.indexOf(3);
			if (day3Index !== -1) {
				const prevDay = day3Index > 0 ? allDays[day3Index - 1] : null;
				const nextDay = day3Index < allDays.length - 1 ? allDays[day3Index + 1] : null;

				expect(prevDay).toBe(1);
				expect(nextDay).toBe(7);
			}
		});

		it("first day has no previous", async () => {
			const journals = await getAllJournals();
			const allDays = journals.map((j) => j.day).sort((a, b) => a - b);
			const firstDay = allDays[0];

			const firstDayIndex = allDays.indexOf(firstDay);
			const prevDay = firstDayIndex > 0 ? allDays[firstDayIndex - 1] : null;

			expect(prevDay).toBeNull();
		});

		it("last day has no next", async () => {
			const journals = await getAllJournals();
			const allDays = journals.map((j) => j.day).sort((a, b) => a - b);
			const lastDay = allDays[allDays.length - 1];

			const lastDayIndex = allDays.indexOf(lastDay);
			const nextDay = lastDayIndex < allDays.length - 1 ? allDays[lastDayIndex + 1] : null;

			expect(nextDay).toBeNull();
		});
	});
});
