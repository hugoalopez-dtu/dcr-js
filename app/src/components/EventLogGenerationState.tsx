import {BiHome, BiLeftArrowCircle} from "react-icons/bi";
import FullScreenIcon from "../utilComponents/FullScreenIcon";
import TopRightIcons from "../utilComponents/TopRightIcons";
import ModalMenu, {type ModalMenuElement} from "../utilComponents/ModalMenu";
import {StateEnum, type StateProps} from "../App";
import {
    type ConstraintSupport,
    copyMarking,
    type DCRGraphS,
    type EventLog,
    generateEventLog,
    generateEventLogWithSupport,
    moddleToDCR,
    type RoleTrace,
    writeEventLog,
} from "dcr-engine";
import MenuElement from "../utilComponents/MenuElement";
import DropDown from "../utilComponents/DropDown";
import Label from "../utilComponents/Label";
import React, {useEffect, useEffectEvent, useState} from "react";
import Form from "../utilComponents/Form";
import styled from "styled-components";
import StyledFileUpload from "../utilComponents/StyledFileUpload";
import FileUpload from "../utilComponents/FileUpload";
import {toast} from "react-toastify";
import {saveAs} from "file-saver";
import {ColoredRelationsSetting, MarkerNotationSetting,} from "./GlobalModalMenuElements";
import ReactiveModeler from "./ReactiveModeler";
import emptyBoardXML from "../resources/emptyBoard";

const Input = styled.input`
    width: 7rem;
    font-size: 20px;
`;

const StatisticsContainer = styled.div`
    width: 100%;
    overflow-x: auto;
    padding: 0.5rem 0;
`;

const StatisticsTable = styled.table`
    width: 100%;
    border-collapse: collapse;
    font-size: 0.875rem;
    text-align: left;

    th,
    td {
        padding: 0.625rem;
        border-bottom: 1px solid #ddd;
    }

    th {
        font-weight: 600;
    }

    td {
        white-space: nowrap;
    }
`;

const ALGORITHMS = ["Simple", "Constraint Support"] as const;

type Algorithm = (typeof ALGORITHMS)[number];

function isAlgorithm(val: string): val is Algorithm {
    return ALGORITHMS.includes(val as unknown as Algorithm);
}

