import { BiHome, BiLeftArrowCircle } from "react-icons/bi";
import FullScreenIcon from "../utilComponents/FullScreenIcon";
import TopRightIcons from "../utilComponents/TopRightIcons";
import ModalMenu, { type ModalMenuElement } from "../utilComponents/ModalMenu";
import { StateEnum, type StateProps } from "../App";
import {
  copyMarking,
  type DCRGraphS,
  type EventLog,
  generateEventLog,
  moddleToDCR,
  type RoleTrace,
  writeEventLog,
} from "dcr-engine";
import MenuElement from "../utilComponents/MenuElement";
import DropDown from "../utilComponents/DropDown";
import Label from "../utilComponents/Label";
import React, { useEffect, useEffectEvent, useState } from "react";
import Form from "../utilComponents/Form";
import styled from "styled-components";
import StyledFileUpload from "../utilComponents/StyledFileUpload";
import FileUpload from "../utilComponents/FileUpload";
import { toast } from "react-toastify";
import { saveAs } from "file-saver";
import {
  ColoredRelationsSetting,
  MarkerNotationSetting,
} from "./GlobalModalMenuElements";
import ReactiveModeler from "./ReactiveModeler";
import emptyBoardXML from "../resources/emptyBoard";

const Input = styled.input`
  width: 7rem;
  font-size: 20px;
`;

const ALGORITHMS = ["Simple"] as const;

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
  const [algorihtm, setAlgorithm] = useState<Algorithm>("Simple");

  const [modeler, setModeler] = useState<DCRModeler | null>(null);
  const [currentDcrGraph, setCurrentDcrGraph] = useState<DCRGraphS | null>(
    null,
  );

  // State to put anything needed to render in the form inputs;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [customFormState, setCustomFormState] = useState<any>();

  const algorithmForms: Record<
    Algorithm,
    {
      inputs: React.ReactNode;
      onSubmit: (formData: FormData) => void | Promise<void>;
    }
  > = {
    Simple: {
      inputs: [
        <MenuElement>
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
        <MenuElement>
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
        <MenuElement>
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
        <MenuElement>
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
        <MenuElement>
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
            markeing: copyMarking(currentDcrGraph.marking),
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
        } catch {
          toast.error("Cannot generate log from parameters...");
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
    if (data.includes("subProcess")) {
      toast.warning("Subprocesses not supported...");
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
        elements: [...savedGraphs.values()].map(({ name, graph }) => ({
          icon: <BiLeftArrowCircle />,
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
    ...savedGraphElements(),
    {
      customElement: (
        <MenuElement>
          <Label>Generation Algorithm:</Label>
          <DropDown
            value={algorihtm}
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
          submit={algorithmForms[algorihtm].onSubmit}
        >
          {algorithmForms[algorihtm].inputs}
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

  const onInitModeler = useEffectEvent((modeler: DCRModeler) => {
    // Import the current graph (if any).
    // After this import will happen on action (manual calls to importXml),
    // so no need to do it reactively when current graph changes (is imported).

    if (currentGraph && !currentGraph.graph.includes("subProcess")) {
      modeler.importXML(currentGraph.graph).catch((e: Error) => console.log(e));
    } else {
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
        }}
      />
      <TopRightIcons>
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

export default EventLogGenerationState;
