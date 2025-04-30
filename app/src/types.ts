import { RelationViolations, RoleTrace } from "dcr-engine";

export type Children = string | React.JSX.Element | React.JSX.Element[];

export type SettingsKey = "markerNotation" | "blackRelations";
export type SettingsVal = "HM2011" | "DCR Solutions" | "TAL2023" | boolean;

export const isSettingsVal = (obj: unknown): obj is SettingsVal => {
    return typeof (obj) === "boolean" || ["HM2011", "DCR Solutions", "TAL2023"].includes(obj as string);
}

export type ReplayLogResults = Array<{
    traceId: string,
    isPositive?: boolean,
    trace: RoleTrace
}>

export type ViolationLogResults = Array<{
    traceId: string,
    results?: {
        totalViolations: number,
        violations: RelationViolations,
        activations: RelationViolations,
    },
    trace: RoleTrace
}>