import { useMemo } from "react";
import { BiCheck, BiQuestionMark, BiX } from "react-icons/bi"
import styled from "styled-components"
import { ReplayLogResults } from "../types";
import { RoleTrace } from "dcr-engine";
import Label from "../utilComponents/Label";
import { CloseResults, ResultsElement, ResultsHeader, ResultsWindow } from "../utilComponents/ConformanceUtil";



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

interface ReplayResultsProps {
    logResults: ReplayLogResults;
    setLogResults: (arg: ReplayLogResults) => void;
    selectedTrace: { traceId: string, traceName: string, trace: RoleTrace } | null;
    setSelectedTrace: (arg: { traceId: string, traceName: string, trace: RoleTrace } | null) => void;
    logName: string;
}

const ReplayResults = ({ logResults, selectedTrace, setSelectedTrace, logName, setLogResults }: ReplayResultsProps) => {

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

    return <ResultsWindow $traceSelected={selectedTrace !== null}>
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
            {logResults.map(({ traceId, trace, isPositive }) => (
                <ResultsElement
                    $selected={selectedTrace !== null && selectedTrace.traceId === traceId}
                    key={traceId}
                    onClick={() => setSelectedTrace({ trace, traceName: traceId, traceId })}
                >
                    <Label>{traceId}</Label>
                    {resultIcon(isPositive)}
                </ResultsElement>))}
        </ul>
    </ResultsWindow>
}

export default ReplayResults;