import type { EventLog, Trace, RoleTrace, VariantLog, Variant, BinaryLog, ClassifiedTraces } from "../types";
import type { ParsedTrace, ParsedEvent } from "./types";
import sax from "sax";

type TraceCallback = (trace: ParsedTrace) => void | Promise<void>;

export async function parseWithCallback(file: File, callback: TraceCallback): Promise<void> {
  const parser = sax.parser(true, {
    lowercase: false,
    trim: true,
  });

  // State tracking
  let inTrace = false;
  let inEvent = false;
  let currentTraceId: string | null = null;
  let currentTraceLabel: string | null = null;
  let currentTrace: Array<ParsedEvent> = [];
  let currentEvent: Partial<ParsedEvent> = {};

  // Set up SAX event handlers
  parser.onopentag = (node) => {
    if (node.name === "trace") {
      inTrace = true;
      currentTraceId = null;
      currentTraceLabel = null;
      currentTrace = [];
    } else if (node.name === "event" && inTrace) {
      inEvent = true;
      currentEvent = {};
    } else if (node.name === "string" && node.attributes) {
      const key = node.attributes.key as string;
      const value = node.attributes.value as string;

      if (key === "concept:name") {
        if (inEvent) {
          currentEvent.activity = value;
        } else if (inTrace && !currentTraceId) {
          currentTraceId = value;
        }
      } else if (key === "label" && inTrace && !inEvent) {
        currentTraceLabel = value;
      } else if (inEvent) {
        // TODO: Should this be "org:role" - DCR.js currently uses just "role" - also in generated logs
        if (key === "role") {
          currentEvent.role = value;
        } else if (key === "org:resource") {
          currentEvent.resource = value;
        } else if (key === "lifecycle:transition") {
          currentEvent.lifecycle = value;
        }
      }
    } else if (node.name === "date" && inEvent && node.attributes) {
      const key = node.attributes.key as string;
      const value = node.attributes.value as string;

      if (key === "time:timestamp") {
        currentEvent.timestamp = new Date(value);
      }
    }
  };

  parser.onclosetag = (tagName) => {
    if (tagName === "event" && inEvent) {
      if (currentEvent.activity) {
        currentTrace.push(currentEvent as ParsedEvent);
      }
      inEvent = false;
      currentEvent = {};
    } else if (tagName === "trace" && inTrace) {
      if (currentTrace.length > 0) {
        callback({
          traceId: currentTraceId || crypto.randomUUID(),
          traceLabel: currentTraceLabel ?? undefined,
          events: currentTrace,
        });
      }
      inTrace = false;
      currentTraceId = null;
      currentTraceLabel = null;
      currentTrace = [];
    }
  };

  parser.onerror = (err) => {
    console.error("SAX parsing error:", err);
    parser.resume();
  };

  // Stream file in chunks
  const stream = file.stream().pipeThrough(new TextDecoderStream());
  const reader = stream.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      parser.write(value);
    }
    // Flush any remaining bytes
    parser.close();
  } catch (err) {
    console.error("Stream reading error:", err);
  }
}

export async function parseAsNonRoleLog(file: File): Promise<EventLog<Trace>> {
  const log: EventLog<Trace> = { events: new Set(), traces: {} };

  await parseWithCallback(file, ({ traceId, events }) => {
    log.traces[traceId] = events.map(e => e.activity);
    events.forEach(e => log.events.add(e.activity));
  });

  return log;
}

export async function parseAsRoleLog(file: File): Promise<EventLog<RoleTrace>> {
  const log: EventLog<RoleTrace> = { events: new Set(), traces: {} };

  await parseWithCallback(file, ({ traceId, events }) => {
    log.traces[traceId] = events.map(e => ({
      activity: e.activity,
      role: e.role || ""
    }));
    events.forEach(e => log.events.add(e.activity));
  });

  return log;
}

export async function parseAsBinaryLog(file: File, positiveClassifier: string): Promise<{
  trainingLog: BinaryLog;
  testLog: EventLog<Trace>;
  gtLog: ClassifiedTraces;
}> {
  const trainingLog: BinaryLog = {
    events: new Set(),
    traces: {},
    nTraces: {},
  };
  const testLog: EventLog<Trace> = { events: new Set(), traces: {} };
  const gtLog: ClassifiedTraces = {};

  await parseWithCallback(file, ({ traceId, traceLabel, events }) => {
    if (!traceLabel) {
      throw new Error("No label found for trace: " + traceId);
    }

    const activities: Array<string> = [];
    for (const e of events) {
      activities.push(e.activity);
      trainingLog.events.add(e.activity);
    }

    if (traceLabel === positiveClassifier) {
      trainingLog.traces[traceId] = activities;
    } else {
      trainingLog.nTraces[traceId] = activities;
    }

    testLog.events = trainingLog.events;
    testLog.traces[traceId] = activities;
    gtLog[traceId] = traceLabel === positiveClassifier;
  });

  return { trainingLog, testLog, gtLog };
}

export async function parseAsNonRoleVariantLog(file: File): Promise<VariantLog<Trace>> {
  const variantsMap = new Map<string, { trace: Trace; count: number }>();
  const events = new Set<string>();
  let totalCount = 0;

  await parseWithCallback(file, ({ events: parsedEvents }) => {
    const trace = parsedEvents.map(e => e.activity);
    const hash = trace.join(";;");

    trace.forEach(activity => events.add(activity));

    if (!variantsMap.has(hash)) {
      variantsMap.set(hash, { trace, count: 0 });
    }

    variantsMap.get(hash)!.count++;
    totalCount++;
  });

  const variants: Variant<Trace>[] = Array.from(variantsMap.entries()).map(
    ([_, val]) => ({
      variantId: crypto.randomUUID(),
      trace: val.trace,
      count: val.count,
    })
  ).sort((a, b) => b.count - a.count);

  return {
    events,
    variants,
    count: totalCount,
  };
}

export async function parseAsRoleVariantLog(file: File): Promise<VariantLog<RoleTrace>> {
  const variantsMap = new Map<string, { trace: RoleTrace; count: number }>();
  const events = new Set<string>();
  let totalCount = 0;

  await parseWithCallback(file, ({ events: parsedEvents }) => {
    const trace: RoleTrace = parsedEvents.map(e => ({
      activity: e.activity,
      role: e.role || ""
    }));
    const hash = trace.map(t => t.activity + "##" + t.role).join(";;");

    parsedEvents.forEach(e => events.add(e.activity));

    if (!variantsMap.has(hash)) {
      variantsMap.set(hash, { trace, count: 0 });
    }

    variantsMap.get(hash)!.count++;
    totalCount++;
  });

  const variants: Variant<RoleTrace>[] = Array.from(variantsMap.entries()).map(
    ([_, val]) => ({
      variantId: crypto.randomUUID(),
      trace: val.trace,
      count: val.count,
    })
  ).sort((a, b) => b.count - a.count);

  return {
    events,
    variants,
    count: totalCount,
  };
}
