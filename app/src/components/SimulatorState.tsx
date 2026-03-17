import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
} from "react";
import { StateEnum, type StateProps } from "../App";
import { toast } from "react-toastify";
import TopRightIcons from "../utilComponents/TopRightIcons";
import {
  BiHome,
  BiLeftArrowCircle,
  BiMeteor,
  BiPlus,
  BiUpload,
} from "react-icons/bi";

import {
  type SubProcess,
  type Event,
  isEnabledS,
  executeS,
  copyMarking,
  moddleToDCR,
  isAcceptingS,
  type RoleTrace,
  replayTraceS,
  SAXParser,
} from "dcr-engine";
import ModalMenu, { type ModalMenuElement } from "../utilComponents/ModalMenu";
import FullScreenIcon from "../utilComponents/FullScreenIcon";
import styled from "styled-components";
import FileUpload from "../utilComponents/FileUpload";
import type { DCRGraphS, EventLog } from "dcr-engine";
import Button from "../utilComponents/Button";

import { saveAs } from "file-saver";
import { writeEventLog } from "dcr-engine";
import EventLogView from "./EventLogView";
import TraceView from "../utilComponents/TraceView";
import StyledFileUpload from "../utilComponents/StyledFileUpload";
import {
  ColoredRelationsSetting,
  MarkerNotationSetting,
} from "./GlobalModalMenuElements";
import ReactiveModeler, { type TargetElement } from "./ReactiveModeler";
import emptyBoardXML from "../resources/emptyBoard";
import RawFileUpload from "../utilComponents/RawFileUpload";

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
`;

const WildButton = styled(BiMeteor)<{ $clicked: boolean; $disabled?: boolean }>`
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

const FinalizeButton = styled(Button)`
  margin: auto;
  margin-bottom: 0;
  width: fit-content;
`;

const SimulatingEnum = {
  Default: "Default",
  Wild: "Wild",
  Not: "Not",
} as const;

type SimulatingEnum = (typeof SimulatingEnum)[keyof typeof SimulatingEnum];

let id = 1;

const DEFAULT_EVENT_LOG = {
  name: "Unnamed Event Log",
  traces: {
    "Trace 0": { traceId: "Trace 0", traceName: "Trace 0", trace: [] },
  },
};

const DEFAULT_SELECTED_TRACE = "Trace 0";

function isDefaultEventLog(traces: Record<string, { trace: RoleTrace }>) {
  const keys = Object.keys(traces);
  if (keys.length === 0) {
    return true;
  }

  if (
    keys.length === 1 &&
    keys[0] === DEFAULT_SELECTED_TRACE &&
    traces[keys[0]].trace.length === 0
  ) {
    return true;
  }

  return false;
}

const DEFAULT_SIMULATION_STATUS = SimulatingEnum.Default;