const EventLogGenerationState = ({
                                     setState,
                                     savedGraphs,
                                     currentGraph,
                                     saveLog: commitSaveLog,
                                     markerNotation,
                                     changeMarkerNotation,
                                     coloredRelations,
                                     changeColoredRelations,
                                 }: StateProps) => {
    const [menuOpen, setMenuOpen] = useState(true);
    const [algorithm, setAlgorithm] = useState<Algorithm>("Simple");

    const [modeler, setModeler] = useState<DCRModeler | null>(null);
    const [currentDcrGraph, setCurrentDcrGraph] = useState<DCRGraphS | null>(
        null,
    );

    // State to put anything needed to render in the form inputs;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [customFormState, setCustomFormState] = useState<any>();
    const [constraintStatistics, setConstraintStatistics] = useState<ConstraintSupport[] | null>(null);

    const algorithmForms: Record<
        Algorithm,
        {
            inputs: React.ReactNode;
            onSubmit: (formData: FormData) => void | Promise<void>;
        }
    > = {
        Simple: {
            inputs: [
                <MenuElement key="name">
                    <Label title="Name to save the event log under">
                        Event Log Name:
                    </Label>
                    <Input
                        type="text"
                        required
                        name="name"
                        min="0"
                        max="1"
                        defaultValue={
                            customFormState?.name ? customFormState.name : "Event Log"
                        }
                        step="0.01"
                    />
                </MenuElement>,
                <MenuElement key="noTraces">
                    <Label>No. Traces</Label>
                    <Input
                        type="number"
                        required
                        name="noTraces"
                        min="0"
                        max=""
                        defaultValue={
                            customFormState?.noTraces ? customFormState.noTraces : "100"
                        }
                        step="1"
                    />
                </MenuElement>,
                <MenuElement key="minTrace">
                    <Label title="Least acceptable trace length before noise is applied">
                        Min. Trace Length
                    </Label>
                    <Input
                        type="number"
                        required
                        name="minTrace"
                        min="0"
                        max=""
                        defaultValue={
                            customFormState?.minTrace ? customFormState.minTrace : "5"
                        }
                        step="1"
                    />
                </MenuElement>,
                <MenuElement key="maxTrace">
                    <Label title="Greatest acceptable trace length before noise is applied">
                        Max. Trace Length
                    </Label>
                    <Input
                        type="number"
                        required
                        name="maxTrace"
                        min="0"
                        max=""
                        defaultValue={
                            customFormState?.maxTrace ? customFormState.maxTrace : "20"
                        }
                        step="1"
                    />
                </MenuElement>,
                <MenuElement key="noise">
                    <Label title="The amount of noise to add, with 0 being no noise and 1 being max.">
                        Noise percentage
                    </Label>
                    <Input
                        type="number"
                        required
                        name="noise"
                        min="0"
                        max="1"
                        defaultValue={
                            customFormState?.noise !== undefined
                                ? customFormState.noise
                                : "0.20"
                        }
                        step="0.01"
                    />
                </MenuElement>,
            ],
            onSubmit: (formData: FormData) => {
                setConstraintStatistics(null);

                if (!currentDcrGraph) {
                    return;
                }

                const rawNoise = formData.get("noise");
                const noise = rawNoise && parseFloat(rawNoise.toString());
                const name = formData.get("name")?.toString();
                const rawNoTraces = formData.get("noTraces");
                const noTraces = rawNoTraces && parseInt(rawNoTraces.toString());
                const rawMinTrace = formData.get("minTrace");
                const minTrace = rawMinTrace && parseInt(rawMinTrace.toString());
                const rawMaxTrace = formData.get("maxTrace");
                const maxTrace = rawMaxTrace && parseInt(rawMaxTrace.toString());

                if (
                    noise === "" ||
                    noise === null ||
                    noTraces === "" ||
                    noTraces === null ||
                    minTrace === "" ||
                    minTrace === null ||
                    maxTrace === "" ||
                    maxTrace === null ||
                    !name
                ) {
                    toast.error("Can't parse input parameters...");
                    return;
                }

                if (minTrace > maxTrace) {
                    toast.error(
                        "Min trace length should be smaller or equal to max trace length!",
                    );
                    return;
                }

                setCustomFormState({
                    ...customFormState,
                    noise,
                    name,
                    noTraces,
                    minTrace,
                    maxTrace,
                });
                try {
                    const draftDcrGraph = {
                        ...currentDcrGraph,
                        marking: copyMarking(currentDcrGraph.marking),
                    };

                    const log = generateEventLog(
                        draftDcrGraph,
                        noTraces,
                        minTrace,
                        maxTrace,
                        noise,
                    );

                    saveEventLog(name, log);
                    saveLog(name, log);
                } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Cannot generate log from parameters...");
                }
            },
        },
        "Constraint Support": {
            inputs: [
                <MenuElement key="name">
                    <Label title="Name to save the event log under">
                        Event Log Name:
                    </Label>
                    <Input
                        type="text"
                        required
                        name="name"
                        defaultValue={customFormState?.name ?? "Event Log"}
                    />
                </MenuElement>,

                <MenuElement key="noTraces">
                    <Label>No. Traces</Label>
                    <Input
                        type="number"
                        required
                        name="noTraces"
                        min="1"
                        step="1"
                        defaultValue={customFormState?.noTraces ?? 100}
                    />
                </MenuElement>,

                <MenuElement key="minTrace">
                    <Label>Min. Trace Length</Label>
                    <Input
                        type="number"
                        required
                        name="minTrace"
                        min="0"
                        step="1"
                        defaultValue={customFormState?.minTrace ?? 5}
                    />
                </MenuElement>,

                <MenuElement key="maxTrace">
                    <Label>Max. Trace Length</Label>
                    <Input
                        type="number"
                        required
                        name="maxTrace"
                        min="0"
                        step="1"
                        defaultValue={customFormState?.maxTrace ?? 20}
                    />
                </MenuElement>,

                <MenuElement key="noise">
                    <Label title="Noise probability between 0 and 1">
                        Noise percentage
                    </Label>
                    <Input
                        type="number"
                        required
                        name="noise"
                        min="0"
                        max="1"
                        step="0.01"
                        defaultValue={customFormState?.noise ?? 0.2}
                    />
                </MenuElement>,

                <MenuElement key="targetSupport">
                    <Label title="Desired support for each supported constraint, between 0 and 1">
                        Target Support
                    </Label>
                    <Input
                        type="number"
                        required
                        name="targetSupport"
                        min="0"
                        max="1"
                        step="0.01"
                        defaultValue={customFormState?.targetSupport ?? 0.8}
                    />
                </MenuElement>,

                <MenuElement key="maxAttempts">
                    <Label title="Maximum number of candidate generation attempts">
                        Max. Attempts
                    </Label>
                    <Input
                        type="number"
                        required
                        name="maxAttempts"
                        min="1"
                        step="1"
                        defaultValue={customFormState?.maxAttempts ?? 1000}
                    />
                </MenuElement>,
            ],


            onSubmit: (formData: FormData) => {
                setConstraintStatistics(null);

                if (!currentDcrGraph) {
                    toast.error("No DCR model loaded.");
                    return;
                }

                const name = formData.get("name")?.toString().trim();

                const noTraces = Number(formData.get("noTraces"));
                const minTraceLen = Number(formData.get("minTrace"));
                const maxTraceLen = Number(formData.get("maxTrace"));
                const noisePercentage = Number(formData.get("noise"));
                const targetSupport = Number(formData.get("targetSupport"));
                const maxAttempts = Number(formData.get("maxAttempts"));

                if (!name) {
                    toast.error("Event log name is required.");
                    return;
                }

                if (
                    !Number.isInteger(noTraces) ||
                    noTraces <= 0 ||
                    !Number.isInteger(minTraceLen) ||
                    minTraceLen < 0 ||
                    !Number.isInteger(maxTraceLen) ||
                    maxTraceLen < minTraceLen ||
                    !Number.isInteger(maxAttempts) ||
                    maxAttempts < noTraces ||
                    !Number.isFinite(noisePercentage) ||
                    noisePercentage < 0 ||
                    noisePercentage > 1 ||
                    !Number.isFinite(targetSupport) ||
                    targetSupport < 0 ||
                    targetSupport > 1
                ) {
                    toast.error("Invalid generation parameters.");
                    return;
                }

                setCustomFormState({
                    ...customFormState,
                    name,
                    noTraces,
                    minTrace: minTraceLen,
                    maxTrace: maxTraceLen,
                    noise: noisePercentage,
                    targetSupport,
                    maxAttempts,
                });

                try {
                    const draftGraph: DCRGraphS = {
                        ...currentDcrGraph,
                        marking: copyMarking(currentDcrGraph.marking),
                    };

                    const result = generateEventLogWithSupport(
                        draftGraph,
                        {
                            noTraces,
                            minTraceLen,
                            maxTraceLen,
                            noisePercentage,
                            targetSupport,
                            maxAttempts,
                        },
                    );

                    const generatedTraces = Object.keys(result.log.traces).length;

                    if (generatedTraces !== noTraces) {
                        toast.error(
                            `Generated only ${generatedTraces} of ${noTraces} requested traces.`,
                        );
                        return;
                    }

                    setConstraintStatistics(result.statistics);
                    saveEventLog(name, result.log);
                    saveLog(name, result.log);

                    if (result.averageSupport !== null) {
                        toast.info(
                            `Average constraint support: ${(result.averageSupport * 100).toFixed(1)}%`,
                        );
                    } else {
                        toast.warning(
                            "No constraints were activated in the generated log.",
                        );
                    }
                } catch (error) {
                    console.error("Constraint support generation failed:", error);

                    toast.error(
                        error instanceof Error
                            ? error.message
                            : "Unable to generate event log.",
                    );
                }
            },

        },
    };

    const saveLog = (name: string, eventLog: EventLog<RoleTrace>) => {
        if (commitSaveLog(name, eventLog)) {
            toast.success("Log saved!");
        }
    };

    const saveEventLog = (name: string, eventLog: EventLog<RoleTrace>) => {
        const data = writeEventLog(eventLog);
        const blob = new Blob([data]);
        saveAs(blob, `${name}.xes`);
    };

    const open = (
        data: string,
        parse: ((xml: string) => Promise<void>) | undefined,
    ) => {
        if (!isCompatible(data)) {
            toast.warning("Log generation not supported for guards, time constraints, variables, and subprocesses...");
        } else {
            if (parse) {
                parse(data).catch((e) => {
                    console.log(e);
                    toast.error("Unable to parse XML...");
                });
            }
        }
    };

    function savedGraphElements(): Array<ModalMenuElement> {
        if (savedGraphs.size === 0) {
            return [];
        }

        return [
            {
                text: "Saved Graphs:",
                elements: [...savedGraphs.values()].map(({name, graph}) => ({
                    icon: <BiLeftArrowCircle/>,
                    text: name,
                    onClick: () => {
                        open(graph, modeler?.importXML);
                        setMenuOpen(false);
                    },
                })),
            },
        ];
    }

    const menuElements: Array<ModalMenuElement> = [
        {
            text: "Open Model",
            elements: [
                {
                    customElement: (
                        <StyledFileUpload>
                            <FileUpload
                                accept="text/xml"
                                fileCallback={(_, contents) => {
                                    open(contents, modeler?.importXML);
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
                                fileCallback={(_, contents) => {
                                    open(contents, modeler?.importDCRPortalXML);
                                }}
                            >
                                <div/>
                                <>Open DCR Solution XML</>
                            </FileUpload>
                        </StyledFileUpload>
                    ),
                },
            ],
        },
        ...savedGraphElements(),
        {
            customElement: (
                <MenuElement>
                    <Label>Generation Algorithm:</Label>
                    <DropDown
                        value={algorithm}
                        options={ALGORITHMS.map((algorithm) => ({
                            title: algorithm,
                            value: algorithm,
                        }))}
                        onChange={(value) => {
                            if (isAlgorithm(value)) {
                                setAlgorithm(value);
                            }
                        }}
                    />
                </MenuElement>
            ),
        },
        {
            customElement: (
                <Form
                    submitText="Generate!"
                    submit={algorithmForms[algorithm].onSubmit}
                >
                    {algorithmForms[algorithm].inputs}
                </Form>
            ),
        },
        ...(algorithm === "Constraint Support" && constraintStatistics
            ? [
                {
                    customElement: (
                        <MenuElement>
                            <StatisticsContainer>
                                <h3>Constraint Support Results</h3>

                                <StatisticsTable>
                                    <thead>
                                    <tr>
                                        <th>Constraint</th>
                                        <th>Activated</th>
                                        <th>Supporting</th>
                                        <th>Violating</th>
                                        <th>Support</th>
                                    </tr>
                                    </thead>

                                    <tbody>
                                    {constraintStatistics.map((constraint) => {
                                        const source =
                                            currentDcrGraph?.labelMap[constraint.source]
                                            || constraint.source;

                                        const target =
                                            currentDcrGraph?.labelMap[constraint.target]
                                            || constraint.target;

                                        return (
                                            <tr
                                                key={`${constraint.type}-${constraint.source}-${constraint.target}`}
                                            >
                                                <td>
                                                    {constraint.type}: {source} → {target}
                                                </td>

                                                <td>{constraint.activatedTraces}</td>
                                                <td>{constraint.supportingTraces}</td>
                                                <td>{constraint.violatingTraces}</td>

                                                <td>
                                                    {constraint.support === null
                                                        ? "N/A"
                                                        : `${(constraint.support * 100).toFixed(1)}%`}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    </tbody>
                                </StatisticsTable>
                            </StatisticsContainer>
                        </MenuElement>
                    ),
                },
            ]
            : []),
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

    const isCompatible = (xml: string) =>
        !xml.includes("subProcess") &&
        !xml.includes("eventData") &&
        !/<dcr:relation[^>]+time=/.test(xml) &&
        !/<dcr:relation[^>]+guard=/.test(xml);

    const onInitModeler = useEffectEvent((modeler: DCRModeler) => {
        // Import the current graph (if any).
        // After this import will happen on action (manual calls to importXml),
        // so no need to do it reactively when current graph changes (is imported).

        if (currentGraph && isCompatible(currentGraph.graph)) {
            modeler.importXML(currentGraph.graph).catch((e: Error) => console.log(e));
        } else {
            if (currentGraph) toast.warning("Log generation not supported for guards, time constraints, variables, and subprocesses...");
            modeler.importXML(emptyBoardXML).catch((e: Error) => console.log(e));
        }
    });

    useEffect(() => {
        if (!modeler) {
            return;
        }

        onInitModeler(modeler);
    }, [modeler]);

    return (
        <>
            <ReactiveModeler
                modeler={modeler}
                setModeler={setModeler}
                coloredRelations={coloredRelations}
                markerNotation={markerNotation}
                disableControls={true}
                isSimulating={false}
                className="conformance"
                onClickElement={() => {
                    // Clear selection
                    const selection = modeler?.getSelection();
                    selection?.select([]);
                }}
                onImport={() => {
                    console.log("Import done");
                    if (!modeler) {
                        return;
                    }

                    const graph = moddleToDCR(modeler.getElementRegistry());
                    setCurrentDcrGraph(graph);
                    setConstraintStatistics(null);
                }}
            />
            <TopRightIcons>
                <FullScreenIcon data-testid="fullscreen-icon"/>
                <BiHome
                    onClick={() => setState(StateEnum.Home)}
                    data-testid="home-icon"
                />
                <ModalMenu
                    elements={menuElements}
                    open={menuOpen}
                    bottomElements={bottomElements}
                    setOpen={setMenuOpen}
                />
            </TopRightIcons>
        </>
    );
};

export default EventLogGenerationState;
