import { replayTraceS } from "dcr-engine";
import { DCRGraphS } from "dcr-engine";
import { useMemo } from "react";
import { BiCheck, BiQuestionMark, BiX } from "react-icons/bi";
import styled from "styled-components";
import { RoleTrace, Trace } from "dcr-engine/src/types";

const TraceWindow = styled.div`
    position: fixed;
    top: 0;
    left: 30rem;
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

interface AlignmentTraceViewProps {
    selectedTrace: { traceId: string, traceName: string, trace: RoleTrace, results?: { cost: number, trace: Trace } };
    setSelectedTrace: (arg: { trace: RoleTrace, traceName: string, traceId: string } | null) => void,
    graphRef: React.RefObject<{ initial: DCRGraphS, current: DCRGraphS } | null>;

    onCloseCallback?: () => void;
}

const AlignmentTraceView = ({ selectedTrace, setSelectedTrace, graphRef, onCloseCallback }: AlignmentTraceViewProps) => {

    const traceIsAccepting = useMemo<boolean | undefined>(() => {
        if (graphRef.current === null || selectedTrace === null) return undefined;
        return replayTraceS(graphRef.current?.initial, selectedTrace?.trace);
    }, [selectedTrace])

    console.log(selectedTrace.results);

    return (
        <TraceWindow>
            <ResultsHeader>
                {selectedTrace.traceName}
                {resultIcon(traceIsAccepting)}
                <CloseTrace onClick={() => {
                    onCloseCallback && onCloseCallback();
                    setSelectedTrace(null);
                }} />
            </ResultsHeader>
            <ul>
                {selectedTrace.trace.map((event, idx) => <Activity key={event.activity + event.role + idx}>{event.role !== "" ? event.role + ": " + event.activity : event.activity}</Activity>)}
            </ul>
            {selectedTrace.results && selectedTrace.results.cost !== 0 && <>
                <ResultsHeader>
                    Aligned:
                </ResultsHeader>
                <ul>
                    {selectedTrace.results.trace.map((event, idx) => <Activity key={event + idx + selectedTrace.trace.length}>{event}</Activity>)}
                </ul>
            </>}
        </TraceWindow>
    )
}

export default AlignmentTraceView;