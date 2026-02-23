import type {
  EventLog,
  Trace,
  RoleTrace,
  BinaryLog,
  ClassifiedTraces,
} from "../../types";
import { generateId } from "../../utility";
import type { ParsedTrace, XesAttributes } from "./shared";

export type TraceCallback = (trace: ParsedTrace) => void;

export type TraceIterator = (
  file: File,
  onTrace: TraceCallback,
) => Promise<void>;

export function createParser(iterate: TraceIterator) {
  return {
    parseAsNonRoleLog: createParseAsNonRoleLog(iterate),
    parseAsRoleLog: createParseAsRoleLog(iterate),
    parseAsBinaryLog: createParseAsBinaryLog(iterate),
  };
}

function getTraceId(traceAttributes: XesAttributes): string {
  if ("concept:name" in traceAttributes) {
    return String(traceAttributes["concept:name"]);
  }

  return String(generateId());
}

// This is a custom attribute used in binary log classification
function getTraceLabel(traceAttributes: XesAttributes): string | null {
  if ("label" in traceAttributes) {
    return String(traceAttributes["label"]);
  }

  return null;
}

// TODO: XES supports event classifiers (sec. 2.5) that define activity identity
// from multiple attribute keys (e.g., "concept:name lifecycle:transition").
// The old parser (eventLogs.ts) searched for a classifier named "Event Name"
// and fell back to "concept:name" if not found, which in practice always
// resolved to "concept:name" for all logs in the dataset.
function getActivity(event: XesAttributes): string {
  if ("concept:name" in event) {
    return String(event["concept:name"]);
  }

  console.warn('No "concept:name" found for event');

  return "";
}

// TODO: Should this be "org:role" - DCR.js currently uses just "role" - also in generated logs
function getRole(event: XesAttributes): string | null {
  if ("role" in event) {
    return String(event["role"]);
  }

  return null;
}

export function createParseAsNonRoleLog(
  iterate: TraceIterator,
): (file: File) => Promise<EventLog<Trace>> {
  return async (file) => {
    const log: EventLog<Trace> = { events: new Set(), traces: {} };

    await iterate(file, ({ traceAttributes, events }) => {
      const traceId = getTraceId(traceAttributes);
      const trace: Trace = new Array(events.length);

      for (let i = 0; i < events.length; i++) {
        const activity = getActivity(events[i]);
        trace[i] = activity;

        if (!log.events.has(activity)) {
          log.events.add(activity);
        }
      }

      log.traces[traceId] = trace;
    });

    return log;
  };
}

export function createParseAsRoleLog(
  iterate: TraceIterator,
): (file: File) => Promise<EventLog<RoleTrace>> {
  return async (file) => {
    const log: EventLog<RoleTrace> = { events: new Set(), traces: {} };

    await iterate(file, ({ traceAttributes, events }) => {
      const traceId = getTraceId(traceAttributes);
      const trace: RoleTrace = new Array(events.length);

      for (let i = 0; i < events.length; i++) {
        const activity = getActivity(events[i]);
        const role = getRole(events[i]) ?? "";
        trace[i] = { activity, role };

        if (!log.events.has(activity)) {
          log.events.add(activity);
        }
      }

      log.traces[traceId] = trace;
    });

    return log;
  };
}

export function createParseAsBinaryLog(iterate: TraceIterator): (
  file: File,
  positiveClassifier: string,
) => Promise<{
  trainingLog: BinaryLog;
  testLog: EventLog<Trace>;
  gtLog: ClassifiedTraces;
}> {
  return async (file, positiveClassifier) => {
    const trainingLog: BinaryLog = {
      events: new Set(),
      traces: {},
      nTraces: {},
    };
    const testLog: EventLog<Trace> = { events: new Set(), traces: {} };
    const gtLog: ClassifiedTraces = {};

    await iterate(file, ({ traceAttributes, events }) => {
      const traceId = getTraceId(traceAttributes);
      const traceLabel = getTraceLabel(traceAttributes);

      if (!traceLabel) {
        throw new Error("No label found for trace: " + traceId);
      }

      const trace: Trace = new Array(events.length);
      for (let i = 0; i < events.length; i++) {
        const activity = getActivity(events[i]);
        trace[i] = activity;

        if (!trainingLog.events.has(activity)) {
          trainingLog.events.add(activity);
        }
      }

      if (traceLabel === positiveClassifier) {
        trainingLog.traces[traceId] = trace;
      } else {
        trainingLog.nTraces[traceId] = trace;
      }

      testLog.events = trainingLog.events;
      testLog.traces[traceId] = trace;
      gtLog[traceId] = traceLabel === positiveClassifier;
    });

    return { trainingLog, testLog, gtLog };
  };
}
