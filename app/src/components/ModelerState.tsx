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
  grid-template-columns: 1fr 1fr 1fr 1fr;
  gap: 0.5em;
`
const ButtonTitle = styled.div`
  font-weight: bold;
  margin-top: auto;
  margin-bottom: auto;
`

const ModelerState = ({ setState }: StateProps) => {
  const [modeler, setModeler] = useState<DCRModeler>(new DCRModeler({}));

  const saveAsXML = async () => {
    const data = await modeler.saveXML({format: true});
    const blob = new Blob([data.xml]);
    saveAs(blob, "dcr-board.xml"); 
  }

  return (
    <>
      <Modeler xml={sampleBoardXML} setModeler={setModeler} />
      <BottomButtons>
        <ButtonTitle>Open:</ButtonTitle>
        <Button onClick={() => {setState(StateEnum.Test)}}>DCR Solutions XML</Button>
        <Button onClick={() => {}}>Editor XML</Button>
        <Button onClick={() => {}}>New Diagram</Button>
        <ButtonTitle>Download:</ButtonTitle>
        <Button onClick={saveAsXML}>Export XML</Button>
        <Button onClick={() => {}}>Export XML</Button>
        <Button onClick={() => {}}>Export XML</Button>
      </BottomButtons>
    </>
  )
}

export default ModelerState