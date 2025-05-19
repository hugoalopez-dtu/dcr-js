import { useEffect, useMemo, useRef, useState } from "react";
import { StateEnum, StateProps } from "../App";
import Modeler from "./Modeler";
import TopRightIcons from "../utilComponents/TopRightIcons";
import FullScreenIcon from "../utilComponents/FullScreenIcon";
import { BiHome, BiLeftArrowCircle, BiSolidFlame, BiSolidRocket, BiUpload } from "react-icons/bi";
import ModalMenu, { ModalMenuElement } from "../utilComponents/ModalMenu";
import Toggle from "../utilComponents/Toggle";
import DropDown from "../utilComponents/DropDown";
import { AlignmentLogResults, isSettingsVal, ReplayLogResults, ViolationLogResults } from "../types";
import { alignTrace, copyMarking, mergeViolations, moddleToDCR, parseLog, quantifyViolations } from "dcr-engine";
import { toast } from "react-toastify";
import FileUpload from "../utilComponents/FileUpload";
import { replayTraceS } from "dcr-engine";
import { DCRGraphS } from "dcr-engine";
import TraceView from "../utilComponents/TraceView";
import { EventLog, LabelDCRPP, RelationActivations, RelationViolations, RoleTrace, Trace } from "dcr-engine/src/types";
import StyledFileUpload from "../utilComponents/StyledFileUpload";
import MenuElement from "../utilComponents/MenuElement";
import Label from "../utilComponents/Label";
import ReplayResults from "./ReplayResults";
import styled from "styled-components";
import HeatmapResults from "./HeatmapResults";
import { graphToGraphPP } from "dcr-engine/src/align";
import AlignmentResults from "./AlignmentResults";
import AlignmentTraceView from "./AlignmentTraceView";
import { mergeActivations } from "dcr-engine/src/conformance";

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