const SimulatorState = ({
  setState,
  savedGraphs,
  savedLogs,
  currentGraph,
  currentLog,
  saveLog: commitSaveLog,
  coloredRelations,
  changeColoredRelations,
  markerNotation,
  changeMarkerNotation,
}: StateProps) => {
  const [modeler, setModeler] = useState<DCRModeler | null>(null);
  const [currentDcrGraph, setCurrentDcrGraph] = useState<DCRGraphS | null>(
    null,
  );
  const [initialDcrGraph, setInitialDcrGraph] = useState<DCRGraphS | null>(
    null,
  );

  const resetCurrentDcrGraph = useCallback(() => {
    if (!modeler || !currentDcrGraph || !initialDcrGraph) {
      return;
    }

    setCurrentDcrGraph(initialDcrGraph);
    modeler.updateRendering(initialDcrGraph);
  }, [currentDcrGraph, initialDcrGraph, modeler]);

  const [menuOpen, setMenuOpen] = useState(false);

  const [eventLog, setEventLog] = useState<{
    name: string;
    traces: {
      [traceId: string]: {
        traceId: string;
        traceName: string;
        trace: RoleTrace;
      };
    };
  }>(DEFAULT_EVENT_LOG);

  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(
    DEFAULT_SELECTED_TRACE,
  );

  const addTraceToLog = useCallback(
    (traceId: string) =>
      setEventLog((currentEventLog) => ({
        ...currentEventLog,
        traces: {
          ...currentEventLog.traces,
          [traceId]: { traceId, traceName: traceId, trace: [] },
        },
      })),
    [],
  );

  const updateLog = useCallback(
    (newName: string) =>
      setEventLog((currentEventLog) => ({
        ...currentEventLog,
        name: newName,
      })),
    [],
  );

  const addEventToTrace = useCallback(
    (traceId: string, activity: string, role: string) =>
      setEventLog((currentEventLog) => {
        const trace = currentEventLog.traces[traceId];
        if (!trace) return currentEventLog;
        return {
          ...currentEventLog,
          traces: {
            ...currentEventLog.traces,
            [traceId]: {
              ...trace,
              trace: [...trace.trace, { activity, role }],
            },
          },
        };
      }),
    [],
  );

  const updateTraceName = useCallback(
    (traceId: string, newName: string) =>
      setEventLog((currentEventLog) => {
        const trace = currentEventLog.traces[traceId];
        if (!trace) return currentEventLog;
        return {
          ...currentEventLog,
          traces: {
            ...currentEventLog.traces,
            [traceId]: {
              ...trace,
              traceName: newName,
            },
          },
        };
      }),
    [],
  );

  const resetTrace = useCallback(
    (traceId: string) =>
      setEventLog((currentEventLog) => {
        const trace = currentEventLog.traces[traceId];
        if (!trace) return currentEventLog;
        return {
          ...currentEventLog,
          traces: {
            ...currentEventLog.traces,
            [traceId]: {
              ...trace,
              trace: [],
            },
          },
        };
      }),
    [],
  );

  const deleteTrace = useCallback((traceId: string) => {
    setEventLog((currentEventLog) => {
      const eventLogCopy = {
        ...currentEventLog,
        traces: { ...currentEventLog.traces },
      };
      delete eventLogCopy.traces[traceId];
      return eventLogCopy;
    });
  }, []);

  const resetEventLog = useCallback(() => {
    setSimulationStatus(DEFAULT_SIMULATION_STATUS);
    setEventLog(DEFAULT_EVENT_LOG);
    setSelectedTraceId(DEFAULT_SELECTED_TRACE);
    resetCurrentDcrGraph();
  }, [resetCurrentDcrGraph]);

  const selectedTrace = useMemo(() => {
    if (selectedTraceId === null) return null;
    const trace = eventLog.traces[selectedTraceId];
    if (!trace) return null;
    return trace;
  }, [eventLog.traces, selectedTraceId]);

  const isSelectedTracePositive = useMemo(() => {
    if (!selectedTrace?.trace || !currentDcrGraph) {
      return;
    }

    const draftDcrGraph = {
      ...currentDcrGraph,
      marking: copyMarking(currentDcrGraph.marking),
    };

    return replayTraceS(draftDcrGraph, selectedTrace.trace);
  }, [currentDcrGraph, selectedTrace?.trace]);

  const addEventToSelectedTrace = useCallback(
    (activity: string, role: string) => {
      if (selectedTraceId === null) return;
      addEventToTrace(selectedTraceId, activity, role);
    },
    [selectedTraceId, addEventToTrace],
  );

  const updateSelectedTraceName = useCallback(
    (newName: string) => {
      if (selectedTraceId === null) return;
      updateTraceName(selectedTraceId, newName);
    },
    [selectedTraceId, updateTraceName],
  );

  const resetSelectedTrace = useCallback(() => {
    if (selectedTraceId === null) return;
    resetTrace(selectedTraceId);
    resetCurrentDcrGraph();
  }, [selectedTraceId, resetTrace, resetCurrentDcrGraph]);

  const [simulationStatus, setSimulationStatus] = useState<SimulatingEnum>(
    DEFAULT_SIMULATION_STATUS,
  );

  const openLog = useCallback(
    (name: string, log: EventLog<RoleTrace>) => {
      if (
        isDefaultEventLog(eventLog.traces) ||
        confirm(
          "This will override your current event log! Do you wish to continue?",
        )
      ) {
        setSimulationStatus(SimulatingEnum.Not);
        setEventLog({
          name,
          traces: Object.keys(log.traces)
            .map((traceName) => ({
              traceName,
              traceId: traceName,
              trace: log.traces[traceName],
            }))
            .reduce((acc, cum) => ({ ...acc, [cum.traceId]: cum }), {}),
        });
        setSelectedTraceId(null);
        resetCurrentDcrGraph();
      }
    },
    [eventLog.traces, resetCurrentDcrGraph],
  );

  const openLogEvent = useEffectEvent(openLog);

  useEffect(() => {
    if (currentLog) {
      openLogEvent(currentLog.name, currentLog.log);
    } else {
      setEventLog(DEFAULT_EVENT_LOG);
    }
  }, [currentLog]);

  const saveLog = () => {
    if (!currentDcrGraph) {
      return;
    }

    const log = {
      traces: Object.values(eventLog.traces).reduce(
        (acc, { traceName, trace }) => ({ ...acc, [traceName]: trace }),
        {},
      ),
      events: currentDcrGraph.events,
    };

    if (commitSaveLog(eventLog.name, log)) {
      toast.success("Log saved!");
    }
  };

  const open = (
    data: string,
    parse: ((xml: string) => Promise<void>) | undefined,
  ) => {
    if (data.includes('multi-instance="true"')) {
      toast.error("Multi-instance subprocesses not supported...");
    } else {
      if (
        isDefaultEventLog(eventLog.traces) ||
        confirm(
          "This will override your current event log! Do you wish to continue?",
        )
      ) {
        if (parse) {
          parse(data)
            .then(() => {
              setSimulationStatus(DEFAULT_SIMULATION_STATUS);
              setEventLog(DEFAULT_EVENT_LOG);
              setSelectedTraceId(DEFAULT_SELECTED_TRACE);
            })
            .catch((e) => {
              console.log(e);
              toast.error("Unable to parse XML...");
            });
        }
      }
    }
  };

  function logExcecutionString(element: TargetElement): string {
    return `Executed ${element.businessObject?.description ?? "Unnamed event"}`;
  }

  function traceString(element: TargetElement): string {
    return element.businessObject?.description ?? "Unnamed event";
  }

  function roleString(element: TargetElement): string {
    return element.businessObject?.role ?? "";
  }

  const executeEvent = (
    element: TargetElement,
    graph: DCRGraphS,
  ): { msg: string; executedEvent: string; role: string } => {
    const eventId: Event = element.id;

    const group: SubProcess | DCRGraphS =
      (graph.subProcessMap[eventId] as SubProcess | undefined) ?? graph;

    const enabledResponse = isEnabledS(eventId, graph, group);
    if (simulationStatus !== SimulatingEnum.Wild && !enabledResponse.enabled) {
      return {
        msg: enabledResponse.msg,
        executedEvent: "",
        role: "",
      };
    }

    executeS(eventId, graph);
    return {
      msg: logExcecutionString(element),
      executedEvent: traceString(element),
      role: roleString(element),
    };
  };

  const saveEventLog = () => {
    if (!modeler || !currentDcrGraph) return;
    const logToExport: EventLog<RoleTrace> = {
      events: currentDcrGraph.events,
      traces: {},
    };
    for (const entry of Object.values(eventLog.traces)) {
      logToExport.traces[entry.traceName] = entry.trace;
    }
    const data = writeEventLog(logToExport);
    const blob = new Blob([data]);
    saveAs(blob, `${eventLog.name}.xes`);
  };

  const closeTraceCallback = () => {
    if (!selectedTrace || simulationStatus === SimulatingEnum.Not) {
      return;
    }

    const eventLogCopy = { ...eventLog, traces: { ...eventLog.traces } };
    delete eventLogCopy.traces[selectedTrace.traceId];
    setEventLog(eventLogCopy);

    setSimulationStatus(SimulatingEnum.Not);
    resetCurrentDcrGraph();
  };

  function savedGraphElements() {
    if (savedGraphs.size === 0) {
      return [];
    }

    return [
      {
        text: "Saved Graphs:",
        elements: [...savedGraphs.values()].map(({ name, graph }) => {
          return {
            icon: <BiLeftArrowCircle />,
            text: name,
            onClick: () => {
              open(graph, modeler?.importXML);
              setMenuOpen(false);
            },
          };
        }),
      },
    ];
  }

  function savedLogElements() {
    if (savedLogs.size === 0) {
      return [];
    }

    return [
      {
        text: "Saved Logs:",
        elements: [...savedLogs.values()].map(({ name, log }) => {
          return {
            icon: <BiLeftArrowCircle />,
            text: name,
            onClick: () => {
              openLog(name, log);
              setMenuOpen(false);
            },
          };
        }),
      },
    ];
  }

  const menuElements: Array<ModalMenuElement> = [
    {
      text: "New Simulation",
      icon: <BiPlus />,
      onClick: () => {
        if (
          confirm(
            "This will erase your current simulated Event Log. Are you sure you wish to continue?",
          )
        ) {
          resetEventLog();
          setMenuOpen(false);
        }
      },
    },
    {
      text: "Open",
      elements: [
        {
          customElement: (
            <StyledFileUpload>
              <FileUpload
                accept="text/xml"
                fileCallback={(_, contents) => {
                  open(contents, modeler?.importXML);
                  setMenuOpen(false);
                }}
              >
                <div />
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
                  setMenuOpen(false);
                }}
              >
                <div />
                <>Open DCR Solution XML</>
              </FileUpload>
            </StyledFileUpload>
          ),
        },
      ],
    },
    {
      customElement: (
        <StyledFileUpload>
          <RawFileUpload
            accept=".xes"
            fileCallback={async (file) => {
              try {
                const log = await SAXParser.parseAsRoleLog(file);
                openLog(file.name.slice(0, -4), log);
              } catch {
                toast.error("Unable to parse log...");
              }
              setMenuOpen(false);
            }}
          >
            <BiUpload />
            <>Upload Log</>
          </RawFileUpload>
        </StyledFileUpload>
      ),
    },
    ...savedGraphElements(),
    ...savedLogElements(),
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

  return (
    <>
      {simulationStatus === SimulatingEnum.Not ? <GreyOut /> : null}
      <ReactiveModeler
        modeler={modeler}
        setModeler={setModeler}
        coloredRelations={coloredRelations}
        markerNotation={markerNotation}
        isSimulating={false}
        disableControls={true}
        onClickElement={(event) => {
          // Clear selection
          const selection = modeler?.getSelection();
          selection?.select([]);

          if (!modeler || !currentDcrGraph) {
            console.warn("Modeler or graph not initialized...");
            return;
          }

          if (simulationStatus === SimulatingEnum.Not) {
            console.warn("Not simulating...");
            return;
          }

          const { element } = event;
          if (element.type !== "dcr:Event") {
            console.warn("Not a valid event...");
            return;
          }

          const draftGraph = {
            ...currentDcrGraph,
            marking: copyMarking(currentDcrGraph.marking), // Only marking is modified during execution
          };

          const response = executeEvent(event.element, draftGraph);
          if (response.executedEvent) {
            addEventToSelectedTrace(response.executedEvent, response.role);
          } else {
            toast.warn(response.msg);
          }

          setCurrentDcrGraph(draftGraph);
          modeler.updateRendering(draftGraph);
        }}
        onImport={() => {
          if (modeler) {
            const graph = moddleToDCR(modeler.getElementRegistry());
            setCurrentDcrGraph(graph);
            setInitialDcrGraph(graph);
            modeler.updateRendering(graph);
          }
        }}
      />
      {simulationStatus === SimulatingEnum.Not && (
        <EventLogView
          eventLog={eventLog}
          selectedTrace={selectedTrace}
          setSelectedTraceId={setSelectedTraceId}
          onEditLog={(newName: string) => {
            updateLog(newName);
          }}
          onDeleteTrace={(traceId: string) => {
            if (selectedTraceId === traceId) {
              setSelectedTraceId(null);
            }

            deleteTrace(traceId);
          }}
        >
          <Button
            disabled={simulationStatus !== SimulatingEnum.Not}
            onClick={() => {
              const traceId = "Trace " + id++;
              addTraceToLog(traceId);
              setSelectedTraceId(traceId);
              setSimulationStatus(SimulatingEnum.Default);
            }}
          >
            Add new trace
          </Button>
          <Button
            disabled={simulationStatus !== SimulatingEnum.Not}
            onClick={saveLog}
          >
            Save log
          </Button>
          <Button
            disabled={simulationStatus !== SimulatingEnum.Not}
            onClick={saveEventLog}
          >
            Export log
          </Button>
        </EventLogView>
      )}
      {selectedTrace && (
        <TraceView
          hugLeft={simulationStatus !== SimulatingEnum.Not}
          onCloseCallback={closeTraceCallback}
          selectedTrace={{
            ...selectedTrace,
            isPositive: isSelectedTracePositive,
          }}
          setSelectedTraceId={setSelectedTraceId}
          {...(simulationStatus !== SimulatingEnum.Not
            ? {
                onResetTrace: () => {
                  resetSelectedTrace();
                },
                onEditTrace: (newName: string) => {
                  updateSelectedTraceName(newName);
                },
              }
            : {})}
        >
          {simulationStatus !== SimulatingEnum.Not && (
            <FinalizeButton
              onClick={() => {
                if (!currentDcrGraph) {
                  return;
                }

                if (
                  (simulationStatus === SimulatingEnum.Wild ||
                    isAcceptingS(currentDcrGraph, currentDcrGraph)) &&
                  selectedTrace
                ) {
                  setSimulationStatus(SimulatingEnum.Not);
                  setSelectedTraceId(null);
                  resetCurrentDcrGraph();
                } else {
                  toast.warn("Graph is not accepting...");
                }
              }}
            >
              Finalize trace
            </FinalizeButton>
          )}
        </TraceView>
      )}
      <TopRightIcons>
        <WildButton
          $disabled={simulationStatus === SimulatingEnum.Not}
          title={
            simulationStatus === SimulatingEnum.Wild
              ? "Disable non-conformant behaviour"
              : "Enable non-conformant behaviour"
          }
          $clicked={simulationStatus === SimulatingEnum.Wild}
          onClick={() => {
            if (simulationStatus === SimulatingEnum.Not) {
              return;
            }

            if (simulationStatus === SimulatingEnum.Wild) {
              setSimulationStatus(SimulatingEnum.Default);
            } else {
              setSimulationStatus(SimulatingEnum.Wild);
            }
          }}
          data-testid="wild-icon"
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

export default SimulatorState;
