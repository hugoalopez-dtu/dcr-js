import DCRModeler from "modeler";

import emptyBoardXML from "../resources/emptyBoard";
import { useEffect, useEffectEvent, useState } from "react";

import { saveAs } from "file-saver";
import { StateEnum, type StateProps } from "../App";
import FileUpload from "../utilComponents/FileUpload";
import ModalMenu, { type ModalMenuElement } from "../utilComponents/ModalMenu";

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
import { toast } from "react-toastify";
import TopRightIcons from "../utilComponents/TopRightIcons";
import { useHotkeys } from "react-hotkeys-hook";
import FullScreenIcon from "../utilComponents/FullScreenIcon";
import StyledFileUpload from "../utilComponents/StyledFileUpload";
import Loading from "../utilComponents/Loading";
import {
  type DCRGraph,
  layoutGraph,
  moddleToDCR,
  nestDCR,
  type Nestings,
} from "dcr-engine";
import GraphNameInput from "../utilComponents/GraphNameInput";
import styled from "styled-components";
import {
  ColoredRelationsSetting,
  MarkerNotationSetting,
} from "./GlobalModalMenuElements";
import ReactiveModeler from "./ReactiveModeler";
import TestDrivenModeling from "./TestDrivenModeling";

declare global {
  function loadPyodide(): Promise<any>;
}

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

  const [menuOpen, setMenuOpen] = useState(false);

  const [loading, setLoading] = useState(false);

  // const modelerRef = useRef<DCRModeler | null>(null);
  const [modeler, setModeler] = useState<DCRModeler | null>(null);

  const [graphName, setGraphName] = useState<string>(
    currentGraph?.name ?? initGraphName,
  );

  const [pyodideState, setPyodideState] = useState<{
    pyodide: any | null;
    loading: boolean;
    error: string | null;
  }>({ pyodide: null, loading: false, error: null });

  async function saveGraph() {
    if (!modeler) {
      return;
    }

    let saved = false;

    try {
      setLoading(true);
      const data = await modeler.saveXML({ format: false });
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

  useHotkeys("ctrl+s", saveGraph, { preventDefault: true });

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

  const initializePyodide = async () => {
    if (pyodideState.pyodide) {
      return pyodideState.pyodide;
    }

    if (pyodideState.loading) {
      return new Promise((resolve) => {
        const checkInit = () => {
          if (pyodideState.pyodide) {
            resolve(pyodideState.pyodide);
          } else if (!pyodideState.loading && pyodideState.error) {
            throw new Error(pyodideState.error);
          } else {
            setTimeout(checkInit, 100);
          }
        };
        checkInit();
      });
    }

    setPyodideState({ pyodide: null, loading: true, error: null });

    try {
      if (typeof loadPyodide === 'undefined') {
        throw new Error('Pyodide CDN script not loaded');
      }

      const pyodideInstance = await loadPyodide();

      await pyodideInstance.loadPackagesFromImports(`
import xml.etree.ElementTree as ET
from xml.dom import minidom
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Literal, Set, Tuple
      `);

      setPyodideState({ pyodide: pyodideInstance, loading: false, error: null });
      return pyodideInstance;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setPyodideState({ pyodide: null, loading: false, error: errorMessage });
      throw new Error(`Failed to initialize Pyodide: ${errorMessage}`);
    }
  };

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

  const convertBpmnToDcr = async (bpmnXmlContent: string, fileName?: string) => {
    try {
      setLoading(true);

      const pyodide = await initializePyodide();

      await pyodide.loadPackagesFromImports(`
import tempfile
import os
from xml.dom import minidom
      `);

      const bpmnParserCode = await fetch('/dcr-js/bpmn2dcr-pycore/bpmn_parser.py').then(r => r.text());
      const translationEngineCode = await fetch('/dcr-js/bpmn2dcr-pycore/translation_engine.py').then(r => r.text());
      const dcrGeneratorCode = await fetch('/dcr-js/bpmn2dcr-pycore/dcr_generator.py').then(r => r.text());

      const cleanBpmnParserCode = bpmnParserCode;
      const cleanTranslationEngineCode = translationEngineCode.replace('from bpmn_parser import BPMNProcess, BPMNObject', '');
      const cleanDcrGeneratorCode = dcrGeneratorCode.replace('from translation_engine import DCRGraph', '');

      const combinedPythonCode = `
${cleanBpmnParserCode}

${cleanTranslationEngineCode}

${cleanDcrGeneratorCode}

def convert_bpmn_to_dcr_xml(bpmn_xml_content):
    import tempfile
    import os
    
    with tempfile.NamedTemporaryFile(mode='w', suffix='.bpmn', delete=False, encoding='utf-8') as temp_bpmn:
        temp_bpmn.write(bpmn_xml_content)
        temp_bpmn_path = temp_bpmn.name
    
    try:
        parser = BPMNParser(temp_bpmn_path)
        bpmn_process, errors = parser.parse_and_validate()
        
        if errors:
            error_message = "\\n".join(errors)
            raise Exception(f"BPMN validation failed:\\n{error_message}")
        
        if bpmn_process is None:
            raise Exception("Failed to parse BPMN process")
        
        translator = TranslationEngine(bpmn_process)
        dcr_graph = translator.translate()
        
        generator = DCRGenerator(dcr_graph)
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.xml', delete=False, encoding='utf-8') as temp_dcr:
            temp_dcr_path = temp_dcr.name
        
        generator.to_xml(temp_dcr_path)
        
        with open(temp_dcr_path, 'r', encoding='utf-8') as f:
            dcr_xml_content = f.read()
        
        os.unlink(temp_dcr_path)
        
        return dcr_xml_content
        
    finally:
        if os.path.exists(temp_bpmn_path):
            os.unlink(temp_bpmn_path)
      `;

      await pyodide.runPython(combinedPythonCode);

      pyodide.globals.set('bpmn_xml_content', bpmnXmlContent);

      const result = await pyodide.runPython(`
try:
    dcr_xml_result = convert_bpmn_to_dcr_xml(bpmn_xml_content)
    conversion_success = True
    error_message = ""
except Exception as e:
    dcr_xml_result = ""
    conversion_success = False
    error_message = str(e)

{'success': conversion_success, 'dcr_xml': dcr_xml_result, 'error': error_message}
      `);

      if (result.success) {
        const dcrXmlContent = result.dcr_xml;

        if (modeler && modeler.importDCRPortalXML) {
          await modeler.importDCRPortalXML(dcrXmlContent);
          const importName = fileName?.replace(/\.(bpmn|xml)$/, '') || 'Converted from BPMN';
          setGraphName(importName);

          setTimeout(() => {
            autoLayout();
          }, 500);
        } else {
          toast.error("Unable to import converted DCR graph");
        }
      } else {
        toast.error(`Conversion failed: ${result.error}`);
      }
    } catch (error) {
      console.error("Error during BPMN conversion:", error);
      toast.error(`Conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  async function saveAsXML() {
    if (!modeler) {
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
        elements: [...savedGraphs.values()].map(({ name, graph }) => {
          return {
            icon: <BiLeftArrowCircle />,
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
      icon: <BiPlus />,
      text: "New Diagram",
      onClick: () => {
        open(emptyBoardXML, modeler?.importXML);
        setMenuOpen(false);
      },
    },
    {
      icon: <BiSave />,
      text: "Save Graph",
      onClick: () => {
        saveGraph();
        setMenuOpen(false);
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
                fileCallback={(name, contents) => {
                  open(contents, modeler?.importXML, name);
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
                fileCallback={(name, contents) => {
                  open(contents, modeler?.importDCRPortalXML, name);
                  setMenuOpen(false);
                }}
              >
                <div />
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
                <div />
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
          icon: <div />,
          text: "Download Editor XML",
          onClick: () => {
            saveAsXML();
            setMenuOpen(false);
          },
        },
        {
          icon: <div />,
          text: "Download DCR Solutions XML",
          onClick: () => {
            saveAsDCRXML();
            setMenuOpen(false);
          },
        },
        {
          icon: <div />,
          text: "Download SVG",
          onClick: () => {
            saveAsSvg();
            setMenuOpen(false);
          },
        },
      ],
    },
    {
      icon: <BiSolidDashboard />,
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

  return (
    <>
      <GraphNameInput
        value={graphName}
        onChange={(e) => setGraphName(e.target.value)}
      />
      {(loading || pyodideState.loading) && <Loading />}
      <ReactiveModeler
        modeler={modeler}
        setModeler={setModeler}
        coloredRelations={coloredRelations}
        markerNotation={markerNotation}
        isSimulating={false}
        disableControls={false}
      />
      <TopRightIcons>
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
        <FullScreenIcon data-testid="fullscreen-icon" />
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
      <TestDrivenModeling modeler={modeler} show={tdmOpen} />
      {examplesOpen && (
        <Examples
          examplesData={examplesData}
          openCustomXML={(xml) => open(xml, modeler?.importCustomXML)}
          openDCRXML={(xml) => open(xml, modeler?.importDCRPortalXML)}
          setExamplesOpen={setExamplesOpen}
          setLoading={setLoading}
        />
      )}
    </>
  );
};

export default ModelerState;