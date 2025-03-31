import { useMemo, useRef, useState } from "react";
import { StateEnum, StateProps } from "../App";
import Modeler from "./Modeler";
import TopRightIcons from "../utilComponents/TopRightIcons";
import FullScreenIcon from "../utilComponents/FullScreenIcon";
import { BiCheck, BiHome, BiLeftArrowCircle, BiQuestionMark, BiUpload, BiX } from "react-icons/bi";
import ModalMenu, { ModalMenuElement } from "../utilComponents/ModalMenu";
import styled from "styled-components";
import Toggle from "../utilComponents/Toggle";
import DropDown from "../utilComponents/DropDown";
import { isSettingsVal } from "../types";
import { copyMarking, moddleToDCR, parseLog } from "dcr-engine";
import { toast } from "react-toastify";
import FileUpload from "../utilComponents/FileUpload";
import { Trace } from "dcr-engine";
import { replayTraceS } from "dcr-engine/src/conformance";
import { DCRGraphS } from "dcr-engine/src/types";

const StyledFileUpload = styled.div`
  width: 100%;
  & > label > svg {
    font-size: 25px;
  }
  & > label {
    padding: 1rem;
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    cursor: pointer;
  }
  &:hover {
      color: white;
      background-color: Gainsboro;
  } 
`

const MenuElement = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  width: 100%;
  padding: 1rem;
  cursor: default;
`

const Label = styled.label`
  margin-top: auto;
  margin-bottom: auto;
`

const ResultsWindow = styled.div<{ $traceSelected: boolean; }>`
    position: fixed;
    top: 0;
    left: 0;
    height: 100vh;
    width: 30rem;
    box-shadow: ${props => props.$traceSelected ? "none" : "0px 0px 5px 0px grey"};
    display: flex;
    flex-direction: column;
    padding-top: 1rem;
    padding-bottom: 1rem;
    font-size: 20px;
    background-color: white;
    box-sizing: border-box;
    overflow: scroll;
    z-index: 5;
`

const TraceWindow = styled.div`
    position: fixed;
    top: 0;
    left: 30rem;
    height: 100vh;
    box-shadow: 0px 0 5px 0px grey;
    display: flex;
    flex-direction: column;
    padding-top: 1rem;
    padding-bottom: 1rem;
    font-size: 20px;
    background-color: gainsboro;
    box-sizing: border-box;
    overflow: scroll;
`

const ResultsElement = styled.li<{ $selected: boolean; }>`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  width: 100%;
  padding: 0.5rem 1rem 0.5rem 1rem;
  cursor: pointer;
  box-sizing: border-box;
  color: ${props => props.$selected ? "white" : "black"};
  background-color: ${props => props.$selected ? "gainsboro" : "white"};

  &:hover {
      color: white;
      background-color: Gainsboro;
  } 

  & > svg {
    color: white;
    border-radius: 50%;
  }
`

const ResultsHeader = styled.h1`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  font-size: 30px;
  font-weight: normal;
  margin: 1rem;
`

const CloseResults = styled(BiX)`
  display: block;
  height: 30px;
  width: 30px;
  margin: auto;
  margin-left: 1rem;
  margin-right: 0;
  cursor: pointer;
  &:hover {
    color: gainsboro;
  }
`

const CloseTrace = styled(BiX)`
  display: block;
  height: 30px;
  width: 30px;
  margin: auto;
  margin-left: 1rem;
  margin-right: 1rem;
  cursor: pointer;
  &:hover {
    color: white;
  }
`

const Activity = styled.li`
  width: 100%;
  padding: 0.5rem 1rem 0.5rem 1rem;
  box-sizing: border-box;
`

type LogResults = Array<{
  traceId: string,
  isPositive?: boolean,
  trace: Trace
}>

const ResultCount = styled.div`
    display: flex;
    flex-direction: row;

    & > svg {
    display: block;
    color: white;
    border-radius: 50%;
    margin: auto;
    margin-right: 1rem;
    margin-left: 0.5rem;
  }
