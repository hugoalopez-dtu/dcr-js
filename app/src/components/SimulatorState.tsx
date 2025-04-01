import { useEffect, useMemo, useRef, useState } from "react";
import { StateEnum, StateProps } from "../App";
import { toast } from "react-toastify";
import TopRightIcons from "../utilComponents/TopRightIcons";
import { BiCheck, BiHome, BiLeftArrowCircle, BiMeteor, BiQuestionMark, BiReset, BiTrash, BiUpload, BiX } from "react-icons/bi";
import Modeler from "./Modeler";

import { SubProcess, Event, isEnabledS, executeS, copyMarking, moddleToDCR, isAcceptingS } from "dcr-engine";
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
import { parseLog, writeEventLog } from "dcr-engine/src/eventLogs";
import { replayTraceS } from "dcr-engine/src/conformance";

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

const ResultsWindow = styled.div<{ $traceSelected: boolean; }>`
    position: fixed;
    top: 0;
    left: 0;
    height: 100vh;
    width: 30rem;
    box-shadow: ${props => props.$traceSelected ? "none" : "0px 0px 5px 0px grey"};
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

const TraceWindow = styled.div<{ $hugLeft: boolean; }>`
    position: fixed;
    top: 0;
    left: ${ props => props.$hugLeft ? "0rem" : "30rem"};
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

const TraceNameInput = styled.input`
    font-size: 20px;
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
  cursor: ${props => !props.$simulating ? "pointer" : "default"};
  box-sizing: border-box;
  color: ${props => props.$selected ? "white" : "black"};
  background-color: ${props => props.$selected ? "gainsboro" : "white"};

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
  color: black;
  &:hover {
    color: white;
  }
`

const ResetTrace = styled(BiReset)`
  display: block;
  height: 30px;
  width: 30px;
  margin: auto;
  margin-left: 1rem;
  margin-right: 1rem;
  cursor: pointer;
  color: black;
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

const WildButton = styled(BiMeteor)<{ $clicked: boolean, $disabled?: boolean }>`
    ${props => props.$clicked ? `
        background-color: black !important;
        color: white;
    ` : ``}
    ${props => props.$disabled ? `
        color : grey;
        border-color: grey !important;
        cursor: default !important;
        &:hover {
            box-shadow: none !important;
        }    
    ` : ""}
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

const GreenCheck = styled(BiCheck)`
        display: block;
        color: white;
        border-radius: 50%;
        margin: auto;
        margin-right: 1rem;
        margin-left: 1rem;
        background-color: green;
`

const RedX = styled(BiX)`
        display: block;
        color: white;
        border-radius: 50%;
        margin: auto;
        margin-right: 1rem;
        margin-left: 1rem;
        background-color: red;
`

const OrangeQuestion = styled(BiQuestionMark)`
        display: block;
        color: white;
        border-radius: 50%;
        margin: auto;
        margin-right: 1rem;
        margin-left: 1rem;
        background-color: orange;
`

const DeleteTrace = styled(BiTrash)`
    display: block;
    height: 20px;
    width: 20px;
    margin: auto;
    margin-left: 0.5rem;
    margin-right: 0.5rem;
    cursor: pointer;
    color: black !important;
    &:hover {
      color: white !important;
    }
`

const resultIcon = (val: boolean | undefined) => {
    switch (val) {
        case undefined:
            return <OrangeQuestion title="free trace" />
        case true:
            return <GreenCheck title="accepting" />
        case false:
            return <RedX title="not accepting" />
    }
}

let id = 0;

