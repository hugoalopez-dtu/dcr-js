import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
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
  StringTraceStreamParser,
} from "dcr-engine";
import ModalMenu, { type ModalMenuElement } from "../utilComponents/ModalMenu";
import FullScreenIcon from "../utilComponents/FullScreenIcon";
import styled from "styled-components";
import FileUpload from "../utilComponents/FileUpload";
import type { DCRGraphS, EventLog, VariableStore, Value } from "dcr-engine";
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

const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
`;

const ModalBox = styled.div`
  background: white;
  border-radius: 8px;
  padding: 20px 24px;
  min-width: 280px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.25);
  font-family: sans-serif;
  font-size: 13px;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const ModalTitle = styled.div`
  font-weight: 700;
  font-size: 14px;
`;

const ModalInput = styled.input`
  width: 100%;
  box-sizing: border-box;
  padding: 6px 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 13px;
`;

const ModalSelect = styled.select`
  width: 100%;
  box-sizing: border-box;
  padding: 6px 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 13px;
`;

const ModalButtons = styled.div`
  display: flex;
  gap: 8px;
  justify-content: flex-end;
`;

function VariableInputModal({
  varName,
  varType,
  currentValue,
  onConfirm,
  onCancel,
}: {
  varName: string;
  varType: string;
  currentValue: string | number | boolean | undefined;
  onConfirm: (value: string | number | boolean) => void;
  onCancel: () => void;
}) {
  const [inputVal, setInputVal] = useState(
    currentValue !== undefined ? String(currentValue) : "",
  );

  const handleConfirm = () => {
    let parsed: string | number | boolean = inputVal;
    if (varType === "Int") parsed = Number(inputVal);
    else if (varType === "Bool") parsed = inputVal === "true";
    onConfirm(parsed);
  };

  return (
    <ModalOverlay onClick={onCancel}>
      <ModalBox onClick={(e) => e.stopPropagation()}>
        <ModalTitle>
          Enter value for <em>{varName}</em>
        </ModalTitle>
        {varType === "Bool" ? (
          <ModalSelect
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
          >
            <option value="true">true</option>
            <option value="false">false</option>
          </ModalSelect>
        ) : (
          <ModalInput
            type={varType === "Int" ? "number" : "text"}
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleConfirm();
              if (e.key === "Escape") onCancel();
            }}
            autoFocus
          />
        )}
        <ModalButtons>
          <button
            onClick={onCancel}
            style={{
              padding: "6px 14px",
              border: "1px solid #ccc",
              borderRadius: "4px",
              cursor: "pointer",
              background: "white",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            style={{
              padding: "6px 14px",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              background: "#28a745",
              color: "white",
              fontWeight: "bold",
            }}
          >
            Confirm
          </button>
        </ModalButtons>
      </ModalBox>
    </ModalOverlay>
  );
}

const SimulatingEnum = {
  Default: "Default",
  Wild: "Wild",
  Not: "Not",
} as const;

