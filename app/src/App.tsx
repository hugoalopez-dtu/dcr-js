import { useState } from "react";
import ModelerState from "./components/ModelerState";
import Button from "./utilComponents/Button";
import HomeState from "./components/HomeState";

export enum StateEnum {
  Modeler,
  Home,
  Simulation,
}

export interface StateProps {
  setState: (state: StateEnum) => void;
}

export type DCRGraphRepository = {
  [name: string]: string;
}

const App = () => {
  const [state, setState] = useState(StateEnum.Modeler);
  const [savedGraphs, setSavedGraphs] = useState<DCRGraphRepository>({});

  switch (state) {
    case StateEnum.Modeler:
      return <ModelerState savedGraphs={savedGraphs} setSavedGraphs={setSavedGraphs} setState={setState} />;
    case StateEnum.Home:
      return <HomeState setState={setState} />
  }
}

export default App;