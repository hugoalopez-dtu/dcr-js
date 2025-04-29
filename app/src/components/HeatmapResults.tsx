import { RelationViolations, RoleTrace } from "dcr-engine";
import { ViolationLogResults } from "../types";
import { CloseResults, ResultsElement, ResultsHeader, ResultsWindow } from "../utilComponents/ConformanceUtil";
import Label from "../utilComponents/Label";

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
    };
}

const HeatmapResults = ({ violationLogResults, selectedTrace, setSelectedTrace, logName, setViolationLogResults, modelerRef, totalLogResults }: HeatmapResultsProps) => {


    return <ResultsWindow $traceSelected={selectedTrace !== null}>
        <ResultsHeader>
            {logName}
            {totalLogResults.totalViolations}
            <CloseResults onClick={() => { setViolationLogResults([]); setSelectedTrace(null) }} />
        </ResultsHeader>
        <ul>
            {violationLogResults.map(({ traceId, trace, results }) => (
                <ResultsElement
                    $selected={selectedTrace !== null && selectedTrace.traceId === traceId}
                    key={traceId}
                    onClick={() => {
                        console.log(results);
                        setSelectedTrace({ trace, traceName: traceId, traceId });
                        results && modelerRef.current?.updateViolations(results.violations);
                    }}
                >
                    <Label>{traceId}</Label>
                    {results?.totalViolations}
                </ResultsElement>))}
        </ul>
    </ResultsWindow>
}

export default HeatmapResults;