type SimulatingEnum = (typeof SimulatingEnum)[keyof typeof SimulatingEnum];

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
  const traceIdCounter = useRef(1);

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
    setVariableStore(initialDcrGraph.initialVariableStore ?? {});
    setClock(new Date());
    modeler.updateRendering(initialDcrGraph, initialDcrGraph.initialVariableStore ?? {}, clock);
  }, [currentDcrGraph, initialDcrGraph, modeler]);

  const [menuOpen, setMenuOpen] = useState(false);

  const [variableStore, setVariableStore] = useState<VariableStore>({});

  const [clock, setClock] = useState<Date>(() => new Date());
  const [advanceValue, setAdvanceValue] = useState<string>("1");
  const [advanceUnit, setAdvanceUnit] = useState<"days" | "hours" | "minutes" | "seconds">("days");

  const advanceTimeUnits: Record<string, number> = {
    days: 86400000, hours: 3600000, minutes: 60000, seconds: 1000,
  };

  const advanceClock = () => {
    const ms = (parseFloat(advanceValue) || 0) * advanceTimeUnits[advanceUnit];
    if (ms <= 0) return;
    const newClock = new Date(clock.getTime() + ms);

    if (currentDcrGraph) {
      const overdue = [...currentDcrGraph.marking.pending.entries()]
        .filter(([, deadline]) => deadline && clock <= deadline && newClock > deadline)
        .map(([eventId]) => currentDcrGraph.labelMap[eventId] || eventId);
      if (overdue.length > 0) {
        if (!window.confirm(`Advancing time will overrun the deadline for: ${overdue.join(", ")}.\n\nProceed?`)) return;
      }

      // Remove pending entries whose deadline has now passed
      for (const [eventId, deadline] of currentDcrGraph.marking.pending.entries()) {
        if (deadline && newClock > deadline) {
          currentDcrGraph.marking.pending.delete(eventId);
        }
      }
      setCurrentDcrGraph({ ...currentDcrGraph });
    }

    setClock(newClock);
  };


  function formatClock(d: Date): string {
    return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  const [pendingExecution, setPendingExecution] = useState<{
    element: TargetElement;
    draftGraph: DCRGraphS;
    varName: string;
    varType: string;
  } | null>(null);

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
    (traceId: string, activity: string, role: string, timestamp?: Date, varName?: string, value?: Value) =>
      setEventLog((currentEventLog) => {
        const trace = currentEventLog.traces[traceId];
        if (!trace) return currentEventLog;
        return {
          ...currentEventLog,
          traces: {
            ...currentEventLog.traces,
            [traceId]: {
              ...trace,
              trace: [...trace.trace, { activity, role, timestamp, varName, value }],
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
    if (!selectedTrace?.trace || !initialDcrGraph) {
      return;
    }

    const draftDcrGraph = {
      ...initialDcrGraph,
      marking: copyMarking(initialDcrGraph.marking),
    };

    return replayTraceS(draftDcrGraph, selectedTrace.trace);
  }, [currentDcrGraph, selectedTrace?.trace]);

  const addEventToSelectedTrace = useCallback(
    (activity: string, role: string, timestamp?: Date, varName?: string, value?: Value) => {
      if (selectedTraceId === null) return;
      addEventToTrace(selectedTraceId, activity, role, timestamp, varName, value);
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
        const traceNums = Object.keys(log.traces)
          .map((k) => { const m = k.match(/^Trace (\d+)$/); return m ? parseInt(m[1]) : -1; })
          .filter((n) => n >= 0);
        traceIdCounter.current = traceNums.length > 0 ? Math.max(...traceNums) + 1 : 0;
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
    varStore: VariableStore = {},
  ): { msg: string; executedEvent: string; role: string; timestamp: Date } => {
    const eventId: Event = element.id;

    const group: SubProcess | DCRGraphS =
      (graph.subProcessMap[eventId] as SubProcess | undefined) ?? graph;

    const enabledResponse = isEnabledS(eventId, graph, group, varStore, clock);
    if (simulationStatus !== SimulatingEnum.Wild && !enabledResponse.enabled) {
      return {
        msg: enabledResponse.msg,
        executedEvent: "",
        role: "",
        timestamp: clock,
      };
    }

    executeS(eventId, graph, varStore, clock);
    return {
      msg: logExcecutionString(element),
      executedEvent: traceString(element),
      role: roleString(element),
      timestamp: clock,
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
                const log = await StringTraceStreamParser.parseAsRoleLog(file);
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

  useEffect(() => {
    if (!modeler || !currentDcrGraph) return;
    modeler.updateRendering(currentDcrGraph, variableStore, clock);
  }, [clock]);

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

          // Check if the event has a data variable
          const eventData = event.element.businessObject?.get?.("eventData");
          const eventVars: Array<{ name: string; type: string }> = eventData ? [eventData] : [];

          if (eventVars.length > 0) {
            // Pre-check enablement before showing popup
            const eventId: Event = event.element.id;
            const group: SubProcess | DCRGraphS =
              (draftGraph.subProcessMap[eventId] as SubProcess | undefined) ??
              draftGraph;
            const enabledResponse = isEnabledS(
              eventId,
              draftGraph,
              group,
              variableStore,
              clock,
            );
            if (
              simulationStatus !== SimulatingEnum.Wild &&
              !enabledResponse.enabled
            ) {
              toast.warn(enabledResponse.msg);
              return;
            }
            setPendingExecution({
              element: event.element,
              draftGraph,
              varName: eventVars[0].name,
              varType: eventVars[0].type,
            });
          } else {
            const response = executeEvent(event.element, draftGraph, variableStore);
            if (response.executedEvent) {
              addEventToSelectedTrace(response.executedEvent, response.role, response.timestamp);
            } else {
              toast.warn(response.msg);
            }
            setCurrentDcrGraph(draftGraph);
            modeler.updateRendering(draftGraph, variableStore, clock);
          }
        }}
        onImport={() => {
          if (modeler) {
            const graph = moddleToDCR(modeler.getElementRegistry());
            setCurrentDcrGraph(graph);
            setInitialDcrGraph(graph);
            setVariableStore(graph.initialVariableStore ?? {});
            modeler.updateRendering(graph, graph.initialVariableStore ?? {}, clock);
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
              const traceId = "Trace " + traceIdCounter.current++;
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
      {pendingExecution && (
        <VariableInputModal
          varName={pendingExecution.varName}
          varType={pendingExecution.varType}
          currentValue={variableStore[pendingExecution.varName]}
          onConfirm={(value) => {
            const newStore = {
              ...variableStore,
              [pendingExecution.varName]: value,
            };
            setVariableStore(newStore);
            const response = executeEvent(
              pendingExecution.element,
              pendingExecution.draftGraph,
              newStore,
            );
            if (response.executedEvent) {
              addEventToSelectedTrace(response.executedEvent, response.role, response.timestamp, pendingExecution.varName, value);
            } else {
              toast.warn(response.msg);
            }
            setCurrentDcrGraph(pendingExecution.draftGraph);
            modeler?.updateRendering(pendingExecution.draftGraph, newStore, clock);
            setPendingExecution(null);
          }}
          onCancel={() => setPendingExecution(null)}
        />
      )}
      <div style={{
        position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)",
        background: "white", borderRadius: "14px",
        boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
        padding: "10px 20px", display: "inline-flex", alignItems: "center",
        gap: "12px", fontSize: "14px", zIndex: 100, whiteSpace: "nowrap",
      }}>
        <span style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 600 }}>
          🕐 {formatClock(clock)}
        </span>
        <span style={{ color: "#ccc", fontSize: "18px", lineHeight: 1 }}>|</span>
        <input
          type="number"
          min="0"
          value={advanceValue}
          onChange={e => setAdvanceValue(e.target.value)}
          style={{ width: "56px", padding: "5px 8px", border: "1px solid #ccc", borderRadius: "6px", fontSize: "14px", textAlign: "center" }}
        />
        <select
          value={advanceUnit}
          onChange={e => setAdvanceUnit(e.target.value as typeof advanceUnit)}
          style={{ padding: "5px 8px", border: "1px solid #ccc", borderRadius: "6px", fontSize: "14px", background: "white" }}
        >
          <option value="seconds">Seconds</option>
          <option value="minutes">Minutes</option>
          <option value="hours">Hours</option>
          <option value="days">Days</option>
        </select>
        <button onClick={advanceClock} style={{
          padding: "6px 16px", border: "none", borderRadius: "8px",
          background: "#0d6efd", color: "white", fontWeight: 600,
          fontSize: "14px", cursor: "pointer",
        }}>Advance ▶</button>
      </div>

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
