import { useCallback, useMemo, useState } from "react";
import ModelerState from "./components/ModelerState";
import HomeState from "./components/HomeState";
import SimulatorState from "./components/SimulatorState";
import ConformanceCheckingState from "./components/ConformanceCheckingState";
import type { EventLog, RoleTrace } from "dcr-engine";
import DiscoveryState from "./components/DiscoveryState";
import EventLogGenerationState from "./components/EventLogGenerationState";
import {
  isColoredRelations,
  isMarkerNotation,
  type ColoredRelations,
  type MarkerNotation,
} from "./types";

export const StateEnum = {
  Modeler: "Modeler",
  Home: "Home",
  Simulator: "Simulator",
  Conformance: "Conformance",
  Discovery: "Discovery",
  EventLogGeneration: "EventLogGeneration",
} as const;

export type StateEnum = (typeof StateEnum)[keyof typeof StateEnum];

export interface DCRGraphEntry {
  name: string;
  graph: string;
}

export interface EventLogEntry {
  name: string;
  log: EventLog<RoleTrace>;
}

export type DCRGraphRepository = Map<string, DCRGraphEntry>;

export type EventLogRepository = Map<string, EventLogEntry>;

export interface StateProps {
  setState: (state: StateEnum) => void;
  savedGraphs: DCRGraphRepository;
  setSavedGraphs: React.Dispatch<React.SetStateAction<DCRGraphRepository>>;
  savedLogs: EventLogRepository;
  setSavedLogs: React.Dispatch<React.SetStateAction<EventLogRepository>>;
  currentGraph: DCRGraphEntry | null;
  setCurrentGraph: (graphName: string | null) => void;
  currentLog: EventLogEntry | null;
  setCurrentLog: (logName: string | null) => void;
  saveGraph: (name: string, graph: string) => boolean;
  saveLog: (name: string, log: EventLog<RoleTrace>) => boolean;
  pickGraph: (name?: string | null) => void;
  pickLog: (name?: string | null) => void;
  markerNotation: MarkerNotation;
  changeMarkerNotation: (value: unknown) => void;
  coloredRelations: ColoredRelations;
  changeColoredRelations: (value: unknown) => void;
}

