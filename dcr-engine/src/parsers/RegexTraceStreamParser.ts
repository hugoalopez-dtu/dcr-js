import {
  type LogCallback,
  type EventCallback,
  createParser,
} from "./lib/factories";
import {
  CUSTOM_LOG_ATTRIBUTES_START_TAG,
  getXesTraceBlocks,
  extractAttributesWithRegex,
  extractTraceAttributesXmlWithRegex,
  extractLogAttributesWithRegex,
} from "./lib/shared";

// Parser using XML buffer of size O(Trace)

export const RegexTraceStreamParser = createParser(
  parseWithRegexUsingTraceBuffer,
);

async function parseWithRegexUsingTraceBuffer(
  file: File,
  onEvent: EventCallback,
  onLog?: LogCallback,
): Promise<void> {
  for await (const xml of getXesTraceBlocks(file)) {
    const isLogAttributes = xml.startsWith(CUSTOM_LOG_ATTRIBUTES_START_TAG);
    if (isLogAttributes) {
      const header = extractLogAttributesWithRegex(xml);
      onLog?.(header);
      continue;
    }

    const traceAttributeXml = extractTraceAttributesXmlWithRegex(xml);
    const traceAttributes = extractAttributesWithRegex(traceAttributeXml);

    const eventRegex = /<event>([\s\S]*?)<\/event>/g;
    let eventMatch;
    while ((eventMatch = eventRegex.exec(xml)) !== null) {
      const eventXml = eventMatch[1];
      const eventAttributes = extractAttributesWithRegex(eventXml);
      onEvent(traceAttributes, eventAttributes);
    }
  }
}
