import type { RelationViolations, RoleTrace, Trace } from "dcr-engine";
import type { RelationActivations } from "dcr-engine/src/types";

export type TraceClassification = "conforming" | "partiallyViolating" | "violating";

export type MarkerNotation = "HM2011" | "DCR Solutions" | "TAL2023";

export const isMarkerNotation = (obj: unknown): obj is MarkerNotation => {
  return (
    typeof obj === "string" &&
    ["HM2011", "DCR Solutions", "TAL2023"].includes(obj)
  );
};

export type ColoredRelations = boolean;

export const isColoredRelations = (obj: unknown): obj is ColoredRelations => {
  return typeof obj === "boolean";
};

export type EmptyLogResults = Array<{
  traceId: string;
  traceName?: string;
  count: number;
  frequency?: number;
  trace: RoleTrace;
}>;

export type ReplaySubTrace = {
  traceId: string;
  traceName?: string;
  trace: RoleTrace;
  isPositive?: boolean;
  classification?: TraceClassification;
};

export type ReplayLogResults = Array<{
  traceId: string;
  traceName?: string;
  count: number;
  frequency?: number;
  isPositive?: boolean;
  classification?: TraceClassification;
  trace: RoleTrace;
  subTraces?: ReplaySubTrace[];
}>;

export type ViolationResults = {
  totalViolations: number;
  totalTimeViolations: number;
  violations: RelationViolations;
  timeViolations: RelationViolations;
  activations: RelationActivations;
  stepViolations: number[];
  stepTimeViolations: number[];
  finalStateAccepting: boolean;
};

export type ViolationSubTrace = {
  traceId: string;
  traceName?: string;
  trace: RoleTrace;
  results?: ViolationResults;
  classification?: TraceClassification;
};

export type ViolationLogResults = Array<{
  traceId: string;
  traceName?: string;
  count: number;
  frequency?: number;
  results?: ViolationResults;
  classification?: TraceClassification;
  trace: RoleTrace;
  subTraces?: ViolationSubTrace[];
}>;

export type AlignmentLogResults = Array<{
  traceId: string;
  traceName?: string;
  count: number;
  frequency?: number;
  results?: {
    cost: number;
    trace: Trace;
  };
  trace: RoleTrace;
}>;
