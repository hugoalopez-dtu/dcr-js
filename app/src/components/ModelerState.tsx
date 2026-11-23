import DCRModeler from "modeler";

import emptyBoardXML from "../resources/emptyBoard";
import {useEffect, useEffectEvent, useRef, useState} from "react";

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
    BiInfoCircle,
} from "react-icons/bi";

import Examples from "./Examples";
import {toast} from "react-toastify";
import TopRightIcons from "../utilComponents/TopRightIcons";
import {useHotkeys} from "react-hotkeys-hook";
import FullScreenIcon from "../utilComponents/FullScreenIcon";
import StyledFileUpload from "../utilComponents/StyledFileUpload";
import Loading from "../utilComponents/Loading";
import {type DCRGraph, extractGraph, layoutGraph, moddleToDCR, nestDCR, buildGraph, filterProcessDescription, diffGraphs, type Nestings, type ProcessDescription, type RoleDataDCR,} from "dcr-engine";
import {applyGraphEdits, eventIdsFromCanvas, type EventIdMap} from "../utilComponents/applyGraphEdits";
import {activityIdsFor, elementsForHover, entriesForElement, hoveredPart, setHighlight, type ActivityIdMap, type ExtractionHoverTarget, type Highlight, type ViewHighlight} from "../utilComponents/extractionHighlight";
import GraphNameInput from "../utilComponents/GraphNameInput";
import styled from "styled-components";
import {ColoredRelationsSetting, MarkerNotationSetting,} from "./GlobalModalMenuElements";
import ReactiveModeler from "./ReactiveModeler";
import TestDrivenModeling from "./TestDrivenModeling";
import {useBPMN} from '../utilComponents/useBPMN';
import {useSMVExport} from '../utilComponents/useSMVExport';
import {BsFiletypeDoc, BsStars} from "react-icons/bs";
import ModelExtractionDialogue from "./ModelExtractionDialogue.tsx";
import type {ExtractionConfig, ExtractionResult} from "dcr-engine/src/extraction";
import {
    defaultMentionDescriptions,
    defaultRelationDescriptions,
    defaultEntityDescription,
    defaultDataDescription,
    defaultRelabelDescription,
    initGraphName,
} from "dcr-engine/src/extraction/definitions";
import ExtractionResultView from "./ExtractionResultView.tsx";
import Popup from "../utilComponents/Popup";


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

const BpmnInfoIcon = styled(BiInfoCircle)`
  font-size: 18px;
  color: grey;
  cursor: pointer;

  &:hover {
    color: black;
  }
`;

