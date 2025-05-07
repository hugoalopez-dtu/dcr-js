import { RoleTrace, Trace } from "dcr-engine";
import { AlignmentLogResults } from "../types";
import { CloseResults, ResultsElement, ResultsHeader, ResultsWindow } from "../utilComponents/ConformanceUtil";
import Label from "../utilComponents/Label";
import { BiCheck, BiQuestionMark, BiX } from "react-icons/bi";
import FlexBox from "../utilComponents/FlexBox";
import { useMemo } from "react";
import ResultContainer from "../utilComponents/ResultContainer";

interface AlignmentResultsProps {
    alignmentLogResults: AlignmentLogResults;
    setAlignmentLogResults: (arg: AlignmentLogResults) => void;
    selectedTrace: { traceId: string, traceName: string, trace: RoleTrace } | null;
    setSelectedTrace: (arg: { traceId: string, traceName: string, trace: RoleTrace, results?: { cost: number, trace: Trace } } | null) => void;
    logName: string;
}

const resultIcon = (val: boolean | undefined) => {
    switch (val) {
        case undefined:
            return <BiQuestionMark style={{ backgroundColor: "orange" }} />
        case true:
            return <BiCheck title="Accepting" style={{ backgroundColor: "green" }} />
        case false:
            return <BiX title="Non-accepting" style={{ backgroundColor: "red" }} />
    }
}

const AlignmentResults = ({ selectedTrace, setSelectedTrace, alignmentLogResults, setAlignmentLogResults, logName }: AlignmentResultsProps) => {

    const { positiveCount, negativeCount, totalCost } = useMemo<{ positiveCount: number, negativeCount: number, totalCost: number }>(() => {
        let positiveCount = 0;
        let negativeCount = 0;
        let totalCost = 0;
        for (const result of alignmentLogResults) {
            if (result.results === undefined) continue;
            totalCost += result.results.cost;
            if (result.results.cost === 0) {
                positiveCount++;
            } else {
                negativeCount++;
            }
        }
        return { positiveCount, negativeCount, totalCost }
    }, [alignmentLogResults]);

    return <ResultsWindow $traceSelected={selectedTrace !== null}>
        <ResultsHeader>
            <FlexBox direction="column" $justify="start">
                <div>{logName}</div>
                <FlexBox direction="row" $justify="space-between">
                    <ResultContainer title="Accepting Traces">
                        {positiveCount}
                        {resultIcon(true)}
                    </ResultContainer>
                    <ResultContainer title="Non-accepting Traces">
                        {negativeCount}
                        {resultIcon(false)}
                    </ResultContainer>
                    {<div title="Total Alignment Cost">{totalCost}</div>}
                </FlexBox>
            </FlexBox>
            <CloseResults onClick={() => { setAlignmentLogResults([]); setSelectedTrace(null) }} />
        </ResultsHeader>
        <ul>
            {alignmentLogResults.map(({ traceId, trace, results }) => (
                <ResultsElement
                    $selected={selectedTrace !== null && selectedTrace.traceId === traceId}
                    key={traceId}
                    onClick={() => {
                        setSelectedTrace({ trace, traceName: traceId, traceId, results });
                    }}
                >
                    <Label>{traceId}</Label>
                    <ResultContainer>
                        {results?.cost}
                        {resultIcon(results?.cost === 0)}
                    </ResultContainer>
                </ResultsElement>))}
        </ul>
    </ResultsWindow>
}

export default AlignmentResults;