import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import { StateEnum, type StateProps } from "../App";
import TopRightIcons from "../utilComponents/TopRightIcons";
import FullScreenIcon from "../utilComponents/FullScreenIcon";
import {
  BiHome,
  BiLeftArrowCircle,
  BiSolidFlame,
  BiSolidRocket,
  BiUpload,
} from "react-icons/bi";
import ModalMenu, { type ModalMenuElement } from "../utilComponents/ModalMenu";
import {
  type AlignmentLogResults,
  type ReplayLogResults,
  type ViolationLogResults,
} from "../types";
import {
  alignTrace,
  mergeViolations,
  moddleToDCR,
  quantifyViolations,
  getVariants,
  replayTraceS,
  type DCRGraphS,
  StringTraceStreamParser,
  filterVariantByTopPercentage,
  filterVariantByBottomPercentage,
} from "dcr-engine";
import { toast } from "react-toastify";
import TraceView from "../utilComponents/TraceView";
import type {
  LabelDCRPP,
  RelationActivations,
  RelationViolations,
  RoleTrace,
  Trace,
  VariantLog,
} from "dcr-engine/src/types";
import StyledFileUpload from "../utilComponents/StyledFileUpload";
import ReplayResults from "./ReplayResults";
import styled from "styled-components";
import HeatmapResults from "./HeatmapResults";
import { graphToGraphPP } from "dcr-engine/src/align";
import AlignmentResults from "./AlignmentResults";
import AlignmentTraceView from "./AlignmentTraceView";
import { mergeActivations } from "dcr-engine/src/conformance";
import {
  ColoredRelationsSetting,
  MarkerNotationSetting,
} from "./GlobalModalMenuElements";
import ReactiveModeler from "./ReactiveModeler";
import emptyBoardXML from "../resources/emptyBoard";
import RawFileUpload from "../utilComponents/RawFileUpload";
import Label from "../utilComponents/Label";
import MenuElement from "../utilComponents/MenuElement";
import EmptyResults from "./EmptyResults";

function logMemory(label: string) {
  if ("gc" in window && typeof window.gc === "function") {
    window.gc();
  }

  // @ts-expect-error: Only available in some browsers
  const mem = window.performance.memory
    ? // @ts-expect-error: Only available in some browsers
      window.performance.memory.usedJSHeapSize
    : 0;

  console.info(`[${label}] Memory: ${(mem / 1024 / 1024).toFixed(2)} MB`);
}

interface ConformanceCheckingSummary {
  totalViolations: number;
  violations: RelationViolations;
  activations: RelationActivations;
}

const HeatmapButton = styled(BiSolidFlame)<{
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
      : ``}
`;

const AlignButton = styled(BiSolidRocket)<{
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
      : ``}
`;

const Input = styled.input`
  width: 7rem;
  font-size: 20px;
`;

const Select = styled.select`
  padding: 0.5rem;
  font-size: 20px;
  background-color: white;
  border: 2px solid gainsboro;
  cursor: pointer;
  &:hover {
    background-color: gainsboro;
    color: white;
  }
`;

const alignShowDesc = (
  trace: Trace,
  graph: LabelDCRPP,
): { cost: number; trace: Trace } => {
  const alignment = alignTrace(trace, graph);

  return {
    cost: alignment.cost,
    trace: alignment.trace.map((event) => graph.labelMap[event]),
  };
};

