import { useEffect, useRef, useState } from "react";
import { StateEnum, StateProps } from "../App";
import { toast } from "react-toastify";
import TopRightIcons from "../utilComponents/TopRightIcons";
import { BiHome, BiLeftArrowCircle, BiMeteor, BiPlus, BiUpload } from "react-icons/bi";
import Modeler from "./Modeler";

import { SubProcess, Event, isEnabledS, executeS, copyMarking, moddleToDCR, isAcceptingS, RoleTrace } from "dcr-engine";
import ModalMenu, { ModalMenuElement } from "../utilComponents/ModalMenu";
import FullScreenIcon from "../utilComponents/FullScreenIcon";
import styled from "styled-components";
import Toggle from "../utilComponents/Toggle";
import DropDown from "../utilComponents/DropDown";
import { isSettingsVal } from "../types";
import FileUpload from "../utilComponents/FileUpload";
import { DCRGraphS, EventLog } from "dcr-engine";
import Button from "../utilComponents/Button";

import { saveAs } from 'file-saver';
import { parseLog, writeEventLog } from "dcr-engine";
import EventLogView from "./EventLogView";
import TraceView from "../utilComponents/TraceView";
import StyledFileUpload from "../utilComponents/StyledFileUpload";
import MenuElement from "../utilComponents/MenuElement";
import Label from "../utilComponents/Label";

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

