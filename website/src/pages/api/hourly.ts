import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { APIRoute } from "astro";

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

const CONTENT_DIR = join(process.cwd(), "content", "hourly");
const PAGE_SIZE = 10;

async function getAllHourlyUpdates(): Promise<HourlyUpdate[]> {
	try {
		const files = await readdir(CONTENT_DIR);
		const jsonFiles = files.filter((f) => f.endsWith(".json"));

		const updates: HourlyUpdate[] = [];

		for (const file of jsonFiles) {
			const filePath = join(CONTENT_DIR, file);
			const content = await readFile(filePath, "utf-8");
			const update = JSON.parse(content) as HourlyUpdate;
			updates.push(update);
		}

		// Sort by day desc, then hour desc (newest first)
		updates.sort((a, b) => {
			if (a.day !== b.day) return b.day - a.day;
			return b.hour - a.hour;
		});

		return updates;
	} catch {
		return [];
	}
}

export const GET: APIRoute = async ({ url }) => {
	const page = Number.parseInt(url.searchParams.get("page") || "0", 10);
	const updates = await getAllHourlyUpdates();

	const start = page * PAGE_SIZE;
	const end = start + PAGE_SIZE;
	const pageUpdates = updates.slice(start, end);
	const hasMore = end < updates.length;

	return new Response(
		JSON.stringify({
			updates: pageUpdates,
			page,
			hasMore,
			total: updates.length,
		}),
		{
			status: 200,
			headers: {
				"Content-Type": "application/json",
			},
		},
	);
};
