export type Children = string | React.JSX.Element | React.JSX.Element[];

export type SettingsKey = "markerNotation" | "blackRelations";
export type SettingsVal = "HM2011" | "DCR Solutions" | "TAL2023" | boolean;

export const isSettingsVal = (obj: unknown): obj is SettingsVal => {
    return typeof (obj) === "boolean" || ["HM2011", "DCR Solutions", "TAL2023"].includes(obj as string);
}
