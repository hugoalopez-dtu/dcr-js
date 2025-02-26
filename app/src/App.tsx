import { useState } from "react";
import ModelerState from "./components/ModelerState";
import Button from "./utilComponents/Button";

export enum StateEnum {
    Modeler,
    Test
}

export interface StateProps {
  setState: (state: StateEnum) => void;
}

const App = () => {
    const [state, setState] = useState(StateEnum.Modeler);
    switch (state) {
      case StateEnum.Modeler:
        return <ModelerState setState={setState}/>;
      case StateEnum.Test:
        return <>
          <div>Hello there! This is a small test!</div>
          <Button onClick={() => setState(StateEnum.Modeler)}>Go Back</Button>
        </>
    }
}

export default App;