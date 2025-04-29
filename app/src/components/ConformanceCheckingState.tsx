import { useMemo, useRef, useState } from "react";
import { StateEnum, StateProps } from "../App";
import Modeler from "./Modeler";
import TopRightIcons from "../utilComponents/TopRightIcons";
import FullScreenIcon from "../utilComponents/FullScreenIcon";
import { BiHome, BiLeftArrowCircle, BiSolidFlame, BiUpload } from "react-icons/bi";
import ModalMenu, { ModalMenuElement } from "../utilComponents/ModalMenu";
import Toggle from "../utilComponents/Toggle";
import DropDown from "../utilComponents/DropDown";
import { isSettingsVal, ReplayLogResults, ViolationLogResults } from "../types";
import { copyMarking, mergeViolations, moddleToDCR, parseLog, quantifyViolations } from "dcr-engine";
import { toast } from "react-toastify";
import FileUpload from "../utilComponents/FileUpload";
import { replayTraceS } from "dcr-engine";
import { DCRGraphS } from "dcr-engine";
import TraceView from "../utilComponents/TraceView";
import { RelationViolations, RoleTrace } from "dcr-engine/src/types";
import StyledFileUpload from "../utilComponents/StyledFileUpload";
import MenuElement from "../utilComponents/MenuElement";
import Label from "../utilComponents/Label";
import ReplayResults from "./ReplayResults";
import styled from "styled-components";
import HeatmapResults from "./HeatmapResults";

const HeatmapButton = styled(BiSolidFlame) <{ $clicked: boolean, $disabled?: boolean }>`
    ${props => props.$clicked ? `
        background-color: black !important;
        color: white;
    ` : ``}
    ${props => props.$disabled ? `
        color : grey;
        border-color: grey !important;
        cursor: default !important;
        &:hover {
            box-shadow: none !important;
        }    
    ` : ""}
`

