import type { EventLog, Trace, RoleTrace, VariantLog, Variant, BinaryLog, ClassifiedTraces } from "../types";
import type { ParsedTrace, ParsedEvent } from "./types";

type Input = string;
type Output = ParsedTrace;

class DefaultTransformer implements Transformer<Input, Output> {
  private readonly parser = new DOMParser();
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
    const wrappedXml = `<root>${traceXml}</root>`;
    const doc = this.parser.parseFromString(wrappedXml, "text/xml");

    const parserError = doc.querySelector("parsererror");
    if (parserError) {
      return;
    }

    const traceEl = doc.querySelector("trace");
    if (!traceEl) {
      return;
    }

    // Extract trace ID
    const traceIdEl = traceEl.querySelector('string[key="concept:name"]');
    const traceId = traceIdEl?.getAttribute("value") || crypto.randomUUID();
    const traceLabelEl = traceEl.querySelector('string[key="label"]');
    const traceLabel = traceLabelEl?.getAttribute("value") ?? undefined;

    // Extract all events
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

export async function parseAsNonRoleVariantLog(file: File): Promise<VariantLog<Trace>> {
  const variantsMap = new Map<string, { trace: Trace; count: number }>();
  const events = new Set<string>();
  let totalCount = 0;

  for await (const { events: parsedEvents } of streamTraces(file)) {
    const trace = parsedEvents.map(e => e.activity);
    const hash = trace.join(";;");

    trace.forEach(activity => events.add(activity));

    if (!variantsMap.has(hash)) {
      variantsMap.set(hash, { trace, count: 0 });
    }

    variantsMap.get(hash)!.count++;
    totalCount++;
  }

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

  for await (const { events: parsedEvents } of streamTraces(file)) {
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
  }

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
