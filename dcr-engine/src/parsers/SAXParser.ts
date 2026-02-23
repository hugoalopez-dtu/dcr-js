import sax from "sax";
import { createParser, type TraceCallback } from "./lib/factories";
import {
  type XesAttributes,
  isAttributeTag,
  parseAttribute,
} from "./lib/shared";

export const SAXParser = createParser(parseWithSAX);

async function parseWithSAX(file: File, onTrace: TraceCallback): Promise<void> {
  const parser = sax.parser(true);

  let inTrace = false;
  let inEvent = false;
  let traceAttributes: XesAttributes = {};
  let eventAttributes: XesAttributes = {};
  let events: XesAttributes[] = [];

  parser.onopentag = (node) => {
    const tag = node.name;

    if (tag === "trace") {
      inTrace = true;
      traceAttributes = {};
      events = [];
    } else if (tag === "event" && inTrace) {
      inEvent = true;
      eventAttributes = {};
    } else if (isAttributeTag(tag) && inTrace) {
      const key = node.attributes.key;
      const value = node.attributes.value;
      if (typeof key === "string" && key !== "" && typeof value === "string") {
        const parsed = parseAttribute(tag, value);
        if (inEvent) {
          eventAttributes[key] = parsed;
        } else {
          traceAttributes[key] = parsed;
        }
      }
    }
  };

  parser.onclosetag = (tag) => {
    if (tag === "event" && inEvent) {
      events.push(eventAttributes);
      inEvent = false;
    } else if (tag === "trace" && inTrace) {
      if (events.length > 0) {
        onTrace({ traceAttributes, events });
      }
      inTrace = false;
    }
  };

  parser.onerror = (err) => {
    console.error("SAX parsing error:", err);
    parser.resume();
  };

  const reader = file.stream().pipeThrough(new TextDecoderStream()).getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      parser.write(value);
    }
  } finally {
    reader.releaseLock();
    parser.close();
  }
}
