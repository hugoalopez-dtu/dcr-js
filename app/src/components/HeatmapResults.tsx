import type { RelationViolations } from "dcr-engine";
import type { ViolationLogResults } from "../types";
import {
  ResultsElement,
  ResultsHeader,
  ResultsWindow,
} from "../utilComponents/ConformanceUtil";
import Label from "../utilComponents/Label";
import { BiCheck, BiQuestionMark, BiX } from "react-icons/bi";
import FlexBox from "../utilComponents/FlexBox";
import { useMemo } from "react";
import ResultContainer from "../utilComponents/ResultContainer";

const resultIcon = (val: boolean | undefined) => {
  switch (val) {
    case undefined:
      return <BiQuestionMark style={{ backgroundColor: "orange" }} />;
    case true:
      return <BiCheck title="Accepting" style={{ backgroundColor: "green" }} />;
    case false:
      return <BiX title="Non-accepting" style={{ backgroundColor: "red" }} />;
  }
};

interface HeatmapResultsProps {
  logName: string;
  violationLogResults: ViolationLogResults;
  aggregatedViolationLogResults:
    | {
        totalViolations: number;
        violations: RelationViolations;
      }
    | undefined;
  selectedTrace: ViolationLogResults[number] | null;
  setSelectedTraceId: React.Dispatch<React.SetStateAction<string | null>>;
}

const HeatmapResults = ({
  logName,
  violationLogResults,
  aggregatedViolationLogResults,
  selectedTrace,
  setSelectedTraceId,
}: HeatmapResultsProps) => {
  const { positiveCount, negativeCount } = useMemo<{
    positiveCount: number;
    negativeCount: number;
  }>(() => {
    let positiveCount = 0;
    let negativeCount = 0;

    for (const result of violationLogResults) {
      if (
        result.results !== undefined &&
        result.results.totalViolations === 0
      ) {
        positiveCount++;
      } else {
        negativeCount++;
      }
    }

    return { positiveCount, negativeCount };
  }, [violationLogResults]);

  return (
    <ResultsWindow $traceSelected={selectedTrace !== null}>
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
            {aggregatedViolationLogResults && (
              <div title="Total Constraint Violations">
                {aggregatedViolationLogResults.totalViolations}
              </div>
            )}
          </FlexBox>
        </FlexBox>
      </ResultsHeader>
      <ul>
        {violationLogResults.map(({ traceId, results }) => (
          <ResultsElement
            $selected={
              selectedTrace !== null && selectedTrace.traceId === traceId
            }
            key={traceId}
            onClick={() => setSelectedTraceId(traceId)}
          >
            <Label>{traceId}</Label>
            <ResultContainer>
              {results?.totalViolations}
              {resultIcon(results?.totalViolations === 0)}
            </ResultContainer>
          </ResultsElement>
        ))}
      </ul>
    </ResultsWindow>
  );
};

export default HeatmapResults;
