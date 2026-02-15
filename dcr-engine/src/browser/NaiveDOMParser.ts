import type { EventLog, Trace, RoleTrace, BinaryLog, ClassifiedTraces } from "../types";
import type { ParsedTrace, ParsedEvent } from "./types";

export async function* streamTraces(file: File): AsyncGenerator<ParsedTrace> {
  // Read entire file as text
  const text = await file.text();

  // Parse entire XML document
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, "text/xml");

  const parserError = doc.querySelector("parsererror");
  if (parserError) {
    throw new Error(`XML parsing error: ${parserError.textContent}`);
  }

  // Get all traces
  const traceElements = Array.from(doc.querySelectorAll("trace"));

  for (const traceEl of traceElements) {
    // Extract trace ID
    const traceIdEl = traceEl.querySelector('string[key="concept:name"]');
    const traceId = traceIdEl?.getAttribute("value") || crypto.randomUUID();
    const traceLabelEl = traceEl.querySelector('string[key="label"]');
    const traceLabel = traceLabelEl?.getAttribute("value") ?? undefined;

    // Extract all events in this trace
    const events: Array<ParsedEvent> = [];
    const eventElements = Array.from(traceEl.querySelectorAll("event"));

    for (const eventEl of eventElements) {
      const activityEl = eventEl.querySelector('string[key="concept:name"]');
      const activity = activityEl?.getAttribute("value");

      if (activity) {
        // TODO: Should this be "org:role" - DCR.js currently uses just "role" - also in generated logs
        const roleEl = eventEl.querySelector('string[key="role"]');
        const resourceEl = eventEl.querySelector('string[key="org:resource"]');
        const timestampEl = eventEl.querySelector('date[key="time:timestamp"]');
        const lifecycleEl = eventEl.querySelector('string[key="lifecycle:transition"]');

        events.push({
          activity,
          role: roleEl?.getAttribute("value") ?? undefined,
          resource: resourceEl?.getAttribute("value") ?? undefined,
          timestamp: timestampEl?.getAttribute("value") ? new Date(timestampEl.getAttribute("value")!) : undefined,
          lifecycle: lifecycleEl?.getAttribute("value") ?? undefined,
        });
      }
    }

    if (events.length > 0) {
      yield { traceId, traceLabel, events };
    }
  }
}

export async function parseAsNonRoleLog(file: File): Promise<EventLog<Trace>> {
  const log: EventLog<Trace> = { events: new Set(), traces: {} };

  for await (const { traceId, events } of streamTraces(file)) {
    log.traces[traceId] = events.map(e => e.activity);
    events.forEach(e => log.events.add(e.activity));
  }

  return log;
}

export async function parseAsRoleLog(file: File): Promise<EventLog<RoleTrace>> {
  const log: EventLog<RoleTrace> = { events: new Set(), traces: {} };

  for await (const { traceId, events } of streamTraces(file)) {
    log.traces[traceId] = events.map(e => ({
      activity: e.activity,
      role: e.role || ""
    }));
    events.forEach(e => log.events.add(e.activity));
  }

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

  for await (const { traceId, traceLabel, events } of streamTraces(file)) {
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
  }

  return { trainingLog, testLog, gtLog };
}
