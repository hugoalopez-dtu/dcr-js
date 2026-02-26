import {
  type LogCallback,
  type EventCallback,
  createParser,
} from "./lib/factories";
import {
  CUSTOM_LOG_ATTRIBUTES_START_TAG,
  getXesTraceBlocks,
  extractAttributesWithDOM,
  extractLogAttributesWithDOM,
} from "./lib/shared";

// Parser using XML buffer of size O(Trace)

export const DOMTraceStreamParser = createParser(parseWithDOMUsingTraceBuffer);

async function parseWithDOMUsingTraceBuffer(
  file: File,
  onEvent: EventCallback,
  onLog?: LogCallback,
): Promise<void> {
  const parser = new DOMParser();

  for await (const xml of getXesTraceBlocks(file)) {
    const document = parser.parseFromString(xml, "application/xml");
    const node = document.documentElement;

    const isLogAttributes = xml.startsWith(CUSTOM_LOG_ATTRIBUTES_START_TAG);
    if (isLogAttributes) {
      const header = extractLogAttributesWithDOM(node);
      onLog?.(header);
      continue;
    }

    const traceAttributes = extractAttributesWithDOM(node);

    let child = node.firstElementChild;
    while (child) {
      if (child.tagName === "event") {
        const eventAttributes = extractAttributesWithDOM(child);
        onEvent(traceAttributes, eventAttributes);
      }
      child = child.nextElementSibling;
    }
  }
}
