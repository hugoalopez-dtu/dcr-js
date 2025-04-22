import { replayTraceS } from "dcr-engine";
import { DCRGraphS } from "dcr-engine";
import { useMemo } from "react";
import { BiCheck, BiQuestionMark, BiReset, BiX } from "react-icons/bi";
import styled from "styled-components";
import { Children } from "../types";
import { RoleTrace } from "dcr-engine/src/types";

const TraceWindow = styled.div<{ $hugLeft: boolean; }>`
    position: fixed;
    top: 0;
    left: ${props => props.$hugLeft ? "0rem" : "30rem"};
    height: 100vh;
    box-shadow: 0px 0 5px 0px grey;
    display: flex;
    flex-direction: column;
    padding-top: 2rem;
    padding-bottom: 2rem;
    font-size: 20px;
    background-color: gainsboro;
    box-sizing: border-box;
    overflow: scroll;
    z-index: 4;
`

const ResultsHeader = styled.h1`
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    font-size: 30px;
    font-weight: normal;
    padding: 0.5rem 1rem 0.5rem 1rem;
    margin: 0;
`

const CloseTrace = styled(BiX)`
  display: block;
  height: 30px;
  width: 30px;
  margin: auto;
  margin-left: 1rem;
  margin-right: 1rem;
  cursor: pointer;
  color: black;
  &:hover {
    color: white;
  }
`

const ResetTrace = styled(BiReset)`
  display: block;
  height: 30px;
  width: 30px;
  margin: auto;
  margin-left: 1rem;
  margin-right: 1rem;
  cursor: pointer;
  color: black;
  &:hover {
    color: white;
  }
`

const TraceNameInput = styled.input`
    font-size: 20px;
    width: fit-content;
    background: transparent;
    appearance: none;
    border: none;
    margin-bottom: 0.5rem;
    padding: 0.25rem 0.5rem 0.25rem 0.5rem;
    margin: 0.25rem 0.5rem 0.25rem 0.5rem;
    &:focus {
      outline: 2px dashed black;
    }
`

const GreenCheck = styled(BiCheck)`
        display: block;
        color: white;
        border-radius: 50%;
        margin: auto;
        margin-right: 1rem;
        margin-left: 1rem;
        background-color: green;
`

const RedX = styled(BiX)`
        display: block;
        color: white;
        border-radius: 50%;
        margin: auto;
        margin-right: 1rem;
        margin-left: 1rem;
        background-color: red;
`

const OrangeQuestion = styled(BiQuestionMark)`
        display: block;
        color: white;
        border-radius: 50%;
        margin: auto;
        margin-right: 1rem;
        margin-left: 1rem;
        background-color: orange;
`

const Activity = styled.li`
  width: 100%;
  padding: 0.5rem 1rem 0.5rem 1rem;
  box-sizing: border-box;
`

const resultIcon = (val: boolean | undefined) => {
    switch (val) {
        case undefined:
            return <OrangeQuestion title="free trace" />
        case true:
            return <GreenCheck title="accepting" />
        case false:
            return <RedX title="not accepting" />
    }
}

interface TraceViewProps {
    hugLeft?: boolean;
    editProps?: {
        traceName: string;
        setTraceName: (val: string) => void,
        traceRef: React.RefObject<{ trace: RoleTrace, traceId: string } | null>;
        reset?: () => void,
    };
    selectedTrace: { traceId: string, traceName: string, trace: RoleTrace };
    setSelectedTrace: (arg: { trace: RoleTrace, traceName: string, traceId: string } | null) => void,
    graphRef: React.RefObject<{ initial: DCRGraphS, current: DCRGraphS } | null>;

    onCloseCallback?: () => void;
    children?: Children;
}

const TraceView = ({ children, hugLeft, editProps, selectedTrace, setSelectedTrace, graphRef, onCloseCallback }: TraceViewProps) => {

    const traceIsAccepting = useMemo<boolean | undefined>(() => {
        if (graphRef.current === null || selectedTrace === null) return undefined;
        return replayTraceS(graphRef.current?.initial, selectedTrace?.trace);
    }, [selectedTrace])

    return (
        <TraceWindow $hugLeft={!!hugLeft}>
            <ResultsHeader>
                {editProps ? <TraceNameInput value={editProps.traceName} onChange={(e) => editProps.setTraceName(e.target.value)} /> : selectedTrace.traceName}
                {resultIcon(traceIsAccepting)}
                {editProps?.reset && <ResetTrace onClick={() => {
                    if (!editProps.traceRef.current) return;

                    const traceId = editProps.traceRef.current.traceId;
                    setSelectedTrace({ traceId: "Trace " + traceId, traceName: editProps.traceName, trace: [] });
                    editProps.traceRef.current = { traceId, trace: [] };
                    editProps.reset && editProps.reset();
                }} />}
                <CloseTrace onClick={() => {
                    onCloseCallback && onCloseCallback();
                    setSelectedTrace(null);
                }} />
            </ResultsHeader>
            <ul>
                {selectedTrace.trace.map((event, idx) => <Activity key={event.activity + event.role + idx}>{event.role !== "" ? event.role + ": " + event.activity : event.activity}</Activity>)}
            </ul>
            {children}
        </TraceWindow>
    )
}

export default TraceView;