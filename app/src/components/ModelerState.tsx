import DCRModeler from "modeler";

import emptyBoardXML from "../resources/emptyBoard";
import {useEffect, useEffectEvent, useState} from "react";

import {saveAs} from "file-saver";
import {StateEnum, type StateProps} from "../App";
import FileUpload from "../utilComponents/FileUpload";
import ModalMenu, {type ModalMenuElement} from "../utilComponents/ModalMenu";

import {
    BiAnalyse,
    BiHome,
    BiLeftArrowCircle,
    BiPlus,
    BiSave,
    BiSolidDashboard,
    BiTestTube,
} from "react-icons/bi";

import Examples from "./Examples";
import {toast} from "react-toastify";
import TopRightIcons from "../utilComponents/TopRightIcons";
import {useHotkeys} from "react-hotkeys-hook";
import FullScreenIcon from "../utilComponents/FullScreenIcon";
import StyledFileUpload from "../utilComponents/StyledFileUpload";
import Loading from "../utilComponents/Loading";
import {type DCRGraph, extractGraph, layoutGraph, moddleToDCR, nestDCR, type Nestings,} from "dcr-engine";
import GraphNameInput from "../utilComponents/GraphNameInput";
import styled from "styled-components";
import {ColoredRelationsSetting, MarkerNotationSetting,} from "./GlobalModalMenuElements";
import ReactiveModeler from "./ReactiveModeler";
import TestDrivenModeling from "./TestDrivenModeling";
import {useBPMN} from '../utilComponents/useBPMN';
import {BsFiletypeDoc, BsStars} from "react-icons/bs";
import ModelExtractionDialogue from "./ModelExtractionDialogue.tsx";
import type {ExtractionConfig, ExtractionResult} from "dcr-engine/src/extraction.ts";
import ExtractionResultView from "./ExtractionResultView.tsx";


const TextButton = styled(BsFiletypeDoc)<{ open: boolean }>`
  border-radius: 50%;
  padding: 5px;
  font-size: 20px;
  height: 30px;
  width: 30px;
  color: ${(props) => (props.open ? "White" : "Black")};
  background-color: ${(props) => (props.open ? "Black !important" : "White")};
  cursor: pointer;
`;

const HeatmapButton = styled(BiTestTube)<{
    $clicked: boolean;
    $disabled?: boolean;
}>`
    ${(props) =>
            props.$clicked
                    ? `
        background-color: black !important;
        color: white;
    `
                    : ``}
    ${(props) =>
            props.$disabled
                    ? `
        color : grey;
        border-color: grey !important;
        cursor: default !important;
        &:hover {
            box-shadow: none !important;
        }    
    `
                    : ""}
`;

const defaultRelationsDescription = `**executes**: Focus on actors. Extract a relation of type "executes", if the text describes that this actor (head) is responsible for the event (tail).
**condition**: Focus on events. Extract a relation of type "condition", if one event (head) must be exectued before another (tail) event can be executed (first event is the "condition" for the second event).
**response**: Focus on events. Extract a relation of type "response", if executing one event (head) neccessitates the execution of another (tail) event ("responding" to the first event).
**includes**: Focus on events. Extract a relation of type "includes", if executing one event (head) enables the execution of another (tail) event again, even if it was execluded before.
**excludes**: Focus on events. Extract a relation of type "excludes", if executing one event (head) makes executing another (tail) event impossible, i.e., prevents its execution. Excludes relations can be reflexive, e.g., if one event can only be executed once.`;

const defaultMentionsDescription = `**Event**: These are events, preconditions or outcomes relevant to law and regulation. Events can be immaterial, e.g., providing support, help or compensation. Beyond that events can also be inputs, that is data that is relevant to the law (e.g. numbers, strings).
**Actor**: Nouns and pronouns, that describe a person, system, or company that is responsible for executing an event in the process.`;

const defaultDataDescription = `**Variable**: Data that is relevant to the process, e.g., by changing rules or outcomes. Examples are the age of process participants, distances, weights, number of units, etc. Time does not need to be extracted separately and will always be a variable available by default.
**Expression**: Rules that change behaviour and constraints, e.g., if a response is only valid if some variable is below a certain threshold. Such expressions are called Guards. If the expression uses the time variable, they are called Deadlines (for responses) and Timeouts (for conditions). Expressions always shall be extracted in the FEEL notation, deadlines and timeouts use the time period format, e.g., PT2h for a period of 2 hours.`;

const initGraphName = "DCR-JS Graph";

