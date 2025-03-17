import { useRef, useState } from "react";
import { StateEnum, StateProps } from "../App";
import { toast } from "react-toast";
import TopRightIcons from "../utilComponents/TopRightIcons";
import { BiHome, BiLeftArrowCircle, BiSolidFolderOpen, BiX } from "react-icons/bi";
import Modeler from "./Modeler";

import { SubProcess, Event, isEnabledS, executeS, copyMarking, moddleToDCR, isAccepting } from "dcr-engine";
import ModalMenu, { ModalMenuElement } from "../utilComponents/ModalMenu";
import FullScreenIcon from "../utilComponents/FullScreenIcon";
import styled from "styled-components";
import Toggle from "../utilComponents/Toggle";
import DropDown from "../utilComponents/DropDown";
import { isSettingsVal } from "../types";
import FileUpload from "../utilComponents/FileUpload";
import { DCRGraphS, EventLog, Trace } from "dcr-engine/src/types";
import Button from "../utilComponents/Button";
import FlexBox from "../utilComponents/FlexBox";

import { saveAs } from 'file-saver';
import { writeEventLog } from "dcr-engine/src/eventLogs";

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

const ResultsWindow = styled.div<{ $traceSelected: boolean; }>`
    position: fixed;
    top: 0;
    left: 0;
    height: 100vh;
    width: 30rem;
    box-shadow: ${ props => props.$traceSelected ? "none" : "0px 0px 5px 0px grey"};
    display: flex;
    flex-direction: column;
    padding-top: 2rem;
    padding-bottom: 2rem;
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
    padding-top: 2rem;
    padding-bottom: 2rem;
    font-size: 20px;
    background-color: gainsboro;
    box-sizing: border-box;
    overflow: scroll;
    z-index: 4;
`

const EventLogInput = styled.input`
    font-size: 30px;
    width: fit-content;
    background: transparent;
    appearance: none;
    border: none;
    margin-bottom: 0.5rem;
    padding: 0.25rem 0.5rem 0.25rem 0.5rem;
    margin: 0.25rem 0.5rem 0.25rem 0.5rem;
    &:focus {
      outline: 2px dashed black;
    }
`

const ResultsElement = styled.li<{ $simulating: boolean, $selected: boolean; }>`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  width: 100%;
  padding: 0.5rem 1rem 0.5rem 1rem;
  cursor: ${props => !props.$simulating ? "pointer" : "default" };
  box-sizing: border-box;
  color: ${ props => props.$selected ? "white" : "black"};
  background-color: ${ props => props.$selected ? "gainsboro" : "white"};

  ${props => !props.$simulating ? `&:hover {
      color: white;
      background-color: Gainsboro;
  }` : ""}

  & > svg {
    color: white;
    border-radius: 50%;
  }
`

const ResultsHeader = styled.h1`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  font-size: 30px;
  font-weight: normal;
  padding: 0.5rem 1rem 0.5rem 1rem;
  margin: 0;
`

const CloseTrace = styled(BiX)`
  display: block;
  height: 30px;
  width: 30px;
  margin: auto;
  margin-left: 1rem;
  margin-right: 1rem;
  cursor: pointer;
  &:hover {
    color: white;
  }
`

const Activity = styled.li`
  width: 100%;
  padding: 0.5rem 1rem 0.5rem 1rem;
  box-sizing: border-box;
`

const GreyOut = styled.div`
    position: fixed;
    height: 100%;
    width: 100%;
    top: 0;
    left: 0;
    cursor: default;
    opacity: 50%;
    background-color: grey;
    z-index: 3;
`

const FinalizeButton = styled(Button)`
    margin: auto;
    margin-bottom: 0;
    width: fit-content;
`

enum SimulatingEnum {
    Default,
    Wild,
    Not
}

