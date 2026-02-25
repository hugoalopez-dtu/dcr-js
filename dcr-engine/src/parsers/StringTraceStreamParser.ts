import { createParser, type TraceCallback } from "./lib/factories";
import {
  type XesAttributes,
  EVENT_START_TAG,
  EVENT_END_TAG,
  getXesTraceBlocks,
  extractAttributesWithString,
  extractTraceAttributesXmlWithString,
} from "./lib/shared";

// Parser using XML buffer of size O(Trace)

export const StringTraceStreamParser = createParser(
  parseWithStringUsingTraceBuffer,
);

async function parseWithStringUsingTraceBuffer(
  file: File,
  onTrace: TraceCallback,
): Promise<void> {
  for await (const traceXml of getXesTraceBlocks(file)) {
    const traceAttributeXml = extractTraceAttributesXmlWithString(traceXml);

    const traceAttributes = extractAttributesWithString(traceAttributeXml);
    const events: XesAttributes[] = [];

    let eventStart = traceXml.indexOf(EVENT_START_TAG);
    while (eventStart !== -1) {
      const eventEnd = traceXml.indexOf(EVENT_END_TAG, eventStart);
      if (eventEnd === -1) {
        break;
      }

      const eventXml = traceXml.substring(
        eventStart + EVENT_START_TAG.length,
        eventEnd,
      );
      const eventAttributes = extractAttributesWithString(eventXml);
      events.push(eventAttributes);

      eventStart = traceXml.indexOf(EVENT_START_TAG, eventEnd);
    }

    if (events.length > 0) {
      onTrace({ traceAttributes, events });
    }
  }
}
