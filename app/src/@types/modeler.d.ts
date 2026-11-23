/* eslint-disable @typescript-eslint/no-explicit-any */
type DCRGraphEditingRelationType =
  | "condition" | "response" | "include" | "exclude" | "milestone" | "spawn"
  | "conditions" | "responses" | "includes" | "excludes" | "milestones" | "spawns";

/** Programmatic editing of the rendered graph: `modeler.get("dcrGraphEditing")`.
 *  Events are referenced by element id or label. Failing operations throw a GraphEditingError. */
interface DCRGraphEditingApi {
  listEvents(): Array<{
    id: string; name: string; role?: string;
    included: boolean; pending: boolean; executed: boolean;
    variable?: { name: string; type: string; default?: string };
  }>;
  listRelations(): Array<{
    id: string; type: string; source: string; target: string;
    sourceId: string; targetId: string; guard?: string;
  }>;
  hasEvent(ref: string): boolean;
  /** Ids of events matching all given filters; no filters returns all. */
  getNodes(filters?: {
    name?: string; role?: string;
    marking?: { included?: boolean; pending?: boolean; executed?: boolean };
  }): string[];
  hasRelation(type: DCRGraphEditingRelationType, source: string, target: string): boolean;
  /** Ids of relations matching all given filters; no filters returns all. */
  getEdges(filters?: { source?: string; target?: string; type?: DCRGraphEditingRelationType | string }): string[];

  addEvent(name: string, options?: {
    role?: string; included?: boolean; pending?: boolean; executed?: boolean;
    near?: string; position?: { x: number; y: number };
  }): string;
  removeEvent(id: string): void;
  renameEvent(id: string, newName: string): void;
  setRole(id: string, role?: string): void;
  setMarking(id: string, marking: { included?: boolean; pending?: boolean; executed?: boolean }): void;
  setVariable(id: string, variable: { name: string; type: string; default?: string } | null): void;

  addRelation(type: DCRGraphEditingRelationType, source: string, target: string, options?: { guard?: string }): string;
  removeRelation(id: string): void;
  changeRelationType(id: string, toType: DCRGraphEditingRelationType): void;
  setGuard(id: string, guard?: string): void;
}

class DCRModeler {
  constructor(options: any): void;

  destroy(): void;

  importXML(xml: string): Promise<void>;
  importCustomXML(xml: string): Promise<void>;
  importDCRPortalXML(xml: string): Promise<void>;

  saveXML(options: { format: boolean }): Promise<{ xml: string }>;
  saveDCRXML(): Promise<{ xml: string }>;
  saveSVG(): Promise<{ svg: string }>;

  setSetting(
    key: "markerNotation",
    value: "HM2011" | "DCR Solutions" | "TAL2023"
  ): void;
  setSetting(key: "blackRelations", value: boolean): void;

  on(channel: string, callback: (event: any) => void);
  off(channel: string, callback: (event: any) => void);

  get(key: "dcrGraphEditing"): DCRGraphEditingApi;
  get(key: string): any;

  getElementRegistry(): any;
  getSelection(): any;

  updateRendering(graph: DCRGraph, variableStore?: VariableStore, currentTime?: Date): void;
  validateGuards(): string[];
  updateViolations(
    arg: {
      violations: RelationViolations;
      activations: RelationViolations;
    } | null
  ): void;
  setSimulating(val: boolean): void;
}

declare module "modeler" {
  export type DCRGraphEditing = DCRGraphEditingApi;
  export default DCRModeler;
}
