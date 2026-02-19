import { chromium } from "playwright";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { performance } from "perf_hooks";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type BenchmarkStatus = "passed" | "failed" | "timedOut" | "unknown";

const ITERATIONS = parseInt(process.env.BENCH_ITERATIONS || "20", 10);
const TIMEOUT = parseInt(process.env.BENCH_TIMEOUT || "90000", 10);
const SAVE_MODELS = (process.env.BENCH_SAVE_MODELS || "true") === "true";

const OUTPUT_DIR = process.env.EXP_OUTPUT_DIR
  ? process.env.EXP_OUTPUT_DIR
  : path.join(__dirname, "../experiments/manual_run");

const TRACES_DIR = path.join(OUTPUT_DIR, "traces");

const BASE_URL = process.env.BASE_URL || "http://localhost:5173/dcr-js";

if (!fs.existsSync(TRACES_DIR)) {
  fs.mkdirSync(TRACES_DIR, { recursive: true });
}

const LOGS_DIR = path.join(__dirname, "../datasets/logs");
const MODELS_DIR = path.join(__dirname, "../datasets/models");

const logFiles = fs.readdirSync(LOGS_DIR).filter((f) => f.endsWith(".xes"));
const modelFiles = fs.readdirSync(MODELS_DIR).filter((f) => f.endsWith(".xml"));

async function runProcessDiscoveryBenchmark(
  logFile: string,
  iteration: number,
): Promise<BenchmarkStatus> {
  const testName = `${logFile}_run_${iteration}`;

  const browserConsoleMessages: any[] = [];
  const traceEvents: any[] = [];
  let status: BenchmarkStatus = "passed";

  const browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--js-flags=--expose-gc",
      "--enable-precise-memory-info",
    ],
  });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const client = await context.newCDPSession(page);

    page.on("console", (msg) => {
      const entry = {
        type: msg.type(),
        text: msg.text(),
        location: msg.location(),
      };
      browserConsoleMessages.push(entry);
    });

    await client.send("Tracing.start", {
      transferMode: "ReportEvents",
      traceConfig: {
        includedCategories: [
          "v8",
          "blink.console",
          "devtools.timeline",
          "disabled-by-default-devtools.timeline",
          "disabled-by-default-v8.gc",
          "disabled-by-default-memory-infra",
          "toplevel",
          "blink.user_timing",
        ],
        memoryDumpConfig: {},
      },
    });

    client.on("Tracing.dataCollected", (event) => {
      traceEvents.push(...event.value);
    });

    await page.goto(BASE_URL);
    await page.waitForLoadState("networkidle");

    await page.getByText("Discovery", { exact: true }).click();

    await page
      .getByLabel("Select event log")
      .setInputFiles(path.join(LOGS_DIR, logFile));

    const waitForDiscovery = page.waitForEvent("console", {
      predicate: (msg) => msg.text().includes("Finished discovery!"),
      timeout: TIMEOUT,
    });

    await page.getByRole("button", { name: "Discover!" }).click();

    await waitForDiscovery;

    await client.send("HeapProfiler.collectGarbage");

    await client.send("Tracing.end");
    await new Promise<void>((resolve) =>
      client.once("Tracing.tracingComplete", () => {
        resolve();
      }),
    );

    const consoleMessages = await page.consoleMessages();
    const failedMessage = consoleMessages.find((msg) =>
      msg.text().includes("Failed discovery!"),
    );

    if (failedMessage) {
      throw new Error("PD failed");
    }

    if (SAVE_MODELS) {
      const downloadTimeout = 60_000;
      await page.getByText("Download").click();
      const waitForXml = page.waitForEvent("download", {
        timeout: downloadTimeout,
      });
      await page.getByText("Download Editor XML").click();
      const downloadXml = await waitForXml;
      const downloadXmlPath = path.join(
        TRACES_DIR,
        `${testName}.PD.dcrgraph.xml`,
      );
      await downloadXml.saveAs(downloadXmlPath);

      const waitForSvg = page.waitForEvent("download", {
        timeout: downloadTimeout,
      });
      await page.getByText("Download SVG").click();
      const downloadSvg = await waitForSvg;
      const downloadSvgPath = path.join(
        TRACES_DIR,
        `${testName}.PD.dcrgraph.svg`,
      );
      await downloadSvg.saveAs(downloadSvgPath);
    }

    console.info(`✓ Completed ${testName}`);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("Timeout")) {
        status = "timedOut";
        console.error(`✗ ${testName} timed out`);
      } else {
        status = "failed";
        console.error(`✗ ${testName} failed:`, error.message);
      }
    } else {
      status = "unknown";
      console.error(`✗ ${testName} failed with unknown error:`, error);
    }
  } finally {
    await browser.close();

    // Save results
    const statusPath = path.join(TRACES_DIR, `${testName}.PD.status.txt`);
    fs.writeFileSync(statusPath, status);

    const consoleLogPath = path.join(TRACES_DIR, `${testName}.PD.console.json`);
    fs.writeFileSync(
      consoleLogPath,
      JSON.stringify(browserConsoleMessages, null, 2),
    );

    const traceData = { traceEvents };
    const savePath = path.join(TRACES_DIR, `${testName}.PD.trace.json`);
    fs.writeFileSync(savePath, JSON.stringify(traceData));
  }

  return status;
}