const SimulatorState = ({ setState, savedGraphs, savedLogs, setSavedLogs, lastSavedGraph, lastSavedLog }: StateProps) => {
    const modelerRef = useRef<DCRModeler | null>(null);
    const graphRef = useRef<{ initial: DCRGraphS, current: DCRGraphS } | null>(null);

    const [menuOpen, setMenuOpen] = useState(false);
    const [selectedTrace, setSelectedTrace] = useState<{ traceId: string, traceName: string, trace: Trace } | null>({ traceId: "Trace 0", traceName: "Trace 0", trace: [] });
    const [eventLog, setEventLog] = useState<{
        name: string,
        traces: {
            [traceId: string]: { traceId: string, traceName: string, trace: Trace }
        },
    }>({ name: "Unnamed Event Log", traces: {} });

    const [traceName, setTraceName] = useState("Trace 0");
    const [wildMode, setWildMode] = useState(false);

    const isSimulatingRef = useRef<SimulatingEnum>(SimulatingEnum.Default);
    const traceRef = useRef<{ traceId: string, trace: Array<string> } | null>({ traceId: "Trace 0", trace: [] });

    const traceIsAccepting = useMemo<boolean | undefined>(() => {
        if (graphRef.current === null || selectedTrace === null) return undefined;
        return replayTraceS(graphRef.current?.initial, selectedTrace?.trace);
    }, [selectedTrace])

    useEffect(() => {
        const lastLog = lastSavedLog.current;
        const initLog = lastLog ? savedLogs[lastLog] : undefined;
        if (initLog && lastLog) {
            openLog(lastLog, initLog)
        } else {
            setEventLog({ name: "Unnamed Event Log", traces:  { "Trace 0": { traceId: "Trace 0", traceName: "", trace: [] }} });
        }
    }, []);

    const saveLog = () => {
        if (!graphRef.current?.current) return;
        const newSavedLogs = { ...savedLogs };
        newSavedLogs[eventLog.name] = {traces: Object.values(eventLog.traces).reduce( (acc, {traceName, trace}) => ({...acc, [traceName]: trace }), {}), events: graphRef.current?.current.events };
        setSavedLogs(newSavedLogs);
        console.log(newSavedLogs);
        lastSavedLog.current = eventLog.name;
        toast.success("Log saved!");
    }

    const openLog = (name: string, log: EventLog) => {
        if (Object.keys(eventLog.traces).length === 0 || confirm("This will override your current event log! Do you wish to continue?")) {
            const el = { name, traces: Object.keys(log.traces).map( traceName => ({traceName, traceId: traceName, trace: log.traces[traceName]})).reduce( (acc, cum) => ({...acc, [cum.traceId]: cum}), {}) };
            setEventLog(el);
            console.log(el, log);
            isSimulatingRef.current = SimulatingEnum.Not;
            traceRef.current = { traceId: "Trace 0", trace: [] };
            setSelectedTrace(null);
            setTraceName("");
            reset();
        }
    }

    const open = (data: string, parse: ((xml: string) => Promise<void>) | undefined) => {
        if (data.includes("multi-instance=\"true\"")) {
            toast.error("Multi-instance subprocesses not supported...");
        } else {
            if (Object.keys(eventLog.traces).length === 0 || confirm("This will override your current event log! Do you wish to continue?")) {
                parse && parse(data).then((_) => {
                    if (modelerRef.current && graphRef.current) {
                        const graph = moddleToDCR(modelerRef.current.getElementRegistry());
                        graphRef.current = { initial: graph, current: { ...graph, marking: copyMarking(graph.marking) } };
                        modelerRef.current.updateRendering(graph);
                        setEventLog({ name: "Unnamed Event Log", traces: { "Trace 0": { traceId: "Trace 0", traceName: "", trace: [] }} });
                        isSimulatingRef.current = SimulatingEnum.Default;
                        traceRef.current = { traceId: "Trace 0", trace: [] };
                        setSelectedTrace({ traceId: "Trace 0", traceName: "Trace 0", trace: [] });
                        setTraceName("Trace 0");
                    }
                }).catch((e) => { console.log(e); toast.error("Unable to parse XML...") });
            }
        }
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

        let group: SubProcess | DCRGraphS = graph.subProcessMap[event];
        if (!group) group = graph;

        const enabledResponse = isEnabledS(event, graph, group);
        if (isSimulatingRef.current !== SimulatingEnum.Wild && !enabledResponse.enabled) {
            return { msg: enabledResponse.msg, executedEvent: "" };
        }
        console.log("executing: ", event);
        executeS(event, graph);
        return { msg: logExcecutionString(eventElement), executedEvent: traceString(eventElement) };
    }

    const eventClick = (event: any) => {
        if (event.element.type !== "dcr:Event" ||
            isSimulatingRef.current === SimulatingEnum.Not ||
            !traceRef.current ||
            !modelerRef.current ||
            !graphRef.current
        ) return;

        const response = executeEvent(event.element, graphRef.current.current);

        if (response.executedEvent !== "") {
            traceRef.current.trace.push(response.executedEvent);
            setSelectedTrace({ traceId: "Trace " + traceRef.current.traceId, traceName, trace: [...traceRef.current.trace] });
        } else {
            toast.warn(response.msg);
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
        for (const entry of Object.values(eventLog.traces)) {
            logToExport.traces[entry.traceName] = entry.trace;
        }
        const data = writeEventLog(logToExport);
        const blob = new Blob([data]);
        saveAs(blob, `${eventLog.name}.xes`);
    }

    const savedGraphElements = () => {
        return Object.keys(savedGraphs).length > 0 ? [{
          text: "Saved Graphs:",
          elements: Object.keys(savedGraphs).map(name => {
            return ({
              icon: <BiLeftArrowCircle />,
              text: name,
              onClick: () => { open(savedGraphs[name], modelerRef.current?.importXML); setMenuOpen(false) },
            })
          })
        }] : [];
      }

      const savedLogElements = () => {
        return Object.keys(savedLogs).length > 0 ? [{
          text: "Saved Logs:",
          elements: Object.keys(savedLogs).map(name => {
            return ({
              icon: <BiLeftArrowCircle />,
              text: name,
              onClick: () => { 
                const log = savedLogs[name];
                openLog(name, log);
                setMenuOpen(false); },
            })
          })
        }] : [];
      }

    const menuElements: Array<ModalMenuElement> = [{
          text: "Open",
          elements: [
            {
              customElement: (
                <StyledFileUpload>
                  <FileUpload accept="text/xml" fileCallback={(_, contents) => { open(contents, modelerRef.current?.importXML); setMenuOpen(false); }}>
                    <div />
                    <>Open Editor XML</>
                  </FileUpload>
                </StyledFileUpload>),
            },
            {
              customElement: (
                <StyledFileUpload>
                  <FileUpload accept="text/xml" fileCallback={(_, contents) => { open(contents, modelerRef.current?.importDCRPortalXML); setMenuOpen(false); }}>
                    <div />
                    <>Open DCR Solution XML</>
                  </FileUpload>
                </StyledFileUpload>),
            },
          ]
        },
        {
            customElement: (
              <StyledFileUpload>
                <FileUpload accept=".xes" fileCallback={(name, contents) => { 
                    try {
                        const log = parseLog(contents);
                        openLog(name.slice(0, -4), log);
                    } catch (e) {
                        toast.error("Unable to parse log...")
                    }
                    setMenuOpen(false); 
                }}>
                  <BiUpload />
                  <>Upload Log</>
                </FileUpload>
              </StyledFileUpload>),
          }, 
        ...savedGraphElements(),
        ...savedLogElements()
    ];

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

    const lastGraph = lastSavedGraph.current;
    const initXml = lastGraph ? savedGraphs[lastGraph] : undefined;

    return (
        <>
            {isSimulatingRef.current === SimulatingEnum.Not ? <GreyOut /> : null}
            <Modeler modelerRef={modelerRef} initXml={initXml} override={{ graphRef: graphRef, overrideOnclick: eventClick, canvasClassName: "simulating" }} />
            {isSimulatingRef.current === SimulatingEnum.Not && <ResultsWindow $traceSelected={selectedTrace !== null}>
                <EventLogInput value={eventLog.name} onChange={(e) => setEventLog({ ...eventLog, name: e.target.value })} />
                {Object.values(eventLog.traces).map(({ trace, traceName, traceId }) =>
                    <ResultsElement
                        $simulating={isSimulatingRef.current !== SimulatingEnum.Not}
                        $selected={selectedTrace !== null && selectedTrace.traceId === traceId}
                        key={traceId}
                        onClick={() => {
                            if (isSimulatingRef.current === SimulatingEnum.Not) {
                                traceRef.current = { trace, traceId};
                                setTraceName(traceName);
                                setSelectedTrace({ trace, traceName, traceId })
                            }
                        }}
                    >
                        {traceName}
                        <DeleteTrace onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`This will delete the trace '${traceName}'. Are you sure?`)) {
                                const newTraces = {...eventLog.traces};
                                delete newTraces[traceId];
                                const newEL = {...eventLog, traces: newTraces};
                                if (traceId === selectedTrace?.traceId) {
                                    setSelectedTrace(null);
                                }
                                setEventLog(newEL);
                            }
                        }}/>
                    </ResultsElement>)}
                <FlexBox direction="row" $justify="space-around" style={{ marginTop: "auto" }}>
                    <Button disabled={isSimulatingRef.current !== SimulatingEnum.Not} onClick={() => {
                        isSimulatingRef.current = SimulatingEnum.Default;
                        const traceId = "Trace " + id++;
                        console.log(id);
                        setEventLog({ ...eventLog, traces: {...eventLog.traces, [traceId]: { traceId: traceId, traceName: traceId, trace: [] }} });
                        setSelectedTrace({ traceId: traceId, traceName: traceId, trace: [] });
                        traceRef.current = { traceId, trace: [] };
                        setTraceName(traceId);
                    }}>
                        Add new trace
                    </Button>
                    <Button disabled={isSimulatingRef.current !== SimulatingEnum.Not} onClick={saveLog}>
                        Save log
                    </Button>
                    <Button disabled={isSimulatingRef.current !== SimulatingEnum.Not} onClick={saveEventLog}>
                        Export log
                    </Button>
                </FlexBox>
            </ResultsWindow>}
            {selectedTrace && <TraceWindow $hugLeft={isSimulatingRef.current !== SimulatingEnum.Not}>
                <ResultsHeader>
                    <TraceNameInput value={traceName} onChange={(e) => setTraceName(e.target.value)} />
                    {resultIcon(traceIsAccepting)}
                    {isSimulatingRef.current !== SimulatingEnum.Not &&  <ResetTrace onClick={() => {
                        if (!traceRef.current) return;
                        
                        const traceId = traceRef.current.traceId;
                        setSelectedTrace({ traceId: "Trace " + traceId, traceName, trace: [] });
                        traceRef.current = { traceId, trace: [] };
                        reset();
                    }} />}
                    <CloseTrace onClick={() => {
                        if (isSimulatingRef.current !== SimulatingEnum.Not) {
                            const eventLogCopy = { ...eventLog, traces: {...eventLog.traces}};
                            delete eventLogCopy.traces[selectedTrace.traceId];
                            setEventLog(eventLogCopy);
                        } else if (traceRef.current) {
                            const eventLogCopy = { ...eventLog, traces: {...eventLog.traces}};
                            eventLogCopy.traces[traceRef.current.traceId].traceName = traceName;
                            setEventLog(eventLogCopy);
                        }
                        setWildMode(false);
                        isSimulatingRef.current = SimulatingEnum.Not;
                        setSelectedTrace(null);
                        reset();
                    }} />
                </ResultsHeader>
                <ul>
                    {selectedTrace.trace.map((activity, idx) => <Activity key={activity + idx}>{activity}</Activity>)}
                </ul>
                {isSimulatingRef.current !== SimulatingEnum.Not && <FinalizeButton onClick={() => {
                    if (!graphRef.current?.current) return;
                    if ((isSimulatingRef.current === SimulatingEnum.Wild || isAcceptingS(graphRef.current.current, graphRef.current.current)) && traceRef.current) {
                        isSimulatingRef.current = SimulatingEnum.Not;
                        const eventLogCopy = { ...eventLog, traces: {...eventLog.traces }};
                        eventLogCopy.traces[traceRef.current.traceId].traceName = traceName;
                        eventLogCopy.traces[traceRef.current.traceId].trace = traceRef.current.trace;
                        setEventLog(eventLogCopy);
                        setWildMode(false);
                        setSelectedTrace(null);
                        reset();
                    } else {
                        toast.warn("Graph is not accepting...");
                    }
                }}>
                    Finalize trace
                </FinalizeButton>}
            </TraceWindow>}
            <TopRightIcons>
                <WildButton $disabled={isSimulatingRef.current === SimulatingEnum.Not} title={wildMode ? "Disable non-conformant behaviour" : "Enable non-conformant behaviour"} $clicked={wildMode} onClick={() => {
                    if (isSimulatingRef.current === SimulatingEnum.Not) return;
                    if (wildMode) {
                        setWildMode(false);
                        isSimulatingRef.current = SimulatingEnum.Default;
                    } else {
                        setWildMode(true);
                        isSimulatingRef.current = SimulatingEnum.Wild;
                    }
                }}/>
                <FullScreenIcon />
                <BiHome onClick={() => setState(StateEnum.Home)} />
                <ModalMenu elements={menuElements} open={menuOpen} bottomElements={bottomElements} setOpen={setMenuOpen} />
            </TopRightIcons>
        </>
    )
}

export default SimulatorState