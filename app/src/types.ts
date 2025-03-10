export type Children = string | React.JSX.Element | React.JSX.Element[];

export type SettingsKey = "markerNotation" | "blackRelations";
export type SettingsVal = "default" | "newMarkers" | "proposedMarkers" | boolean;

export const isSettingsVal = (obj: unknown): obj is SettingsVal => {
    return typeof (obj) === "boolean" || ["default", "newMarkers", "proposedMarkers"].includes(obj as string);
}