const ConformanceCheckingState = ({ savedGraphs, savedLogs, setState, lastSavedGraph, lastSavedLog }: StateProps) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [heatmapMode, setHeatmapMode] = useState(true);

  const modelerRef = useRef<DCRModeler | null>(null);
  const graphRef = useRef<{ initial: DCRGraphS, current: DCRGraphS } | null>(null);

  const [logResults, setLogResults] = useState<ReplayLogResults>([]);
  const [violationLogResults, setViolationLogResults] = useState<ViolationLogResults>([]);

  const [logName, setLogName] = useState<string>("");
  const [selectedTrace, setSelectedTrace] = useState<{ traceId: string, traceName: string, trace: RoleTrace } | null>(null);

  const nestingRef = useRef<boolean>(false);

  const totalLogResults = useMemo<{
    totalViolations: number,
    violations: RelationViolations
  }>(() => {
    const retval = violationLogResults.reduce((acc, cum) => cum.results ? {
      totalViolations: acc.totalViolations + cum.results.totalViolations,
      violations: mergeViolations(acc.violations, cum.results.violations)
    } : acc, {
      totalViolations: 0,
      violations: {
        conditionsFor: {},
        responseTo: {},
        excludesTo: {},
        milestonesFor: {}
      }
    });
    modelerRef.current?.updateViolations(retval.violations);
    return retval
  }, [violationLogResults]);

  const open = (data: string, parse: ((xml: string) => Promise<void>) | undefined) => {
    if (data.includes("multi-instance=\"true\"")) {
      toast.error("Multi-instance subprocesses not supported...");
    } else {
      if (data.includes("SubProcess") || data.includes("Nesting")) nestingRef.current = true;
      else nestingRef.current = false;

      parse && parse(data).then((_) => {
        if (modelerRef.current && graphRef.current) {
          const graph = moddleToDCR(modelerRef.current.getElementRegistry());
          graphRef.current = { initial: graph, current: { ...graph, marking: copyMarking(graph.marking) } };
          if (logResults) {
            const newResults = logResults.map(({ traceId, trace }) => ({ traceId, trace, isPositive: replayTraceS(graph, trace) }));
            setLogResults(newResults);
          }
          if (violationLogResults) {
            const newResults = violationLogResults.map(({ trace, traceId }) => ({ traceId, trace, results: quantifyViolations(graph, trace) }));
            setViolationLogResults(newResults);
          }
        }
      }).catch((e) => { console.log(e); toast.error("Unable to parse XML...") });
    }
  }

  const handleLogUpload = (name: string, data: string) => {
    try {
      const log = parseLog(data);
      const results = Object.keys(log.traces).map(traceId => {
        const trace = log.traces[traceId];
        return {
          traceId,
          trace,
          isPositive: graphRef.current ? replayTraceS(graphRef.current.initial, trace) : undefined,
        }
      });
      setLogName(name.slice(0, -4));
      setLogResults(results);
      const violationResults = Object.keys(log.traces).map(traceId => {
        const trace = log.traces[traceId];
        return {
          traceId,
          trace,
          results: graphRef.current ? quantifyViolations(graphRef.current.initial, trace) : undefined,
        }
      });
      setViolationLogResults(violationResults);
    } catch (e) {
      console.log(e);
      toast.error("Cannot parse log...");
    }
  }

  const savedGraphElements = () => {
    return Object.keys(savedGraphs).length > 0 ? [{
      text: "Saved Graphs:",
      elements: Object.keys(savedGraphs).map(name => {
        return ({
          icon: <BiLeftArrowCircle />,
          text: name,
          onClick: () => { open(savedGraphs[name], modelerRef.current?.importXML); setMenuOpen(false) },
        })
      })
    }] : [];
  }

  const savedLogElements = () => {
    return Object.keys(savedLogs).length > 0 ? [{
      text: "Saved Logs:",
      elements: Object.keys(savedLogs).map(name => {
        return ({
          icon: <BiLeftArrowCircle />,
          text: name,
          onClick: () => {
            const log = savedLogs[name];
            const results = Object.keys(log.traces).map(traceId => {
              const trace = log.traces[traceId];
              return {
                traceId,
                trace,
                isPositive: graphRef.current ? replayTraceS(graphRef.current.initial, trace) : undefined,
              }
            });
            setLogName(name);
            setLogResults(results);
            const violationResults = Object.keys(log.traces).map(traceId => {
              const trace = log.traces[traceId];
              return {
                traceId,
                trace,
                results: graphRef.current ? quantifyViolations(graphRef.current.initial, trace) : undefined,
              }
            });
            setViolationLogResults(violationResults);
            setMenuOpen(false);
          },
        })
      })
    }] : [];
  }

  const menuElements: Array<ModalMenuElement> = [
    {
      text: "Open Model",
      elements: [
        {
          customElement: (
            <StyledFileUpload>
              <FileUpload accept="text/xml" fileCallback={(_, contents) => { open(contents, modelerRef.current?.importXML); setMenuOpen(false); }}>
                <div />
                <>Open Editor XML</>
              </FileUpload>
            </StyledFileUpload>),
        },
        {
          customElement: (
            <StyledFileUpload>
              <FileUpload accept="text/xml" fileCallback={(_, contents) => { open(contents, modelerRef.current?.importDCRPortalXML); setMenuOpen(false); }}>
                <div />
                <>Open DCR Solution XML</>
              </FileUpload>
            </StyledFileUpload>),
        },
      ]
    }, {
      customElement: (
        <StyledFileUpload>
          <FileUpload accept=".xes" fileCallback={(name, contents) => { handleLogUpload(name, contents); setMenuOpen(false); }}>
            <BiUpload />
            <>Upload Log</>
          </FileUpload>
        </StyledFileUpload>),
    },
    ...savedGraphElements(),
    ...savedLogElements(),
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

  const lastGraph = lastSavedGraph.current;
  const initXml = lastGraph ? savedGraphs[lastGraph] : undefined;

  const lastLog = lastSavedLog.current;
  const initLog = lastLog ? savedLogs[lastLog] : undefined;

  const onLoadCallback = initLog ? (graph: DCRGraphS) => {
    const results = Object.keys(initLog.traces).map(traceId => {
      const trace = initLog.traces[traceId];
      return {
        traceId,
        trace,
        isPositive: replayTraceS(graph, trace),
      }
    });
    lastLog && setLogName(lastLog);
    setLogResults(results);
    const violationResults = Object.keys(initLog.traces).map(traceId => {
      const trace = initLog.traces[traceId];
      return {
        traceId,
        trace,
        results: quantifyViolations(graph, trace),
      }
    });
    setViolationLogResults(violationResults);
  } : undefined;

  return (
    <>
      <Modeler modelerRef={modelerRef} initXml={initXml} override={{ graphRef: graphRef, noRendering: true, overrideOnclick: () => null, canvasClassName: "conformance", onLoadCallback }} />
      {logResults.length > 0 && !heatmapMode && <ReplayResults logName={logName} logResults={logResults} selectedTrace={selectedTrace} setLogResults={setLogResults} setSelectedTrace={setSelectedTrace} />}
      {violationLogResults.length > 0 && heatmapMode && <HeatmapResults totalLogResults={totalLogResults} logName={logName} violationLogResults={violationLogResults} selectedTrace={selectedTrace} setViolationLogResults={setViolationLogResults} setSelectedTrace={setSelectedTrace} modelerRef={modelerRef} />}
      {selectedTrace && <TraceView graphRef={graphRef} selectedTrace={selectedTrace} setSelectedTrace={setSelectedTrace} onCloseCallback={() => {
        if (heatmapMode) {
          modelerRef.current?.updateViolations(totalLogResults.violations);
        }
      }} />}
      <TopRightIcons>
        <HeatmapButton onClick={() => {
          if (nestingRef.current) {
            toast.error("Nestings and Subprocesses not supported for heatmap...");
            return;
          }
          if (heatmapMode) {
            modelerRef.current?.updateViolations(null);
          } else {
            const viols = selectedTrace ? violationLogResults.find(elem => elem.traceId === selectedTrace.traceId)?.results?.violations : totalLogResults.violations;
            modelerRef.current?.updateViolations(viols);
          }
          setHeatmapMode(!heatmapMode)
        }} $clicked={heatmapMode} title="Display results as contraint violation heatmap." />
        <FullScreenIcon />
        <BiHome onClick={() => setState(StateEnum.Home)} />
        <ModalMenu elements={menuElements} open={menuOpen} bottomElements={bottomElements} setOpen={setMenuOpen} />
      </TopRightIcons>
    </>
  )
}

export default ConformanceCheckingState