const BpmnSupportList = styled.ul`
  margin: 0.5rem 0;
  padding-left: 1.5rem;
`;


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
    const [extractionStep, setExtractionStep] = useState<string | null>(null);
    const [extractConfig, setExtractConfig] = useState<ExtractionConfig>({
        modelName: "", apiKey: "", text: "",
        mentionDescriptions: defaultMentionDescriptions,
        relationDescriptions: defaultRelationDescriptions,
        entityDescription: defaultEntityDescription,
        dataDescription: defaultDataDescription,
        includeData: false,
        relabelDescription: defaultRelabelDescription,
        relabel: true,
    });
    const [extractionResult, setExtractionResult] = useState<ExtractionResult | undefined>();
    const [extractionRun, setExtractionRun] = useState(0);
    // The graph the canvas was last built from by extraction (Rebuild applies only the difference to it),
    // and which canvas event each of its events is (so renamed events are still found).
    // activityIds: which canvas event each activity (entity id) became, used to find it on hover.
    const [built, setBuilt] = useState<{graph: RoleDataDCR; eventIds: EventIdMap; activityIds: ActivityIdMap} | undefined>();
    // Canvas elements currently highlighted because their text is hovered in the extraction view.
    const hoverHighlight = useRef<Highlight[]>([]);

    const [menuOpen, setMenuOpen] = useState(false);
    const [textOpen, setTextOpen] = useState(false);
    const [bpmnInfoOpen, setBpmnInfoOpen] = useState(false);

    const [loading, setLoading] = useState(false);

    // const modelerRef = useRef<DCRModeler | null>(null);
    const [modeler, setModeler] = useState<DCRModeler | null>(null);

    const [graphName, setGraphName] = useState<string>(
        currentGraph?.name ?? initGraphName,
    );

    function warnIfInvalidGuards(): boolean {
        if (!modeler) return false;
        const issues: string[] = modeler.validateGuards();
        issues.forEach((msg: string) => toast.warning(msg));
        return issues.length > 0;
    }

    async function saveGraph() {
        if (!modeler) {
            return;
        }

        if (warnIfInvalidGuards()) return false;
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
        fetch(`${import.meta.env.BASE_URL}examples/generated_examples.txt`)
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
                    setExtractionResult(undefined);
                    setBuilt(undefined);
                    setTextOpen(false);
                    warnIfInvalidGuards();
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

        if (warnIfInvalidGuards()) return;
        const data = await modeler.saveXML({format: true});
        const blob = new Blob([data.xml]);

        saveAs(blob, `${graphName}.xml`);
    }

    async function saveAsDCRXML() {
        if (!modeler) {
            return;
        }

        if (warnIfInvalidGuards()) return;
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

    async function saveAsSMV() {
        if (!modeler) {
            return;
        }

        if (warnIfInvalidGuards()) return;

        try {
            setLoading(true);
            const data = await modeler.saveXML({format: true});
            const smv = await exportSMV(data.xml);
            const blob = new Blob([smv]);
            saveAs(blob, `${graphName}.smv`);
        } catch (e) {
            toast.error(`SMV export failed: ${e instanceof Error ? e.message : "Unknown error"}`);
        } finally {
            setLoading(false);
        }
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
                                <span style={{display: "flex", alignItems: "center", gap: "0.4rem"}}>
                                    Open BPMN 2.0 XML
                                    <BpmnInfoIcon
                                        title="Supported BPMN elements"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setBpmnInfoOpen(true);
                                        }}
                                    />
                                </span>
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
                {
                    icon: <div/>,
                    text: "Download SMV",
                    onClick: () => {
                        saveAsSMV();
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
            (element: any) => element.element.type === "dcr:Event"
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
    const {exportSMV} = useSMVExport();

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

                    if (!confirm("This will replace your current diagram. Continue?")) return;

                    setIsExtractingModel(true);
                    setExtractionStep(null);
                    try {
                        const res = await extractGraph(config, setExtractionStep);
                        setExtractionResult(res)
                        setExtractionRun((n) => n + 1);
                        const xml = await layoutGraph(res.graph);
                        await modeler.importXML(xml);
                        const eventIds = eventIdsFromCanvas(modeler.get("dcrGraphEditing"));
                        setBuilt({graph: res.graph, eventIds, activityIds: activityIdsFor(res.doc, eventIds)});
                        setGraphName("Extracted Model");    
                    } catch (e) {
                        console.error(e);
                        toast.error(`Model extraction failed: ${e instanceof Error ? e.message : e}`);
                    } finally {
                        setModelExtractionOpen(false);
                        setIsExtractingModel(false);
                        setExtractionStep(null);
                        setTextOpen(true);
                    }


                }}
                busy={isExtractingModel}
                step={extractionStep}
            />
        );
    }

    const handleProcessDescriptionChange = (doc: ProcessDescription) => {
        setExtractionResult((prev) =>
            prev ? {...prev, doc} : prev
        );
    };

    const rebuildModel = async (
        selectedMentions: Set<number>,
        selectedRelations: Set<number>,
        selectedVariables: Set<number>,
        selectedExpressions: Set<number>
    ) => {
        if (!modeler || !extractionResult) return;
        const filteredDoc = filterProcessDescription(
            extractionResult.doc,
            selectedMentions,
            selectedRelations,
            selectedVariables,
            selectedExpressions
        );
        try {
            const graph = buildGraph(filteredDoc);
            const api = modeler.get("dcrGraphEditing");
            if (!built || api.listEvents().length === 0) {
                // Nothing to update in place: draw from scratch.
                const xml = await layoutGraph(graph);
                await modeler.importXML(xml);
                const eventIds = eventIdsFromCanvas(api);
                setBuilt({graph, eventIds, activityIds: activityIdsFor(filteredDoc, eventIds)});
            } else {
                // Apply only what changed since the last build, keeping layout and manual edits.
                const {applied, skipped, eventIds} = applyGraphEdits(api, diffGraphs(built.graph, graph), built.eventIds);
                setBuilt({graph, eventIds, activityIds: activityIdsFor(filteredDoc, eventIds)});
                if (skipped.length > 0) {
                    console.warn("Rebuild: skipped edits", skipped);
                    toast.warning(`Model updated (${applied} changes); ${skipped.length} skipped, see console.`);
                }
            }
        } catch (e) {
            console.log(e);
            alert(`Unable to rebuild model: ${e instanceof Error ? e.message : e}`);
        }
    };

    // Highlight the canvas element(s) of the hovered mention or relation (null: clear).
    const handleExtractionHover = (target: ExtractionHoverTarget | null) => {
        if (!modeler) return;
        let next: Highlight[] = [];
        if (target && extractionResult && built) {
            try {
                next = elementsForHover(target, extractionResult.doc, modeler.get("dcrGraphEditing"), built.eventIds, built.activityIds);
            } catch (e) {
                console.warn("Extraction hover:", e);
            }
        }
        hoverHighlight.current = setHighlight(modeler, hoverHighlight.current, next);
    };

    // Don't leave a highlight behind when the extraction panel closes.
    useEffect(() => {
        if (!textOpen && modeler) {
            hoverHighlight.current = setHighlight(modeler, hoverHighlight.current, []);
        }
    }, [textOpen, modeler]);

    // The other direction: hovering on the canvas highlights entries in the extraction view.
    const [viewHighlight, setViewHighlight] = useState<ViewHighlight | null>(null);
    useEffect(() => {
        setViewHighlight(null);
        if (!modeler || !textOpen || !extractionResult || !built) return;
        const eventBus = modeler.get("eventBus");
        let currentKey = "";
        const update = (part: Highlight | undefined) => {
            const key = part ? `${part.id}:${part.part}` : "";
            if (key === currentKey) return;
            currentKey = key;
            if (!part) return setViewHighlight(null);
            try {
                setViewHighlight(entriesForElement(part, extractionResult.doc, modeler.get("dcrGraphEditing"), built.eventIds, built.activityIds));
            } catch (e) {
                console.warn("Canvas hover:", e);
                setViewHighlight(null);
            }
        };
        // diagram-js tells which element the mouse entered/left; the role/label
        // part is re-checked on every native mouse move over the canvas.
        let hovered: any = null;
        const onHover = (e: any) => {
            hovered = e.element;
            update(hoveredPart(modeler, hovered, e.originalEvent));
        };
        const onOut = () => {
            hovered = null;
            update(undefined);
        };
        const onMouseMove = (e: MouseEvent) => {
            if (hovered) update(hoveredPart(modeler, hovered, e));
        };
        const container: HTMLElement = modeler.get("canvas").getContainer();
        eventBus.on("element.hover", onHover);
        eventBus.on("element.out", onOut);
        container.addEventListener("mousemove", onMouseMove);
        return () => {
            eventBus.off("element.hover", onHover);
            eventBus.off("element.out", onOut);
            container.removeEventListener("mousemove", onMouseMove);
        };
    }, [modeler, textOpen, extractionResult, built]);

    const renderExtractionResult = () => {
        if(!extractionResult) return null;
        return <div style={{
            position: "absolute",
            top: "5rem",
            left: 0,
            right: 0,
            boxSizing: "border-box",
            padding: 25,
        }}>
            <h4>Extraction Result</h4>
            <ExtractionResultView
                key={extractionRun}
                processDescription={extractionResult.doc}
                onRebuild={rebuildModel}
                onHover={handleExtractionHover}
                highlighted={viewHighlight}
                onProcessDescriptionChange={handleProcessDescriptionChange}
            />
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
                {extractionResult && (
                    <ModalMenu
                        icon={TextButton}
                        elements={[{customElement: renderExtractionResult()}]}
                        bottomElements={[]}
                        open={textOpen && !menuOpen && !modelExtractionOpen}
                        setOpen={setTextOpen}
                    />
                )}
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

                        if (
                            !tdmOpen &&
                            Object.keys(elementRegistry._elements).find((element) => {
                                const bo =
                                    elementRegistry._elements[element].element.businessObject;
                                return bo.guard || bo.time || bo.eventData;
                            })
                        ) {
                            toast.warning(
                                "Test driven modeling not supported for guards, time constraints, and variables...",
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
                    openEditorXML={(xml) => open(xml, modeler?.importXML)}
                    openCustomXML={(xml) => open(xml, modeler?.importCustomXML)}
                    openDCRXML={(xml) => open(xml, modeler?.importDCRPortalXML)}
                    setExamplesOpen={setExamplesOpen}
                    setLoading={setLoading}
                />
            )}
            {renderExtractionDialogue()}
            {bpmnInfoOpen && (
                <Popup close={() => setBpmnInfoOpen(false)}>
                    <h3>Supported BPMN Elements</h3>
                    <p>The BPMN import currently supports:</p>
                    <BpmnSupportList>
                        <li>Start Event</li>
                        <li>End Event</li>
                        <li>Task</li>
                        <li>Exclusive Gateway (XOR)</li>
                        <li>Parallel Gateway (AND)</li>
                        <li>Inclusive Gateway (OR)</li>
                    </BpmnSupportList>
                    <p>
                        Gateways must follow the single-entry-single-exit (SESE) principle: 
                        each split gateway is matched by exactly one join gateway of the 
                        same type, forming a self-contained block.
                    </p>
                    <p>
                        Other BPMN elements (e.g., subprocesses, timer/message/boundary events,
                        pools and lanes, data objects) are not currently supported and may cause
                        the import to fail or produce an incomplete graph.
                    </p>
                </Popup>
            )}
        </>
    );
};

export default ModelerState;
