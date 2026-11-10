#!/usr/bin/env node

/**
 * Mocter Core — Canonical End-to-End Verification Runner.
 *
 * Usage:
 *   node tests/e2e/run.mjs
 *   node tests/e2e/run.mjs --scenario=A
 *   node tests/e2e/run.mjs --tier=1
 *   node tests/e2e/run.mjs --bail
 *   node tests/e2e/run.mjs --filter="RLS"
 */

import { runSuites } from "./harness/runner-core.mjs";

// Parse CLI flags
const args = process.argv.slice(2);
const options = {
  filterScenario: null,
  filterTier: null,
  filterText: null,
  bail: false,
};

for (const arg of args) {
  if (arg.startsWith("--scenario=")) {
    options.filterScenario = arg.split("=")[1].trim();
  } else if (arg.startsWith("--tier=")) {
    options.filterTier = arg.split("=")[1].trim();
  } else if (arg.startsWith("--filter=")) {
    options.filterText = arg.split("=")[1].trim();
  } else if (arg === "--bail") {
    options.bail = true;
  }
}

async function main() {
  const scenario = options.filterScenario ? options.filterScenario.toUpperCase() : null;

  // Dynamically import test suites based on scenario filter
  if (!scenario || scenario === "A") {
    await import("./scenarios/scenario-a-cell-isolation.test.mjs");
  }
  if (!scenario || scenario === "B") {
    await import("./scenarios/scenario-b-bifurcated-session-dispatch.test.mjs");
  }
  if (!scenario || scenario === "C") {
    await import("./scenarios/scenario-c-3step-onboarding.test.mjs");
  }
  if (!scenario || scenario === "D") {
    await import("./scenarios/scenario-d-workspace-and-media.test.mjs");
  }
  if (!scenario || scenario === "E") {
    await import("./scenarios/scenario-e-cell-migration.test.mjs");
  }

  const results = await runSuites(options);

  if (results.failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("FATAL ERROR in E2E Runner:", err);
  process.exit(1);
});
