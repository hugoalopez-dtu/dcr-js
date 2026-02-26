import {
  type LogCallback,
  type EventCallback,
  createParser,
} from "./lib/factories";
import {
  CUSTOM_LOG_ATTRIBUTES_START_TAG,
  EVENT_START_TAG,
  EVENT_END_TAG,
  getXesTraceBlocks,
  extractAttributesWithString,
  extractTraceAttributesXmlWithString,
  extractLogAttributesWithString,
} from "./lib/shared";

// Parser using XML buffer of size O(Trace)

export const StringTraceStreamParser = createParser(
  parseWithStringUsingTraceBuffer,
);

async function parseWithStringUsingTraceBuffer(
  file: File,
  onEvent: EventCallback,
  onLog?: LogCallback,
): Promise<void> {
  for await (const xml of getXesTraceBlocks(file)) {
    const isLogAttributes = xml.startsWith(CUSTOM_LOG_ATTRIBUTES_START_TAG);
    if (isLogAttributes) {
      const header = extractLogAttributesWithString(xml);
      onLog?.(header);
      continue;
    }

    const traceAttributeXml = extractTraceAttributesXmlWithString(xml);
    const traceAttributes = extractAttributesWithString(traceAttributeXml);

    let eventStart = xml.indexOf(EVENT_START_TAG);
    while (eventStart !== -1) {
      const eventEnd = xml.indexOf(EVENT_END_TAG, eventStart);
      if (eventEnd === -1) {
        break;
      }

      const eventXml = xml.substring(
        eventStart + EVENT_START_TAG.length,
        eventEnd,
      );
      const eventAttributes = extractAttributesWithString(eventXml);
      onEvent(traceAttributes, eventAttributes);

      eventStart = xml.indexOf(EVENT_START_TAG, eventEnd);
    }
  }
}
