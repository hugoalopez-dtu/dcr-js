import Modeler from './Modeler';
import DCRModeler from "modeler";
import styled from "styled-components";

import emptyBoardXML from '../resources/emptyBoard';
import { useEffect, useRef, useState } from 'react';

import { saveAs } from 'file-saver';
import { DCRGraphRepository, StateEnum, StateProps } from '../App';
import FileUpload from '../utilComponents/FileUpload';
import ModalMenu, { ModalMenuElement } from '../utilComponents/ModalMenu';

import { BiDownload, BiExitFullscreen, BiFullscreen, BiHome, BiPlus, BiSave, BiSolidCamera, BiSolidDashboard, BiSolidFolderOpen } from 'react-icons/bi';

import Examples from './Examples';
import { toast } from 'react-toast';
import TopRightIcons from '../utilComponents/TopRightIcons';
import Toggle from '../utilComponents/Toggle';
import DropDown from '../utilComponents/DropDown';
import { isSettingsVal } from '../types';
import { useHotkeys } from 'react-hotkeys-hook';

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
  &:hover {
      color: white;
      background-color: Gainsboro;
  } 
`

const MenuElement = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  width: 100%;
  padding: 1em;
  cursor: default;
`

const Label = styled.label`
  margin-top: auto;
  margin-bottom: auto;
`

const Loading = styled.div`
    z-index: 1000;
    position: fixed;
    height: 100%;
    width: 100%;
    top: 0;
    left: 0;
    cursor: wait;
`

const GraphNameInput = styled.input`
  position: fixed;
  top: 0;
  left: 50%;
  text-align: center;
  z-index: 5;
  margin-top: 0.5em;
  transform: translateX(-50%);
  font-size: 30px;
  width: fit-content;
  background: transparent;
  appearance: none;
  border: none;
  &:focus {
    outline: 2px dashed black;
  }
`

type ModelerStateProps = {
  savedGraphs: DCRGraphRepository;
  setSavedGraphs: (repository: DCRGraphRepository) => void;
} & StateProps;

const initGraphName = "DCR-JS Graph"

const ModelerState = ({ setState, savedGraphs, setSavedGraphs }: ModelerStateProps) => {
  const [examplesOpen, setExamplesOpen] = useState(false);
  const [examplesData, setExamplesData] = useState<Array<string>>([]);

  const [menuOpen, setMenuOpen] = useState(false);

  const [isFullscreen, setIsFullscreen] = useState(false);

  const [loading, setLoading] = useState(false);

  const modelerRef = useRef<DCRModeler | null>(null);

  const [graphName, setGraphName] = useState<string>(initGraphName);
  const [graphId, setGraphId] = useState<string>("");

  const saveGraph = () => {
    let shouldSave = true;
    if (savedGraphs[graphName] && graphName !== graphId) shouldSave = confirm(`This will overwrite the previously saved graph '${graphName}'. Are you sure you wish to continue?`);

    if (shouldSave) {
      setLoading(true);
      modelerRef.current?.saveXML({ format: false }).then(data => {
        const newSavedGraphs = { ...savedGraphs };
        newSavedGraphs[graphName] = data.xml;
        setGraphId(graphName);
        setSavedGraphs(newSavedGraphs);
        setLoading(false);
        toast.success("Graph saved!");
      });
    }
  }

  useHotkeys("ctrl+s", saveGraph, { preventDefault: true });

  useEffect(() => {
    // Fetch examples
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

    // Add listener to fullscreen changes
    function onFullscreenChange() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }
    document.addEventListener('fullscreenchange', onFullscreenChange);

    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const open = (data: string, parse: ((xml: string) => Promise<void>) | undefined) => {
    parse && parse(data).then(_ => { setGraphName(initGraphName); setGraphId("") }).catch((e) => { console.log(e); toast.error("Unable to parse XML...") });
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
      onClick: () => { open(emptyBoardXML, modelerRef.current?.importXML); setMenuOpen(false) },
    },
    {
      icon: <BiSave />,
      text: "Save Graph",
      onClick: () => { saveGraph(); setMenuOpen(false) },
    },
    {
      element: (
        <StyledFileUpload>
          <FileUpload accept="text/xml" fileCallback={(contents) => { open(contents, modelerRef.current?.importXML); setMenuOpen(false); }}>
            <BiSolidFolderOpen />
            <>Editor XML</>
          </FileUpload>
        </StyledFileUpload>),
    },
    {
      icon: <BiDownload />,
      text: "Download Editor XML",
      onClick: () => { saveAsXML(); setMenuOpen(false) },
    },
    {
      icon: <BiSolidCamera />,
      text: "Download SVG",
      onClick: () => { saveAsSvg(); setMenuOpen(false) },
    },
    {
      icon: <BiSolidDashboard />,
      text: "Examples",
      onClick: () => { setMenuOpen(false); setExamplesOpen(true) },
    }
  ]

  const bottomElements: Array<ModalMenuElement> = [
    {
      element:
        <MenuElement>
          <Toggle initChecked={true} onChange={(e) => modelerRef.current?.setSetting("blackRelations", !e.target.checked)} />
          <Label>Coloured Relations</Label>
        </MenuElement>
    },
    {
      element:
        <MenuElement>
          <DropDown
            options={[{ title: "Default", value: "default" }, { title: "Proposed", value: "proposedMarkers" }, { title: "New", value: "newMarkers" }]}
            onChange={(option) => isSettingsVal(option) && modelerRef.current?.setSetting("markerNotation", option)}
          />
          <Label>Relation Notation</Label>
        </MenuElement>
    }
  ]

  return (
    <>
      <GraphNameInput
        value={graphName}
        onChange={e => setGraphName(e.target.value)}
      />
      {loading && <Loading />}
      <Modeler modelerRef={modelerRef} />
      <TopRightIcons>
        {isFullscreen ?
          <BiExitFullscreen title='Exit Fullscreen'
            onClick={() => { document.exitFullscreen(); setIsFullscreen(false) }}
          />
          :
          <BiFullscreen title='Enter Fullscreen'
            onClick={() => { document.documentElement.requestFullscreen(); setIsFullscreen(true) }}
          />}
        <BiHome onClick={() => setState(StateEnum.Home)} />
        <ModalMenu elements={menuElements} bottomElements={bottomElements} open={menuOpen} setOpen={setMenuOpen} />
      </TopRightIcons>
      {examplesOpen && <Examples
        examplesData={examplesData}
        openCustomXML={(xml) => open(xml, modelerRef.current?.importCustomXML)}
        openDCRXML={(xml) => open(xml, modelerRef.current?.importDCRPortalXML)}
        setExamplesOpen={setExamplesOpen}
        setLoading={setLoading}
      />}
    </>
  )
}

export default ModelerState