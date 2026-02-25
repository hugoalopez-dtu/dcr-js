import sax from "sax";
import {
  type LogCallback,
  type EventCallback,
  createParser,
} from "./lib/factories";
import {
  type XesTraceAttributes,
  type XesEventAttributes,
  type XesEventClassifiers,
  isScalarAttributeTag,
  parseAttribute,
} from "./lib/shared";

export const SAXParser = createParser(parseWithSAX);

async function parseWithSAX(
  file: File,
  onEvent: EventCallback,
  onLog?: LogCallback,
): Promise<void> {
  const parser = sax.parser(true);
  let preamble = true;

  let inTrace = false;
  let inEvent = false;
  let inGlobalEvent = false;
  let traceAttributes: XesTraceAttributes = {};
  let eventAttributes: XesEventAttributes = {};

  const globalEventAttributes: XesEventAttributes = {};
  const classifiers: XesEventClassifiers = {};

  parser.onopentag = (node) => {
    const tag = node.name;

    if (tag === "global") {
      const scope = node.attributes.scope;
      if (scope === "event") {
        inGlobalEvent = true;
      }
    } else if (tag === "classifier") {
      const name = node.attributes.name;
      const keys = node.attributes.keys;
      if (typeof name === "string" && typeof keys === "string") {
        classifiers[name] = keys;
      }
    } else if (isScalarAttributeTag(tag) && inGlobalEvent) {
      const key = node.attributes.key;
      const value = node.attributes.value;
      if (typeof key === "string" && key !== "" && typeof value === "string") {
        globalEventAttributes[key] = parseAttribute(tag, value);
      }
    } else if (tag === "trace") {
      if (preamble) {
        preamble = false;
        onLog?.({ globalEventAttributes, eventClassifiers: classifiers });
      }

      inTrace = true;
      traceAttributes = {};
    } else if (tag === "event" && inTrace) {
      inEvent = true;
      eventAttributes = {};
    } else if (isScalarAttributeTag(tag) && inTrace) {
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
    if (tag === "global" && inGlobalEvent) {
      inGlobalEvent = false;
    } else if (tag === "event" && inEvent) {
      onEvent(traceAttributes, eventAttributes);
      inEvent = false;
    } else if (tag === "trace" && inTrace) {
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