const WildButton = styled(BiMeteor) <{ $clicked: boolean, $disabled?: boolean }>`
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

let id = 1;

const SimulatorState = ({ setState, savedGraphs, savedLogs, setSavedLogs, lastSavedGraph, lastSavedLog }: StateProps) => {
    const modelerRef = useRef<DCRModeler | null>(null);
    const graphRef = useRef<{ initial: DCRGraphS, current: DCRGraphS } | null>(null);

    const [menuOpen, setMenuOpen] = useState(false);
    const [selectedTrace, setSelectedTrace] = useState<{ traceId: string, traceName: string, trace: RoleTrace } | null>({ traceId: "Trace 0", traceName: "Trace 0", trace: [] });
    const [eventLog, setEventLog] = useState<{
        name: string,
        traces: {
            [traceId: string]: { traceId: string, traceName: string, trace: RoleTrace }
        },
    }>({ name: "Unnamed Event Log", traces: {} });

    const [traceName, setTraceName] = useState("Trace 0");
    const [wildMode, setWildMode] = useState(false);

    const isSimulatingRef = useRef<SimulatingEnum>(SimulatingEnum.Default);
    const traceRef = useRef<{ traceId: string, trace: RoleTrace } | null>({ traceId: "Trace 0", trace: [] });

    useEffect(() => {
        const lastLog = lastSavedLog.current;
        const initLog = lastLog ? savedLogs[lastLog] : undefined;
        if (initLog && lastLog) {
            openLog(lastLog, initLog)
        } else {
            setEventLog({ name: "Unnamed Event Log", traces: { "Trace 0": { traceId: "Trace 0", traceName: "", trace: [] } } });
        }
    }, []);

    const saveLog = () => {
        if (!graphRef.current?.current) return;
        const newSavedLogs = { ...savedLogs };
        newSavedLogs[eventLog.name] = { traces: Object.values(eventLog.traces).reduce((acc, { traceName, trace }) => ({ ...acc, [traceName]: trace }), {}), events: graphRef.current?.current.events };
        setSavedLogs(newSavedLogs);
        lastSavedLog.current = eventLog.name;
        toast.success("Log saved!");
    }

    const openLog = (name: string, log: EventLog<RoleTrace>) => {
        if (Object.keys(eventLog.traces).length === 0 || confirm("This will override your current event log! Do you wish to continue?")) {
            const el = { name, traces: Object.keys(log.traces).map(traceName => ({ traceName, traceId: traceName, trace: log.traces[traceName] })).reduce((acc, cum) => ({ ...acc, [cum.traceId]: cum }), {}) };
            setEventLog(el);
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
                        setEventLog({ name: "Unnamed Event Log", traces: { "Trace 0": { traceId: "Trace 0", traceName: "", trace: [] } } });
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
        var eventName: string = event.businessObject.description;
        if (eventName == null || eventName === "") {
            return ("Executed Unnamed event");
        } else {
            return ("Executed  " + eventName);
        }
    }

    function traceString(event: any): string {
        var eventName: string = event.businessObject.description;
        if (eventName == null || eventName === "") {
            eventName = "Unnamed event";
        }
        return (eventName.toString());
    }

    function roleString(event: any): string {
        var eventRole: string = event.businessObject.role;
        if (eventRole == null || eventRole === "") {
            eventRole = "";
        }
        return (eventRole.toString());
    }

    const executeEvent = (eventElement: any, graph: DCRGraphS): { msg: string, executedEvent: string, role: string } => {
        const event: Event = eventElement.id;
        let eventName: String = eventElement.businessObject?.description;
        if (eventName == null || eventName === "") {
            eventName = "Unnamed event";
        }

        let group: SubProcess | DCRGraphS = graph.subProcessMap[event];
        if (!group) group = graph;

        const enabledResponse = isEnabledS(event, graph, group);
        if (isSimulatingRef.current !== SimulatingEnum.Wild && !enabledResponse.enabled) {
            return { msg: enabledResponse.msg, executedEvent: "", role: "" };
        }
        executeS(event, graph);
        return { msg: logExcecutionString(eventElement), executedEvent: traceString(eventElement), role: roleString(eventElement) };
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
            traceRef.current.trace.push({ activity: response.executedEvent, role: response.role });
            setSelectedTrace({ traceId: traceRef.current.traceId, traceName, trace: [...traceRef.current.trace] });
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
        const logToExport: EventLog<RoleTrace> = {
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

    const closeTraceCallback = () => {
        if (!selectedTrace) return;
        if (isSimulatingRef.current !== SimulatingEnum.Not) {
            const eventLogCopy = { ...eventLog, traces: { ...eventLog.traces } };
            delete eventLogCopy.traces[selectedTrace.traceId];
            setEventLog(eventLogCopy);
        } else if (traceRef.current) {
            const eventLogCopy = { ...eventLog, traces: { ...eventLog.traces } };
            eventLogCopy.traces[traceRef.current.traceId].traceName = traceName;
            setEventLog(eventLogCopy);
        }
        isSimulatingRef.current = SimulatingEnum.Not;
    };

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
                        setMenuOpen(false);
                    },
                })
            })
        }] : [];
    }

    const menuElements: Array<ModalMenuElement> = [{
        text: "New Simulation",
        icon: <BiPlus />,
        onClick: () => {
            if (confirm("This will erase your current simulated Event Log. Are you sure you wish to continue?")) {
                setEventLog({ name: "Unnamed Event Log", traces: {} });
                isSimulatingRef.current = SimulatingEnum.Not;
                traceRef.current = null;
                setSelectedTrace(null);
                setTraceName("");
                reset();
                setMenuOpen(false);
            }
        }
    }, {
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
            {isSimulatingRef.current === SimulatingEnum.Not && <EventLogView
                eventLog={eventLog}
                selectedTrace={selectedTrace}
                setSelectedTrace={setSelectedTrace}
                traceRef={traceRef}
                editProps={{
                    setEventLog,
                    setTraceName
                }}
            >
                <Button disabled={isSimulatingRef.current !== SimulatingEnum.Not} onClick={() => {
                    isSimulatingRef.current = SimulatingEnum.Default;
                    const traceId = "Trace " + id++;
                    setEventLog({ ...eventLog, traces: { ...eventLog.traces, [traceId]: { traceId: traceId, traceName: traceId, trace: [] } } });
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
            </EventLogView>}
            {selectedTrace && <TraceView
                hugLeft={isSimulatingRef.current !== SimulatingEnum.Not}
                graphRef={graphRef}
                onCloseCallback={closeTraceCallback}
                selectedTrace={selectedTrace}
                setSelectedTrace={setSelectedTrace}
                editProps={isSimulatingRef.current !== SimulatingEnum.Not ? {
                    traceName,
                    setTraceName,
                    traceRef,
                    reset,
                } : undefined}
            >
                {isSimulatingRef.current !== SimulatingEnum.Not ? <FinalizeButton onClick={() => {
                    if (!graphRef.current?.current) return;
                    if ((isSimulatingRef.current === SimulatingEnum.Wild || isAcceptingS(graphRef.current.current, graphRef.current.current)) && traceRef.current) {
                        isSimulatingRef.current = SimulatingEnum.Not;
                        const eventLogCopy = { ...eventLog, traces: { ...eventLog.traces } };

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
                </FinalizeButton> : <></>}
            </TraceView>}
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
                }} />
                <FullScreenIcon />
                <BiHome onClick={() => setState(StateEnum.Home)} />
                <ModalMenu elements={menuElements} open={menuOpen} bottomElements={bottomElements} setOpen={setMenuOpen} />
            </TopRightIcons>
        </>
    )
}

export default SimulatorState