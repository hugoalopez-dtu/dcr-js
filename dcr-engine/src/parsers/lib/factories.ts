import type {
  EventLog,
  Trace,
  RoleTrace,
  BinaryLog,
  ClassifiedTraces,
  Event,
} from "../../types";
import { generateId } from "../../utility";
import type {
  XesLogAttributes,
  XesTraceAttributes,
  XesEventAttributes,
} from "./shared";

export type EventCallback = (
  traceAttributes: XesTraceAttributes,
  eventAttributes: XesEventAttributes,
) => void;

export type LogCallback = (logAttributes: XesLogAttributes) => void;

export type EventIterator = (
  file: File,
  onEvent: EventCallback,
  onLog?: LogCallback,
) => Promise<void>;

export function createParser(iterate: EventIterator) {
  return {
    parseAsNonRoleLog: createParseAsNonRoleLog(iterate),
    parseAsRoleLog: createParseAsRoleLog(iterate),
    parseAsBinaryLog: createParseAsBinaryLog(iterate),
  };
}

function getTraceId(traceAttributes: XesTraceAttributes): string {
  if ("concept:name" in traceAttributes) {
    return String(traceAttributes["concept:name"]);
  }

  return String(generateId());
}

// This is a custom attribute used in binary log classification
function getTraceLabel(traceAttributes: XesTraceAttributes): string | null {
  if ("label" in traceAttributes) {
    return String(traceAttributes["label"]);
  }

  return null;
}

function getClassifierKeys(rawKeys: string, validKeys: Set<string>): string[] {
  const candidates: string[] = [];
  const segments = rawKeys.split("'");
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (i % 2 === 1) {
      if (segment !== "") candidates.push(segment);
    } else {
      for (const part of segment.split(" ")) {
        if (part !== "") candidates.push(part);
      }
    }
  }

  const resolved: string[] = [];
  let i = 0;
  while (i < candidates.length) {
    if (validKeys.has(candidates[i])) {
      resolved.push(candidates[i]);
      i++;
    } else if (i + 1 < candidates.length) {
      const merged = candidates[i] + " " + candidates[i + 1];
      if (validKeys.has(merged)) {
        resolved.push(merged);
        i += 2;
      } else {
        resolved.push(candidates[i]);
        i++;
      }
    } else {
      resolved.push(candidates[i]);
      i++;
    }
  }

  return resolved.sort();
}

function createEventClassifier(
  logAttributes: XesLogAttributes,
  classifierName: string,
): (eventAttributes: XesEventAttributes) => string {
  const { globalEventAttributes, eventClassifiers } = logAttributes;
  const validKeys = new Set(Object.keys(globalEventAttributes));

  let rawKeys: string | undefined;
  if (classifierName in eventClassifiers) {
    rawKeys = eventClassifiers[classifierName];
  } else {
    const names = Object.keys(eventClassifiers);
    if (names.length > 0) {
      rawKeys = eventClassifiers[names[0]];
    }
  }

  const classifierKeys = rawKeys
    ? getClassifierKeys(rawKeys, validKeys)
    : ["concept:name"];

  return (eventAttributes) =>
    classifierKeys
      .map((k) => String(eventAttributes[k] ?? globalEventAttributes[k] ?? ""))
      .join(":");
}

function getDefaultEventClassifier(
  eventAttributes: XesEventAttributes,
  fallbackEventAttributes: XesEventAttributes = {},
): string {
  if (
    "concept:name" in eventAttributes &&
    eventAttributes["concept:name"] !== ""
  ) {
    return String(eventAttributes["concept:name"]);
  }

  if (
    "concept:name" in fallbackEventAttributes &&
    fallbackEventAttributes["concept:name"] !== ""
  ) {
    return String(fallbackEventAttributes["concept:name"]);
  }

  console.warn("No classifier found for event");
  return "";
}

// TODO: Should this be "org:role" - DCR.js currently uses a custom "role" attribute - also in generated logs
function getRole(
  eventAttributes: XesEventAttributes,
  fallbackEventAttributes: XesEventAttributes = {},
): string | null {
  if ("role" in eventAttributes) {
    return String(eventAttributes["role"]);
  }

  if ("role" in fallbackEventAttributes) {
    return String(fallbackEventAttributes["role"]);
  }

  return null;
}

