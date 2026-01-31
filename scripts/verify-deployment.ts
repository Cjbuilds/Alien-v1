/**
 * ALIEN Deployment Verification Script
 *
 * Verifies that the website is properly deployed and functioning:
 * - Checks website accessibility
 * - Verifies content endpoints
 * - Tests landing page structure
 */

import { logger } from "../src/utils/logger.ts";

const log = logger.createLogger({ module: "verify-deployment" });

interface VerificationResult {
	step: string;
	passed: boolean;
	message: string;
}

/**
 * Verify a URL is accessible
 */
async function checkUrl(url: string, description: string): Promise<VerificationResult> {
	try {
		const response = await fetch(url, {
			method: "GET",
			headers: { Accept: "text/html,application/json" },
		});

		if (response.ok) {
			return {
				step: description,
				passed: true,
				message: `Status ${response.status}`,
			};
		}

		return {
			step: description,
			passed: false,
			message: `Status ${response.status}: ${response.statusText}`,
		};
	} catch (error) {
		return {
			step: description,
			passed: false,
			message: `Error: ${(error as Error).message}`,
		};
	}
}

/**
 * Verify JSON endpoint
 */
async function checkJsonEndpoint(
	url: string,
	description: string,
	expectedFields: string[],
): Promise<VerificationResult> {
	try {
		const response = await fetch(url);

		if (!response.ok) {
			return {
				step: description,
				passed: false,
				message: `Status ${response.status}`,
			};
		}

		const data = await response.json();
		const missingFields = expectedFields.filter((field) => !(field in data));

		if (missingFields.length > 0) {
			return {
				step: description,
				passed: false,
				message: `Missing fields: ${missingFields.join(", ")}`,
			};
		}

		return {
			step: description,
			passed: true,
			message: "All fields present",
		};
	} catch (error) {
		return {
			step: description,
			passed: false,
			message: `Error: ${(error as Error).message}`,
		};
	}
}

/**
 * Run all verification checks
 */
async function runVerification(baseUrl: string): Promise<void> {
	log.info("Starting deployment verification", { baseUrl });
	console.log(`\n${"=".repeat(60)}`);
	console.log("ALIEN DEPLOYMENT VERIFICATION");
	console.log("=".repeat(60));
	console.log(`\nTarget: ${baseUrl}\n`);

	const results: VerificationResult[] = [];

	// Check homepage
	results.push(await checkUrl(baseUrl, "Homepage accessible"));

	// Check landing.json
	results.push(
		await checkJsonEndpoint(`${baseUrl}/content/landing.json`, "Landing data endpoint", [
			"currentDay",
			"daysRemaining",
			"runwayDays",
			"lastUpdated",
		]),
	);

	// Check hourly content directory (may be empty initially)
	results.push(await checkUrl(`${baseUrl}/content/hourly/`, "Hourly content directory"));

	// Display results
	console.log("RESULTS:");
	console.log("-".repeat(60));

	let passedCount = 0;
	for (const result of results) {
		const status = result.passed ? "✅ PASS" : "❌ FAIL";
		console.log(`${status} | ${result.step}`);
		console.log(`         ${result.message}`);
		if (result.passed) passedCount++;
	}

	console.log("-".repeat(60));
	console.log(`\n${passedCount}/${results.length} checks passed\n`);

	if (passedCount === results.length) {
		console.log("✅ Deployment verification PASSED");
		console.log("ALIEN website is ready!");
	} else {
		console.log("⚠️  Some checks failed");
		console.log("Please verify deployment and content generation");
	}

	console.log(`${"=".repeat(60)}\n`);
}

// Get URL from command line or use default
const baseUrl = process.argv[2] || "http://localhost:3000";

if (!baseUrl.startsWith("http")) {
	console.error("Usage: bun run scripts/verify-deployment.ts <url>");
	console.error("Example: bun run scripts/verify-deployment.ts https://alien.vercel.app");
	process.exit(1);
}

runVerification(baseUrl);