const ModelerState = ({
                          setState,
                          savedGraphs,
                          currentGraph,
                          saveGraph: commitSaveGraph,
                          coloredRelations,
                          changeColoredRelations,
                          markerNotation,
                          changeMarkerNotation,
                      }: StateProps) => {
    const [examplesOpen, setExamplesOpen] = useState(false);
    const [examplesData, setExamplesData] = useState<Array<string>>([]);
    const [tdmOpen, setTdmOpen] = useState(false);
    const [modelExtractionOpen, setModelExtractionOpen] = useState(false);
    const [isExtractingModel, setIsExtractingModel] = useState(false);
    const [extractConfig, setExtractConfig] = useState<ExtractionConfig>({
        modelName: "", apiKey: "", text: "",
        relationDescription: defaultRelationsDescription,
        mentionDescription: defaultMentionsDescription,
        dataDescription: defaultDataDescription
    });
    const [extractionResult, setExtractionResult] = useState<ExtractionResult | undefined>();

    const [menuOpen, setMenuOpen] = useState(false);
    const [textOpen, setTextOpen] = useState(false);

    const [loading, setLoading] = useState(false);

    // const modelerRef = useRef<DCRModeler | null>(null);
    const [modeler, setModeler] = useState<DCRModeler | null>(null);

    const [graphName, setGraphName] = useState<string>(
        currentGraph?.name ?? initGraphName,
    );


    async function saveGraph() {
        if (!modeler) {
            return;
        }

        let saved = false;

        try {
            setLoading(true);
            const data = await modeler.saveXML({format: false});
            if (commitSaveGraph(graphName, data.xml)) {
                toast.success("Graph saved!");
                saved = true;
            }
        } catch {
            toast.error("Failed to save graph...");
        } finally {
            setLoading(false);
        }

        return saved;
    }

    useHotkeys("ctrl+s", saveGraph, {preventDefault: true});

    useEffect(() => {
        // Fetch examples
        fetch("/dcr-js/examples/generated_examples.txt")
            .then((response) => {
                if (!response.ok) {
                    throw new Error(
                        "Failed to fetch examples status code: " + response.status,
                    );
                }
                return response.text();
            })
            .then((data) => {
                let files = data.split("\n");
                files.pop(); // Remove last empty line
                files = files.map((name) => name.split(".").slice(0, -1).join(".")); // Shave file extension off
                setExamplesData(files);
            });
    }, []);


    function open(
        data: string,
        parse: ((xml: string) => Promise<void>) | undefined,
        importFn?: string,
    ) {
        const importName = importFn?.slice(0, -4);

        if (parse) {
            parse(data)
                .then(() => {
                    setGraphName(importName ? importName : initGraphName);
                })
                .catch((e) => {
                    console.log(e);
                    toast.error("Unable to parse XML...");
                });
        }
    }


    async function saveAsXML() {
        if (!modeler) {
            return;
        }

        const data = await modeler.saveXML({format: true});
        const blob = new Blob([data.xml]);

        saveAs(blob, `${graphName}.xml`);
    }

    async function saveAsDCRXML() {
        if (!modeler) {
            return;
        }

        const data = await modeler.saveDCRXML();
        const blob = new Blob([data.xml]);

        saveAs(blob, `${graphName}.xml`);
    }

    async function saveAsSvg() {
        if (!modeler) {
            return;
        }

        const data = await modeler.saveSVG();
        const blob = new Blob([data.svg]);

        saveAs(blob, `${graphName}.svg`);
    }

    function savedGraphElements(): Array<ModalMenuElement> {
        if (savedGraphs.size === 0) {
            return [];
        }

        return [
            {
                text: "Saved Graphs:",
                elements: [...savedGraphs.values()].map(({name, graph}) => {
                    return {
                        icon: <BiLeftArrowCircle/>,
                        text: name,
                        onClick: () => {
                            open(graph, modeler?.importXML, name + ".xml");
                            setMenuOpen(false);
                        },
                    };
                }),
            },
        ];
    }

    const menuElements: Array<ModalMenuElement> = [
        {
            icon: <BiPlus/>,
            text: "New Diagram",
            onClick: () => {
                open(emptyBoardXML, modeler?.importXML);
                setMenuOpen(false);
            },
        },
        {
            icon: <BiSave/>,
            text: "Save Graph",
            onClick: () => {
                saveGraph();
                setMenuOpen(false);
            },
        },
        {
            icon: <BsStars/>,
            text: "From Text",
            onClick: async () => {
                setModelExtractionOpen(true);
                setMenuOpen(false);
            }
        },
        {
            text: "Open",
            elements: [
                {
                    customElement: (
                        <StyledFileUpload>
                            <FileUpload
                                accept="text/xml"
                                fileCallback={(name, contents) => {
                                    open(contents, modeler?.importXML, name);
                                    setMenuOpen(false);
                                }}
                            >
                                <div/>
                                <>Open Editor XML</>
                            </FileUpload>
                        </StyledFileUpload>
                    ),
                },
                {
                    customElement: (
                        <StyledFileUpload>
                            <FileUpload
                                accept="text/xml"
                                fileCallback={(name, contents) => {
                                    open(contents, modeler?.importDCRPortalXML, name);
                                    setMenuOpen(false);
                                }}
                            >
                                <div/>
                                <>Open DCR Solution XML</>
                            </FileUpload>
                        </StyledFileUpload>
                    ),
                },
                {
                    customElement: (
                        <StyledFileUpload>
                            <FileUpload accept=".bpmn,.xml" fileCallback={(name, contents) => {
                                convertBpmnToDcr(contents, name);
                                setMenuOpen(false);
                            }}>
                                <div/>
                                <>Open BPMN 2.0 XML</>
                            </FileUpload>
                        </StyledFileUpload>
                    ),
                },
            ],
        },
        {
            text: "Download",
            elements: [
                {
                    icon: <div/>,
                    text: "Download Editor XML",
                    onClick: () => {
                        saveAsXML();
                        setMenuOpen(false);
                    },
                },
                {
                    icon: <div/>,
                    text: "Download DCR Solutions XML",
                    onClick: () => {
                        saveAsDCRXML();
                        setMenuOpen(false);
                    },
                },
                {
                    icon: <div/>,
                    text: "Download SVG",
                    onClick: () => {
                        saveAsSvg();
                        setMenuOpen(false);
                    },
                },
            ],
        },
        {
            icon: <BiSolidDashboard/>,
            text: "Examples",
            onClick: () => {
                setMenuOpen(false);
                setExamplesOpen(true);
            },
        },
        ...savedGraphElements(),
    ];

    const bottomElements: Array<ModalMenuElement> = [
        {
            customElement: (
                <ColoredRelationsSetting
                    coloredRelations={coloredRelations}
                    changeColoredRelations={changeColoredRelations}
                />
            ),
        },
        {
            customElement: (
                <MarkerNotationSetting
                    markerNotation={markerNotation}
                    changeMarkerNotation={changeMarkerNotation}
                />
            ),
        },
    ];

    const layout = () => {
        if (!modeler) return;
        const elementRegistry = modeler.getElementRegistry();
        const events = Object.values(elementRegistry._elements).filter(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (element: any) => element.element.id.includes("Event"),
        );
        const uniqueActivities = new Set(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            events.map((element: any) => element.element.businessObject.description),
        );
        if (events.length !== uniqueActivities.size || uniqueActivities.has("")) {
            toast.warning(
                "Graph layout not supported for empty or duplicate activity names...",
            );
            return;
        }
        if (
            Object.keys(elementRegistry._elements).find(
                (element) =>
                    element.includes("SubProcess") ||
                    elementRegistry._elements[element].element.businessObject.role,
            )
        ) {
            toast.warning("Graph layout not supported for subprocesses and roles...");
            return;
        }
        if (
            confirm(
                "This will overwrite your current layout, do you wish to continue?",
            )
        ) {
            try {
                const nest = confirm("Do you wish to nest?");
                const graph = moddleToDCR(elementRegistry, true);
                const nestings = nestDCR(graph);
                const params: [DCRGraph, Nestings | undefined] = nest
                    ? [nestings.nestedGraph, nestings]
                    : [graph, undefined];
                layoutGraph(...params)
                    .then((xml) => {
                        modeler
                            ?.importXML(xml)
                            .catch((e) => {
                                console.log(e);
                                toast.error("Invalid xml...");
                            })
                            .finally(() => {
                                setLoading(false);
                            });
                    })
                    .catch((e) => {
                        console.log(e);
                        setLoading(false);
                        toast.error("Unable to layout graph...");
                    });
            } catch {
                toast.error("Something went wrong...");
            }
        }
    };

    const autoLayout = () => {
        if (!modeler) return;
        const elementRegistry = modeler.getElementRegistry();
        const events = Object.values(elementRegistry._elements).filter(
            (element: any) => element.element.id.includes("Event")
        );
        const uniqueActivities = new Set(
            events.map((element: any) => element.element.businessObject.description)
        );
        if (events.length !== uniqueActivities.size || uniqueActivities.has("")) {
            return;
        }
        if (
            Object.keys(elementRegistry._elements).find(
                (element) =>
                    element.includes("SubProcess") ||
                    elementRegistry._elements[element].element.businessObject.role
            )
        ) {
            return;
        }

        try {
            setLoading(true);
            const graph = moddleToDCR(elementRegistry, true);
            const params: [DCRGraph, undefined] = [graph, undefined];
            layoutGraph(...params)
                .then((xml) => {
                    modeler
                        ?.importXML(xml)
                        .catch((e) => {
                            console.log(e);
                        })
                        .finally(() => {
                            setLoading(false);
                        });
                })
                .catch((e) => {
                    console.log(e);
                    setLoading(false);
                });
        } catch (e) {
            setLoading(false);
        }
    };

    const {convertBpmnToDcr, loading: bpmnLoading} = useBPMN(modeler, setGraphName, setLoading, autoLayout);

    const onInitModeler = useEffectEvent((modeler: DCRModeler) => {
        modeler
            .importXML(currentGraph?.graph ?? emptyBoardXML)
            .catch((e: Error) => {
                console.log(e);
                toast.error("Unable to import XML...");
            });
    });

    useEffect(() => {
        if (!modeler) {
            return;
        }

        onInitModeler(modeler);
    }, [modeler]);

    const renderExtractionDialogue = () => {
        if (!modelExtractionOpen) return;
        return (
            <ModelExtractionDialogue
                config={extractConfig}
                onChange={setExtractConfig}
                onClose={() => setModelExtractionOpen(false)}
                onSubmit={async (config) => {
                    if(!modeler) return;

                    setIsExtractingModel(true);
                    try {
                        const res = await extractGraph(config);
                        setExtractionResult(res)
                        const xml = await layoutGraph(res.graph);
                        console.log(xml);
                        await modeler.importXML(xml);
                    } catch (e) {
                        console.log(e);
                    } finally {
                        setModelExtractionOpen(false);
                        setIsExtractingModel(false);
                        setTextOpen(true);
                    }


                }}
                busy={isExtractingModel}
            />
        );
    }

    const renderExtractionResult = () => {
        if(!extractionResult) return null;
        return <div style={{padding: 25}}>
            <h4>Extraction Result</h4>
            <ExtractionResultView processDescription={extractionResult.doc} />
        </div>;
    }

    return (
        <>
            <GraphNameInput
                value={graphName}
                onChange={(e) => setGraphName(e.target.value)}
            />
            {(loading || bpmnLoading) && <Loading/>}
            <ReactiveModeler
                modeler={modeler}
                setModeler={setModeler}
                coloredRelations={coloredRelations}
                markerNotation={markerNotation}
                isSimulating={false}
                disableControls={false}
            />
            <div style={{width: 100, height: "100vh"}}>tze</div>
            <TopRightIcons>
                <ModalMenu
                    icon={TextButton}
                    elements={[{customElement: renderExtractionResult()}]}
                    bottomElements={[]}
                    open={textOpen && !menuOpen && !modelExtractionOpen}
                    setOpen={setTextOpen}
                />
                <HeatmapButton
                    onClick={() => {
                        if (!modeler) return;
                        const elementRegistry = modeler.getElementRegistry();

                        if (
                            !tdmOpen &&
                            Object.keys(elementRegistry._elements).find(
                                (element) =>
                                    element.includes("SubProcess") ||
                                    elementRegistry._elements[element].element.businessObject
                                        .role,
                            )
                        ) {
                            toast.warning(
                                "Test driven modeling not supported for subprocesses and roles...",
                            );
                            return;
                        }
                        setTdmOpen(!tdmOpen);
                    }}
                    $clicked={tdmOpen}
                    title="Open Test Driven Modeling Pane"
                    data-testid="heatmap-icon"
                />
                <BiAnalyse
                    title="Layout Graph"
                    onClick={layout}
                    data-testid="analyse-icon"
                />
                <FullScreenIcon data-testid="fullscreen-icon"/>
                <BiHome
                    onClick={async () => {
                        const saved = await saveGraph();
                        if (
                            !saved &&
                            !window.confirm(
                                "Graph wasn't saved. Are you sure you wish to exit modeler?",
                            )
                        ) {
                            return;
                        }
                        setState(StateEnum.Home);
                    }}
                    data-testid="home-icon"
                />
                <ModalMenu
                    elements={menuElements}
                    bottomElements={bottomElements}
                    open={menuOpen}
                    setOpen={setMenuOpen}
                />
            </TopRightIcons>
            <TestDrivenModeling modeler={modeler} show={tdmOpen}/>
            {examplesOpen && (
                <Examples
                    examplesData={examplesData}
                    openCustomXML={(xml) => open(xml, modeler?.importCustomXML)}
                    openDCRXML={(xml) => open(xml, modeler?.importDCRPortalXML)}
                    setExamplesOpen={setExamplesOpen}
                    setLoading={setLoading}
                />
            )}
            {renderExtractionDialogue()}
        </>
    );
};

export default ModelerState;
