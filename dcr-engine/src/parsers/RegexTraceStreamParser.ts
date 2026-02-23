import { createParser, type TraceCallback } from "./lib/factories";
import {
  type XesAttributes,
  getXesTraceBlocks,
  extractAttributesWithRegex,
  extractTraceAttributesXmlWithRegex,
} from "./lib/shared";

// Parser using XML buffer of size O(Trace)

export const RegexTraceStreamParser = createParser(
  parseWithRegexUsingTraceBuffer,
);

async function parseWithRegexUsingTraceBuffer(
  file: File,
  onTrace: TraceCallback,
): Promise<void> {
  for await (const traceXml of getXesTraceBlocks(file)) {
    const traceAttributeXml = extractTraceAttributesXmlWithRegex(traceXml);

    const traceAttributes = extractAttributesWithRegex(traceAttributeXml);
    const events: XesAttributes[] = [];

    const eventRegex = /<event>([\s\S]*?)<\/event>/g;
    let eventMatch;
    while ((eventMatch = eventRegex.exec(traceXml)) !== null) {
      const eventXml = eventMatch[1];
      const eventAttributes = extractAttributesWithRegex(eventXml);
      events.push(eventAttributes);
    }

    if (events.length > 0) {
      onTrace({ traceAttributes, events });
    }
  }
}
