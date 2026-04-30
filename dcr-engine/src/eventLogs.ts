import { XMLParser, XMLBuilder } from "fast-xml-parser";
import { EventLog, Event, XMLLog, XMLEvent, RoleTrace, BinaryLog, ClassifiedTraces, Trace } from "./types";

export const parserOptions = {
  attributeNamePrefix: "",
  attrNodeName: "attr",
  textNodeName: "#text",
  ignoreAttributes: false,
  ignoreNameSpace: false,
  allowBooleanAttributes: false,
  parseNodeValue: true,
  parseAttributeValue: true,
  trimValues: true,
  parseTrueNumberOnly: false,
  arrayMode: true,
  stopNodes: ["parse-me-as-string"],
};

const writingOptions = {
  attributeNamePrefix: "@",
  ignoreAttributes: false,
  format: true,
  arrayMode: false,
  indentBy: "  ",
  supressEmptyNode: true,
};

const toArray = <T>(value: T | T[] | undefined | null): T[] => {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
};

const getNodeField = (node: any, field: string): unknown => {
  if (!node) return undefined;
  return node.attr?.[field] ?? node[field];
};

const collectXesAttributes = (node: any): any[] => {
  return ["string", "date", "float", "int", "boolean"]
    .flatMap((key) => toArray(node?.[key]));
};

const getXesAttributeValue = (
  attributes: any[],
  key: string,
): string | undefined => {
  const match = attributes.find((attr) => getNodeField(attr, "key") === key);
  const value = match ? getNodeField(match, "value") : undefined;
  return value === undefined ? undefined : String(value);
};

// Parse .xes file to an EventLog
export const parseLog = (
  data: string,
  classifierName: string = "Event Name",
): EventLog<RoleTrace> => {
  // Update: Initialize XMLParser instance (v4)
  const parserInstance = new XMLParser(parserOptions);
  const logJson = parserInstance.parse(data.toString());
  const logRoot = Array.isArray(logJson.log) ? logJson.log[0] : logJson.log;
  
  const log: EventLog<RoleTrace> = {
    events: new Set<Event>(),
    traces: {},
  };

  let keys = "";
  // Check if log and classifier exist to avoid runtime errors
  if (logRoot?.classifier) {
    for (const classifier of toArray(logRoot.classifier)) {
      if (getNodeField(classifier, "name") === classifierName) {
        keys = String(getNodeField(classifier, "keys") ?? "");
      }
    }
  }
  
  if (keys === "") keys = "concept:name";
  
  const classifiers = (keys + " ")
    .split("'")
    .map((newKeys) => {
      if (newKeys.startsWith(" ") || newKeys.endsWith(" ")) {
        return newKeys.split(" ");
      } else return newKeys;
    })
    .flat()
    .filter((key) => key !== "")
    .sort();

  let id = 0;
  if (logRoot?.trace) {
    for (const xmlTrace of toArray(logRoot.trace)) {
      const trace: RoleTrace = [];
      const traceAttrs = collectXesAttributes(xmlTrace);
      const traceId = getXesAttributeValue(traceAttrs, "concept:name") ?? (id++).toString();
      
      const events = toArray(xmlTrace.event);
      for (const elem of events) {
        const eventAttrs = collectXesAttributes(elem);
        const nameArr: string[] = [];
        const role = getXesAttributeValue(eventAttrs, "role") ?? "";
        for (const clas of classifiers) {
          const value = getXesAttributeValue(eventAttrs, clas);
          if (value === undefined) {
            throw new Error(
              "Couldn't discern Events with classifiers: " + classifiers,
            );
          }
          nameArr.push(value);
        }
        const name = nameArr.join(":");
        trace.push({ activity: name, role });
        log.events.add(name);
      }
      log.traces[traceId] = trace;
    }
  }
  return log;
};

export const writeEventLog = (log: EventLog<RoleTrace>): string => {
  const xmlLog: XMLLog = {
    log: {
      "@xes.version": "1.0",
      "@xes.features": "nested-attributes",
      "@openxes.version": "1.0RC7",
      global: {
        "@scope": "event",
        string: [{
          "@key": "concept:name",
          "@value": "__INVALID__",
        }, {
          "@key": "role",
          "@value": "__INVALID__",
        }],
      },
      classifier: {
        "@name": "Event Name",
        "@keys": "concept:name",
      },
      trace: [],
    },
  };

  for (const traceId in log.traces) {
    const trace = log.traces[traceId];
    const traceElem: any = {
      string: {
        "@key": "concept:name",
        "@value": traceId,
      },
      event: [],
    };
    for (const event of trace) {
      const eventElem: XMLEvent = {
        string: [{
          "@key": "concept:name",
          "@value": event.activity,
        }, {
          "@key": "role",
          "@value": event.role,
        }],
      };
      traceElem.event.push(eventElem);
    }
    xmlLog.log.trace.push(traceElem);
  }

  // Update: Use XMLBuilder instead of j2xParser (v4)
  const builder = new XMLBuilder(writingOptions);
  const xml = builder.build(xmlLog);
  return xml;
};

// Parse .xes data to a Binary EventLog
export const parseBinaryLog = (
  data: string,
  positiveClasifier: string,
): { trainingLog: BinaryLog; testLog: EventLog<Trace>; gtLog: ClassifiedTraces } => {
  // Update: Initialize XMLParser instance (v4)
  const parserInstance = new XMLParser(parserOptions);
  const logJson = parserInstance.parse(data.toString());
  const logRoot = Array.isArray(logJson.log) ? logJson.log[0] : logJson.log;

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

  if (logRoot?.trace) {
    for (const xmlTrace of toArray(logRoot.trace)) {
      const trace: Trace = [];
      const traceAttrs = collectXesAttributes(xmlTrace);
      const traceId = getXesAttributeValue(traceAttrs, "concept:name") ?? "";
      const label = getXesAttributeValue(traceAttrs, "label") ?? "";
      if (traceId === "" || label === "") {
        throw new Error("No trace id or label found!");
      }
      const events = toArray(xmlTrace.event);
      for (const elem of events) {
        const eventName = getXesAttributeValue(collectXesAttributes(elem), "concept:name");
        if (eventName !== undefined) {
          trace.push(eventName);
          trainingLog.events.add(eventName);
        }
      }
      (label === positiveClasifier ? trainingLog.traces : trainingLog.nTraces)[traceId] =
        trace;
      testLog.traces[traceId] = trace;
      gtLog[traceId] = label === positiveClasifier;
    }
  }
  testLog.events = trainingLog.events;
  return { trainingLog, testLog, gtLog };
};