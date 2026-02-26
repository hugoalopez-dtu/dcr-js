import {
  type LogCallback,
  type EventCallback,
  createParser,
} from "./lib/factories";
import {
  type XesTraceAttributes,
  CUSTOM_LOG_ATTRIBUTES_START_TAG,
  CUSTOM_TRACE_ATTRIBUTES_START_TAG,
  getXesEventBlocks,
  extractAttributesWithDOM,
  extractLogAttributesWithDOM,
} from "./lib/shared";

// Parser using XML buffer of size O(Event)
// Note that output buffer is O(Trace), since callers process complete traces
// Based on benchmarking results, it is not recommended to use any event-based parser due to overhead

export const DOMEventStreamParser = createParser(parseWithDOMUsingEventBuffer);

async function parseWithDOMUsingEventBuffer(
  file: File,
  onEvent: EventCallback,
  onLog?: LogCallback,
): Promise<void> {
  const parser = new DOMParser();

  let traceAttributes: XesTraceAttributes = {};

  for await (const xml of getXesEventBlocks(file)) {
    const document = parser.parseFromString(xml, "application/xml");
    const node = document.documentElement;

    const isLogAttributes = xml.startsWith(CUSTOM_LOG_ATTRIBUTES_START_TAG);
    if (isLogAttributes) {
      const header = extractLogAttributesWithDOM(node);
      onLog?.(header);
      continue;
    }

    const isTraceAttribute = xml.startsWith(CUSTOM_TRACE_ATTRIBUTES_START_TAG);
    if (isTraceAttribute) {
      traceAttributes = extractAttributesWithDOM(node);
    } else {
      const eventAttributes = extractAttributesWithDOM(node);
      onEvent(traceAttributes, eventAttributes);
    }
  }
}
