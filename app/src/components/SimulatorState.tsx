import { useRef, useState } from "react";
import { StateEnum, StateProps } from "../App";
import { toast } from "react-toast";
import TopRightIcons from "../utilComponents/TopRightIcons";
import { BiHome, BiLeftArrowCircle, BiReset, BiSolidFolderOpen } from "react-icons/bi";
import Modeler from "./Modeler";

import { SubProcess, Event, isEnabledS, executeS, copyMarking, moddleToDCR } from "dcr-engine";
import ModalMenu, { ModalMenuElement } from "../utilComponents/ModalMenu";
import FullScreenIcon from "../utilComponents/FullScreenIcon";
import styled from "styled-components";
import Toggle from "../utilComponents/Toggle";
import DropDown from "../utilComponents/DropDown";
import { isSettingsVal } from "../types";
import FileUpload from "../utilComponents/FileUpload";
import { DCRGraphS } from "dcr-engine/src/types";

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

const SavedGraphs = styled.label`
    padding: 1rem;
`

const Label = styled.label`
  margin-top: auto;
  margin-bottom: auto;
`
/*
const ResultsWindow = styled.div<{ $traceSelected: boolean; }>`
    position: fixed;
    top: 0;
    left: 0;
    height: 100vh;
    width: 30rem;
    box-shadow: ${ props => props.$traceSelected ? "none" : "0px 0px 5px 0px grey"};
    display: flex;
    flex-direction: column;
    padding-top: 1rem;
    padding-bottom: 1rem;
    font-size: 20px;
    background-color: white;
    box-sizing: border-box;
    overflow: scroll;
    z-index: 5;
`

const TraceWindow = styled.div`
    position: fixed;
    top: 0;
    left: 30rem;
    height: 100vh;
    box-shadow: 0px 0 5px 0px grey;
    display: flex;
    flex-direction: column;
    padding-top: 1rem;
    padding-bottom: 1rem;
    font-size: 20px;
    background-color: gainsboro;
    box-sizing: border-box;
    overflow: scroll;
` */

const SimulatorState = ({ setState, savedGraphs }: StateProps) => {
    const modelerRef = useRef<DCRModeler | null>(null);
    const graphRef = useRef<{ initial: DCRGraphS, current: DCRGraphS } | null>(null);

    const [menuOpen, setMenuOpen] = useState(false);

    const open = (data: string, parse: ((xml: string) => Promise<void>) | undefined) => {
        if (data.includes("multi-instance=\"true\"")) {
            toast.error("Multi-instance subprocesses not supported...");
        } else {
            parse && parse(data).then((_) => {
                if (modelerRef.current && graphRef.current) {
                    const graph = moddleToDCR(modelerRef.current.getElementRegistry());
                    graphRef.current = { initial: graph, current: { ...graph, marking: copyMarking(graph.marking) } };
                    modelerRef.current.updateRendering(graph);
                }
            }
        ).catch((e) => { console.log(e); toast.error("Unable to parse XML...") });
    }
    } 

    const findElementGroup = (event: Event, group: DCRGraphS | SubProcess): DCRGraphS | SubProcess | null => {
        if (group.events.has(event)) return group;

        let childGroup: DCRGraphS | SubProcess | null = null;

        group.subProcesses.forEach((subProcess: SubProcess) => {
            let ret = findElementGroup(event, subProcess);
            if (ret) childGroup = ret;
        });

        return childGroup;
    }

    function logExcecutionString(event: any): string {
        var eventName: String = event.businessObject.description;
        if (eventName == null || eventName === "") {
            return ("Executed Unnamed event");
        } else {
            return ("Executed  " + eventName);
        }
    }

    function traceString(event: any): string {
        var eventName: String = event.businessObject.description;
        if (eventName == null || eventName === "") {
            eventName = "Unnamed event";
        }
        return (eventName.toString());
    }

    const executeEvent = (eventElement: any, graph: DCRGraphS): { msg: string, executedEvent: string } => {
        const event: Event = eventElement.id;
        let eventName: String = eventElement.businessObject?.description;
        if (eventName == null || eventName === "") {
            eventName = "Unnamed event";
        }

        let group: DCRGraphS | SubProcess | null = findElementGroup(event, graph);
        if (!group) {
            return { msg: "Event not found in graph", executedEvent: "" };
        }

        const enabledResponse = isEnabledS(event, graph, group);
        if (!enabledResponse.enabled) {
            return { msg: enabledResponse.msg, executedEvent: "" };
        }
        executeS(event, graph, group);
        return { msg: logExcecutionString(eventElement), executedEvent: traceString(eventElement) };
    }

    const eventClick = (event: any) => {
        if (!modelerRef.current || !graphRef.current) return;

        const response = executeEvent(event.element, graphRef.current.current);
        console.log(response);
        modelerRef.current.updateRendering(graphRef.current.current);
    }

    const reset = () => {
        if (graphRef.current && modelerRef.current) {
            graphRef.current.current = { ...graphRef.current.initial, marking: copyMarking(graphRef.current.initial.marking) };
            modelerRef.current.updateRendering(graphRef.current.current);
        }
    }

    const menuElements: Array<ModalMenuElement> = [    {
        element: (
          <StyledFileUpload>
            <FileUpload accept="text/xml" fileCallback={(contents) => { open(contents, modelerRef.current?.importXML); setMenuOpen(false); }}>
              <BiSolidFolderOpen />
              <>Editor XML</>
            </FileUpload>
          </StyledFileUpload>),
      },{
        element: <SavedGraphs>Saved Graphs:</SavedGraphs>
    }, ...Object.keys(savedGraphs).map(name => {
        return ({
            icon: <BiLeftArrowCircle />,
            text: name,
            onClick: () => { open(savedGraphs[name], modelerRef.current?.importXML); setMenuOpen(false) },
        })
    })];

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
            <Modeler modelerRef={modelerRef} override={{ graphRef: graphRef, overrideOnclick: eventClick, canvasClassName: "simulating" }} />
            <TopRightIcons>
                <FullScreenIcon />
                <BiReset onClick={reset} />
                <BiHome onClick={() => setState(StateEnum.Home)} />
                <ModalMenu elements={menuElements} open={menuOpen} bottomElements={bottomElements} setOpen={setMenuOpen} />
            </TopRightIcons>
        </>
    )
}

export default SimulatorState