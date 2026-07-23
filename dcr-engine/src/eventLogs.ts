import { XMLParser, XMLBuilder } from "fast-xml-parser";
import type {
  EventLog,
  Event,
  XMLLog,
  XMLEvent,
  RoleTrace,
  BinaryLog,
  ClassifiedTraces,
  Trace,
} from "./types";

const arrayTags = new Set(["log", "classifier", "trace", "event", "string", "global"]);

export const parserOptions = {
  attributeNamePrefix: "",
  textNodeName: "#text",
  ignoreAttributes: false,
  ignoreNameSpace: false,
  allowBooleanAttributes: false,
  parseNodeValue: true,
  parseAttributeValue: true,
  trimValues: true,
  parseTrueNumberOnly: false,
  isArray: (tagName: string) => arrayTags.has(tagName),
  stopNodes: ["parse-me-as-string"],
};

const writingOptions = {
  attributeNamePrefix: "@",
  ignoreAttributes: false,
  format: true,
  indentBy: "  ",
  suppressEmptyNode: true,
};

function* parseLogGenerator(
  data: string,
  classifierName: string = "Event Name",
) {
  const logJson = new XMLParser(parserOptions).parse(data.toString());

  let keys = "";
  for (const i in logJson.log[0].classifier) {
    if (logJson.log[0].classifier[i].name === classifierName) {
      keys = logJson.log[0].classifier[i].keys;
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
    let traceId: string = "";
    let traceLabel: string = "";

    const xmlTrace = logJson.log[0].trace[i];
    for (const elem of xmlTrace.string) {
      if (elem.key === "concept:name") {
        traceId = elem.value;
      }

      // This was part of original code, but not part of the XES standard,
      // but maybe it is common to use in practice with tools like ProM? It is
      // used for the binary log parsing
      if (elem.key === "label") {
        traceLabel = elem.value;
      }
    }

    if (traceId === "") {
      traceId = (id++).toString();
    }

    const events = xmlTrace.event ? xmlTrace.event : [];
    for (const elem of events) {
      let nameArr = [];
      let role: string = "";

      for (const attr of elem.string) {
        // Original code used role instead of org:role, and so does this
        if (attr.key === "role") {
          role = attr.value;
        }
      }

      for (const clas of classifiers) {
        try {
          const event = elem.string.find(
            (newElem: any) => newElem.key === clas,
          );
          nameArr.push(event.value);
        } catch {
          throw new Error(
            "Couldn't discern Events with classifiers: " + classifiers,
          );
        }
      }

      const name = nameArr.join(":");
      const dateElem = (elem as any).date;
      const timestamp = dateElem?.value ? new Date(dateElem.value as string) : undefined;
      const toObj = (e: any) => Array.isArray(e) ? e[0] : e;
      const varElem = toObj((elem as any).int) ?? toObj((elem as any).float) ?? toObj((elem as any).boolean);
      const varName: string | undefined = varElem?.key;
      const value: number | boolean | string | undefined = varElem?.value;
      yield { traceId, traceLabel, event: { activity: name, role, timestamp, varName, value } };
    }
  }
}

export function parseRoleLog(
  data: string,
  classifierName: string = "Event Name",
): EventLog<RoleTrace> {
  const events = new Set<Event>();
  const traces: Record<string, RoleTrace> = {};

  for (const { traceId, event } of parseLogGenerator(data, classifierName)) {
    if (!traces[traceId]) {
      traces[traceId] = [];
    }
    traces[traceId].push(event);
    events.add(event.activity);
  }

  return { events, traces };
}

export function parseNonRoleLog(
  data: string,
  classifierName: string = "Event Name",
): EventLog<Trace> {
  const events = new Set<Event>();
  const traces: Record<string, Trace> = {};

  for (const { traceId, event } of parseLogGenerator(data, classifierName)) {
    if (!traces[traceId]) {
      traces[traceId] = [];
    }
    traces[traceId].push(event.activity);
    events.add(event.activity);
  }

  return { events, traces };
}

export function writeEventLog(log: EventLog<RoleTrace>): string {
  // Setting log metadata
  const xmlLog: XMLLog = {
    log: {
      "@xes.version": "1.0",
      "@xes.features": "nested-attributes",
      "@openxes.version": "1.0RC7",
      global: {
        "@scope": "event",
        string: [
          {
            "@key": "concept:name",
            "@value": "__INVALID__",
          },
          {
            "@key": "role",
            "@value": "__INVALID__",
          },
        ],
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
        string: [
          {
            "@key": "concept:name",
            "@value": event.activity,
          },
          {
            "@key": "role",
            "@value": event.role,
          },
        ],
      };
      if (event.timestamp) {
        eventElem.date = {
          "@key": "time:timestamp",
          "@value": event.timestamp.toISOString(),
        };
      }
      if (event.varName !== undefined && event.value !== undefined) {
        const xesType =
          typeof event.value === "boolean" ? "boolean" :
          typeof event.value === "number" ? "int" : "string";
        (eventElem as any)[xesType] = (eventElem as any)[xesType]
          ? [...[].concat((eventElem as any)[xesType]), { "@key": event.varName, "@value": String(event.value) }]
          : { "@key": event.varName, "@value": String(event.value) };
      }
      traceElem.event.push(eventElem);
    }

    xmlLog.log.trace.push(traceElem);
  }

  const builder = new XMLBuilder(writingOptions);
  const xml = builder.build(xmlLog);
  return xml;
}

export function parseBinaryLog(
  data: string,
  positiveClasifier: string,
): {
  trainingLog: BinaryLog;
  testLog: EventLog<Trace>;
  gtLog: ClassifiedTraces;
} {
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

  for (const { traceId, traceLabel, event } of parseLogGenerator(data)) {
    if (traceId === "" || traceLabel === "") {
      throw new Error("No trace id or label found!");
    }

    trainingLog.events.add(event.activity);
    if (traceLabel === positiveClasifier) {
      if (!trainingLog.traces[traceId]) {
        trainingLog.traces[traceId] = [];
      }
      trainingLog.traces[traceId].push(event.activity);
    } else {
      if (!trainingLog.nTraces[traceId]) {
        trainingLog.nTraces[traceId] = [];
      }
      trainingLog.nTraces[traceId].push(event.activity);
    }

    testLog.events.add(event.activity);
    if (!testLog.traces[traceId]) {
      testLog.traces[traceId] = [];
    }
    testLog.traces[traceId].push(event.activity);

    gtLog[traceId] = traceLabel === positiveClasifier;
  }

  return { trainingLog, testLog, gtLog };
}
