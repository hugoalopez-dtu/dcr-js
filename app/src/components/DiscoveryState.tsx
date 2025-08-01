import { BiHome, BiSave } from "react-icons/bi";
import FullScreenIcon from "../utilComponents/FullScreenIcon";
import TopRightIcons from "../utilComponents/TopRightIcons";
import ModalMenu, { ModalMenuElement } from "../utilComponents/ModalMenu";
import { StateEnum, StateProps } from "../App";
import { abstractLog, DCRGraph, DCRGraphS, EventLog, filter, layoutGraph, mineFromAbstraction, nestDCR, Nestings, parseLog, rejectionMiner, RoleTrace } from "dcr-engine";
import FileUpload from "../utilComponents/FileUpload";
import MenuElement from "../utilComponents/MenuElement";
import Toggle from "../utilComponents/Toggle";
import DropDown from "../utilComponents/DropDown";
import Label from "../utilComponents/Label";
import { isSettingsVal } from "../types";
import Modeler from "./Modeler";
import { toast } from "react-toastify";
import React, { useRef, useState } from "react";
import Form from "../utilComponents/Form";
import styled from "styled-components";
import Loading from "../utilComponents/Loading";
import { saveAs } from 'file-saver';
import { useHotkeys } from "react-hotkeys-hook";
import GraphNameInput from "../utilComponents/GraphNameInput";
import { parseBinaryLog } from "dcr-engine/src/eventLogs";
import { StopWatch } from "dcr-engine/src/utility";

const FileInput = styled.div`
    border: 1px dashed black;
    padding: 0.75rem;
    cursor: pointer;
    & > label {
        cursor: pointer
    }
    &:hover {
        color: white;
        background-color: Gainsboro;
        border: 1px dashed white;
    }    
`

const Input = styled.input`
    width: 7rem; 
    font-size: 20px; 
`

const initGraphName = "";

