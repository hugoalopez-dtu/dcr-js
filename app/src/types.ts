import type { RelationViolations, RoleTrace, Trace } from "dcr-engine";
import type { RelationActivations } from "dcr-engine/src/types";

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

export type ReplayLogResults = Array<{
  traceId: string;
  isPositive?: boolean;
  trace: RoleTrace;
}>;

export type ViolationLogResults = Array<{
  traceId: string;
  results?: {
    totalViolations: number;
    violations: RelationViolations;
    activations: RelationActivations;
  };
  trace: RoleTrace;
}>;

export type AlignmentLogResults = Array<{
  traceId: string;
  results?: {
    cost: number;
    trace: Trace;
  };
  trace: RoleTrace;
}>;
