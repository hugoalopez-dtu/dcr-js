import type {
  DCRGraph,
  Marking,
  SubProcess,
  EventMap,
  Event,
  Trace,
  EventLog,
  DCRGraphS,
  RoleTrace,
  Nestings,
  RelationViolations,
  VariantLog,
} from "./src/types";
import { isSubProcess } from "./src/types";
import {
  execute,
  isEnabled,
  isAccepting,
  executeS,
  isEnabledS,
  isAcceptingS,
} from "./src/executionEngine";
import { moddleToDCR } from "./src/graphConversion";
import { copyMarking, filterVariantByTopPercentage, getBinaryVariants, getVariants } from "./src/utility";
import {
  parseRoleLog,
  parseNonRoleLog,
  writeEventLog,
  parseBinaryLog,
} from "./src/eventLogs";
import {
  replayTraceS,
  mergeViolations,
  quantifyViolations,
} from "./src/conformance";
import layoutGraph from "./src/layout";
import { nestDCR } from "./src/nesting";
import { generateEventLog } from "./src/generation";
import runTest from "./src/tdm";
import { alignTrace } from "./src/align";

import rejectionMiner from "./src/binary";

import mineFromAbstraction, { abstractLog, filter } from "./src/discovery";

import * as SAXParser from "./src/browser/SAXParser";
import * as DOMEventStreamParser from "./src/browser/DOMEventStreamParser";
import * as RegexEventStreamParser from "./src/browser/RegexEventStreamParser";
import * as DOMTraceStreamParser from "./src/browser/DOMTraceStreamParser";
import * as RegexTraceStreamParser from "./src/browser/RegexTraceStreamParser";

export {
  type DCRGraph,
  type DCRGraphS,
  type EventLog,
  type EventMap,
  type Marking,
  type SubProcess,
  type Event,
  type Trace,
  type RoleTrace,
  type Nestings,
  type RelationViolations,
  type VariantLog,
  isSubProcess,
  execute,
  isAccepting,
  isEnabled,
  moddleToDCR,
  copyMarking,
  parseRoleLog,
  parseNonRoleLog,
  parseBinaryLog,
  isAcceptingS,
  executeS,
  isEnabledS,
  replayTraceS,
  writeEventLog,
  layoutGraph,
  mineFromAbstraction,
  abstractLog,
  nestDCR,
  filter,
  mergeViolations,
  quantifyViolations,
  getVariants,
  generateEventLog,
  runTest,
  alignTrace,
  rejectionMiner,
  getBinaryVariants,
  filterVariantByTopPercentage,
  RegexTraceStreamParser,
  DOMTraceStreamParser,
  RegexEventStreamParser,
  DOMEventStreamParser,
  SAXParser,
};
