import { useState } from "react";
import ModelerState from "./components/ModelerState";
import HomeState from "./components/HomeState";
import SimulatorState from "./components/SimulatorState";

export enum StateEnum {
  Modeler,
  Home,
  Simulation,
}

export interface StateProps {
  savedGraphs: DCRGraphRepository;
  setSavedGraphs: (repository: DCRGraphRepository) => void;
  setState: (state: StateEnum) => void;
}

export type DCRGraphRepository = {
  [name: string]: string;
}

const App = () => {
  const [state, setState] = useState(StateEnum.Home);
  const [savedGraphs, setSavedGraphs] = useState<DCRGraphRepository>({});

  switch (state) {
    case StateEnum.Modeler:
      return <ModelerState savedGraphs={savedGraphs} setSavedGraphs={setSavedGraphs} setState={setState} />;
    case StateEnum.Home:
      return <HomeState setState={setState} savedGraphs={savedGraphs} setSavedGraphs={setSavedGraphs} />;
    case StateEnum.Simulation:
      return <SimulatorState setState={setState} savedGraphs={savedGraphs} setSavedGraphs={setSavedGraphs} />;
  }
}

export default App;