async function runConformanceCheckingBenchmark(
  logFile: string,
  modelFile: string,
  iteration: number,
): Promise<BenchmarkStatus> {
  const testName = `${logFile}_run_${iteration}`;

  const browserConsoleMessages: any[] = [];
  const traceEvents: any[] = [];
  let status: BenchmarkStatus = "passed";

  const browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--js-flags=--expose-gc",
      "--enable-precise-memory-info",
    ],
  });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const client = await context.newCDPSession(page);

    page.on("console", (msg) => {
      const entry = {
        type: msg.type(),
        text: msg.text(),
        location: msg.location(),
      };
      browserConsoleMessages.push(entry);
    });

    await client.send("Tracing.start", {
      transferMode: "ReportEvents",
      traceConfig: {
        includedCategories: [
          "v8",
          "blink.console",
          "devtools.timeline",
          "disabled-by-default-devtools.timeline",
          "disabled-by-default-v8.gc",
          "disabled-by-default-memory-infra",
          "toplevel",
          "blink.user_timing",
        ],
        memoryDumpConfig: {},
      },
    });

    client.on("Tracing.dataCollected", (event) => {
      traceEvents.push(...event.value);
    });

    await page.goto(BASE_URL);
    await page.waitForLoadState("networkidle");

    await page.getByText("Conformance", { exact: true }).click();

    const waitForLog = page.waitForEvent("console", {
      predicate: (msg) => msg.text().includes("Finished parsing log!"),
      timeout: TIMEOUT,
    });

    await page
      .getByLabel("Upload Log")
      .setInputFiles(path.join(LOGS_DIR, logFile));

    await waitForLog;

    await page.getByText("Open Model").click();

    const waitForModel = page.waitForEvent("console", {
      predicate: (msg) => msg.text().includes("Finished opening model!"),
      timeout: TIMEOUT,
    });

    await page
      .getByLabel("Open Editor XML")
      .setInputFiles(path.join(MODELS_DIR, modelFile));

    await waitForModel;

    await Promise.all([
      page.getByRole("button", { name: "Check!" }).click({
        timeout: TIMEOUT,
      }),
      page.waitForEvent("console", {
        predicate: (msg) =>
          msg.text().includes("Finished conformance checking!"),
        timeout: TIMEOUT,
      }),
    ]);

    await client.send("HeapProfiler.collectGarbage");

    await client.send("Tracing.end");
    await new Promise<void>((resolve) =>
      client.once("Tracing.tracingComplete", () => {
        resolve();
      }),
    );

    const consoleMessages = await page.consoleMessages();
    const failedMessage = consoleMessages.find((msg) =>
      msg.text().includes("Failed conformance checking!"),
    );

    if (failedMessage) {
      throw new Error("CC failed");
    }

    console.info(`✓ Completed ${testName}`);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("Timeout")) {
        status = "timedOut";
        console.error(`✗ ${testName} timed out`);
      } else {
        status = "failed";
        console.error(`✗ ${testName} failed:`, error.message);
      }
    } else {
      status = "unknown";
      console.error(`✗ ${testName} failed with unknown error:`, error);
    }
  } finally {
    await browser.close();

    // Save results
    const statusPath = path.join(TRACES_DIR, `${testName}.CC.status.txt`);
    fs.writeFileSync(statusPath, status);

    const consoleLogPath = path.join(TRACES_DIR, `${testName}.CC.console.json`);
    fs.writeFileSync(
      consoleLogPath,
      JSON.stringify(browserConsoleMessages, null, 2),
    );

    const traceData = { traceEvents };
    const savePath = path.join(TRACES_DIR, `${testName}.CC.trace.json`);
    fs.writeFileSync(savePath, JSON.stringify(traceData));
  }

  return status;
}

function duration(start: number, end: number): string {
  return ((end - start) / 1000).toFixed(2);
}