export function createParseAsNonRoleLog(
  iterate: EventIterator,
): (file: File, classifierName?: string) => Promise<EventLog<Trace>> {
  return async (file, classifierName = "Event Name") => {
    let getEventClassifier = getDefaultEventClassifier;
    const log: EventLog<Trace> = { events: new Set(), traces: {} };

    await iterate(
      file,
      (traceAttributes, eventAttributes) => {
        const traceId = getTraceId(traceAttributes);

        // This is corrosponds to how eventLogs.ts defines activity,
        // which in practice ends up being concept:name
        const activity = getEventClassifier(eventAttributes);

        if (!(traceId in log.traces)) {
          log.traces[traceId] = [];
        }
        log.traces[traceId].push(activity);

        if (!log.events.has(activity)) {
          log.events.add(activity);
        }
      },
      (logAttributes) => {
        getEventClassifier = createEventClassifier(
          logAttributes,
          classifierName,
        );
      },
    );

    return log;
  };
}

export function createParseAsRoleLog(
  iterate: EventIterator,
): (file: File, classifierName?: string) => Promise<EventLog<RoleTrace>> {
  return async (file, classifierName = "Event Name") => {
    let globalEventAttributes: XesEventAttributes = {};
    let getEventClassifier = getDefaultEventClassifier;
    const log: EventLog<RoleTrace> = { events: new Set(), traces: {} };

    await iterate(
      file,
      (traceAttributes, eventAttributes) => {
        const traceId = getTraceId(traceAttributes);

        // This is corrosponds to how eventLogs.ts defines activity,
        // which in practice ends up being concept:name
        const activity = getEventClassifier(eventAttributes);
        const role = getRole(eventAttributes, globalEventAttributes) ?? "";

        if (!(traceId in log.traces)) {
          log.traces[traceId] = [];
        }
        log.traces[traceId].push({ activity, role });

        if (!log.events.has(activity)) {
          log.events.add(activity);
        }
      },
      (logAttributes) => {
        globalEventAttributes = logAttributes.globalEventAttributes;
        getEventClassifier = createEventClassifier(
          logAttributes,
          classifierName,
        );
      },
    );

    return log;
  };
}

export function createParseAsBinaryLog(iterate: EventIterator): (
  file: File,
  positiveClassifier: string,
  classifierName?: string,
) => Promise<{
  trainingLog: BinaryLog;
  testLog: EventLog<Trace>;
  gtLog: ClassifiedTraces;
}> {
  return async (file, positiveClassifier, classifierName = "Event Name") => {
    let getEventClassfier = getDefaultEventClassifier;

    const trainingLog: BinaryLog = {
      events: new Set<Event>(),
      traces: {},
      nTraces: {},
    };

    const testLog: EventLog<Trace> = {
      events: new Set<Event>(),
      traces: {},
    };

    const gtLog: ClassifiedTraces = {};

    await iterate(
      file,
      (traceAttributes, eventAttributes) => {
        const traceId = getTraceId(traceAttributes);
        const traceLabel = getTraceLabel(traceAttributes);

        if (!traceId || !traceLabel) {
          throw new Error("No trace id or label found!");
        }

        // This is corrosponds to how eventLogs.ts defines activity,
        // which in practice ends up being concept:name
        const activity = getEventClassfier(eventAttributes);

        trainingLog.events.add(activity);
        if (traceLabel === positiveClassifier) {
          if (!(traceId in trainingLog.traces)) {
            trainingLog.traces[traceId] = [];
          }
          trainingLog.traces[traceId].push(activity);
        } else {
          if (!(traceId in trainingLog.nTraces)) {
            trainingLog.nTraces[traceId] = [];
          }
          trainingLog.nTraces[traceId].push(activity);
        }

        testLog.events.add(activity);
        if (!(traceId in testLog.traces)) {
          testLog.traces[traceId] = [];
        }
        testLog.traces[traceId].push(activity);

        gtLog[traceId] = traceLabel === positiveClassifier;
      },
      (logAttributes) => {
        getEventClassfier = createEventClassifier(
          logAttributes,
          classifierName,
        );
      },
    );

    return { trainingLog, testLog, gtLog };
  };
}
