import Modeler from './Modeler';
import DCRModeler from "modeler";
import styled from "styled-components";

import emptyBoardXML from '../resources/emptyBoard';
import { useEffect, useRef, useState } from 'react';

import { saveAs } from 'file-saver';
import { StateEnum, StateProps } from '../App';
import FileUpload from '../utilComponents/FileUpload';
import ModalMenu, { ModalMenuElement } from '../utilComponents/ModalMenu';

import { BiHome, BiLeftArrowCircle, BiPlus, BiSave, BiSolidDashboard } from 'react-icons/bi';

import Examples from './Examples';
import { toast } from 'react-toastify';
import TopRightIcons from '../utilComponents/TopRightIcons';
import Toggle from '../utilComponents/Toggle';
import DropDown from '../utilComponents/DropDown';
import { isSettingsVal } from '../types';
import { useHotkeys } from 'react-hotkeys-hook';
import FullScreenIcon from '../utilComponents/FullScreenIcon';

const StyledFileUpload = styled.div`
  width: 100%;
  & > label > svg {
    font-size: 25px;
  }
  & > label {
    padding: 1rem;
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
  padding: 1rem;
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
  margin-top: 0.5rem;
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

const initGraphName = "DCR-JS Graph"

const ModelerState = ({ setState, savedGraphs, setSavedGraphs }: StateProps) => {
  const [examplesOpen, setExamplesOpen] = useState(false);
  const [examplesData, setExamplesData] = useState<Array<string>>([]);

  const [menuOpen, setMenuOpen] = useState(false);

  const [loading, setLoading] = useState(false);

  const modelerRef = useRef<DCRModeler | null>(null);

  const lastGraph = Object.keys(savedGraphs).pop();

  const [graphName, setGraphName] = useState<string>(lastGraph ? lastGraph : initGraphName);
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
  }, []);

  const open = (data: string, parse: ((xml: string) => Promise<void>) | undefined, importFn?: string) => {
    const importName = importFn?.slice(0, -4);
    parse && parse(data).then(_ => { setGraphName(importName ? importName : initGraphName); setGraphId(importName ? importName : "") }).catch((e) => { console.log(e); toast.error("Unable to parse XML...") });
  }

  const saveAsXML = async () => {
    if (!modelerRef.current) return;

    const data = await modelerRef.current.saveXML({ format: true });
    const blob = new Blob([data.xml]);
    saveAs(blob, `${graphName}.xml`);
  }

  const saveAsDCRXML = async () => {
    if (!modelerRef.current) return;

    const data = await modelerRef.current.saveDCRXML();
    const blob = new Blob([data.xml]);
    saveAs(blob, `${graphName}.xml`);
  }

  const saveAsSvg = async () => {
    if (!modelerRef.current) return;
    const data = await modelerRef.current.saveSVG();
    const blob = new Blob([data.svg]);
    saveAs(blob, `${graphName}.svg`);
  }

  const savedGraphElements = () => {
    return Object.keys(savedGraphs).length > 0 ? [{
      text: "Saved Graphs:",
      elements: Object.keys(savedGraphs).map(name => {
        return ({
          icon: <BiLeftArrowCircle />,
          text: name,
          onClick: () => { open(savedGraphs[name], modelerRef.current?.importXML, name + ".xml"); setMenuOpen(false) },
        })
      })
    }] : [];
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
      text: "Open",
      elements: [
        {
          customElement: (
            <StyledFileUpload>
              <FileUpload accept="text/xml" fileCallback={(name, contents) => { open(contents, modelerRef.current?.importXML, name); setMenuOpen(false); }}>
                <div />
                <>Open Editor XML</>
              </FileUpload>
            </StyledFileUpload>),
        },
        {
          customElement: (
            <StyledFileUpload>
              <FileUpload accept="text/xml" fileCallback={(name, contents) => { open(contents, modelerRef.current?.importDCRPortalXML, name); setMenuOpen(false); }}>
                <div />
                <>Open DCR Solution XML</>
              </FileUpload>
            </StyledFileUpload>),
        },
      ]
    },
    {
      text: "Download",
      elements: [{
        icon: <div />,
        text: "Download Editor XML",
        onClick: () => { saveAsXML(); setMenuOpen(false) },
      },
      {
        icon: <div />,
        text: "Download DCR Solutions XML",
        onClick: () => { saveAsDCRXML(); setMenuOpen(false) },
      },
      {
        icon: <div />,
        text: "Download SVG",
        onClick: () => { saveAsSvg(); setMenuOpen(false) },
      }
      ],
    },
    {
      icon: <BiSolidDashboard />,
      text: "Examples",
      onClick: () => { setMenuOpen(false); setExamplesOpen(true) },
    },
    ...savedGraphElements()
  ]

  const bottomElements: Array<ModalMenuElement> = [
    {
      customElement:
        <MenuElement>
          <Toggle initChecked={true} onChange={(e) => modelerRef.current?.setSetting("blackRelations", !e.target.checked)} />
          <Label>Coloured Relations</Label>
        </MenuElement>
    },
    {
      customElement:
        <MenuElement>
          <DropDown
            options={[{ title: "TAL2023", value: "TAL2023", tooltip: "https://link.springer.com/chapter/10.1007/978-3-031-46846-9_12" }, { title: "HM2011", value: "HM2011", tooltip: "https://arxiv.org/abs/1110.4161" }, { title: "DCR Solutions", value: "DCR Solutions", tooltip: "https://dcrsolutions.net/" }]}
            onChange={(option) => isSettingsVal(option) && modelerRef.current?.setSetting("markerNotation", option)}
          />
          <Label>Relation Notation</Label>
        </MenuElement>
    }
  ]

  const initXml = lastGraph ? savedGraphs[lastGraph] : undefined;

  return (
    <>
      <GraphNameInput
        value={graphName}
        onChange={e => setGraphName(e.target.value)}
      />
      {loading && <Loading />}
      <Modeler initXml={initXml} modelerRef={modelerRef} />
      <TopRightIcons>
        <FullScreenIcon />
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