const AlignButton = styled(BiSolidRocket) <{ $clicked: boolean, $disabled?: boolean }>`
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

const alignShowDesc = (trace: Trace, graph: LabelDCRPP): { cost: number, trace: Trace } => {
  const alignment = alignTrace(trace, graph);
  return { cost: alignment.cost, trace: alignment.trace.map(event => graph.labelMap[event]) }
}

const ConformanceCheckingState = ({ savedGraphs, savedLogs, setState, lastSavedGraph, lastSavedLog }: StateProps) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [heatmapMode, setHeatmapMode] = useState(false);
  const [alignmentMode, setAlignmentMode] = useState(false);

  const modelerRef = useRef<DCRModeler | null>(null);
  const graphRef = useRef<{ initial: DCRGraphS, current: DCRGraphS } | null>(null);

  const [logResults, setLogResults] = useState<ReplayLogResults>([]);
  const [violationLogResults, setViolationLogResults] = useState<ViolationLogResults>([]);
  const [alignmentLogResults, setAlignmentLogResults] = useState<AlignmentLogResults>([]);

  const [logName, setLogName] = useState<string>("");
  const [selectedTrace, setSelectedTrace] = useState<{ traceId: string, traceName: string, trace: RoleTrace, results?: { cost: number, trace: Trace } } | null>(null);

  const nestingRef = useRef<boolean>(true);
  const roleSPRef = useRef<boolean>(true);

  useEffect(() => {
    const lastGraph = lastSavedGraph.current;
    const initXml = lastGraph ? savedGraphs[lastGraph] : undefined;

    const nestings = initXml ? (initXml.includes("Nesting")) : false;
    roleSPRef.current = initXml ? (initXml.includes("role") || initXml.includes("subProcess")) : false;
    nestingRef.current = nestings

    setHeatmapMode(!nestings);
  }, []);

  const totalLogResults = useMemo<{
    totalViolations: number,
    violations: RelationViolations,
    activations: RelationActivations
  } | undefined>(() => {
    if (violationLogResults.length === 0) return undefined;
    const retval = violationLogResults.reduce((acc, cum) => cum.results ? {
      totalViolations: acc.totalViolations + cum.results.totalViolations,
      violations: mergeViolations(acc.violations, cum.results.violations),
      activations: mergeActivations(acc.activations, cum.results.activations),
    } : acc, {
      totalViolations: 0,
      violations: {
        conditionsFor: {},
        responseTo: {},
        excludesTo: {},
        milestonesFor: {}
      },
      activations: {
        conditionsFor: {},
        responseTo: {},
        excludesTo: {},
        milestonesFor: {},
        includesTo: {}
      }
    });
    modelerRef.current?.updateViolations(retval);
    return retval
  }, [violationLogResults]);

  const open = (data: string, parse: ((xml: string) => Promise<void>) | undefined) => {
    if (data.includes("multi-instance=\"true\"")) {
      toast.error("Multi-instance subprocesses not supported...");
    } else {
      parse && parse(data).then((_) => {
        if (data.includes("Nesting")) {
          setHeatmapMode(false);
          nestingRef.current = true;
        }
        else nestingRef.current = false;
        if (data.includes("role") || data.includes("subProcess")) {
          setAlignmentMode(false);
          roleSPRef.current = true;
        }
        else nestingRef.current = false;
        if (modelerRef.current && graphRef.current) {
          const graph = moddleToDCR(modelerRef.current.getElementRegistry());
          graphRef.current = { initial: graph, current: { ...graph, marking: copyMarking(graph.marking) } };
          if (logResults) {
            const newResults = logResults.map(({ traceId, trace }) => ({ traceId, trace, isPositive: replayTraceS(graph, trace) }));
            setLogResults(newResults);
          }
          if (violationLogResults && !nestingRef.current) {
            const newResults = violationLogResults.map(({ trace, traceId }) => ({ traceId, trace, results: quantifyViolations(graph, trace) }));
            setViolationLogResults(newResults);
          }
          if (alignmentLogResults && !roleSPRef.current) {
            const graphPP = graphToGraphPP(graph);
            const newResults = alignmentLogResults.map(({ trace, traceId }) => ({ traceId, trace, results: alignShowDesc(trace.map(event => event.activity), graphPP) }));
            setAlignmentLogResults(newResults);
          }
        }
      }).catch((e) => { console.log(e); toast.error("Unable to parse XML...") });
    }
  }

  const openLog = (name: string, log: EventLog<RoleTrace>, graph: DCRGraphS | undefined) => {
    const results = Object.keys(log.traces).map(traceId => {
      const trace = log.traces[traceId];
      return {
        traceId,
        trace,
        isPositive: graph ? replayTraceS(graph, trace) : undefined,
      }
    });
    setLogName(name);
    setLogResults(results);
    if (!nestingRef.current) {
      const violationResults = Object.keys(log.traces).map(traceId => {
        const trace = log.traces[traceId];
        return {
          traceId,
          trace,
          results: graph ? quantifyViolations(graph, trace) : undefined,
        }
      });
      setViolationLogResults(violationResults);
    }
    if (!roleSPRef.current) {
      const graphPP = graph ? graphToGraphPP(graph) : undefined;
      const alignmentResults = Object.keys(log.traces).map(traceId => {
        const trace = log.traces[traceId];
        return {
          traceId,
          trace,
          results: graphPP ? alignShowDesc(trace.map(event => event.activity), graphPP) : undefined,
        }
      });
      setAlignmentLogResults(alignmentResults);
    }
  }

  const handleLogUpload = (name: string, data: string) => {
    try {
      const log = parseLog(data);
      openLog(name.slice(0, -4), log, graphRef.current?.current);
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
            openLog(name, log, graphRef.current?.current);
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

  const onLoadCallback = lastSavedLog.current && savedLogs[lastSavedLog.current] ? (graph: DCRGraphS) => {
    if (nestingRef.current) {
      return;
    }
    const initLog = lastSavedLog.current && savedLogs[lastSavedLog.current]
    if (!initLog) return;

    lastSavedLog.current && openLog(lastSavedLog.current, initLog, graph);
  } : undefined;

  return (
    <>
      <Modeler modelerRef={modelerRef} initXml={lastSavedGraph.current && savedGraphs[lastSavedGraph.current]} override={{ graphRef: graphRef, noRendering: true, overrideOnclick: () => null, canvasClassName: "conformance", onLoadCallback }} />
      {logResults.length > 0 && !heatmapMode && !alignmentMode && <ReplayResults logName={logName} logResults={logResults} selectedTrace={selectedTrace} setLogResults={setLogResults} setSelectedTrace={setSelectedTrace} />}
      {violationLogResults.length > 0 && heatmapMode && <HeatmapResults totalLogResults={totalLogResults} logName={logName} violationLogResults={violationLogResults} selectedTrace={selectedTrace} setViolationLogResults={setViolationLogResults} setSelectedTrace={setSelectedTrace} modelerRef={modelerRef} />}
      {alignmentLogResults.length > 0 && alignmentMode && <AlignmentResults alignmentLogResults={alignmentLogResults} logName={logName} selectedTrace={selectedTrace} setAlignmentLogResults={setAlignmentLogResults} setSelectedTrace={setSelectedTrace} />}
      {selectedTrace && !alignmentMode && <TraceView graphRef={graphRef} selectedTrace={selectedTrace} setSelectedTrace={setSelectedTrace} onCloseCallback={() => {
        if (heatmapMode && totalLogResults) {
          modelerRef.current?.updateViolations(totalLogResults);
        }
      }} />}
      {selectedTrace && alignmentMode && <AlignmentTraceView graphRef={graphRef} selectedTrace={selectedTrace} setSelectedTrace={setSelectedTrace} />}
      <TopRightIcons>
        <AlignButton onClick={() => {
          if (roleSPRef.current) {
            toast.warning("Roles and subprocesses not supported for alignment...");
            return;
          }
          if (heatmapMode) {
            modelerRef.current?.updateViolations(null);
          }
          if (!alignmentMode && selectedTrace && graphRef.current) {
            const newSelectedTrace = { ...selectedTrace };
            newSelectedTrace.results = alignShowDesc(newSelectedTrace.trace.map(event => event.activity), graphToGraphPP(graphRef.current?.current));
            setSelectedTrace(newSelectedTrace);
          }
          setAlignmentMode(!alignmentMode);
          setHeatmapMode(false);
        }} $clicked={alignmentMode} title="Display results as alignments." />
        <HeatmapButton onClick={() => {
          if (nestingRef.current) {
            toast.warning("Nestings and multi-instance subprocesses not supported for heatmap...");
            return;
          }
          if (heatmapMode) {
            modelerRef.current?.updateViolations(null);
          } else {
            const viols = selectedTrace ? violationLogResults.find(elem => elem.traceId === selectedTrace.traceId)?.results : totalLogResults;
            console.log(viols);
            viols && modelerRef.current?.updateViolations(viols);
          }
          setHeatmapMode(!heatmapMode);
          setAlignmentMode(false);
        }} $clicked={heatmapMode} title="Display results as contraint violation heatmap." />
        <FullScreenIcon />
        <BiHome onClick={() => setState(StateEnum.Home)} />
        <ModalMenu elements={menuElements} open={menuOpen} bottomElements={bottomElements} setOpen={setMenuOpen} />
      </TopRightIcons>
    </>
  )
}

export default ConformanceCheckingState