const DiscoveryState = ({ setState, savedGraphs, setSavedGraphs, lastSavedGraph, savedLogs, setSavedLogs, lastSavedLog }: StateProps) => {
    const [menuOpen, setMenuOpen] = useState(true);
    const [formToShow, setFormToShow] = useState("DisCoveR");

    const [loading, setLoading] = useState(false);

    // State to put anything needed to render in the form inputs;
    const [customFormState, setCustomFormState] = useState<any>();

    const modelerRef = useRef<DCRModeler | null>(null);
    const graphRef = useRef<{ initial: DCRGraphS, current: DCRGraphS } | null>(null);

    const [graphName, setGraphName] = useState<string>(initGraphName);

    const saveLog = (eventLog: EventLog<RoleTrace>, name: string) => {
        if (!graphRef.current?.current) return;
        const newSavedLogs = { ...savedLogs };
        newSavedLogs[name] = eventLog;
        setSavedLogs(newSavedLogs);
        lastSavedLog.current = name;
        toast.success("Log saved!");
    }

    const algorithms: {
        [key: string]: {
            inputs: Array<React.JSX.Element>,
            onSubmit: (formData: FormData) => void;
        }
    } = {
        "DisCoveR": {
            inputs: [
                <MenuElement>
                    <Label>Event Log:</Label>
                    <FileInput>
                        <FileUpload accept=".xes" fileCallback={(name, contents) => setCustomFormState({ ...customFormState, name, contents })} name="log">{customFormState?.name ? customFormState?.name : "Select event log"}</FileUpload>
                    </FileInput>
                </MenuElement>,
                <MenuElement>
                    <Label title="The amount of noise filtering employed, with 0 being no filtering and 1 being max.">Noise Threshold:</Label>
                    <Input
                        type="number"
                        required
                        name="noise"
                        min="0"
                        max="1"
                        defaultValue={customFormState?.threshold ? customFormState.threshold : "0.20"}
                        step="0.01" />
                </MenuElement>,
                <MenuElement>
                    <Label >Nest Graph</Label>
                    <Input name="nest" type="checkbox" defaultChecked={customFormState?.nest ? customFormState.nest : false} />
                </MenuElement>,
                <MenuElement>
                    <Label title="Saves the uploaded event log for later use in conformance checking, simulation, etc.">Save Log</Label>
                    <Input name="save" type="checkbox" defaultChecked={customFormState?.save ? customFormState.save : false} />
                </MenuElement>,
            ],
            onSubmit: (formData: FormData) => {
                setLoading(true);
                const rawThreshold = formData.get("noise");
                const threshold = rawThreshold && parseFloat(rawThreshold.toString());
                const nest = !!formData.get("nest");
                const save = !!formData.get("save");
                setCustomFormState({ ...customFormState, threshold, nest, save });
                if (threshold === "" || threshold === null) {
                    toast.error("Can't parse input parameters...");
                    setLoading(false);
                    return;
                }
                try {
                    if (!modelerRef) return;

                    const data = customFormState.contents;
                    console.log("Trying to parse log...");
                    const stopWatch = new StopWatch();
                    const log = parseLog(data);
                    console.log("Parsed log!");
                    stopWatch.click();
                    const noRoleLog = {
                        events: log.events,
                        traces: Object.keys(log.traces).map(traceId => ({ traceId, trace: log.traces[traceId].map(elem => elem.activity) })).reduce((acc, { traceId, trace }) => ({ ...acc, [traceId]: trace }), {})
                    }
                    console.log("Filtering...");
                    stopWatch.reset();
                    const filteredLog = threshold === 0 ? noRoleLog : filter(noRoleLog, threshold);
                    console.log("Filtering done!");
                    stopWatch.click()
                    console.log("Discovering...");
                    const logAbs = abstractLog(filteredLog);
                    const graph = mineFromAbstraction(logAbs);
                    console.log("Discovery done!");
                    stopWatch.click();
                    console.log("Nesting...");
                    const nestings = nestDCR(graph);
                    console.log("Nesting done!");
                    stopWatch.click();
                    const params: [DCRGraph, Nestings | undefined] = nest ? [nestings.nestedGraph, nestings] : [graph, undefined];
                    console.log("Computing layout...");
                    layoutGraph(...params).then(xml => {
                        console.log("Layout done!");
                        stopWatch.click();
                        modelerRef.current?.importXML(xml).catch(e => {
                            console.log(e);
                            toast.error("Invalid xml...")
                        }).finally(() => {
                            setGraphName(customFormState.name.slice(0, -4));
                            if (save) saveLog(log, customFormState.name);
                            setLoading(false);
                        });
                    }).catch(e => {
                        console.log(e);
                        setLoading(false);
                        toast.error("Unable to layout graph...")
                    });

                } catch (e) {
                    console.log(e);
                    setLoading(false);
                    toast.error("Cannot parse log...");
                }

            }
        },
        "RejectionMiner": {
            inputs: [
                <MenuElement>
                    <Label>Binary Event Log:</Label>
                    <FileInput>
                        <FileUpload accept=".xes" fileCallback={(name, contents) => setCustomFormState({ ...customFormState, name, contents })} name="log">{customFormState?.name ? customFormState?.name : "Select event log"}</FileUpload>
                    </FileInput>
                </MenuElement>,
                <MenuElement>
                    <Label title="The classifier in the event log that denotes that it is a positive trace.">Positive Trace Classifier</Label>
                    <Input
                        name="positiveClassifier"
                        type="text"
                        required
                        defaultValue={customFormState?.positiveClassifier ? customFormState.positiveClassifier : "Required"} />
                </MenuElement>,
                <MenuElement>
                    <Label title="Leverage the negative traces to find additional constraints that cover many negative traces and few positive ones.">Optimize Precision</Label>
                    <Input name="optimizePrecision" type="checkbox" defaultChecked={customFormState?.optimizePrecision !== undefined ? customFormState.optimizePrecision : true} />
                </MenuElement>,
                <MenuElement>
                    <Label title="Saves the uploaded event log for later use in conformance checking, simulation, etc.">Save Log</Label>
                    <Input name="save" type="checkbox" defaultChecked={customFormState?.save ? customFormState.save : false} />
                </MenuElement>,
            ],
            onSubmit: (formData: FormData) => {
                setLoading(true);
                const positiveClassifier = formData.get("positiveClassifier")?.toString();
                const optimizePrecision = !!formData.get("optimizePrecision");
                const save = !!formData.get("save");
                setCustomFormState({ ...customFormState, positiveClassifier, optimizePrecision, save });
                console.log(positiveClassifier);
                if (!positiveClassifier) {
                    toast.error("Can't parse input parameters...");
                    setLoading(false);
                    return;
                }
                try {
                    if (!modelerRef) return;

                    console.log(optimizePrecision, formData.get("optimizePrecision"))

                    const data = customFormState.contents;
                    console.log("Trying to parse log...");
                    const { trainingLog, testLog } = parseBinaryLog(data, positiveClassifier);
                    console.log("Parsed log!");

                    console.log("Discovering...");
                    const graph = rejectionMiner(trainingLog, optimizePrecision);
                    console.log("Discovery done!");
                    console.log("Computing layout...");
                    layoutGraph(graph).then(xml => {
                        console.log("Layout done!");
                        modelerRef.current?.importXML(xml).catch(e => {
                            console.log(e);
                            toast.error("Invalid xml...")
                        }).finally(() => {
                            const roleLog: EventLog<RoleTrace> = {
                                events: testLog.events,
                                traces: {}
                            }
                            for (const traceId in testLog.traces) {
                                roleLog.traces[traceId] = testLog.traces[traceId].map(activity => ({ activity, role: "" }))
                            }
                            setGraphName(customFormState.name.slice(0, -4));
                            if (save) saveLog(roleLog, customFormState.name);
                            setLoading(false);
                        });
                    }).catch(e => {
                        console.log(e);
                        setLoading(false);
                        toast.error("Unable to layout graph...")
                    });

                } catch (e) {
                    console.log(e);
                    setLoading(false);
                    toast.error("Cannot parse log...");
                }
            }
        }
    }

    const saveGraph = () => {
        if (graphName === "") {
            toast.warning("Discover a graph before saving!");
            return;
        }
        if (!savedGraphs[graphName] || confirm(`This will overwrite the previously saved graph '${graphName}'. Are you sure you wish to continue?`)) {
            modelerRef.current?.saveXML({ format: false }).then(data => {
                const newSavedGraphs = { ...savedGraphs };
                newSavedGraphs[graphName] = data.xml;
                lastSavedGraph.current = graphName;
                setSavedGraphs(newSavedGraphs);
                toast.success("Graph saved!");
            });
        }
    }

    useHotkeys("ctrl+s", saveGraph, { preventDefault: true });

    const saveAsXML = async () => {
        if (!modelerRef.current) return;
        if (graphName === "") {
            toast.warning("Discover a graph before saving!");
            return;
        }

        const data = await modelerRef.current.saveXML({ format: true });
        const blob = new Blob([data.xml]);

        saveAs(blob, `${graphName}.xml`);
    }

    const saveAsDCRXML = async () => {
        if (!modelerRef.current) return;
        if (graphName === "") {
            toast.warning("Discover a graph before saving!");
            return;
        }

        const data = await modelerRef.current.saveDCRXML();
        const blob = new Blob([data.xml]);

        saveAs(blob, `${graphName}.xml`);
    }

    const saveAsSvg = async () => {
        if (!modelerRef.current) return;
        if (graphName === "") {
            toast.warning("Discover a graph before saving!");
            return;
        }
        const data = await modelerRef.current.saveSVG();
        const blob = new Blob([data.svg]);

        saveAs(blob, `${graphName}.svg`);
    }


    const menuElements: Array<ModalMenuElement> = [
        {
            icon: <BiSave />,
            text: "Save Graph",
            onClick: () => { saveGraph() },
        },
        {
            text: "Download",
            elements: [{
                icon: <div />,
                text: "Download Editor XML",
                onClick: () => { saveAsXML() },
            },
            {
                icon: <div />,
                text: "Download DCR Solutions XML",
                onClick: () => { saveAsDCRXML() },
            },
            {
                icon: <div />,
                text: "Download SVG",
                onClick: () => { saveAsSvg() },
            }
            ],
        },
        {
            customElement: (
                <MenuElement>
                    <Label>Discovery Algorithm:</Label>
                    <DropDown value={formToShow} options={Object.keys(algorithms).map((key) => ({ title: key, value: key }))} onChange={(val) => setFormToShow(val)} />
                </MenuElement>
            )
        },
        {
            customElement: (
                <Form submitText="Discover!" inputFields={algorithms[formToShow].inputs} submit={algorithms[formToShow].onSubmit} />
            )
        }
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
    ];

    return (
        <>
            <GraphNameInput
                value={graphName}
                onChange={e => setGraphName(e.target.value)}
            />
            {loading && <Loading />}
            <Modeler modelerRef={modelerRef} override={{ graphRef: graphRef, overrideOnclick: () => null, canvasClassName: "conformance" }} />
            <TopRightIcons>
                <FullScreenIcon />
                <BiHome onClick={() => { if (graphName) saveGraph(); setState(StateEnum.Home) }} />
                <ModalMenu elements={menuElements} open={menuOpen} bottomElements={bottomElements} setOpen={setMenuOpen} />
            </TopRightIcons>
        </>
    )
}

export default DiscoveryState