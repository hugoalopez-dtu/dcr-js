import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { xmlToDCR } from "../../dcr-engine/src/graphConversion.js";
import { isEnabledS, executeS, isAcceptingS } from "../../dcr-engine/src/executionEngine.js";
import { copyMarking } from "../../dcr-engine/src/utility.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Suppress verbose engine logging during replay
console.log = () => {};

const xml = fs.readFileSync(
  path.join(__dirname, "../../app/public/examples/diagrams/LoanApp_junior_senior.xml"),
  "utf-8"
);
const graph = xmlToDCR(xml);
const initialMarking = copyMarking(graph.marking);

// label -> event id (1:1 for this graph)
const labelToEvent: Record<string, string> = {};
for (const [ev, label] of Object.entries(graph.labelMap)) {
  labelToEvent[label] = ev;
}

// --- Load CSV ---
const csvPath = "/Users/sofia/Downloads/LoanApp_junior_senior.csv";
const raw = fs.readFileSync(csvPath, "utf-8").trim().split("\n");
const header = raw[0].split(",");
const idx = (col: string) => header.indexOf(col);
const iCase = idx("case_id");
const iActivity = idx("activity_name");
const iStart = idx("start_timestamp");

type Row = { caseId: string; activity: string; start: string };
const rows: Row[] = raw.slice(1).map(line => {
  const cols = line.split(",");
  return { caseId: cols[iCase], activity: cols[iActivity], start: cols[iStart] };
});

// Group by case_id, sort by start_timestamp
const cases = new Map<string, Row[]>();
for (const r of rows) {
  if (!cases.has(r.caseId)) cases.set(r.caseId, []);
  cases.get(r.caseId)!.push(r);
}
for (const trace of cases.values()) {
  trace.sort((a, b) => a.start.localeCompare(b.start));
}

// --- Replay ---
let nTraces = 0;
let nZeroIllegal = 0;
let nAccepting = 0;
const offendingCounts = new Map<string, number>(); // "activity@position" -> count
const cancelPositions: number[] = [];

for (const [caseId, trace] of cases.entries()) {
  nTraces++;
  graph.marking = copyMarking(initialMarking);
  let illegalCount = 0;

  trace.forEach((row, position) => {
    const eventId = labelToEvent[row.activity];
    if (row.activity === "Cancel application") cancelPositions.push(position);

    if (!eventId) {
      illegalCount++;
      const key = `${row.activity}@${position}`;
      offendingCounts.set(key, (offendingCounts.get(key) || 0) + 1);
      return;
    }

    const { enabled } = isEnabledS(eventId, graph, graph);
    if (!enabled) {
      illegalCount++;
      const key = `${row.activity}@${position}`;
      offendingCounts.set(key, (offendingCounts.get(key) || 0) + 1);
    }
    // Execute regardless, to keep replaying the rest of the trace
    executeS(eventId, graph);
  });

  if (illegalCount === 0) nZeroIllegal++;
  if (isAcceptingS(graph, graph)) nAccepting++;
}

// Position distribution of "Cancel application"
const cancelPosDist: Record<string, number> = {};
for (const p of cancelPositions) {
  cancelPosDist[p] = (cancelPosDist[p] || 0) + 1;
}

// Aggregate first-offending (activity, position) pairs
const offendingPairs = Array.from(offendingCounts.entries())
  .map(([key, count]) => {
    const at = key.lastIndexOf("@");
    return { activity: key.slice(0, at), position: Number(key.slice(at + 1)), count };
  })
  .sort((a, b) => b.count - a.count);

const report = {
  nTraces,
  pctZeroIllegal: (100 * nZeroIllegal) / nTraces,
  pctAccepting: (100 * nAccepting) / nTraces,
  offendingActivityPositionPairs: offendingPairs,
  cancelApplicationPositionDistribution: cancelPosDist,
  cancelApplicationOccurrencesAtPosition0: cancelPosDist["0"] || 0,
};

const outDir = path.join(__dirname, "../../dcr-gymnasium-agent/dcr-gymnasium-agent/python/scripts/logs");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "conformance_report.json"), JSON.stringify(report, null, 2));

const md = `# Conformance Replay — LoanApp_junior_senior

- Traces replayed: ${report.nTraces}
- Traces with zero illegal transitions: ${report.pctZeroIllegal.toFixed(2)}%
- Traces ending in an accepting state: ${report.pctAccepting.toFixed(2)}%
- "Cancel application" at position 0: ${report.cancelApplicationOccurrencesAtPosition0} occurrences

## Top offending (activity, position) pairs (non-conforming traces)

${offendingPairs.slice(0, 15).map(p => `- ${p.activity} @ position ${p.position}: ${p.count}`).join("\n")}

## "Cancel application" position distribution

${Object.entries(cancelPosDist).sort((a,b) => Number(a[0])-Number(b[0])).map(([pos, c]) => `- position ${pos}: ${c}`).join("\n")}
`;

fs.writeFileSync(path.join(outDir, "conformance_report.md"), md);

console.error(`Done. nTraces=${nTraces}, zeroIllegal=${report.pctZeroIllegal.toFixed(2)}%, accepting=${report.pctAccepting.toFixed(2)}%`);
