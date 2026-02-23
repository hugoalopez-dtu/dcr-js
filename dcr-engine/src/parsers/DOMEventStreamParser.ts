import { createParser, type TraceCallback } from "./lib/factories";
import {
  type XesAttributes,
  EVENT_START_TAG,
  getXesEventBlocks,
  extractAttributesWithDOM,
} from "./lib/shared";

// Parser using XML buffer of size O(Event)
// Note that output buffer is O(Trace), since callers process complete traces
// Based on benchmarking results, it is not recommended to use any event-based parser due to overhead

export const DOMEventStreamParser = createParser(parseWithDOMUsingEventBuffer);

async function parseWithDOMUsingEventBuffer(
  file: File,
  onTrace: TraceCallback,
): Promise<void> {
  let traceAttributes: XesAttributes = {};
  let events: XesAttributes[] = [];

  const parser = new DOMParser();

  for await (const eventOrTraceAttributeXml of getXesEventBlocks(file)) {
    const isTraceAttribute =
      !eventOrTraceAttributeXml.startsWith(EVENT_START_TAG);

    const document = parser.parseFromString(
      eventOrTraceAttributeXml,
      "application/xml",
    );
    const eventOrTraceAttributeNode = document.documentElement;

    const attributes = extractAttributesWithDOM(eventOrTraceAttributeNode);

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
