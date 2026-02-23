import { createParser, type TraceCallback } from "./lib/factories";
import {
  type XesAttributes,
  EVENT_START_TAG,
  getXesEventBlocks,
  extractAttributesWithRegex,
} from "./lib/shared";

// Parser using XML buffer of size O(Event)
// Note that output buffer is O(Trace), since callers process complete traces
// Based on benchmarking results, it is not recommended to use any event-based parser due to overhead

export const RegexEventStreamParser = createParser(
  parseWithRegexUsingEventBuffer,
);

async function parseWithRegexUsingEventBuffer(
  file: File,
  onTrace: TraceCallback,
): Promise<void> {
  let traceAttributes: XesAttributes = {};
  let events: XesAttributes[] = [];

  for await (const eventOrTraceAttributeXml of getXesEventBlocks(file)) {
    const isTraceAttribute =
      !eventOrTraceAttributeXml.startsWith(EVENT_START_TAG);

    const attributes = extractAttributesWithRegex(eventOrTraceAttributeXml);

    if (isTraceAttribute) {
      if (events.length > 0) {
        onTrace({ traceAttributes, events });
      }
      traceAttributes = attributes;
      events = [];
    } else {
      events.push(attributes);
    }
  }

  if (events.length > 0) {
    onTrace({ traceAttributes, events });
  }
}
