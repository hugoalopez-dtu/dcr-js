// TODO: Add extraction support for "nested-attributes" extension, and "container" and "list" attributes,
//       which will require modifying below types and extraction functions.

export type XesEventClassifiers = {
  [name: string]: string; // keys
};

export type XesAttribute =
  | string // string
  | number // date, int, float
  | boolean; // boolean

export type XesAttributes = {
  [key: string]: XesAttribute;
};

export type XesLogAttributes = {
  globalEventAttributes: XesEventAttributes;
  eventClassifiers: XesEventClassifiers;
};

export type XesTraceAttributes = XesAttributes;

export type XesEventAttributes = XesAttributes;

export const SCALAR_TAG_NAMES = new Set([
  "string",
  "date",
  "int",
  "float",
  "boolean",
  "id",
]);

export function isScalarAttributeTag(tagName: string) {
  return SCALAR_TAG_NAMES.has(tagName);
}

export function parseAttribute(
  type: string,
  value: string,
): Exclude<XesAttribute, XesAttribute[]> {
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
      return value; // string, id
  }
}

export const TRACE_START_TAG = "<trace>";
export const TRACE_END_TAG = "</trace>";
export const EVENT_START_TAG = "<event>";
export const EVENT_END_TAG = "</event>";

export const CUSTOM_LOG_ATTRIBUTES_START_TAG = "<_logAttributes>";
export const CUSTOM_LOG_ATTRIBUTES_END_TAG = "</_logAttributes>";
export const CUSTOM_TRACE_ATTRIBUTES_START_TAG = "<_traceAttributes>";
export const CUSTOM_TRACE_ATTRIBUTES_END_TAG = "</_traceAttributes>";