const ConformanceCheckingState = ({
  savedGraphs,
  savedLogs,
  setState,
  currentGraph,
  currentLog,
  saveGraph,
  saveLog,
  pickGraph,
  pickLog,
  markerNotation,
  changeMarkerNotation,
  coloredRelations,
  changeColoredRelations,
}: StateProps) => {
  const [menuOpen, setMenuOpen] = useState(true);
  const [heatmapMode, setHeatmapMode] = useState(false);
  const [alignmentMode, setAlignmentMode] = useState(false);

  const [modeler, setModeler] = useState<DCRModeler | null>(null);
  const [currentDcrGraph, setCurrentDcrGraph] = useState<DCRGraphS | null>(
    null,
  );

  const [variantLog, setVariantLog] = useState<VariantLog<RoleTrace> | null>(
    null,
  );

  const emptyLogResults = useMemo(() => {
    if (!variantLog) {
      return [];
    }

    return variantLog.variants.map((variant, index) => {
      return {
        traceId: variant.variantId,
        traceName: `Trace Variant #${index + 1}`,
        count: variant.count,
        frequency: variant.count / variantLog.count,
        trace: variant.trace,
      };
    });
  }, [variantLog]);

  const [replayLogResults, setReplayLogResults] = useState<ReplayLogResults>(
    [],
  );
  const [violationLogResults, setViolationLogResults] =
    useState<ViolationLogResults>([]);
  const [alignmentLogResults, setAlignmentLogResults] =
    useState<AlignmentLogResults>([]);

  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);

  const variantsDirectionRef = useRef<HTMLSelectElement>(null);
  const variantsPercentageRef = useRef<HTMLInputElement>(null);

  const resetAllResults = useCallback(() => {
    setReplayLogResults([]);
    setViolationLogResults([]);
    setAlignmentLogResults([]);
    setSelectedTraceId(null);
    setHeatmapMode(false);
    setAlignmentMode(false);
  }, []);

  const selectedEmptyTrace = useMemo(() => {
    if (!selectedTraceId) {
      return null;
    }

    const trace = emptyLogResults.find((tr) => tr.traceId === selectedTraceId);

    if (!trace) {
      return null;
    }

    return {
      traceId: selectedTraceId,
      traceName: trace.traceName,
      trace: trace.trace,
      count: trace.count,
      frequency: trace.frequency,
    };
  }, [selectedTraceId, emptyLogResults]);

  const selectedReplayTrace = useMemo(() => {
    if (!selectedTraceId) {
      return null;
    }

    const trace = replayLogResults.find((tr) => tr.traceId === selectedTraceId);

    if (!trace) {
      return null;
    }

    return {
      traceId: selectedTraceId,
      traceName: trace.traceName,
      trace: trace.trace,
      count: trace.count,
      frequency: trace.frequency,
      isPositive: trace.isPositive,
    };
  }, [selectedTraceId, replayLogResults]);

  const selectedViolationTrace = useMemo(() => {
    if (!selectedTraceId) {
      return null;
    }

    const trace = violationLogResults.find(
      (tr) => tr.traceId === selectedTraceId,
    );

    if (!trace) {
      return null;
    }

    return {
      traceId: selectedTraceId,
      traceName: trace.traceName,
      trace: trace.trace,
      count: trace.count,
      frequency: trace.frequency,
      results: trace.results,
    };
  }, [selectedTraceId, violationLogResults]);

  const selectedAlignmentTrace = useMemo(() => {
    if (!selectedTraceId) {
      return null;
    }

    const trace = alignmentLogResults.find(
      (tr) => tr.traceId === selectedTraceId,
    );

    if (!trace) {
      return null;
    }

    return {
      traceId: selectedTraceId,
      traceName: trace.traceName,
      trace: trace.trace,
      count: trace.count,
      frequency: trace.frequency,
      results: trace.results,
    };
  }, [selectedTraceId, alignmentLogResults]);

  const hasNesting = useMemo(() => {
    return currentGraph?.graph.includes("Nesting") ?? false;
  }, [currentGraph?.graph]);

  const hasRole = useMemo(() => {
    return currentGraph?.graph.includes("role") ?? false;
  }, [currentGraph?.graph]);

  const hasSubProcess = useMemo(() => {
    return currentGraph?.graph.includes("subProcess") ?? false;
  }, [currentGraph?.graph]);

  const heatmapIsAllowed = !hasNesting;
  const alignmentIsAllowed = !(hasRole || hasSubProcess);

  const performConformanceChecking = useCallback(
    (graph: DCRGraphS, variantLog: VariantLog<RoleTrace>) => {
      const rawVariantsDirection = variantsDirectionRef.current?.value;
      const variantsDirection =
        rawVariantsDirection === "top" ? "top" : "bottom";
      const rawVariantsPercentage = variantsPercentageRef.current?.value;
      const variantsPercentage = rawVariantsPercentage
        ? parseFloat(rawVariantsPercentage.toString()) / 100
        : 1;
      console.info("variants%", variantsPercentage, variantsDirection);

      try {
        logMemory("Before conformance checking");
        console.info("Started conformance checking...");
        console.time("conformance-checking");
        performance.mark("conformance-checking-start");

        console.info("Started variant filtering...");
        console.time("filter-variants");
        performance.mark("filter-variants-start");

        if (variantsPercentage >= 1) {
          console.info("No variant filtering will be applied to log.");
        }

        const filteredVariantLog =
          variantsPercentage < 1
            ? variantsDirection === "top"
              ? filterVariantByTopPercentage(variantLog, variantsPercentage)
              : filterVariantByBottomPercentage(variantLog, variantsPercentage)
            : variantLog;

        performance.mark("filter-variants-end");
        performance.measure(
          "filter-variants",
          "filter-variants-start",
          "filter-variants-end",
        );
        console.info("Finished variant filtering!");
        console.timeEnd("filter-variants");
        logMemory("After filtering variants");

        console.info("Started replaying log...");
        console.time("replay-log");
        performance.mark("replay-log-start");

        setReplayLogResults(
          filteredVariantLog.variants.map(
            ({ variantId, trace, count }, index) => {
              return {
                traceId: variantId,
                traceName: `Trace Variant #${index + 1}`,
                count,
                frequency: count / variantLog.count, // relative to the original log
                trace,
                isPositive: replayTraceS(graph, trace),
              };
            },
          ),
        );

        performance.mark("replay-log-end");
        performance.measure("replay-log", "replay-log-start", "replay-log-end");
        console.info("Finished replaying log!");
        console.timeEnd("replay-log");
        logMemory("After replaying log");

        if (!hasNesting) {
          console.info("Started quantifying violations...");
          console.time("quantify-violations");
          performance.mark("quantify-violations-start");

          setViolationLogResults(
            filteredVariantLog.variants.map(
              ({ variantId, trace, count }, index) => ({
                traceId: variantId,
                traceName: `Trace Variant #${index + 1}`,
                count,
                frequency: count / variantLog.count, // relative to the original log
                trace,
                results: quantifyViolations(graph, trace),
              }),
            ),
          );

          performance.mark("quantify-violations-end");
          performance.measure(
            "quantify-violations",
            "quantify-violations-start",
            "quantify-violations-end",
          );
          console.info("Finished quantifying violations!");
          console.timeEnd("quantify-violations");
          logMemory("After quantifying violations");
        }

        if (!(hasRole || hasSubProcess)) {
          console.info("Started precomputing properties...");
          console.time("precompute-properties");
          performance.mark("precompute-properties-start");

          const graphPP = graphToGraphPP(graph);

          performance.mark("precompute-properties-end");
          performance.measure(
            "precompute-properties",
            "precompute-properties-start",
            "precompute-properties-end",
          );
          console.info("Started precomputing properties!");
          console.timeEnd("precompute-properties");
          logMemory("After precomputing properties");

          console.info("Started aligning log...");
          console.time("align-log");
          performance.mark("align-log-start");

          setAlignmentLogResults(
            filteredVariantLog.variants.map(
              ({ variantId, trace, count }, index) => ({
                traceId: variantId,
                traceName: `Trace Variant #${index + 1}`,
                count,
                frequency: count / variantLog.count, // relative to the original log
                trace,
                results: alignShowDesc(
                  trace.map((event) => event.activity),
                  graphPP,
                ),
              }),
            ),
          );

          performance.mark("align-log-end");
          performance.measure("align-log", "align-log-start", "align-log-end");
          console.info("Finished aligning log!");
          console.timeEnd("align-log");
          logMemory("After aligning log");
        }

        // Enable heatmap by default after conformance checking completes
        if (heatmapIsAllowed) {
          setHeatmapMode(true);
          setAlignmentMode(false);
        }
      } catch (e) {
        console.log(e);
        console.error("Failed conformance checking!");
        resetAllResults();
      }

      performance.mark("conformance-checking-end");
      performance.measure(
        "conformance-checking",
        "conformance-checking-start",
        "conformance-checking-end",
      );
      console.info("Finished conformance checking!");
      console.timeEnd("conformance-checking");
      logMemory("After conformance checking");
    },
    [hasNesting, hasRole, hasSubProcess, heatmapIsAllowed, resetAllResults],
  );

  const aggregatedViolationLogResults = useMemo<
    ConformanceCheckingSummary | undefined
  >(() => {
    if (violationLogResults.length === 0) {
      return undefined;
    }

    return violationLogResults.reduce(
      (acc, result) => {
        if (!result.results) {
          return acc;
        }

        return {
          totalViolations: acc.totalViolations + result.results.totalViolations,
          violations: mergeViolations(
            acc.violations,
            result.results.violations,
          ),
          activations: mergeActivations(
            acc.activations,
            result.results.activations,
          ),
        };
      },
      {
        totalViolations: 0,
        violations: {
          conditionsFor: {},
          responseTo: {},
          excludesTo: {},
          milestonesFor: {},
        },
        activations: {
          conditionsFor: {},
          responseTo: {},
          excludesTo: {},
          milestonesFor: {},
          includesTo: {},
        },
      },
    );
  }, [violationLogResults]);

  useEffect(() => {
    if (!modeler || !heatmapMode) {
      return;
    }

    if (selectedViolationTrace?.results) {
      modeler.updateViolations(selectedViolationTrace.results);
    } else if (aggregatedViolationLogResults) {
      modeler.updateViolations(aggregatedViolationLogResults);
    }

    return () => {
      modeler.updateViolations(null);
    };
  }, [
    heatmapMode,
    selectedViolationTrace?.results,
    aggregatedViolationLogResults,
    modeler,
  ]);

  function savedGraphElements(): Array<ModalMenuElement> {
    if (savedGraphs.size === 0) {
      return [];
    }

    return [
      {
        text: "Saved Graphs:",
        elements: [...savedGraphs.values()].map(({ name, graph }) => ({
          icon: <BiLeftArrowCircle />,
          text: name,
          onClick: async () => {
            if (!modeler) {
              return;
            }

            if (graph.includes('multi-instance="true"')) {
              toast.error("Multi-instance subprocesses not supported...");
              return;
            }

            try {
              await modeler.importXML(graph);
              pickGraph(name);
              resetAllResults();
            } catch (e) {
              console.log(e);
              toast.error("Unable to parse XML...");
              return;
            }
          },
        })),
      },
    ];
  }

  function savedLogElements(): Array<ModalMenuElement> {
    if (savedLogs.size === 0) {
      return [];
    }

    return [
      {
        text: "Saved Logs:",
        elements: [...savedLogs.values()].map(({ name }) => ({
          icon: <BiLeftArrowCircle />,
          text: name,
          onClick: () => {
            pickLog(name);
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
              <RawFileUpload
                accept="text/xml"
                fileCallback={async (file) => {
                  if (!modeler) {
                    return;
                  }

                  logMemory("Before opening model");
                  console.info("Started opening model...");
                  console.time("open-model");
                  performance.mark("open-model-start");

                  try {
                    const rawData = await file.text();
                    if (rawData.includes('multi-instance="true"')) {
                      throw new Error(
                        "Multi-instance subprocesses not supported...",
                        {
                          cause: "Validation",
                        },
                      );
                    }

                    await modeler.importXML(rawData);

                    const data = await modeler.saveXML({
                      format: false,
                    });

                    saveGraph(file.name, data.xml);
                  } catch (e) {
                    if (e instanceof Error && e.cause === "Validation") {
                      toast.error(e.message);
                      return;
                    }
                    console.log(e);
                    toast.error("Unable to parse XML...");
                  }

                  performance.mark("open-model-end");
                  performance.measure(
                    "open-model",
                    "open-model-start",
                    "open-model-end",
                  );
                  console.info("Finished opening model!");
                  console.timeEnd("open-model");
                  logMemory("After opening model");
                }}
              >
                <div />
                Open Editor XML
              </RawFileUpload>
            </StyledFileUpload>
          ),
        },
        {
          customElement: (
            <StyledFileUpload>
              <RawFileUpload
                accept="text/xml"
                fileCallback={async (file) => {
                  if (!modeler) {
                    return;
                  }

                  logMemory("Before opening model");
                  console.info("Started opening model...");
                  console.time("open-model");
                  performance.mark("open-model-start");

                  try {
                    const rawData = await file.text();
                    if (rawData.includes('multi-instance="true"')) {
                      throw new Error(
                        "Multi-instance subprocesses not supported...",
                        {
                          cause: "Validation",
                        },
                      );
                    }

                    await modeler.importDCRPortalXML(rawData);

                    const data = await modeler.saveXML({
                      format: false,
                    });

                    saveGraph(file.name, data.xml);
                  } catch (e) {
                    if (e instanceof Error && e.cause === "Validation") {
                      toast.error(e.message);
                      return;
                    }
                    console.log(e);
                    toast.error("Unable to parse XML...");
                  }

                  performance.mark("open-model-end");
                  performance.measure(
                    "open-model",
                    "open-model-start",
                    "open-model-end",
                  );
                  console.info("Finished opening model!");
                  console.timeEnd("open-model");
                  logMemory("After opening model");
                }}
              >
                <div />
                Open DCR Solution XML
              </RawFileUpload>
            </StyledFileUpload>
          ),
        },
      ],
    },
    ...savedGraphElements(),
    ...savedLogElements(),
    {
      customElement: (
        <MenuElement>
          <Label>Variant Ordering</Label>
          <Select
            name="variantsDirection"
            data-testid="variantsDirection"
            defaultValue="top"
            ref={variantsDirectionRef}
          >
            <option value="top">Most frequent</option>
            <option value="bottom">Least frequent</option>
          </Select>
        </MenuElement>
      ),
    },
    {
      customElement: (
        <MenuElement>
          <Label>Coverage Threshold</Label>
          <Input
            type="number"
            required
            data-testid="variantsPercentage"
            name="variantsPercentage"
            min="0"
            max="100"
            defaultValue="100"
            step="1"
            ref={variantsPercentageRef}
          />
        </MenuElement>
      ),
    },
    {
      customElement: (
        <StyledFileUpload>
          <RawFileUpload
            accept=".xes"
            fileCallback={async (file) => {
              logMemory("Before parsing log");
              console.info("Started parsing log...");
              console.time("parse-log");
              performance.mark("parse-log-start");

              try {
                const log = await StringTraceStreamParser.parseAsRoleLog(file);
                saveLog(file.name, log);
              } catch (e) {
                console.log(e);
                toast.error("Cannot parse log...");
              }

              performance.mark("parse-log-end");
              performance.measure(
                "parse-log",
                "parse-log-start",
                "parse-log-end",
              );
              console.info("Finished parsing log!");
              console.timeEnd("parse-log");
              logMemory("After parsing log");
            }}
          >
            <BiUpload />
            Upload Log
          </RawFileUpload>
        </StyledFileUpload>
      ),
    },
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

  const onInitModeler = useEffectEvent((modeler: DCRModeler) => {
    // Import the current graph (if any).
    // After this import will happen on action (manual calls to importXml),
    // so no need to do it reactively when current graph changes (is imported).

    modeler
      .importXML(currentGraph?.graph ?? emptyBoardXML)
      .catch((e: Error) => console.log(e));
  });

  useEffect(() => {
    if (!modeler) {
      return;
    }

    onInitModeler(modeler);
  }, [modeler]);

  useEffect(() => {
    logMemory("Before collecting variants");

    if (currentLog) {
      console.info("Started collecting variants...");
      console.time("collect-variants");
      performance.mark("collect-variants-start");

      const variantLog = getVariants(currentLog.log);
      setVariantLog(variantLog);

      performance.mark("collect-variants-end");
      performance.measure(
        "collect-variants",
        "collect-variants-start",
        "collect-variants-end",
      );
      console.info("Finished collecting variants!");
      console.timeEnd("collect-variants");
      logMemory("After collecting variants");
    }
  }, [currentLog]);

  function handleCheck() {
    if (currentDcrGraph && variantLog) {
      performConformanceChecking(currentDcrGraph, variantLog);
    }
  }

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
          if (!modeler) {
            return;
          }

          const graph = moddleToDCR(modeler.getElementRegistry());
          setCurrentDcrGraph(graph);
        }}
      />
      {/* Empty results view: When no results has been calculated */}
      {emptyLogResults.length > 0 && replayLogResults.length === 0 && (
        <EmptyResults
          logName={currentLog?.name ?? ""}
          emptyLogResults={emptyLogResults}
          selectedTrace={selectedReplayTrace}
          setSelectedTraceId={setSelectedTraceId}
          onCheck={handleCheck}
        />
      )}
      {/* Default view: When heatmap and alignment is disabled */}
      {replayLogResults.length > 0 && !heatmapMode && !alignmentMode && (
        <ReplayResults
          logName={currentLog?.name ?? ""}
          replayLogResults={replayLogResults}
          selectedTrace={selectedReplayTrace}
          setSelectedTraceId={setSelectedTraceId}
          onCheck={handleCheck}
        />
      )}
      {/* Heatmap view: When heatmap is enabled (alignment cannot be enabled at the same time) */}
      {violationLogResults.length > 0 && heatmapMode && (
        <HeatmapResults
          logName={currentLog?.name ?? ""}
          violationLogResults={violationLogResults}
          aggregatedViolationLogResults={aggregatedViolationLogResults}
          selectedTrace={selectedViolationTrace}
          setSelectedTraceId={setSelectedTraceId}
          onCheck={handleCheck}
        />
      )}
      {/* Alignment view: When alignment is enabled (heatmap cannot be enabled at the same time) */}
      {alignmentLogResults.length > 0 && alignmentMode && (
        <AlignmentResults
          logName={currentLog?.name ?? ""}
          alignmentLogResults={alignmentLogResults}
          selectedTrace={selectedAlignmentTrace}
          setSelectedTraceId={setSelectedTraceId}
          onCheck={handleCheck}
        />
      )}
      {/* Empty results view: When no results has been calculated */}
      {selectedEmptyTrace && !selectedReplayTrace && (
        <TraceView
          selectedTrace={selectedEmptyTrace}
          setSelectedTraceId={setSelectedTraceId}
        />
      )}
      {/* Default view: When alignment is disabled (heatmap can be enabled or disabled in this view) */}
      {selectedReplayTrace && !alignmentMode && (
        <TraceView
          selectedTrace={selectedReplayTrace}
          setSelectedTraceId={setSelectedTraceId}
        />
      )}
      {/* Alignment view: When alignment is enabled (heatmap cannot be enabled at the same time) */}
      {selectedAlignmentTrace && alignmentMode && (
        <AlignmentTraceView
          selectedTrace={{
            ...selectedAlignmentTrace,
            isPositive: selectedReplayTrace?.isPositive,
          }}
          setSelectedTraceId={setSelectedTraceId}
        />
      )}
      <TopRightIcons>
        <AlignButton
          onClick={() => {
            if (!alignmentIsAllowed) {
              toast.warning(
                "Roles and subprocesses not supported for alignment...",
              );
              return;
            }

            setAlignmentMode((alignmentMode) => !alignmentMode);
            setHeatmapMode(false);
          }}
          $clicked={alignmentIsAllowed && alignmentMode}
          title="Display results as alignments."
          data-testid="alignment-icon"
        />
        <HeatmapButton
          onClick={() => {
            if (!heatmapIsAllowed) {
              toast.warning(
                "Nestings and multi-instance subprocesses not supported for heatmap...",
              );
              return;
            }

            setHeatmapMode((heatmapMode) => !heatmapMode);
            setAlignmentMode(false);
          }}
          $clicked={heatmapIsAllowed && heatmapMode}
          title="Display results as constraint violation heatmap."
          data-testid="heatmap-icon"
        />
        <FullScreenIcon data-testid="fullscreen-icon" />
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

export default ConformanceCheckingState;
