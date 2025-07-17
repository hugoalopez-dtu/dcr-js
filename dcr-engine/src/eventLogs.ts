import parser, { j2xParser } from "fast-xml-parser";
import { EventLog, Event, XMLLog, XMLEvent, RoleTrace, BinaryLog, ClassifiedTraces, Trace } from "./types";

export const parserOptions = {
  attributeNamePrefix: "",
  attrNodeName: "attr", //default is 'false'
  textNodeName: "#text",
  ignoreAttributes: false,
  ignoreNameSpace: false,
  allowBooleanAttributes: false,
  parseNodeValue: true,
  parseAttributeValue: true,
  trimValues: true,
  parseTrueNumberOnly: false,
  arrayMode: true, //"strict"
  stopNodes: ["parse-me-as-string"],
};

const writingOptions = {
  attributeNamePrefix: "@",
  //attrNodeName: "@", //default is false
  //textNodeName: "#text",
  ignoreAttributes: false,
  //cdataTagName: "__cdata", //default is false
  //cdataPositionChar: "\\c",
  format: true,
  arrayMode: false,
  indentBy: "  ",
  supressEmptyNode: true,
};

// Parse .xes file to an EventLog
export const parseLog = (
  data: string,
  classifierName: string = "Event Name",
): EventLog<RoleTrace> => {
  const logJson = parser.parse(data.toString(), parserOptions);
  const log: EventLog<RoleTrace> = {
    events: new Set<Event>(),
    traces: {},
  };

  let keys = "";
  for (const i in logJson.log[0].classifier) {
    if (logJson.log[0].classifier[i].attr.name === classifierName) {
      keys = logJson.log[0].classifier[i].attr.keys;
    }
  }
  if (keys === "") keys = "concept:name";
  // Extract classifiers to array according to https://xes-standard.org/_media/xes/xesstandarddefinition-2.0.pdf
  // Example: "x y 'z w' hello" => ["hello", "x", "y", "z w"]
  const classifiers = (keys + " ") // Fix for case where
    .split("'") // Split based on ' to discern which classifiers have spaces
    .map((newKeys) => {
      // Only the classifiers surrounded by ' will have no spaces on either side, split the rest on space
      if (newKeys.startsWith(" ") || newKeys.endsWith(" ")) {
        return newKeys.split(" ");
      } else return newKeys;
    })
    .flat() // Flatten to 1d array
    .filter((key) => key !== "") // Remove empty strings
    .sort(); // Sort to ensure arbitrary but deterministic order

  let id = 0;
  for (const i in logJson.log[0].trace) {

    const trace: RoleTrace = [];
    let traceId: string = "";
    const xmlTrace = logJson.log[0].trace[i];
    try {
      for (const elem of xmlTrace.string) {
        if (elem.attr.key === "concept:name") {
          traceId = elem.attr.value;
        }
      }
    } catch (e) {
      throw new Error("No trace id found!");
    }
    if (traceId === "") {
      traceId = (id++).toString();
    }
    const events = xmlTrace.event ? xmlTrace.event : [];
    for (const elem of events) {
      let nameArr = [];
      let role: string = "";
      for (const attr of elem.string) {
        if (attr.attr.key === "role") {
          role = attr.attr.value;
        }
      }
      for (const clas of classifiers) {
        try {
          const event = elem.string.find(
            (newElem: any) => newElem.attr.key === clas,
          );
          nameArr.push(event.attr.value);
        } catch {
          throw new Error(
            "Couldn't discern Events with classifiers: " + classifiers,
          );
        }
      }
      const name = nameArr.join(":");
      trace.push({ activity: name, role });
      log.events.add(name);
    }
    log.traces[traceId] = trace;
  }
  return log;
};

export const writeEventLog = (log: EventLog<RoleTrace>): string => {
  // Setting log metadata
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
  // Convert the classified log to a form that can be exported as xml
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
  const parser = new j2xParser(writingOptions);
  const xml = parser.parse(xmlLog);
  return xml;
};


// Parse .xes data to a Binary EventLog
export const parseBinaryLog = (
  data: string,
  positiveClasifier: string,
): { trainingLog: BinaryLog; testLog: EventLog<Trace>; gtLog: ClassifiedTraces } => {
  const logJson = parser.parse(data.toString(), parserOptions);
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

  for (const i in logJson.log[0].trace) {
    const trace: Trace = [];
    let traceId: string = "";
    let label: string = "";
    const xmlTrace = logJson.log[0].trace[i];
    for (const elem of xmlTrace.string) {
      if (elem.attr.key === "concept:name") {
        traceId = elem.attr.value;
      }
      if (elem.attr.key === "label") {
        label = elem.attr.value;
      }
    }
    if (traceId === "" || label === "") {
      throw new Error("No trace id or label found!");
    }
    const events = xmlTrace.event ? xmlTrace.event : [];
    for (const elem of events) {
      for (const event of elem.string) {
        if (event.attr.key === "concept:name") {
          trace.push(event.attr.value.toString());
          trainingLog.events.add(event.attr.value.toString());
        }
      }
    }
    (label === positiveClasifier ? trainingLog.traces : trainingLog.nTraces)[traceId] =
      trace;
    testLog.traces[traceId] = trace;
    gtLog[traceId] = label === positiveClasifier;
  }
  testLog.events = trainingLog.events;
  return { trainingLog, testLog, gtLog };
};