`

const resultIcon = (val: boolean | undefined) => {
  switch (val) {
    case undefined:
      return <BiQuestionMark style={{ backgroundColor: "orange" }} />
    case true:
      return <BiCheck title="accepting" style={{ backgroundColor: "green" }} />
    case false:
      return <BiX title="not accepting" style={{ backgroundColor: "red" }} />
  }
}

const ConformanceCheckingState = ({ savedGraphs, savedLogs, setState, lastSavedGraph, lastSavedLog }: StateProps) => {
  const [menuOpen, setMenuOpen] = useState(false);

  const modelerRef = useRef<DCRModeler | null>(null);
  const graphRef = useRef<{ initial: DCRGraphS, current: DCRGraphS } | null>(null);

  const [logResults, setLogResults] = useState<LogResults>([]);
  const [logName, setLogName] = useState<string>("");
  const [selectedTrace, setSelectedTrace] = useState<{ traceId: string, trace: Trace } | null>(null);

  const { positiveCount, negativeCount } = useMemo<{ positiveCount: number, negativeCount: number }>(() => {
    let positiveCount = 0;
    let negativeCount = 0;
    for (const result of logResults) {
      if (result.isPositive !== undefined && result.isPositive) {
        positiveCount++;
      } else {
        negativeCount++;
      }
    }
    return { positiveCount, negativeCount }
  }, [logResults]);

  const open = (data: string, parse: ((xml: string) => Promise<void>) | undefined) => {
    if (data.includes("multi-instance=\"true\"")) {
      toast.error("Multi-instance subprocesses not supported...");
    } else {
      parse && parse(data).then((_) => {
        if (modelerRef.current && graphRef.current) {
          const graph = moddleToDCR(modelerRef.current.getElementRegistry());
          graphRef.current = { initial: graph, current: { ...graph, marking: copyMarking(graph.marking) } };
          if (logResults) {
            const newResults = logResults.map(({ traceId, trace }) => ({ traceId, trace, isPositive: replayTraceS(graph, trace) }));
            setLogResults(newResults);
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
            console.log(log);
            const results = Object.keys(log.traces).map(traceId => {
              const trace = log.traces[traceId];
              console.log(trace, "hehe");
              return {
                traceId,
                trace,
                isPositive: graphRef.current ? replayTraceS(graphRef.current.initial, trace) : undefined,
              }
            });
            setLogName(name);
            setLogResults(results); 
            setMenuOpen(false); },
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
  } : undefined;

  return (
    <>
      <Modeler modelerRef={modelerRef} initXml={initXml} override={{ graphRef: graphRef, overrideOnclick: () => null, canvasClassName: "conformance", onLoadCallback }} />
      {logResults.length > 0 && <ResultsWindow $traceSelected={selectedTrace !== null}>
        <ResultsHeader>
          {logName}
          <ResultCount>
            {positiveCount}
            {resultIcon(true)}
            {negativeCount}
            {resultIcon(false)}
          </ResultCount>
          <CloseResults onClick={() => { setLogResults([]); setSelectedTrace(null) }} />
        </ResultsHeader>
        <ul>
          {logResults.map(({ traceId, trace, isPositive }) => <ResultsElement $selected={selectedTrace !== null && selectedTrace.traceId === traceId} key={traceId} onClick={() => setSelectedTrace({ trace, traceId })}>
            <Label>{traceId}</Label>
            {resultIcon(isPositive)}
          </ResultsElement>)}
        </ul>
      </ResultsWindow>}
      {selectedTrace && <TraceWindow>
        <ResultsHeader>
          {selectedTrace.traceId}
          <CloseTrace onClick={() => setSelectedTrace(null)} />
        </ResultsHeader>
        <ul>
          {selectedTrace.trace.map((activity, idx) => <Activity key={activity + idx}>{activity}</Activity>)}
        </ul>
      </TraceWindow>}
      <TopRightIcons>
        <FullScreenIcon />
        <BiHome onClick={() => setState(StateEnum.Home)} />
        <ModalMenu elements={menuElements} open={menuOpen} bottomElements={bottomElements} setOpen={setMenuOpen} />
      </TopRightIcons>
    </>
  )
}

export default ConformanceCheckingState