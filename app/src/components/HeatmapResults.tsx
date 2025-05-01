import { RelationViolations, RoleTrace } from "dcr-engine";
import { ViolationLogResults } from "../types";
import { CloseResults, ResultsElement, ResultsHeader, ResultsWindow } from "../utilComponents/ConformanceUtil";
import Label from "../utilComponents/Label";
import { BiCheck, BiQuestionMark, BiX } from "react-icons/bi";
import FlexBox from "../utilComponents/FlexBox";
import { useMemo } from "react";
import ResultContainer from "../utilComponents/ResultContainer";

interface HeatmapResultsProps {
    modelerRef: React.RefObject<DCRModeler | null>,
    violationLogResults: ViolationLogResults;
    setViolationLogResults: (arg: ViolationLogResults) => void;
    selectedTrace: { traceId: string, traceName: string, trace: RoleTrace } | null;
    setSelectedTrace: (arg: { traceId: string, traceName: string, trace: RoleTrace } | null) => void;
    logName: string;
    totalLogResults: {
        totalViolations: number,
        violations: RelationViolations
    } | undefined;
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

const HeatmapResults = ({ violationLogResults, selectedTrace, setSelectedTrace, logName, setViolationLogResults, modelerRef, totalLogResults }: HeatmapResultsProps) => {

    const { positiveCount, negativeCount } = useMemo<{ positiveCount: number, negativeCount: number }>(() => {
        let positiveCount = 0;
        let negativeCount = 0;
        for (const result of violationLogResults) {
            if (result.results !== undefined && result.results.totalViolations === 0) {
                positiveCount++;
            } else {
                negativeCount++;
            }
        }
        return { positiveCount, negativeCount }
    }, [violationLogResults]);

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
                    {totalLogResults && <div title="Total Constraint Violations">{totalLogResults.totalViolations}</div>}
                </FlexBox>
            </FlexBox>
            <CloseResults onClick={() => { setViolationLogResults([]); setSelectedTrace(null) }} />
        </ResultsHeader>
        <ul>
            {violationLogResults.map(({ traceId, trace, results }) => (
                <ResultsElement
                    $selected={selectedTrace !== null && selectedTrace.traceId === traceId}
                    key={traceId}
                    onClick={() => {
                        setSelectedTrace({ trace, traceName: traceId, traceId });
                        results && modelerRef.current?.updateViolations(results);
                    }}
                >
                    <Label>{traceId}</Label>
                    <ResultContainer>
                        {results?.totalViolations}
                        {resultIcon(results?.totalViolations === 0)}
                    </ResultContainer>
                </ResultsElement>))}
        </ul>
    </ResultsWindow>
}

export default HeatmapResults;