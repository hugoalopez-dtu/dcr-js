import Modeler from './Modeler';
import DCRModeler from "modeler";
import styled from "styled-components";

import emptyBoardXML from '../resources/emptyBoard';
import { useRef } from 'react';

import { saveAs } from 'file-saver';
import { StateEnum, StateProps } from '../App';
import FileUpload from '../utilComponents/FileUpload';
import ModalMenu, { ModalMenuElement } from '../utilComponents/ModalMenu';

import { BiDownload, BiPlus, BiSolidCamera, BiSolidFolderOpen } from 'react-icons/bi';

const StyledFileUpload = styled.div`
  width: 100%;
  & > label > svg {
    font-size: 25px;
  }
  & > label {
    padding: 1em;
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    cursor: pointer;
  }
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

  const menuElements: Array<ModalMenuElement> = [
    {
      icon: <BiPlus />,
      text: "New Diagram",
      onClick: () => open(emptyBoardXML),
    },{
      element: (
        <StyledFileUpload>
          <FileUpload accept="text/xml" fileCallback={(contents) => open(contents)}>
            <BiSolidFolderOpen />
            <>Editor XML</>
          </FileUpload>
        </StyledFileUpload>),
    },
    {
      icon: <BiDownload />,
      text: "Download Editor XML",
      onClick: saveAsXML
    },
    {
      icon: <BiSolidCamera />,
      text: "Download SVG",
      onClick: saveAsSvg,
    } 
  ]

  return (
    <>
      <Modeler modelerRef={modelerRef} />
      <ModalMenu elements={menuElements}/>
    </>
  )
}

export default ModelerState