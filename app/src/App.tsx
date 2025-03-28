import { useState } from "react";
import ModelerState from "./components/ModelerState";
import HomeState from "./components/HomeState";
import SimulatorState from "./components/SimulatorState";
import ConformanceCheckingState from "./components/ConformanceCheckingState";
import { EventLog } from "dcr-engine";

export enum StateEnum {
  Modeler,
  Home,
  Simulator,
  Conformance,
}

export interface StateProps {
  savedGraphs: DCRGraphRepository;
  setSavedGraphs: (repository: DCRGraphRepository) => void;
  setState: (state: StateEnum) => void;
  savedLogs: EventLogRepository;
  setSavedLogs: (repository: EventLogRepository) => void;
}

export type DCRGraphRepository = {
  [name: string]: string;
}

export type EventLogRepository = {
  [name: string]: EventLog;
}

const App = () => {
  const [state, setState] = useState(StateEnum.Modeler);
  const [savedGraphs, setSavedGraphs] = useState<DCRGraphRepository>({});
  const [savedLogs, setSavedLogs] = useState<EventLogRepository>({});

  switch (state) {
    case StateEnum.Modeler:
      return <ModelerState savedLogs={savedLogs} setSavedLogs={setSavedLogs} savedGraphs={savedGraphs} setSavedGraphs={setSavedGraphs} setState={setState} />;
    case StateEnum.Home:
      return <HomeState savedLogs={savedLogs} setSavedLogs={setSavedLogs} setState={setState} savedGraphs={savedGraphs} setSavedGraphs={setSavedGraphs} />;
    case StateEnum.Simulator:
      return <SimulatorState savedLogs={savedLogs} setSavedLogs={setSavedLogs} setState={setState} savedGraphs={savedGraphs} setSavedGraphs={setSavedGraphs} />;
    case StateEnum.Conformance:
      return <ConformanceCheckingState savedLogs={savedLogs} setSavedLogs={setSavedLogs} setState={setState} savedGraphs={savedGraphs} setSavedGraphs={setSavedGraphs} />;
  }
}

export default App;