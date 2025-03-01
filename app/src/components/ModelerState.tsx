import Modeler from './Modeler';
import DCRModeler from "modeler";
import styled from "styled-components";

import emptyBoardXML from '../resources/emptyBoard';
import sampleBoardXML from '../resources/sampleBoard';
import { useState } from 'react';
import Button from '../utilComponents/Button';

import { saveAs } from 'file-saver';
import { StateEnum, StateProps } from '../App';

const BottomButtons = styled.div`
  position: fixed;
  bottom: 0;
  left: 0;
  overflow: hidden;
  padding: 1em;
  display: grid;
  grid-template-rows: 1fr 1fr;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 0.5em;
`
const ButtonTitle = styled.div`
  font-weight: bold;
  margin-top: auto;
  margin-bottom: auto;
`

const ModelerState = ({ setState }: StateProps) => {
  const [modeler, setModeler] = useState<DCRModeler>(new DCRModeler({}));
  const [xml, setXml] = useState<string>(sampleBoardXML);

  // State to reset modeller even without updating the XML.
  // This is necessary due to the fact that the modeller maintains it's own state, so react doesn't know when to update.
  // https://www.nikgraf.com/blog/using-reacts-key-attribute-to-remount-a-component
  const [modelerKey, setModelerKey] = useState<number>(0);
  const resetModeler = () => setModelerKey(modelerKey + 1);

  const open = (data: string) => () => {
    setXml(data);
    resetModeler();
  }

  const saveAsXML = async () => {
    const data = await modeler.saveXML({format: true});
    const blob = new Blob([data.xml]);
    saveAs(blob, "dcr-board.xml"); 
  }

  const saveAsSvg = async () => {
    const data = await modeler.saveSVG();
    const blob = new Blob([data.svg]);
    saveAs(blob, "dcr-board.svg"); 
  }

  return (
    <>
      <Modeler key={modelerKey} xml={xml} setModeler={setModeler} />
      <BottomButtons>
        <ButtonTitle>Open:</ButtonTitle>
        <Button onClick={() => {}}>Editor XML</Button>
        <Button onClick={open(emptyBoardXML)}>New Diagram</Button>
        <ButtonTitle>Download:</ButtonTitle>
        <Button onClick={saveAsXML}>Export XML</Button>
        <Button onClick={saveAsSvg}>Export SVG</Button>
      </BottomButtons>
    </>
  )
}

export default ModelerState