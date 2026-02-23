import { createParser, type TraceCallback } from "./lib/factories";
import {
  type XesAttributes,
  getXesTraceBlocks,
  extractAttributesWithDOM,
} from "./lib/shared";

// Parser using XML buffer of size O(Trace)

export const DOMTraceStreamParser = createParser(parseWithDOMUsingTraceBuffer);

async function parseWithDOMUsingTraceBuffer(
  file: File,
  onTrace: TraceCallback,
): Promise<void> {
  const parser = new DOMParser();

  for await (const traceXml of getXesTraceBlocks(file)) {
    const document = parser.parseFromString(traceXml, "application/xml");
    const traceNode = document.documentElement;

    const events: XesAttributes[] = [];

    const traceAttributes = extractAttributesWithDOM(traceNode, (eventNode) => {
      const eventAttributes = extractAttributesWithDOM(eventNode);
      events.push(eventAttributes);
    });

    if (events.length > 0) {
      onTrace({ traceAttributes, events });
    }
  }
}
