import Modeler from './Modeler';
import DCRModeler from "modeler";
import styled from "styled-components";

import emptyBoardXML from '../resources/emptyBoard';
import { useRef } from 'react';
import Button from '../utilComponents/Button';

import { saveAs } from 'file-saver';
import { StateEnum, StateProps } from '../App';
import FileUploadButton from '../utilComponents/FileUploadButton';

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
  const modelerRef = useRef<DCRModeler | null>(null);

  const open = (data: string) => {
    console.log(data);
    modelerRef.current?.importXML(data).catch((e) => console.log(e));
  }

  const saveAsXML = async () => {
    if (!modelerRef.current) return;

    const data = await modelerRef.current.saveXML({ format: true });
    const blob = new Blob([data.xml]);
    saveAs(blob, "dcr-board.xml");
  }

  const saveAsSvg = async () => {
    if (!modelerRef.current) return;
    const data = await modelerRef.current.saveSVG();
    const blob = new Blob([data.svg]);
    saveAs(blob, "dcr-board.svg");
  }

  return (
    <>
      <Modeler modelerRef={modelerRef} />
      <BottomButtons>
        <ButtonTitle>Open:</ButtonTitle>
        <FileUploadButton fileCallback={(contents) => open(contents)}>Editor XML</FileUploadButton>
        <Button onClick={() => open(emptyBoardXML)}>New Diagram</Button>
        <ButtonTitle>Download:</ButtonTitle>
        <Button onClick={saveAsXML}>Export XML</Button>
        <Button onClick={saveAsSvg}>Export SVG</Button>
      </BottomButtons>
    </>
  )
}

export default ModelerState