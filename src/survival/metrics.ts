import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import Supermemory from "supermemory";

const METRICS_FILE = join(process.cwd(), ".alien", "metrics.json");
const SUPERMEMORY_METRICS_ID = "alien-metrics";

export interface KeyMetrics {
	[key: string]: string | number | boolean;
}

export interface Metrics {
	thingsShipped: number;
	revenueTotal: number;
	currentStrategy: string;
	keyMetrics: KeyMetrics;
}

const DEFAULT_METRICS: Metrics = {
	thingsShipped: 0,
	revenueTotal: 0,
	currentStrategy: "",
	keyMetrics: {},
};

let cachedMetrics: Metrics | null = null;
let supermemoryClient: Supermemory | null = null;

function getSupermemoryClient(): Supermemory | null {
	if (!supermemoryClient && process.env.SUPERMEMORY_API_KEY) {
		supermemoryClient = new Supermemory({
			apiKey: process.env.SUPERMEMORY_API_KEY,
		});
	}
	return supermemoryClient;
}

function ensureDirectory(): void {
	const dir = dirname(METRICS_FILE);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
}

function loadFromFile(): Metrics {
	try {
		if (existsSync(METRICS_FILE)) {
			const data = readFileSync(METRICS_FILE, "utf-8");
			return JSON.parse(data) as Metrics;
		}
	} catch {
		// If file is corrupted, return defaults
	}
	return { ...DEFAULT_METRICS };
}

function saveToFile(metrics: Metrics): void {
	ensureDirectory();
	writeFileSync(METRICS_FILE, JSON.stringify(metrics, null, 2));
}

async function backupToSupermemory(metrics: Metrics): Promise<void> {
	const client = getSupermemoryClient();
	if (!client) return;

	try {
		await client.memory.create({
			id: SUPERMEMORY_METRICS_ID,
			content: JSON.stringify(metrics),
			metadata: {
				type: "metrics",
				updatedAt: new Date().toISOString(),
			},
		});
	} catch {
		// Silently fail - local persistence is primary
	}
}

export function getMetrics(): Metrics {
	if (!cachedMetrics) {
		cachedMetrics = loadFromFile();
	}
	return { ...cachedMetrics };
}

export function updateMetrics(partial: Partial<Metrics>): Metrics {
	const current = getMetrics();
	const updated: Metrics = {
		...current,
		...partial,
		keyMetrics: {
			...current.keyMetrics,
			...(partial.keyMetrics || {}),
		},
	};
	cachedMetrics = updated;
	saveToFile(updated);
	backupToSupermemory(updated);
	return { ...updated };
}

export function incrementShipped(): number {
	const updated = updateMetrics({
		thingsShipped: getMetrics().thingsShipped + 1,
	});
	return updated.thingsShipped;
}

export function setStrategy(name: string): void {
	updateMetrics({ currentStrategy: name });
}

export function resetMetricsCache(): void {
	cachedMetrics = null;
	supermemoryClient = null;
}
