import type { EventLog, Trace, RoleTrace, BinaryLog, ClassifiedTraces } from "../types";
import type { ParsedTrace, ParsedEvent } from "./types";

type Input = string;
type Output = ParsedTrace;

class DefaultTransformer implements Transformer<Input, Output> {
  private readonly parser: DOMParser = new DOMParser();

  private buffer: string = "";
  private inTrace: boolean = false;
  private currentTraceId: string | null = null;
  private currentTraceLabel: string | null = null;
  private currentTrace: Array<ParsedEvent> = [];

  start(_controller: TransformStreamDefaultController<Output>): void {
    this.buffer = "";
    this.inTrace = false;
    this.currentTraceId = null;
    this.currentTraceLabel = null;
    this.currentTrace = [];
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

  private processBuffer(
    controller: TransformStreamDefaultController<Output>
  ): void {
    // Process buffer in a loop until we can't parse any more complete elements
    while (true) {
      // Not currently inside a trace, so look for start of trace
      if (!this.inTrace) {
        const traceStart = this.buffer.indexOf("<trace");
        if (traceStart === -1) {
          // No trace found, so continue processing and try again
          if (this.buffer.length > 20) {
            // Trim buffer to avoid unbounded growth, 
            // keeping last 10 chars for partial matches,
            // but this could be just 5 characters, since
            // smallest partial match is "<trac"
            this.buffer = this.buffer.slice(-10);
          }
          break;
        }

        // Found trace, so consume "<trace" (6 characters) 
        // and begin processing trace
        this.buffer = this.buffer.slice(traceStart + 6);
        this.inTrace = true;
        this.currentTrace = [];
        this.currentTraceId = null;
        this.currentTraceLabel = null;
        continue;
      }

      // Currently inside a trace, so look for event and end of trace
      const eventStart = this.buffer.indexOf("<event");
      const traceEnd = this.buffer.indexOf("</trace>");

      // Trace ends before next event (or no more events)
      if (traceEnd !== -1 && (eventStart === -1 || traceEnd < eventStart)) {
        // Try to extract trace ID, if we don't have it yet
        if (!this.currentTraceId) {
          const searchString = this.buffer.substring(0, traceEnd);
          const wrappedSearchString = `<root>${searchString}</root>`;
          const searchDoc = this.parser.parseFromString(wrappedSearchString, "text/xml");
          const parserError = searchDoc.querySelector("parsererror");
          if (!parserError) {
            const traceIdEl = searchDoc.querySelector('string[key="concept:name"]');
            this.currentTraceId = traceIdEl?.getAttribute("value") || null;
            const traceLabelEl = searchDoc.querySelector('string[key="label"]');
            this.currentTraceLabel = traceLabelEl?.getAttribute("value") || null;
          }
        }

        // Emit the complete trace and clean up
        this.finalizeTrace(controller);
        this.buffer = this.buffer.slice(traceEnd + 8); // Skip past "</trace>"
        this.inTrace = false;
        continue;
      }

      // Found event, so look for end of event
      if (eventStart !== -1) {
        // Try to extract trace ID, if we don't have it yet
        if (!this.currentTraceId) {
          const searchString = this.buffer.substring(0, eventStart);
          const wrappedSearchString = `<root>${searchString}</root>`;
          const searchDoc = this.parser.parseFromString(wrappedSearchString, "text/xml");
          const parserError = searchDoc.querySelector("parsererror");
          if (!parserError) {
            const traceIdEl = searchDoc.querySelector('string[key="concept:name"]');
            this.currentTraceId = traceIdEl?.getAttribute("value") || null;
            const traceLabelEl = searchDoc.querySelector('string[key="label"]');
            this.currentTraceLabel = traceLabelEl?.getAttribute("value") || null;
          }
        }

        // Check if we have the complete event
        const eventEnd = this.buffer.indexOf("</event>", eventStart);
        if (eventEnd !== -1) {
          // Found complete event, so parse it 
          const eventString = this.buffer.substring(eventStart, eventEnd + 8);
          const wrappedEventString = `<root>${eventString}</root>`;
          const eventDoc = this.parser.parseFromString(wrappedEventString, "text/xml");

          const parserError = eventDoc.querySelector("parsererror");
          if (!parserError) {
            const eventEl = eventDoc.querySelector("event");
            if (eventEl) {
              // Extract required attributes from event
              const activityEl = eventEl.querySelector('string[key="concept:name"]');
              const activity = activityEl?.getAttribute("value");

              if (activity) {
                // Extract optional attributes from event
                // TODO: Should this be "org:role" - DCR.js currently uses just "role" - also in generated logs
                const roleEl = eventEl.querySelector('string[key="role"]');
                const resourceEl = eventEl.querySelector('string[key="org:resource"]');
                const timestampEl = eventEl.querySelector('date[key="time:timestamp"]');
                const lifecycleEl = eventEl.querySelector('string[key="lifecycle:transition"]');

                this.currentTrace.push({
                  activity,
                  role: roleEl?.getAttribute("value") ?? undefined,
                  resource: resourceEl?.getAttribute("value") ?? undefined,
                  timestamp: timestampEl?.getAttribute("value") ? new Date(timestampEl.getAttribute("value")!) : undefined,
                  lifecycle: lifecycleEl?.getAttribute("value") ?? undefined,
                });
              }
            }
          }

          // Clear buffer immediately after parsing event
          this.buffer = this.buffer.slice(eventEnd + 8);
          continue;
        } else {
          // Incomplete event, so keep it in buffer for next chunk
          if (eventStart > 0) {
            this.buffer = this.buffer.slice(eventStart);
          }
          break;
        }
      }

      // No more complete elements to process
      break;
    }
  }

  private finalizeTrace(controller: TransformStreamDefaultController<Output>): void {
    if (this.currentTrace.length > 0) {
      controller.enqueue({
        traceId: this.currentTraceId || crypto.randomUUID(),
        traceLabel: this.currentTraceLabel ?? undefined,
        events: this.currentTrace
      });
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