export async function* getXesTraceBlocks(file: File) {
  const reader = file.stream().pipeThrough(new TextDecoderStream()).getReader();

  try {
    let buffer = "";
    let cursor = 0;
    let preamble = true;

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
        if (preamble) {
          preamble = false;

          const logStart = buffer.indexOf("<log", cursor);
          if (logStart !== -1) {
            const logStartEnd = buffer.indexOf(">", logStart);
            if (logStartEnd !== -1) {
              // Yield log attributes between <log> and first <trace>
              yield `${CUSTOM_LOG_ATTRIBUTES_START_TAG}${buffer.substring(logStartEnd + 1, traceStart)}${CUSTOM_LOG_ATTRIBUTES_END_TAG}`;
            }
          }
        }

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
    let preamble = true;

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
          if (preamble) {
            preamble = false;

            const logStart = buffer.indexOf("<log", cursor);
            if (logStart !== -1) {
              const logStartEnd = buffer.indexOf(">", logStart);
              if (logStartEnd !== -1) {
                // Yield log attributes between <log> and first <trace>
                yield `${CUSTOM_LOG_ATTRIBUTES_START_TAG}${buffer.substring(logStartEnd + 1, traceStart)}${CUSTOM_LOG_ATTRIBUTES_END_TAG}`;
              }
            }
          }

          // Yield trace attributes between <trace> and first <event>
          yield `${CUSTOM_TRACE_ATTRIBUTES_START_TAG}${buffer.substring(traceStart + TRACE_START_TAG.length, eventStart)}${CUSTOM_TRACE_ATTRIBUTES_END_TAG}`;

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

export function extractAttributesWithDOM(parent: Element): XesAttributes {
  const attributes: XesAttributes = {};
  let node = parent.firstElementChild;
  while (node) {
    if (isScalarAttributeTag(node.tagName)) {
      const key = node.getAttribute("key");
      const value = node.getAttribute("value");
      if (typeof key === "string" && key !== "" && typeof value === "string") {
        attributes[key] = parseAttribute(node.tagName, value);
      }
    } else if (node.tagName === "event" || node.tagName === "trace") {
      // Per spec, attributes comes before <event> or <trace> at the same level
      break;
    }
    node = node.nextElementSibling;
  }
  return attributes;
}

export function extractAttributesWithRegex(xml: string) {
  const attributes: XesAttributes = {};

  const attributeRegex =
    /<(string|date|int|float|boolean|id)\s+([^>]+?)(?:\/>|>[\s\S]*?<\/\1>)/g;
  let attributeMatch;
  while ((attributeMatch = attributeRegex.exec(xml)) !== null) {
    const type = attributeMatch[1];
    if (!isScalarAttributeTag(type)) {
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

export function extractAttributesWithString(xml: string) {
  const attributes: XesAttributes = {};

  let position = 0;
  while ((position = xml.indexOf("<", position)) !== -1) {
    const end = xml.indexOf(">", position);
    if (end === -1) {
      break;
    }

    const tag = xml.substring(position + "<".length, end);
    position = end + ">".length;

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
    if (!isScalarAttributeTag(type)) {
      continue;
    }

    const keyIdx = tag.indexOf('key="');
    if (keyIdx === -1) {
      continue;
    }

    const keyStart = keyIdx + 'key="'.length;
    const keyEnd = tag.indexOf('"', keyStart);
    if (keyEnd === -1) {
      continue;
    }

    const key = tag.substring(keyStart, keyEnd);
    if (key === "") {
      continue;
    }

    const valueIdx = tag.indexOf('value="');
    if (valueIdx === -1) {
      continue;
    }

    const valueStart = valueIdx + 'value="'.length;
    const valueEnd = tag.indexOf('"', valueStart);
    if (valueEnd === -1) {
      continue;
    }

    const value = tag.substring(valueStart, valueEnd);

    attributes[key] = parseAttribute(type, value);

    const isSelfClosing = tag.endsWith("/");
    if (!isSelfClosing) {
      const closingTag = `</${type}>`;
      const closingIdx = xml.indexOf(closingTag, position);
      if (closingIdx !== -1) {
        position = closingIdx + closingTag.length;
      }
    }
  }

  return attributes;
}

export function extractLogAttributesWithDOM(parent: Element): XesLogAttributes {
  let globalEventAttributes: XesEventAttributes = {};
  const classifiers: XesEventClassifiers = {};

  let node = parent.firstElementChild;
  while (node) {
    if (node.tagName === "global") {
      const scope = node.getAttribute("scope");
      if (scope === "event") {
        globalEventAttributes = extractAttributesWithDOM(node);
      }
    } else if (node.tagName === "classifier") {
      const name = node.getAttribute("name");
      const keys = node.getAttribute("keys");
      if (name && name !== "" && keys) {
        classifiers[name] = keys;
      }
    } else if (node.tagName === "trace") {
      // Per spec, no more globals or classifiers after first trace
      break;
    }
    node = node.nextElementSibling;
  }

  return { globalEventAttributes, eventClassifiers: classifiers };
}

export function extractLogAttributesWithRegex(xml: string): XesLogAttributes {
  let globalEventAttributes: XesEventAttributes = {};
  const classifiers: XesEventClassifiers = {};

  // Per spec, <global> comes before <classifier>, so search <global> first
  const globalRegex = /<global\s+scope="event"\s*>([\s\S]*?)<\/global>/g;
  let globalMatch;
  while ((globalMatch = globalRegex.exec(xml)) !== null) {
    globalEventAttributes = extractAttributesWithRegex(globalMatch[1]);
  }

  // Per spec, <classifier> comes after <global>, so continue from current position
  const classifierRegex = /<classifier\s+([^>]+?)\/?\s*>/g;
  classifierRegex.lastIndex = globalRegex.lastIndex;
  let classifierMatch;
  while ((classifierMatch = classifierRegex.exec(xml)) !== null) {
    const attrs = classifierMatch[1];
    const nameMatch = /name="([^"]*)"/.exec(attrs);
    const keysMatch = /keys="([^"]*)"/.exec(attrs);
    if (nameMatch && nameMatch[1] !== "" && keysMatch) {
      classifiers[nameMatch[1]] = keysMatch[1];
    }
  }

  return {
    globalEventAttributes,
    eventClassifiers: classifiers,
  };
}

export function extractLogAttributesWithString(xml: string): XesLogAttributes {
  let globalEventAttributes: XesEventAttributes = {};
  const classifiers: XesEventClassifiers = {};

  // Per spec, <global> comes before <classifier>, so search <global> first
  let position = 0;
  while ((position = xml.indexOf("<global", position)) !== -1) {
    const globalTagEnd = xml.indexOf(">", position);
    if (globalTagEnd === -1) {
      break;
    }

    const globalTag = xml.substring(position, globalTagEnd + ">".length);
    position = globalTagEnd + ">".length;

    if (!globalTag.includes('scope="event"')) {
      continue;
    }

    const globalClose = xml.indexOf("</global>", globalTagEnd);
    if (globalClose === -1) {
      continue;
    }

    const globalContent = xml.substring(position, globalClose);
    globalEventAttributes = extractAttributesWithString(globalContent);

    position = globalClose + "</global>".length;
  }

  // Per spec, <classifier> comes after <global>, so continue from current position
  while ((position = xml.indexOf("<classifier", position)) !== -1) {
    const classifierEnd = xml.indexOf(">", position);
    if (classifierEnd === -1) {
      break;
    }

    const tag = xml.substring(position, classifierEnd + ">".length);
    position = classifierEnd + ">".length;

    const nameIdx = tag.indexOf('name="');
    if (nameIdx === -1) {
      continue;
    }

    const nameStart = nameIdx + 'name="'.length;
    const nameEnd = tag.indexOf('"', nameStart);
    if (nameEnd === -1) {
      continue;
    }

    const name = tag.substring(nameStart, nameEnd);
    if (name === "") {
      continue;
    }

    const keysIdx = tag.indexOf('keys="');
    if (keysIdx === -1) {
      continue;
    }

    const keysStart = keysIdx + 'keys="'.length;
    const keysEnd = tag.indexOf('"', keysStart);
    if (keysEnd === -1) {
      continue;
    }

    const keys = tag.substring(keysStart, keysEnd);

    classifiers[name] = keys;
  }

  return { globalEventAttributes, eventClassifiers: classifiers };
}
