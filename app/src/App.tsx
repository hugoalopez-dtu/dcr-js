import Modeler from './Modeler';
import ColumnContainer from './utilComponents/ColumnContainer';

import emptyBoardXML from './resources/emptyBoard';
import sampleBoardXML from './resources/sampleBoard';

function App() {
  return (
    //<p>This should show a modeller:</p>
    <Modeler initXml={sampleBoardXML} />
  )
}

export default App;