const SimulatorState = ({ setState, savedGraphs }: StateProps) => {
    const modelerRef = useRef<DCRModeler | null>(null);
    const graphRef = useRef<{ initial: DCRGraphS, current: DCRGraphS } | null>(null);

    const [menuOpen, setMenuOpen] = useState(false);
    const [selectedTrace, setSelectedTrace] = useState<{traceId: string, trace: Trace} | null>(null);
    const [eventLog, setEventLog] = useState<{
        name: string,
        traces: Array<{traceId: string, trace: Trace}>,
    }>({ name: "Unnamed Event Log", traces: [ ]});

    const isSimulatingRef = useRef<SimulatingEnum>(SimulatingEnum.Not);
    const traceRef = useRef<{traceId: number, trace: Array<string>} | null>(null);

    const open = (data: string, parse: ((xml: string) => Promise<void>) | undefined) => {
        if (data.includes("multi-instance=\"true\"")) {
            toast.error("Multi-instance subprocesses not supported...");
        } else {
            if (eventLog.traces.length === 0 || confirm("This will override your current event log! Do you wish to continue?")) {
                parse && parse(data).then((_) => {
                    if (modelerRef.current && graphRef.current) {
                        const graph = moddleToDCR(modelerRef.current.getElementRegistry());
                        graphRef.current = { initial: graph, current: { ...graph, marking: copyMarking(graph.marking) } };
                        modelerRef.current.updateRendering(graph);
                        setEventLog({ name: "Unnamed Event Log", traces: [ ]});
                        isSimulatingRef.current = SimulatingEnum.Not;
                        traceRef.current = null;
                        setSelectedTrace(null);
                    }
                }).catch((e) => { console.log(e); toast.error("Unable to parse XML...") });
            }
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
        // Allow anything in Wild mode
        if (isSimulatingRef.current === SimulatingEnum.Wild) return { msg: logExcecutionString(eventElement), executedEvent: traceString(eventElement) };
        
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
        if (isSimulatingRef.current === SimulatingEnum.Not || !traceRef.current || !modelerRef.current || !graphRef.current) return;

        const response = executeEvent(event.element, graphRef.current.current);
        console.log(response);
        if (response.executedEvent !== "") {
            traceRef.current.trace.push(response.executedEvent);
            setSelectedTrace( { traceId: "Trace " + traceRef.current.traceId, trace: [...traceRef.current.trace] });
        }
        modelerRef.current.updateRendering(graphRef.current.current);
    }

    const reset = () => {
        if (graphRef.current && modelerRef.current) {
            graphRef.current.current = { ...graphRef.current.initial, marking: copyMarking(graphRef.current.initial.marking) };
            modelerRef.current.updateRendering(graphRef.current.current);
        }
    }

    const saveEventLog = () => {
        if (!modelerRef.current || !graphRef.current) return;
        const logToExport: EventLog = {
            events: graphRef.current?.initial.events,
            traces: {}
        }
        for (const entry of eventLog.traces) {
            logToExport.traces[entry.traceId] = entry.trace;
        }
        const data = writeEventLog(logToExport);
        const blob = new Blob([data]);
        saveAs(blob, `${eventLog.name}.xes`);
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
            {isSimulatingRef.current === SimulatingEnum.Not ? <GreyOut /> : null}
            <Modeler modelerRef={modelerRef} override={{ graphRef: graphRef, overrideOnclick: eventClick, canvasClassName: "simulating" }} />
            <ResultsWindow $traceSelected={selectedTrace !== null}>
                <EventLogInput value={eventLog.name} onChange={(e) => setEventLog({ ...eventLog, name: e.target.value })}/>
                {eventLog.traces.map( ({trace, traceId }) => 
                    <ResultsElement 
                        $simulating={isSimulatingRef.current !== SimulatingEnum.Not} 
                        $selected={selectedTrace !== null && selectedTrace.traceId === traceId} 
                        key={traceId} 
                        onClick={() => {
                            if (isSimulatingRef.current === SimulatingEnum.Not) setSelectedTrace({trace, traceId}) 
                        }}
                    >
                        {traceId}
                    </ResultsElement>)}
                <FlexBox direction="row" $justify="space-around" style={{marginTop: "auto"}}>
                    <Button disabled={isSimulatingRef.current !== SimulatingEnum.Not} onClick={() => {
                        isSimulatingRef.current = SimulatingEnum.Default;
                        const traceId = eventLog.traces.length;
                        setEventLog( {...eventLog, traces: [...eventLog.traces, { traceId: "Trace " + traceId, trace: []}]});
                        setSelectedTrace({ traceId: "Trace " + traceId, trace: []});
                        traceRef.current = { traceId, trace: [] };
                    }}>
                        Add new trace
                    </Button>
                    <Button disabled={isSimulatingRef.current !== SimulatingEnum.Not} onClick={() => {
                        isSimulatingRef.current = SimulatingEnum.Wild;
                        const traceId = eventLog.traces.length;
                        setEventLog( {...eventLog, traces: [...eventLog.traces, { traceId: "Trace " + traceId, trace: []}]});
                        setSelectedTrace({ traceId: "Trace " + traceId, trace: []});
                        traceRef.current = { traceId, trace: [] };
                    }}>
                        Add non-conforming trace
                    </Button>
                    <Button disabled={isSimulatingRef.current !== SimulatingEnum.Not} onClick={saveEventLog}>
                        Export log
                    </Button>
                </FlexBox>
            </ResultsWindow>
            {selectedTrace && <TraceWindow>
             <ResultsHeader>
              {selectedTrace.traceId}
              <CloseTrace onClick={() => {
                if (isSimulatingRef.current !== SimulatingEnum.Not) {
                    setEventLog( {...eventLog, traces: eventLog.traces.filter( entry => entry.traceId !== selectedTrace.traceId)});
                }
                isSimulatingRef.current = SimulatingEnum.Not;
                setSelectedTrace(null);
                reset();
              }}/>
             </ResultsHeader>
             <ul>
              {selectedTrace.trace.map( (activity, idx) => <Activity key={activity + idx}>{activity}</Activity>)}
             </ul>
             {isSimulatingRef.current !== SimulatingEnum.Not && <FinalizeButton onClick={() => {
                if (!graphRef.current?.current) return;
                if (isAccepting(graphRef.current.current) && traceRef.current) {
                    isSimulatingRef.current = SimulatingEnum.Not;
                    const eventLogCopy = {...eventLog, traces: [...eventLog.traces]};
                    eventLogCopy.traces[traceRef.current.traceId].trace = traceRef.current.trace;
                    setSelectedTrace(null);
                    reset();
                } else {
                    toast.warn("Graphs is not accepting...");
                }
             }}>
                Finalize trace
             </FinalizeButton>}
            </TraceWindow>}
            <TopRightIcons>
                <FullScreenIcon />
                <BiHome onClick={() => setState(StateEnum.Home)} />
                <ModalMenu elements={menuElements} open={menuOpen} bottomElements={bottomElements} setOpen={setMenuOpen} />
            </TopRightIcons>
        </>
    )
}

export default SimulatorState