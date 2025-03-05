import Modeler from './Modeler';
import DCRModeler from "modeler";
import styled from "styled-components";

import emptyBoardXML from '../resources/emptyBoard';
import { useEffect, useRef, useState } from 'react';

import { saveAs } from 'file-saver';
import { StateEnum, StateProps } from '../App';
import FileUpload from '../utilComponents/FileUpload';
import ModalMenu, { ModalMenuElement } from '../utilComponents/ModalMenu';

import { BiDownload, BiHome, BiPlus, BiSolidCamera, BiSolidDashboard, BiSolidFolderOpen } from 'react-icons/bi';

import Examples from './Examples';
import { toast } from 'react-toast';
import TopRightIcons from '../utilComponents/TopRightIcons';

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
  const [examplesOpen, setExamplesOpen] = useState(false);
  const [examplesData, setExamplesData] = useState<Array<string>>([]);
  const modelerRef = useRef<DCRModeler | null>(null);

  useEffect(() => {
    fetch('examples/generated_examples.txt')
      .then(response => {
        if (!response.ok) {
          throw new Error('Failed to fetch examples status code: ' + response.status);
        }
        return response.text();
      })
      .then(data => {
        let files = data.split('\n');
        files.pop(); // Remove last empty line
        files = files.map(name => name.split('.').slice(0, -1).join('.')); // Shave file extension off
        setExamplesData(files);
      })
  }, []);

  const open = (data: string, parse: ((xml: string) => Promise<void>) | undefined) => {
    parse && parse(data).catch((e) => { console.log(e); toast.error("Unable to parse XML...") });
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
      onClick: () => open(emptyBoardXML, modelerRef.current?.importXML),
    }, {
      element: (
        <StyledFileUpload>
          <FileUpload accept="text/xml" fileCallback={(contents) => open(contents, modelerRef.current?.importXML)}>
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
    },
    {
      icon: <BiSolidDashboard />,
      text: "Examples",
      onClick: () => setExamplesOpen(true),
    }
  ]

  return (
    <>
      <Modeler modelerRef={modelerRef} />
      <TopRightIcons>
        <BiHome onClick={() => setState(StateEnum.Home)} />
        <ModalMenu elements={menuElements} />
      </TopRightIcons>
      {examplesOpen && <Examples
        examplesData={examplesData}
        openCustomXML={(xml) => open(xml, modelerRef.current?.importCustomXML)}
        openDCRXML={(xml) => open(xml, modelerRef.current?.importDCRPortalXML)}
        setExamplesOpen={setExamplesOpen}
      />}
    </>
  )
}

export default ModelerState