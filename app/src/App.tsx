import { useRef, useState } from "react";
import ModelerState from "./components/ModelerState";
import HomeState from "./components/HomeState";
import SimulatorState from "./components/SimulatorState";
import ConformanceCheckingState from "./components/ConformanceCheckingState";
import { EventLog, RoleTrace } from "dcr-engine";
import DiscoveryState from "./components/DiscoveryState";
import EventLogGenerationState from "./components/EventLogGenerationState";

export enum StateEnum {
  Modeler,
  Home,
  Simulator,
  Conformance,
  Discovery,
  EventLogGeneration
}

export interface StateProps {
  savedGraphs: DCRGraphRepository;
  setSavedGraphs: (repository: DCRGraphRepository) => void;
  setState: (state: StateEnum) => void;
  savedLogs: EventLogRepository;
  setSavedLogs: (repository: EventLogRepository) => void;
  lastSavedGraph: React.RefObject<string | undefined>;
  lastSavedLog: React.RefObject<string | undefined>;
}

export type DCRGraphRepository = {
  [name: string]: string;
}

export type EventLogRepository = {
  [name: string]: EventLog<RoleTrace>;
}

const App = () => {
  const [state, setState] = useState(StateEnum.Home);
  const [savedGraphs, setSavedGraphs] = useState<DCRGraphRepository>({});
  const [savedLogs, setSavedLogs] = useState<EventLogRepository>({});

  const lastSavedGraph = useRef<string>(undefined);
  const lastSavedLog = useRef<string>(undefined);

  switch (state) {
    case StateEnum.Modeler:
      return <ModelerState
        savedLogs={savedLogs}
        setSavedLogs={setSavedLogs}
        savedGraphs={savedGraphs}
        setSavedGraphs={setSavedGraphs}
        setState={setState}
        lastSavedGraph={lastSavedGraph}
        lastSavedLog={lastSavedLog}
      />;
    case StateEnum.Home:
      return <HomeState savedLogs={savedLogs}
        setSavedLogs={setSavedLogs}
        savedGraphs={savedGraphs}
        setSavedGraphs={setSavedGraphs}
        setState={setState}
        lastSavedGraph={lastSavedGraph}
        lastSavedLog={lastSavedLog}
      />;
    case StateEnum.Simulator:
      return <SimulatorState
        savedLogs={savedLogs}
        setSavedLogs={setSavedLogs}
        savedGraphs={savedGraphs}
        setSavedGraphs={setSavedGraphs}
        setState={setState}
        lastSavedGraph={lastSavedGraph}
        lastSavedLog={lastSavedLog}
      />;
    case StateEnum.Conformance:
      return <ConformanceCheckingState
        savedLogs={savedLogs}
        setSavedLogs={setSavedLogs}
        savedGraphs={savedGraphs}
        setSavedGraphs={setSavedGraphs}
        setState={setState}
        lastSavedGraph={lastSavedGraph}
        lastSavedLog={lastSavedLog}
      />;
    case StateEnum.Discovery:
      return <DiscoveryState
        savedLogs={savedLogs}
        setSavedLogs={setSavedLogs}
        savedGraphs={savedGraphs}
        setSavedGraphs={setSavedGraphs}
        setState={setState}
        lastSavedGraph={lastSavedGraph}
        lastSavedLog={lastSavedLog}
      />;
    case StateEnum.EventLogGeneration:
      return <EventLogGenerationState
        savedLogs={savedLogs}
        setSavedLogs={setSavedLogs}
        savedGraphs={savedGraphs}
        setSavedGraphs={setSavedGraphs}
        setState={setState}
        lastSavedGraph={lastSavedGraph}
        lastSavedLog={lastSavedLog}
      />;
  }
}

export default App;