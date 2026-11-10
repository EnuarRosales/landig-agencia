import assert from "node:assert/strict";

/**
 * Lightweight assertion & runner core for Mocter E2E test suites.
 * Supports asynchronous test execution, tiered classification, and detailed diagnostic reporting.
 */

class TestRunnerState {
  constructor() {
    this.suites = [];
    this.currentSuite = null;
    this.results = {
      passed: 0,
      failed: 0,
      skipped: 0,
      total: 0,
      tests: [],
      startTime: null,
      endTime: null,
    };
  }

  createSuite(name) {
    const s = {
      name,
      tests: [],
      beforeAllFns: [],
      afterAllFns: [],
      beforeEachFns: [],
      afterEachFns: [],
    };
    this.suites.push(s);
    this.currentSuite = s;
    return s;
  }

  registerTest(name, fn, meta = {}) {
    if (!this.currentSuite) {
      this.createSuite("Default Suite");
    }
    this.currentSuite.tests.push({
      name,
      fn,
      tier: meta.tier || 1,
      featureId: meta.featureId || null,
      scenario: meta.scenario || null,
      timeoutMs: meta.timeoutMs || 15000,
      skip: meta.skip || false,
    });
  }
}

export const runnerState = new TestRunnerState();

export function suite(name, fn) {
  runnerState.createSuite(name);
  fn();
}

export function test(name, metaOrFn, maybeFn) {
  let fn;
  let meta = {};
  if (typeof metaOrFn === "function") {
    fn = metaOrFn;
  } else {
    meta = metaOrFn || {};
    fn = maybeFn;
  }
  runnerState.registerTest(name, fn, meta);
}

export function beforeAll(fn) {
  if (runnerState.currentSuite) {
    runnerState.currentSuite.beforeAllFns.push(fn);
  }
}

export function afterAll(fn) {
  if (runnerState.currentSuite) {
    runnerState.currentSuite.afterAllFns.push(fn);
  }
}

export function beforeEach(fn) {
  if (runnerState.currentSuite) {
    runnerState.currentSuite.beforeEachFns.push(fn);
  }
}

export function afterEach(fn) {
  if (runnerState.currentSuite) {
    runnerState.currentSuite.afterEachFns.push(fn);
  }
}

export { assert };

/**
 * Execute all registered test suites and tests.
 */
export async function runSuites(options = {}) {
  const { filterScenario, filterTier, filterText, bail = false } = options;
  runnerState.results.startTime = Date.now();

  console.log("\n=======================================================");
  console.log("       MOCTER CORE — END-TO-END VERIFICATION RUNNER     ");
  console.log("=======================================================\n");

  for (const suiteObj of runnerState.suites) {
    console.log(`\n📦 Suite: ${suiteObj.name}`);

    // Run beforeAll
    for (const bAll of suiteObj.beforeAllFns) {
      try {
        await bAll();
      } catch (err) {
        console.error(`  ❌ Suite beforeAll failed: ${err.message}`);
        throw err;
      }
    }

    for (const testCase of suiteObj.tests) {
      // Filters
      if (filterScenario && testCase.scenario && testCase.scenario.toUpperCase() !== filterScenario.toUpperCase()) {
        continue;
      }
      if (filterTier && testCase.tier !== parseInt(filterTier, 10)) {
        continue;
      }
      if (filterText && !testCase.name.toLowerCase().includes(filterText.toLowerCase())) {
        continue;
      }

      runnerState.results.total++;

      if (testCase.skip) {
        runnerState.results.skipped++;
        console.log(`  ⚪ [SKIPPED] [Tier ${testCase.tier}] ${testCase.name}`);
        runnerState.results.tests.push({
          suite: suiteObj.name,
          name: testCase.name,
          status: "skipped",
          tier: testCase.tier,
          scenario: testCase.scenario,
        });
        continue;
      }

      // Run beforeEach
      for (const bEach of suiteObj.beforeEachFns) {
        await bEach();
      }

      const start = Date.now();
      let status = "passed";
      let error = null;

      try {
        // Execute with timeout
        await Promise.race([
          testCase.fn(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Test timed out after ${testCase.timeoutMs}ms`)), testCase.timeoutMs),
          ),
        ]);
        runnerState.results.passed++;
        const duration = Date.now() - start;
        console.log(`  ✅ [PASS] [Tier ${testCase.tier}] ${testCase.name} (${duration}ms)`);
      } catch (err) {
        status = "failed";
        error = err;
        runnerState.results.failed++;
        const duration = Date.now() - start;
        console.log(`  ❌ [FAIL] [Tier ${testCase.tier}] ${testCase.name} (${duration}ms)`);
        console.log(`     Error: ${err.message}`);
        if (err.stack) {
          const lines = err.stack.split("\n").slice(1, 4).map((l) => `     ${l.trim()}`).join("\n");
          console.log(lines);
        }

        if (bail) {
          console.log(`\n⚠️  Bail requested. Aborting execution after failure.`);
          break;
        }
      } finally {
        // Run afterEach
        for (const aEach of suiteObj.afterEachFns) {
          try {
            await aEach();
          } catch (e) {
            console.error(`     Warning: afterEach error: ${e.message}`);
          }
        }

        runnerState.results.tests.push({
          suite: suiteObj.name,
          name: testCase.name,
          status,
          durationMs: Date.now() - start,
          tier: testCase.tier,
          featureId: testCase.featureId,
          scenario: testCase.scenario,
          error: error ? error.message : null,
        });
      }

      if (bail && status === "failed") {
        break;
      }
    }

    // Run afterAll
    for (const aAll of suiteObj.afterAllFns) {
      try {
        await aAll();
      } catch (err) {
        console.error(`  Suite afterAll warning: ${err.message}`);
      }
    }
  }

  runnerState.results.endTime = Date.now();
  const totalDuration = ((runnerState.results.endTime - runnerState.results.startTime) / 1000).toFixed(2);

  console.log("\n=======================================================");
  console.log("                     TEST SUMMARY                       ");
  console.log("=======================================================");
  console.log(`  Total Tests:  ${runnerState.results.total}`);
  console.log(`  Passed:       ${runnerState.results.passed}`);
  console.log(`  Failed:       ${runnerState.results.failed}`);
  console.log(`  Skipped:      ${runnerState.results.skipped}`);
  console.log(`  Duration:     ${totalDuration}s`);
  console.log("=======================================================\n");

  return runnerState.results;
}
