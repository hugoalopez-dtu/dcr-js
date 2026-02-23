export type XesAttribute = string | number | boolean;
export type XesAttributes = Record<string, XesAttribute>;

export interface ParsedTrace {
  traceAttributes: XesAttributes;
  events: XesAttributes[];
}

export const TAG_NAMES = new Set(["string", "date", "int", "float", "boolean"]);

export function isAttributeTag(tagName: string) {
  return TAG_NAMES.has(tagName);
}

export function parseAttribute(type: string, value: string): XesAttribute {
  switch (type) {
    case "date":
      return Date.parse(value);
    case "int":
      return parseInt(value, 10);
    case "float":
      return parseFloat(value);
    case "boolean":
      return value.toLowerCase() === "true";
    default:
      return value;
  }
}

export const TRACE_START_TAG = "<trace>";
export const TRACE_END_TAG = "</trace>";
export const EVENT_START_TAG = "<event>";
export const EVENT_END_TAG = "</event>";

export async function* getXesTraceBlocks(file: File) {
  const reader = file.stream().pipeThrough(new TextDecoderStream()).getReader();

  try {
    let buffer = "";
    let cursor = 0;

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      if (cursor > 0) {
        buffer = buffer.substring(cursor);
        cursor = 0;
      }

      buffer += value;

      let traceStart = buffer.indexOf(TRACE_START_TAG, cursor);
      while (traceStart !== -1) {
        const traceEnd = buffer.indexOf(TRACE_END_TAG, traceStart);

        if (traceEnd !== -1) {
          // Yield full <trace>...</trace>
          yield buffer.substring(traceStart, traceEnd + TRACE_END_TAG.length);

          // Advance cursor to just after </trace>
          cursor = traceEnd + TRACE_END_TAG.length;

          // Check for next <trace> after cursor
          traceStart = buffer.indexOf(TRACE_START_TAG, cursor);
        } else {
          // No full <trace>...</trace>, need to read more chunks
          break;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function* getXesEventBlocks(file: File) {
  const reader = file.stream().pipeThrough(new TextDecoderStream()).getReader();

  try {
    let buffer = "";
    let cursor = 0;

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      if (cursor > 0) {
        buffer = buffer.substring(cursor);
        cursor = 0;
      }

      buffer += value;

      let eventStart = buffer.indexOf(EVENT_START_TAG, cursor);
      while (eventStart !== -1) {
        const traceStart = buffer.indexOf(TRACE_START_TAG, cursor);
        if (traceStart !== -1 && traceStart < eventStart) {
          // Yield trace attributes between <trace> and first <event>
          yield `<_traceAttributes>${buffer.substring(traceStart + TRACE_START_TAG.length, eventStart)}</_traceAttributes>`;

          // Advance cursor to just before first <event> so we don't yield <trace> again, if we don't find full <event>...</event> in this chunk
          cursor = eventStart;
        }

        const eventEnd = buffer.indexOf(EVENT_END_TAG, eventStart);
        if (eventEnd !== -1) {
          // Yield full <event>...</event>
          yield buffer.substring(eventStart, eventEnd + EVENT_END_TAG.length);

          // Advance cursor to just after </event>
          cursor = eventEnd + EVENT_END_TAG.length;

          // Check for next <event> after cursor
          eventStart = buffer.indexOf(EVENT_START_TAG, cursor);
        } else {
          // No full <event>...</event>, need to read more chunks
          break;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export function extractTraceAttributesXmlWithRegex(xml: string) {
  const traceAttributesMatch = /<trace>([\s\S]*?)<event>/.exec(xml);
  if (!traceAttributesMatch) {
    return "";
  }
  return traceAttributesMatch[1];
}

export function extractTraceAttributesXmlWithString(xml: string) {
  const traceStartIdx = xml.indexOf(TRACE_START_TAG);
  const firstEventStartIdx = xml.indexOf(EVENT_START_TAG);
  if (traceStartIdx === -1 || firstEventStartIdx === -1) {
    return "";
  }

  return xml.substring(
    traceStartIdx + TRACE_START_TAG.length,
    firstEventStartIdx,
  );
}

export function extractAttributesWithDOM(
  parent: Element,
  onEvent?: (eventElement: Element) => void,
): XesAttributes {
  const attributes: XesAttributes = {};
  let node = parent.firstElementChild;
  while (node) {
    if (isAttributeTag(node.tagName)) {
      const key = node.getAttribute("key");
      const value = node.getAttribute("value");
      if (typeof key === "string" && key !== "" && typeof value === "string") {
        attributes[key] = parseAttribute(node.tagName, value);
      }
    } else if (onEvent && node.tagName === "event") {
      onEvent(node);
    }
    node = node.nextElementSibling;
  }
  return attributes;
}

export function extractAttributesWithRegex(xml: string) {
  const attributes: XesAttributes = {};

  const attributeRegex = /<(string|date|int|float|boolean)\s+([^>]+?)>/g;
  let attributeMatch;
  while ((attributeMatch = attributeRegex.exec(xml)) !== null) {
    const type = attributeMatch[1];
    if (!isAttributeTag(type)) {
      continue;
    }

    const searchString = attributeMatch[2];

    const keyMatch = /key="([^"]*)"/.exec(searchString);
    if (!keyMatch) {
      continue;
    }

    const key = keyMatch[1];
    if (key === "") {
      continue;
    }

    const valueMatch = /value="([^"]*)"/.exec(searchString);
    if (!valueMatch) {
      continue;
    }

    const value = valueMatch[1];

    attributes[key] = parseAttribute(type, value);
  }

  return attributes;
}

const TAG_OPEN = "<";
const TAG_CLOSE = ">";
const KEY_ATTRIBUTE_OPEN = 'key="';
const VALUE_ATTRIBUTE_OPEN = 'value="';
const ATTRIBUTE_CLOSE = '"';

export function extractAttributesWithString(xml: string) {
  const attributes: XesAttributes = {};

  let position = 0;
  while ((position = xml.indexOf(TAG_OPEN, position)) !== -1) {
    const end = xml.indexOf(TAG_CLOSE, position);
    if (end === -1) {
      break;
    }

    const tag = xml.substring(position + TAG_OPEN.length, end);
    position = end + TAG_CLOSE.length;

    let firstWhitespaceIdx = -1;
    for (let i = 0; i < tag.length; i++) {
      const char = tag[i];
      if (char === " " || char === "\t" || char === "\n" || char === "\r") {
        firstWhitespaceIdx = i;
        break;
      }
    }

    if (firstWhitespaceIdx === -1) {
      continue;
    }

    const type = tag.substring(0, firstWhitespaceIdx);
    if (!isAttributeTag(type)) {
      continue;
    }

    const keyIdx = tag.indexOf(KEY_ATTRIBUTE_OPEN);
    if (keyIdx === -1) {
      continue;
    }

    const keyStart = keyIdx + KEY_ATTRIBUTE_OPEN.length;
    const keyEnd = tag.indexOf(ATTRIBUTE_CLOSE, keyStart);
    const key = tag.substring(keyStart, keyEnd);
    if (key === "") {
      continue;
    }

    const valueIdx = tag.indexOf(VALUE_ATTRIBUTE_OPEN);
    if (valueIdx === -1) {
      continue;
    }

    const valueStart = valueIdx + VALUE_ATTRIBUTE_OPEN.length;
    const valueEnd = tag.indexOf(ATTRIBUTE_CLOSE, valueStart);
    const value = tag.substring(valueStart, valueEnd);

    attributes[key] = parseAttribute(type, value);
  }

  return attributes;
}
