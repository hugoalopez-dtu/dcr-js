import { BiHome, BiSave } from "react-icons/bi";
import FullScreenIcon from "../utilComponents/FullScreenIcon";
import TopRightIcons from "../utilComponents/TopRightIcons";
import ModalMenu, { type ModalMenuElement } from "../utilComponents/ModalMenu";
import { StateEnum, type StateProps } from "../App";
import {
  abstractLog,
  type DCRGraph,
  type EventLog,
  filter,
  layoutGraph,
  mineFromAbstraction,
  nestDCR,
  type Nestings,
  RegexTraceStreamParser,
  rejectionMiner,
  type RoleTrace,
} from "dcr-engine";
import MenuElement from "../utilComponents/MenuElement";
import DropDown from "../utilComponents/DropDown";
import Label from "../utilComponents/Label";
import { toast } from "react-toastify";
import React, { useState } from "react";
import Form from "../utilComponents/Form";
import styled from "styled-components";
import Loading from "../utilComponents/Loading";
import { saveAs } from "file-saver";
import { useHotkeys } from "react-hotkeys-hook";
import GraphNameInput from "../utilComponents/GraphNameInput";
import {
  ColoredRelationsSetting,
  MarkerNotationSetting,
} from "./GlobalModalMenuElements";
import ReactiveModeler from "./ReactiveModeler";
import RawFileUpload from "../utilComponents/RawFileUpload";

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

const FileInput = styled.div`
  border: 1px dashed black;
  padding: 0.75rem;
  cursor: pointer;
  & > label {
    cursor: pointer;
  }
  &:hover {
    color: white;
    background-color: Gainsboro;
    border: 1px dashed white;
  }
`;

const Input = styled.input`
  width: 7rem;
  font-size: 20px;
`;

const initGraphName = "";

const ALGORITHMS = ["DisCoveR", "RejectionMiner"] as const;

type Algorithm = (typeof ALGORITHMS)[number];

function isAlgorithm(val: string): val is Algorithm {
  return ALGORITHMS.includes(val as unknown as Algorithm);
}

