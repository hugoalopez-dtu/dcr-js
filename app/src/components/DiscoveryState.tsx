import { BiHome, BiSave } from "react-icons/bi";
import FullScreenIcon from "../utilComponents/FullScreenIcon";
import TopRightIcons from "../utilComponents/TopRightIcons";
import ModalMenu, { ModalMenuElement } from "../utilComponents/ModalMenu";
import { StateEnum, StateProps } from "../App";
import { abstractLog, DCRGraph, DCRGraphS, filter, layoutGraph, mineFromAbstraction, nestDCR, Nestings, parseLog } from "dcr-engine";
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

const DiscoveryState = ({ setState, savedGraphs, setSavedGraphs, lastSavedGraph }: StateProps) => {
    const [menuOpen, setMenuOpen] = useState(true);
    const [formToShow, setFormToShow] = useState("DisCoveR");

    const [loading, setLoading] = useState(false);

    // State to put anything needed to render in the form inputs;
    const [customFormState, setCustomFormState] = useState<any>();

    const modelerRef = useRef<DCRModeler | null>(null);
    const graphRef = useRef<{ initial: DCRGraphS, current: DCRGraphS } | null>(null);

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
                    <Label>Noise Threshold:</Label>
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
                    <Label>Nest Graph</Label>
                    <Input name="nest" type="checkbox" defaultChecked={customFormState?.nest ? customFormState.nest : false} />
                </MenuElement>,
            ],
            onSubmit: (formData: FormData) => {
                setLoading(true);
                const rawThreshold = formData.get("noise");
                const threshold = rawThreshold && parseFloat(rawThreshold.toString());
                const nest = !!formData.get("nest");
                setCustomFormState({ ...customFormState, threshold, nest });
                if (threshold === "" || threshold === null) {
                    toast.error("Can't parse input parameters...");
                    setLoading(false);
                    return;
                }
                try {
                    if (!modelerRef) return;

                    const data = customFormState.contents;
                    console.log("Trying to parse log...");
                    const log = parseLog(data);
                    console.log("Parsed log!");
                    const noRoleLog = {
                        events: log.events,
                        traces: Object.keys(log.traces).map(traceId => ({ traceId, trace: log.traces[traceId].map(elem => elem.activity) })).reduce((acc, { traceId, trace }) => ({ ...acc, [traceId]: trace }), {})
                    }

                    const filteredLog = filter(noRoleLog, threshold);
                    console.log("Filtering done!");
                    const logAbs = abstractLog(filteredLog);
                    const graph = mineFromAbstraction(logAbs);
                    console.log("Discovery done!");
                    const nestings = nestDCR(graph);
                    console.log("Nesting done!");
                    const params: [DCRGraph, Nestings | undefined] = nest ? [nestings.nestedGraph, nestings] : [graph, undefined];
                    layoutGraph(...params).then(xml => {
                        console.log("Layout done!");
                        modelerRef.current?.importXML(xml).catch(e => {
                            console.log(e);
                            toast.error("Invalid xml...")
                        }).finally(() => {
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
        const graphName = customFormState.name ? customFormState.name.slice(0, -4) : "discovered_model";
        modelerRef.current?.saveXML({ format: false }).then(data => {
            const newSavedGraphs = { ...savedGraphs };
            newSavedGraphs[graphName] = data.xml;
            lastSavedGraph.current = graphName;
            setSavedGraphs(newSavedGraphs);
            toast.success("Graph saved!");
        });
    }

    useHotkeys("ctrl+s", saveGraph, { preventDefault: true });

    const saveAsXML = async () => {
        if (!modelerRef.current) return;

        const data = await modelerRef.current.saveXML({ format: true });
        const blob = new Blob([data.xml]);
        const graphName = customFormState.name ? customFormState.name.slice(0, -4) : "discovered_model";
        saveAs(blob, `${graphName}.xml`);
    }

    const saveAsDCRXML = async () => {
        if (!modelerRef.current) return;

        const data = await modelerRef.current.saveDCRXML();
        const blob = new Blob([data.xml]);
        const graphName = customFormState.name ? customFormState.name.slice(0, -4) : "discovered_model";
        saveAs(blob, `${graphName}.xml`);
    }

    const saveAsSvg = async () => {
        if (!modelerRef.current) return;
        const data = await modelerRef.current.saveSVG();
        const blob = new Blob([data.svg]);
        const graphName = customFormState.name ? customFormState.name.slice(0, -4) : "discovered_model";
        saveAs(blob, `${graphName}.svg`);
    }


    const menuElements: Array<ModalMenuElement> = [
        {
            icon: <BiSave />,
            text: "Save Graph",
            onClick: () => { saveGraph(); setMenuOpen(false) },
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
            <Modeler modelerRef={modelerRef} override={{ graphRef: graphRef, overrideOnclick: () => null, canvasClassName: "conformance" }} />
            {loading && <Loading />}
            <TopRightIcons>
                <FullScreenIcon />
                <BiHome onClick={() => setState(StateEnum.Home)} />
                <ModalMenu elements={menuElements} open={menuOpen} bottomElements={bottomElements} setOpen={setMenuOpen} />
            </TopRightIcons>
        </>
    )
}

export default DiscoveryState