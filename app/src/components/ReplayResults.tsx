import { useMemo } from "react";
import { BiCheck, BiQuestionMark, BiX } from "react-icons/bi";
import { ReplayLogResults } from "../types";
import { RoleTrace } from "dcr-engine";
import Label from "../utilComponents/Label";
import { CloseResults, ResultsElement, ResultsHeader, ResultsWindow } from "../utilComponents/ConformanceUtil";
import FlexBox from "../utilComponents/FlexBox";
import ResultContainer from "../utilComponents/ResultContainer";

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
                </FlexBox>
            </FlexBox>
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