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
  extractAttributesWithRegex,
  extractLogAttributesWithRegex,
} from "./lib/shared";

// Parser using XML buffer of size O(Event)
// Note that output buffer is O(Trace), since callers process complete traces
// Based on benchmarking results, it is not recommended to use any event-based parser due to overhead

export const RegexEventStreamParser = createParser(
  parseWithRegexUsingEventBuffer,
);

async function parseWithRegexUsingEventBuffer(
  file: File,
  onEvent: EventCallback,
  onLog?: LogCallback,
): Promise<void> {
  let traceAttributes: XesTraceAttributes = {};

  for await (const xml of getXesEventBlocks(file)) {
    const isLogAttributes = xml.startsWith(CUSTOM_LOG_ATTRIBUTES_START_TAG);
    if (isLogAttributes) {
      const header = extractLogAttributesWithRegex(xml);
      onLog?.(header);
      continue;
    }

    const isTraceAttribute = xml.startsWith(CUSTOM_TRACE_ATTRIBUTES_START_TAG);
    if (isTraceAttribute) {
      traceAttributes = extractAttributesWithRegex(xml);
    } else {
      const eventAttributes = extractAttributesWithRegex(xml);
      onEvent(traceAttributes, eventAttributes);
    }
  }
}
