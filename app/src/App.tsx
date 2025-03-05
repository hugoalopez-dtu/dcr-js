import { useState } from "react";
import ModelerState from "./components/ModelerState";
import Button from "./utilComponents/Button";

export enum StateEnum {
  Modeler,
  Home,
  Simulation,
}

export interface StateProps {
  setState: (state: StateEnum) => void;
}

const App = () => {
  const [state, setState] = useState(StateEnum.Modeler);
  switch (state) {
    case StateEnum.Modeler:
      return <ModelerState setState={setState} />;
    case StateEnum.Home:
      return <>
        <div>Hello there! This is home</div>
        <Button onClick={() => setState(StateEnum.Modeler)}>Modeler</Button>
      </>
  }
}

export default App;