async function runProcessDiscoveryBenchmarks() {
  const log: string[] = [];
  function logger(message: string) {
    log.push(message);
    console.info(message);
  }

  const startTime = performance.now();
  logger(`PD benchmark started at ${new Date().toISOString()}`);

  for (const logFile of logFiles) {
    const logStartTime = performance.now();
    logger("================================================================");
    logger(
      `Started PD benchmark for ${logFile} at ${new Date().toISOString()}`,
    );
    logger("----------------------------------------------------------------");

    let failedAttempts = 0;
    let timeouts = 0;

    for (let iteration = 1; iteration <= ITERATIONS; iteration++) {
      const iterationStartTime = performance.now();

      if (iteration > 1) {
        logger(
          "----------------------------------------------------------------",
        );
      }

      if (failedAttempts >= 1) {
        logger(
          `Skipping further attempts for ${logFile} as it has failed previously.`, // Assumed to be deterministic
        );
        break;
      }

      if (timeouts >= 3) {
        logger(
          `Skipping further attempts for ${logFile} as it has timed out ${timeouts} times.`, // Assumed to be indeterministic, hence more retries
        );
        break;
      }

      try {
        logger(
          `Started iteration #${iteration} for ${logFile} at ${new Date().toISOString()} | ${failedAttempts} failed attempts | ${timeouts} timeouts`,
        );

        const status = await runProcessDiscoveryBenchmark(logFile, iteration);

        logger(
          `Completed iteration #${iteration} for ${logFile} with status: ${status}`,
        );

        if (status === "failed") failedAttempts++;
        if (status === "timedOut") timeouts++;
      } catch (error) {
        // Error already logged in runBenchmark
      } finally {
        const iterationEndTime = performance.now();
        const iterationDuration = duration(
          iterationStartTime,
          iterationEndTime,
        );

        logger(
          `Completed iteration #${iteration} for ${logFile} in ${iterationDuration} seconds`,
        );
      }
    }

    logger("----------------------------------------------------------------");

    const logEndTime = performance.now();
    const logDuration = duration(logStartTime, logEndTime);

    logger(`Completed PD benchmark for ${logFile} in ${logDuration} seconds`);
  }

  logger("================================================================");

  const endTime = performance.now();
  const totalDuration = duration(startTime, endTime);

  logger(`All PD benchmarks completed in ${totalDuration} seconds`);

  const logPath = path.join(OUTPUT_DIR, `PD_benchmark_log_${Date.now()}.txt`);
  fs.writeFileSync(logPath, log.join("\n"));
}

async function runConformanceCheckingBenchmarks() {
  const log: string[] = [];
  function logger(message: string) {
    log.push(message);
    console.info(message);
  }

  const startTime = performance.now();
  logger(`CC benchmark started at ${new Date().toISOString()}`);

  for (const logFile of logFiles) {
    const logPrefix = logFile.split(" ")[0];
    const modelFile = modelFiles.find((m) => m.split(" ")[0] === logPrefix);
    if (!modelFile) {
      logger(`No matching model found for ${logFile}, skipping.`);
      continue;
    }

    const logStartTime = performance.now();
    logger("================================================================");
    logger(
      `Started CC benchmark for ${logFile} at ${new Date().toISOString()}`,
    );
    logger("----------------------------------------------------------------");

    let failedAttempts = 0;
    let timeouts = 0;

    for (let iteration = 1; iteration <= ITERATIONS; iteration++) {
      const iterationStartTime = performance.now();

      if (iteration > 1) {
        logger(
          "----------------------------------------------------------------",
        );
      }

      if (failedAttempts >= 1) {
        logger(
          `Skipping further attempts for ${logFile} as it has failed previously.`, // Assumed to be deterministic
        );
        break;
      }

      if (timeouts >= 3) {
        logger(
          `Skipping further attempts for ${logFile} as it has timed out ${timeouts} times.`, // Assumed to be indeterministic, hence more retries
        );
        break;
      }

      try {
        logger(
          `Started iteration #${iteration} for ${logFile} at ${new Date().toISOString()} | ${failedAttempts} failed attempts | ${timeouts} timeouts`,
        );

        const status = await runConformanceCheckingBenchmark(
          logFile,
          modelFile,
          iteration,
        );

        logger(
          `Completed iteration #${iteration} for ${logFile} with status: ${status}`,
        );

        if (status === "failed") failedAttempts++;
        if (status === "timedOut") timeouts++;
      } catch (error) {
        // Error already logged in runBenchmark
      } finally {
        const iterationEndTime = performance.now();
        const iterationDuration = duration(
          iterationStartTime,
          iterationEndTime,
        );

        logger(
          `Completed iteration #${iteration} for ${logFile} in ${iterationDuration} seconds`,
        );
      }
    }

    logger("----------------------------------------------------------------");

    const logEndTime = performance.now();
    const logDuration = duration(logStartTime, logEndTime);

    logger(`Completed CC benchmark for ${logFile} in ${logDuration} seconds`);
  }

  logger("================================================================");

  const endTime = performance.now();
  const totalDuration = duration(startTime, endTime);

  logger(`All CC benchmarks completed in ${totalDuration} seconds`);

  const logPath = path.join(OUTPUT_DIR, `CC_benchmark_log_${Date.now()}.txt`);
  fs.writeFileSync(logPath, log.join("\n"));
}

async function main() {
  const benchmarkType = process.env.BENCH_TYPE || "all";

  if (benchmarkType === "discovery" || benchmarkType === "all") {
    await runProcessDiscoveryBenchmarks();
  }

  if (benchmarkType === "conformance" || benchmarkType === "all") {
    await runConformanceCheckingBenchmarks();
  }

  // Force Node.js to exit cleanly in case of lingering handles
  process.exit(0);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