const App = () => {
  const [state, setState] = useState<StateEnum>(StateEnum.Home);

  const [markerNotation, setMarkerNotation] =
    useState<MarkerNotation>("TAL2023");

  const [coloredRelations, setColoredRelations] =
    useState<ColoredRelations>(true);

  const [graphs, setGraphs] = useState<DCRGraphRepository>(new Map());
  const [logs, setLogs] = useState<EventLogRepository>(new Map());

  const [currentGraphName, setCurrentGraphName] = useState<string | null>(null);
  const [currentLogName, setCurrentLogName] = useState<string | null>(null);

  const currentGraph = useMemo(() => {
    if (currentGraphName === null) {
      return null;
    }

    return graphs.get(currentGraphName) ?? null;
  }, [graphs, currentGraphName]);

  const currentLog = useMemo(() => {
    if (currentLogName === null) {
      return null;
    }

    return logs.get(currentLogName) ?? null;
  }, [logs, currentLogName]);

  const saveGraph = useCallback(
    (name: string, graph: string) => {
      if (!graphs.has(name) || window.confirm("Overwrite existing graph?")) {
        setGraphs((prev) => {
          const newMap = new Map(prev);
          newMap.set(name, { name, graph });
          return newMap;
        });
        setCurrentGraphName(name);
        return true;
      }
      return false;
    },
    [graphs],
  );

  const saveLog = useCallback(
    (name: string, log: EventLog<RoleTrace>) => {
      if (!logs.has(name) || window.confirm("Overwrite existing log?")) {
        setLogs((prev) => {
          const newMap = new Map(prev);
          newMap.set(name, { name, log });
          return newMap;
        });
        setCurrentLogName(name);
        return true;
      }
      return false;
    },
    [logs],
  );

  const pickGraph = useCallback(
    (name: string | null = null) => {
      if (name && !graphs.has(name)) {
        window.alert("Graph not found!");
        return;
      }
      setCurrentGraphName(name);
    },
    [graphs],
  );

  const pickLog = useCallback(
    (name: string | null = null) => {
      if (name && !logs.has(name)) {
        window.alert("Log not found!");
        return;
      }
      setCurrentLogName(name);
    },
    [logs],
  );

  const changeMarkerNotation = useCallback((value: unknown) => {
    if (isMarkerNotation(value)) {
      setMarkerNotation(value);
    }
  }, []);

  const changeColoredRelations = useCallback((value: unknown) => {
    if (isColoredRelations(value)) {
      setColoredRelations(value);
    }
  }, []);

  switch (state) {
    case StateEnum.Modeler:
      return (
        <ModelerState
          savedLogs={logs}
          setSavedLogs={setLogs}
          savedGraphs={graphs}
          setSavedGraphs={setGraphs}
          setState={setState}
          currentGraph={currentGraph}
          currentLog={currentLog}
          setCurrentGraph={setCurrentGraphName}
          setCurrentLog={setCurrentLogName}
          saveGraph={saveGraph}
          saveLog={saveLog}
          pickGraph={pickGraph}
          pickLog={pickLog}
          markerNotation={markerNotation}
          changeMarkerNotation={changeMarkerNotation}
          coloredRelations={coloredRelations}
          changeColoredRelations={changeColoredRelations}
        />
      );
    case StateEnum.Home:
      return (
        <HomeState
          savedLogs={logs}
          setSavedLogs={setLogs}
          savedGraphs={graphs}
          setSavedGraphs={setGraphs}
          setState={setState}
          currentGraph={currentGraph}
          currentLog={currentLog}
          setCurrentGraph={setCurrentGraphName}
          setCurrentLog={setCurrentLogName}
          saveGraph={saveGraph}
          saveLog={saveLog}
          pickGraph={pickGraph}
          pickLog={pickLog}
          markerNotation={markerNotation}
          changeMarkerNotation={changeMarkerNotation}
          coloredRelations={coloredRelations}
          changeColoredRelations={changeColoredRelations}
        />
      );
    case StateEnum.Simulator:
      return (
        <SimulatorState
          savedLogs={logs}
          setSavedLogs={setLogs}
          savedGraphs={graphs}
          setSavedGraphs={setGraphs}
          setState={setState}
          currentGraph={currentGraph}
          currentLog={currentLog}
          setCurrentGraph={setCurrentGraphName}
          setCurrentLog={setCurrentLogName}
          saveGraph={saveGraph}
          saveLog={saveLog}
          pickGraph={pickGraph}
          pickLog={pickLog}
          markerNotation={markerNotation}
          changeMarkerNotation={changeMarkerNotation}
          coloredRelations={coloredRelations}
          changeColoredRelations={changeColoredRelations}
        />
      );
    case StateEnum.Conformance:
      return (
        <ConformanceCheckingState
          savedLogs={logs}
          setSavedLogs={setLogs}
          savedGraphs={graphs}
          setSavedGraphs={setGraphs}
          setState={setState}
          currentGraph={currentGraph}
          currentLog={currentLog}
          setCurrentGraph={setCurrentGraphName}
          setCurrentLog={setCurrentLogName}
          saveGraph={saveGraph}
          saveLog={saveLog}
          pickGraph={pickGraph}
          pickLog={pickLog}
          markerNotation={markerNotation}
          changeMarkerNotation={changeMarkerNotation}
          coloredRelations={coloredRelations}
          changeColoredRelations={changeColoredRelations}
        />
      );
    case StateEnum.Discovery:
      return (
        <DiscoveryState
          savedLogs={logs}
          setSavedLogs={setLogs}
          savedGraphs={graphs}
          setSavedGraphs={setGraphs}
          setState={setState}
          currentGraph={currentGraph}
          currentLog={currentLog}
          setCurrentGraph={setCurrentGraphName}
          setCurrentLog={setCurrentLogName}
          saveGraph={saveGraph}
          saveLog={saveLog}
          pickGraph={pickGraph}
          pickLog={pickLog}
          markerNotation={markerNotation}
          changeMarkerNotation={changeMarkerNotation}
          coloredRelations={coloredRelations}
          changeColoredRelations={changeColoredRelations}
        />
      );
    case StateEnum.EventLogGeneration:
      return (
        <EventLogGenerationState
          savedLogs={logs}
          setSavedLogs={setLogs}
          savedGraphs={graphs}
          setSavedGraphs={setGraphs}
          setState={setState}
          currentGraph={currentGraph}
          currentLog={currentLog}
          setCurrentGraph={setCurrentGraphName}
          setCurrentLog={setCurrentLogName}
          saveGraph={saveGraph}
          saveLog={saveLog}
          pickGraph={pickGraph}
          pickLog={pickLog}
          markerNotation={markerNotation}
          changeMarkerNotation={changeMarkerNotation}
          coloredRelations={coloredRelations}
          changeColoredRelations={changeColoredRelations}
        />
      );
  }
};

export default App;
