import { startExtractionRun } from "@/lib/runner/playwright-runner";

const runId = process.argv[2];
const targetUrl = process.argv[3];
const loginUrl = process.argv[4];

if (!runId || !targetUrl) {
  throw new Error("Usage: npm run extractor:worker -- <runId> <targetUrl> [loginUrl]");
}

void startExtractionRun(runId, {
  targetUrl,
  loginUrl
});
