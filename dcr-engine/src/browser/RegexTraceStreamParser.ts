import { v4 } from "uuid";
import type { EventLog, Trace, RoleTrace, BinaryLog, ClassifiedTraces } from "../types";
import type { ParsedTrace, ParsedEvent } from "./types";

type Input = string;
type Output = ParsedTrace;

class DefaultTransformer implements Transformer<Input, Output> {
  private readonly traceIdRegex = /<string\s+key="concept:name"\s+value="([^"]+)"/;
  private readonly eventRegex = /<event[\s\S]*?<\/event>/g;
  private readonly activityRegex = /<string\s+key="concept:name"\s+value="([^"]+)"/;

  // TODO: Should this be "org:role" - DCR.js currently uses just "role" - also in generated logs
  private readonly roleRegex = /<string\s+key="role"\s+value="([^"]+)"/;
  private readonly resourceRegex = /<string\s+key="org:resource"\s+value="([^"]+)"/;
  private readonly timestampRegex = /<date\s+key="time:timestamp"\s+value="([^"]+)"/;
  private readonly lifecycleRegex = /<string\s+key="lifecycle:transition"\s+value="([^"]+)"/;
  private readonly traceLabelRegex = /<string\s+key="label"\s+value="([^"]+)"/;

  private buffer = "";

  start(_controller: TransformStreamDefaultController<Output>): void {
    this.buffer = "";
  }

  transform(
    chunk: Input,
    controller: TransformStreamDefaultController<Output>
  ): void {
    this.buffer += chunk;
    this.processBuffer(controller);
  }

  flush(controller: TransformStreamDefaultController<Output>): void {
    this.processBuffer(controller);
  }

  private processBuffer(controller: TransformStreamDefaultController<Output>) {
    // Look for complete trace chunks
    while (true) {
      const traceStart = this.buffer.indexOf("<trace");
      if (traceStart === -1) {
        // No trace found, trim buffer
        if (this.buffer.length > 20) {
          this.buffer = this.buffer.slice(-10);
        }
        break;
      }

      const traceEnd = this.buffer.indexOf("</trace>", traceStart);
      if (traceEnd === -1) {
        // Incomplete trace, keep in buffer
        if (traceStart > 0) {
          this.buffer = this.buffer.slice(traceStart);
        }
        break;
      }

      // Found complete trace, parse it
      const traceXml = this.buffer.substring(traceStart, traceEnd + 8);
      this.parseTrace(traceXml, controller);

      // Remove parsed trace from buffer
      this.buffer = this.buffer.slice(traceEnd + 8);
    }
  }

  private parseTrace(traceXml: string, controller: TransformStreamDefaultController<Output>) {
    // Extract trace ID
    const traceIdMatch = traceXml.match(this.traceIdRegex);
    const traceId = traceIdMatch?.[1] || v4();
    const traceLabelMatch = traceXml.match(this.traceLabelRegex);
    const traceLabel = traceLabelMatch?.[1];

    // Extract all events
    const events: Array<ParsedEvent> = [];
    const eventMatches = traceXml.matchAll(this.eventRegex);

    for (const eventMatch of eventMatches) {
      const eventXml = eventMatch[0];
      const activityMatch = eventXml.match(this.activityRegex);

      if (activityMatch) {
        const roleMatch = eventXml.match(this.roleRegex);
        const resourceMatch = eventXml.match(this.resourceRegex);
        const timestampMatch = eventXml.match(this.timestampRegex);
        const lifecycleMatch = eventXml.match(this.lifecycleRegex);

        events.push({
          activity: activityMatch[1],
          role: roleMatch?.[1],
          resource: resourceMatch?.[1],
          timestamp: timestampMatch?.[1] ? new Date(timestampMatch[1]) : undefined,
          lifecycle: lifecycleMatch?.[1],
        });
      }
    }

    if (events.length > 0) {
      controller.enqueue({ traceId, traceLabel, events });
    }
  }
}

class DefaultTransformStream extends TransformStream<Input, Output> {
  constructor() {
    super(new DefaultTransformer());
  }
}

export async function* streamTraces(file: File): AsyncGenerator<ParsedTrace> {
  const stream = file.stream();
  const textStream = stream.pipeThrough(new TextDecoderStream());
  const xesStream = textStream.pipeThrough(new DefaultTransformStream());
  const reader = xesStream.getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    yield value;
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