const DiscoveryState = ({
  setState,
  saveGraph: commitSaveGraph,
  saveLog: commitSaveLog,
  markerNotation,
  changeMarkerNotation,
  coloredRelations,
  changeColoredRelations,
}: StateProps) => {
  const [menuOpen, setMenuOpen] = useState(true);
  const [algorithm, setAlgorithm] = useState<Algorithm>("DisCoveR");

  const [modeler, setModeler] = useState<DCRModeler | null>(null);

  const [loading, setLoading] = useState(false);

  // State to put anything needed to render in the form inputs;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [customFormState, setCustomFormState] = useState<any>();
  const [graphName, setGraphName] = useState<string>(initGraphName);
  const [lastSavedXML, setLastSavedXML] = useState<string | null>(null);

  const saveLog = (eventLog: EventLog<RoleTrace>, name: string) => {
    commitSaveLog(name, eventLog);
    toast.success("Log saved!");
  };

  const algorithmForms: Record<
    Algorithm,
    {
      inputs: React.ReactNode;
      onSubmit: (formData: FormData) => void | Promise<void>;
    }
  > = {
    DisCoveR: {
      inputs: [
        <MenuElement>
          <Label>Event Log:</Label>
          <FileInput>
            <RawFileUpload
              accept=".xes"
              fileCallback={(file) =>
                setCustomFormState({ ...customFormState, logFile: file })
              }
              name="log"
            >
              {customFormState?.logFile?.name
                ? customFormState?.logFile?.name
                : "Select event log"}
            </RawFileUpload>
          </FileInput>
        </MenuElement>,
        <MenuElement>
          <Label title="The amount of noise filtering employed, with 0 being no filtering and 1 being max.">
            Noise Threshold:
          </Label>
          <Input
            type="number"
            required
            name="noise"
            min="0"
            max="1"
            defaultValue={
              customFormState?.threshold ? customFormState.threshold : "0"
            }
            step="0.01"
          />
        </MenuElement>,
        <MenuElement>
          <Label>Nest Graph</Label>
          <Input
            name="nest"
            type="checkbox"
            defaultChecked={
              customFormState?.nest ? customFormState.nest : false
            }
          />
        </MenuElement>,
        <MenuElement>
          <Label title="Saves the uploaded event log for later use in conformance checking, simulation, etc.">
            Save Log
          </Label>
          <Input
            name="save"
            type="checkbox"
            defaultChecked={
              customFormState?.save ? customFormState.save : false
            }
          />
        </MenuElement>,
      ],
      onSubmit: async (formData: FormData) => {
        setLoading(true);

        const rawThreshold = formData.get("noise");
        const threshold = rawThreshold && parseFloat(rawThreshold.toString());
        const nest = !!formData.get("nest");
        const save = !!formData.get("save");

        setCustomFormState({
          ...customFormState,
          threshold,
          nest,
          save,
        });

        const logFile = customFormState?.logFile;
        if (!(logFile instanceof File)) {
          console.error("No log file provided...");
          toast.error("Can't parse input parameters...");
          setLoading(false);
          return;
        }

        if (threshold === "" || threshold === null) {
          toast.error("Can't parse input parameters...");
          setLoading(false);
          return;
        }

        logMemory("Before discovery");
        console.info("Started discovery...");
        console.time("discover");
        performance.mark("discover-start");

        try {
          if (!modeler) return;

          console.info("Started parsing log...");
          console.time("parse-log");
          performance.mark("parse-log-start");

          // Parse as non-role log directly instead of transforming to non-role
          // log to reduce noise in benchmark
          const noRoleLog =
            await RegexTraceStreamParser.parseAsNonRoleLog(logFile);

          performance.mark("parse-log-end");
          performance.measure("parse-log", "parse-log-start", "parse-log-end");
          console.info("Finished parsing log!");
          console.timeEnd("parse-log");
          logMemory("After parsing log");

          console.info("Started filtering log...");
          console.time("filter-log");
          performance.mark("filter-log-start");

          if (threshold <= 0) {
            console.info("No filtering will be applied to log.");
          }

          const filteredLog =
            threshold === 0 ? noRoleLog : filter(noRoleLog, threshold);

          performance.mark("filter-log-end");
          performance.measure(
            "filter-log",
            "filter-log-start",
            "filter-log-end",
          );
          console.info("Finished filtering log!");
          console.timeEnd("filter-log");
          logMemory("After filtering log");

          console.info("Started abstracting log...");
          console.time("abstract-log");
          performance.mark("abstract-log-start");

          const logAbs = abstractLog(filteredLog);

          performance.mark("abstract-log-end");
          performance.measure(
            "abstract-log",
            "abstract-log-start",
            "abstract-log-end",
          );
          console.info("Finished abstracting log!");
          console.timeEnd("abstract-log");
          logMemory("After abstracting log");

          console.info("Started mining log...");
          console.time("mine-log");
          performance.mark("mine-log-start");

          const graph = mineFromAbstraction(logAbs);

          performance.mark("mine-log-end");
          performance.measure("mine-log", "mine-log-start", "mine-log-end");
          console.info("Finished mining log!");
          console.timeEnd("mine-log");
          logMemory("After mining log");

          console.info("Started nesting graph...");
          console.time("nest-graph");
          performance.mark("nest-graph-start");

          const nestings = nestDCR(graph);

          performance.mark("nest-graph-end");
          performance.measure(
            "nest-graph",
            "nest-graph-start",
            "nest-graph-end",
          );
          console.info("Finished nesting graph!");
          console.timeEnd("nest-graph");
          logMemory("After nesting graph");

          try {
            console.info("Started layouting graph...");
            console.time("layout-graph");
            performance.mark("layout-graph-start");

            const params: [DCRGraph, Nestings | undefined] = nest
              ? [nestings.nestedGraph, nestings]
              : [graph, undefined];
            const xml = await layoutGraph(...params);

            performance.mark("layout-graph-end");
            performance.measure(
              "layout-graph",
              "layout-graph-start",
              "layout-graph-end",
            );
            console.info("Finished layouting graph!");
            console.timeEnd("layout-graph");
            logMemory("After layouting graph");

            try {
              console.info("Started importing graph...");
              console.time("import-graph");
              performance.mark("import-graph-start");

              await modeler.importXML(xml);

              performance.mark("import-graph-end");
              performance.measure(
                "import-graph",
                "import-graph-start",
                "import-graph-end",
              );
              console.info("Finsihed importing graph!");
              console.timeEnd("import-graph");
              logMemory("After importing graph");
            } catch (e) {
              console.log(e);
              console.error("Failed discovery!");
              toast.error("Invalid xml...");
            } finally {
              setGraphName(logFile.name.slice(0, -4));
              if (save) {
                console.info("Started saving log...");
                console.time("save-log");
                performance.mark("save-log-start");

                const roleLog: EventLog<RoleTrace> = {
                  events: noRoleLog.events,
                  traces: {},
                };

                for (const traceId in noRoleLog.traces) {
                  roleLog.traces[traceId] = noRoleLog.traces[traceId].map(
                    (activity) => ({ activity, role: "" }),
                  );
                }

                saveLog(roleLog, logFile.name);

                performance.mark("save-log-end");
                performance.measure(
                  "save-log",
                  "save-log-start",
                  "save-log-end",
                );
                console.info("Finished saving log!");
                console.timeEnd("save-log");
                logMemory("After saving log");
              }
              setLoading(false);
            }
          } catch (e) {
            console.log(e);
            console.error("Failed discovery!");
            setLoading(false);
            toast.error("Unable to layout graph...");
          }
        } catch (e) {
          console.log(e);
          console.error("Failed discovery!");
          setLoading(false);
          toast.error("Cannot parse log...");
        }

        performance.mark("discover-end");
        performance.measure("discover", "discover-start", "discover-end");
        console.info("Finished discovery!");
        console.timeEnd("discover");
        logMemory("After discovery");
      },
    },
    RejectionMiner: {
      inputs: [
        <MenuElement>
          <Label>Binary Event Log:</Label>
          <FileInput>
            <RawFileUpload
              accept=".xes"
              fileCallback={(file) =>
                setCustomFormState({ ...customFormState, logFile: file })
              }
              name="log"
            >
              {customFormState?.logFile?.name
                ? customFormState?.logFile?.name
                : "Select event log"}
            </RawFileUpload>
          </FileInput>
        </MenuElement>,
        <MenuElement>
          <Label title="The classifier in the event log that denotes that it is a positive trace.">
            Positive Trace Classifier
          </Label>
          <Input
            name="positiveClassifier"
            type="text"
            required
            defaultValue={
              customFormState?.positiveClassifier
                ? customFormState.positiveClassifier
                : "Required"
            }
          />
        </MenuElement>,
        <MenuElement>
          <Label title="Leverage the negative traces to find additional constraints that cover many negative traces and few positive ones.">
            Optimize Precision
          </Label>
          <Input
            name="optimizePrecision"
            type="checkbox"
            defaultChecked={
              customFormState?.optimizePrecision !== undefined
                ? customFormState.optimizePrecision
                : true
            }
          />
        </MenuElement>,
        <MenuElement>
          <Label title="Saves the uploaded event log for later use in conformance checking, simulation, etc.">
            Save Log
          </Label>
          <Input
            name="save"
            type="checkbox"
            defaultChecked={
              customFormState?.save ? customFormState.save : false
            }
          />
        </MenuElement>,
      ],
      onSubmit: async (formData: FormData) => {
        setLoading(true);

        const positiveClassifier = formData
          .get("positiveClassifier")
          ?.toString();
        const optimizePrecision = !!formData.get("optimizePrecision");
        const save = !!formData.get("save");

        setCustomFormState({
          ...customFormState,
          positiveClassifier,
          optimizePrecision,
          save,
        });

        const logFile = customFormState?.logFile;
        if (!(logFile instanceof File)) {
          console.error("No log file provided...");
          toast.error("Can't parse input parameters...");
          setLoading(false);
          return;
        }

        if (!positiveClassifier) {
          toast.error("Can't parse input parameters...");
          setLoading(false);
          return;
        }

        logMemory("Before discovery");
        console.info("Started discovery...");
        console.time("discover");
        performance.mark("discover-start");

        try {
          if (!modeler) return;

          console.info("Started parsing log...");
          console.time("parse-log");
          performance.mark("parse-log-start");

          const { trainingLog, testLog } =
            await RegexTraceStreamParser.parseAsBinaryLog(
              logFile,
              positiveClassifier,
            );

          performance.mark("parse-log-end");
          performance.measure("parse-log", "parse-log-start", "parse-log-end");
          console.info("Finished parsing log!");
          console.timeEnd("parse-log");
          logMemory("After parsing log");

          console.info("Started mining log...");
          console.time("mine-log");
          performance.mark("mine-log-start");

          const graph = rejectionMiner(trainingLog, optimizePrecision);

          performance.mark("mine-log-end");
          performance.measure("mine-log", "mine-log-start", "mine-log-end");
          console.info("Finished mining log!");
          console.timeEnd("mine-log");
          logMemory("After mining log");

          try {
            console.info("Started layouting graph...");
            console.time("layout-graph");
            performance.mark("layout-graph-start");

            const xml = await layoutGraph(graph);

            performance.mark("layout-graph-end");
            performance.measure(
              "layout-graph",
              "layout-graph-start",
              "layout-graph-end",
            );
            console.info("Finished layouting graph!");
            console.timeEnd("layout-graph");
            logMemory("After mining log");

            try {
              console.info("Started importing graph...");
              console.time("import-graph");
              performance.mark("import-graph-start");

              await modeler.importXML(xml);

              performance.mark("import-graph-end");
              performance.measure(
                "import-graph",
                "import-graph-start",
                "import-graph-end",
              );
              console.info("Finsihed importing graph!");
              console.timeEnd("import-graph");
              logMemory("After importing graph");
            } catch (e) {
              console.log(e);
              console.error("Failed discovery!");
              toast.error("Invalid xml...");
            } finally {
              setGraphName(logFile.name.slice(0, -4));
              if (save) {
                console.info("Started saving log...");
                console.time("save-log");
                performance.mark("save-log-start");

                const roleLog: EventLog<RoleTrace> = {
                  events: testLog.events,
                  traces: {},
                };

                for (const traceId in testLog.traces) {
                  roleLog.traces[traceId] = testLog.traces[traceId].map(
                    (activity) => ({ activity, role: "" }),
                  );
                }

                saveLog(roleLog, logFile.name);

                performance.mark("save-log-end");
                performance.measure(
                  "save-log",
                  "save-log-start",
                  "save-log-end",
                );
                console.info("Finished saving log!");
                console.timeEnd("save-log");
                logMemory("After saving log");
              }
              setLoading(false);
            }
          } catch (e) {
            console.log(e);
            console.error("Failed discovery!");
            setLoading(false);
            toast.error("Unable to layout graph...");
          }
        } catch (e) {
          console.log(e);
          console.error("Failed discovery!");
          setLoading(false);
          toast.error("Cannot parse log...");
        }

        performance.mark("discover-end");
        performance.measure("discover", "discover-start", "discover-end");
        console.info("Finished discovery!");
        console.timeEnd("discover");
        logMemory("After discovery");
      },
    },
  };

  async function saveGraph() {
    if (graphName === "") {
      toast.warning("Discover a graph before saving!");
      return;
    }

    if (!modeler) {
      return;
    }

    let saved = false;

    try {
      setLoading(true);
      const data = await modeler.saveXML({ format: false });
      if (commitSaveGraph(graphName, data.xml)) {
        toast.success("Graph saved!");
        setLastSavedXML(data.xml);
        saved = true;
      }
    } catch {
      toast.error("Failed to save graph...");
    } finally {
      setLoading(false);
    }

    return saved;
  }

  useHotkeys("ctrl+s", saveGraph, { preventDefault: true });

  async function saveAsXML() {
    if (!modeler) {
      return;
    }

    if (graphName === "") {
      toast.warning("Discover a graph before saving!");
      return;
    }

    const data = await modeler.saveXML({ format: true });
    const blob = new Blob([data.xml]);

    saveAs(blob, `${graphName}.xml`);
  }

  async function saveAsDCRXML() {
    if (!modeler) {
      return;
    }

    if (graphName === "") {
      toast.warning("Discover a graph before saving!");
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

    if (graphName === "") {
      toast.warning("Discover a graph before saving!");
      return;
    }

    const data = await modeler.saveSVG();
    const blob = new Blob([data.svg]);

    saveAs(blob, `${graphName}.svg`);
  }

  const menuElements: Array<ModalMenuElement> = [
    {
      icon: <BiSave />,
      text: "Save Graph",
      onClick: () => {
        saveGraph();
      },
    },
    {
      text: "Download",
      elements: [
        {
          icon: <div />,
          text: "Download Editor XML",
          onClick: () => {
            saveAsXML();
          },
        },
        {
          icon: <div />,
          text: "Download DCR Solutions XML",
          onClick: () => {
            saveAsDCRXML();
          },
        },
        {
          icon: <div />,
          text: "Download SVG",
          onClick: () => {
            saveAsSvg();
          },
        },
      ],
    },
    {
      customElement: (
        <MenuElement>
          <Label>Discovery Algorithm:</Label>
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
          submitText="Discover!"
          submit={algorithmForms[algorithm].onSubmit}
        >
          {algorithmForms[algorithm].inputs}
        </Form>
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

  return (
    <>
      <GraphNameInput
        value={graphName}
        onChange={(e) => setGraphName(e.target.value)}
      />
      {loading && <Loading />}
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
      />
      <TopRightIcons>
        <FullScreenIcon data-testid="full-screen-icon" />
        <BiHome
          onClick={async () => {
            if (!modeler) {
              setState(StateEnum.Home);
              return;
            }

            try {
              const data = await modeler.saveXML({ format: false });
              const hasUnsavedChanges =
                lastSavedXML !== null && data.xml !== lastSavedXML;
              if (hasUnsavedChanges) {
                const wantSave = window.confirm(
                  "You have unsaved changes. Save before leaving?",
                );
                if (wantSave) {
                  const saved = await saveGraph();
                  if (!saved) {
                    return;
                  }
                }
              }
            } finally {
              setState(StateEnum.Home);
            }
          }}
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

export default DiscoveryState;
