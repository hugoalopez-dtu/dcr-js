import type { RelationViolations } from "dcr-engine";
import type { TraceClassification, ViolationLogResults } from "../types";
import {
  PartialViolationIcon,
  RelationViolationIcon,
  ResultsElement,
  ResultsHeader,
  ResultsWindow,
} from "../utilComponents/ConformanceUtil";
import Label from "../utilComponents/Label";
import { BiCheck, BiChevronDown, BiChevronRight, BiQuestionMark, BiTime, BiX } from "react-icons/bi";
import FlexBox from "../utilComponents/FlexBox";
import { Fragment, useMemo, useState } from "react";
import ResultContainer from "../utilComponents/ResultContainer";
import Form from "../utilComponents/Form";

const classificationIcon = (c: TraceClassification | undefined) => {
  switch (c) {
    case "conforming":
      return <BiCheck title="Conforming" style={{ backgroundColor: "green" }} />;
    case "partiallyViolating":
      return <PartialViolationIcon title="Partially Violating" />;
    case "violating":
      return <BiX title="Violating" style={{ backgroundColor: "red" }} />;
    default:
      return <BiQuestionMark style={{ backgroundColor: "orange" }} />;
  }
};

interface HeatmapResultsProps {
  logName: string;
  violationLogResults: ViolationLogResults;
  aggregatedViolationLogResults:
    | {
        totalViolations: number;
        totalTimeViolations: number;
        violations: RelationViolations;
      }
    | undefined;
  selectedTrace: ViolationLogResults[number] | null;
  setSelectedTraceId: React.Dispatch<React.SetStateAction<string | null>>;
  onCheck: () => void;
  hasTimeConstraints: boolean;
}

const HeatmapResults = ({
  logName,
  violationLogResults,
  aggregatedViolationLogResults,
  selectedTrace,
  setSelectedTraceId,
  onCheck,
  hasTimeConstraints,
}: HeatmapResultsProps) => {
  const [expandedVariantId, setExpandedVariantId] = useState<string | null>(null);

  const { conformingCount, partiallyViolatingCount, violatingCount } = useMemo(() => {
    let conformingCount = 0;
    let partiallyViolatingCount = 0;
    let violatingCount = 0;

    for (const result of violationLogResults) {
      if (result.subTraces?.length) {
        for (const st of result.subTraces) {
          if (st.classification === "conforming") conformingCount++;
          else if (st.classification === "partiallyViolating") partiallyViolatingCount++;
          else violatingCount++;
        }
      } else {
        if (result.classification === "conforming") conformingCount++;
        else if (result.classification === "partiallyViolating") partiallyViolatingCount++;
        else violatingCount++;
      }
    }

    return { conformingCount, partiallyViolatingCount, violatingCount };
  }, [violationLogResults]);

  return (
    <ResultsWindow $traceSelected={selectedTrace !== null}>
      <ResultsHeader>
        <FlexBox direction="column" $justify="start">
          <div>{logName}</div>
          <FlexBox direction="row" $justify="space-between">
            <ResultContainer title="Conforming">
              {conformingCount}
              <BiCheck style={{ backgroundColor: "green" }} />
            </ResultContainer>
            <ResultContainer title="Partially Violating">
              {partiallyViolatingCount}
              <PartialViolationIcon />
            </ResultContainer>
            <ResultContainer title="Violating">
              {violatingCount}
              <BiX style={{ backgroundColor: "red" }} />
            </ResultContainer>
            {aggregatedViolationLogResults && (
              <>
                <ResultContainer title="Total Structural Violations">
                  {aggregatedViolationLogResults.totalViolations - aggregatedViolationLogResults.totalTimeViolations}
                  <RelationViolationIcon />
                </ResultContainer>
                {hasTimeConstraints && (
                  <ResultContainer title="Total Temporal Violations">
                    {aggregatedViolationLogResults.totalTimeViolations}
                    <BiTime style={{ color: "goldenrod" }} />
                  </ResultContainer>
                )}
              </>
            )}
          </FlexBox>
        </FlexBox>
      </ResultsHeader>
      <Form submitText="Check!" submit={onCheck} />
      <ul>
        {violationLogResults.map(({ traceName, traceId, results, count, frequency, classification, subTraces }) => {
          const hasSubTraces = !!subTraces?.length;
          const isExpanded =
            expandedVariantId === traceId ||
            (hasSubTraces && subTraces!.some((st) => st.traceId === selectedTrace?.traceId));

          return (
            <Fragment key={traceId}>
              <ResultsElement
                $selected={!hasSubTraces && selectedTrace !== null && selectedTrace.traceId === traceId}
                onClick={() => {
                  if (hasSubTraces) {
                    setExpandedVariantId(isExpanded ? null : traceId);
                  } else {
                    setSelectedTraceId(traceId);
                  }
                }}
              >
                <Label>
                  {hasSubTraces && (
                    isExpanded
                      ? <BiChevronDown style={{ verticalAlign: "middle", marginRight: "0.25rem" }} />
                      : <BiChevronRight style={{ verticalAlign: "middle", marginRight: "0.25rem" }} />
                  )}
                  {traceName || traceId} {`(${count} occurrences)`}{" "}
                  {frequency ? `(${(frequency * 100).toFixed(2)}%)` : ""}
                </Label>
                {!hasSubTraces && (
                  <ResultContainer title={classification === "conforming" ? "Conforming" : classification === "partiallyViolating" ? "Partially Violating" : "Violating"}>
                    {classificationIcon(classification)}
                  </ResultContainer>
                )}
                <ResultContainer title="Structural Violations">
                  {(results?.totalViolations ?? 0) - (results?.totalTimeViolations ?? 0)}
                  <RelationViolationIcon />
                </ResultContainer>
                {hasTimeConstraints && (
                  <ResultContainer title="Temporal Violations">
                    {results?.totalTimeViolations ?? 0}
                    <BiTime style={{ color: results?.totalTimeViolations ? "goldenrod" : "grey" }} />
                  </ResultContainer>
                )}
              </ResultsElement>
              {hasSubTraces && isExpanded &&
                subTraces!.map((st) => {
                  const structViol = (st.results?.totalViolations ?? 0) - (st.results?.totalTimeViolations ?? 0);
                  return (
                    <ResultsElement
                      $selected={selectedTrace?.traceId === st.traceId}
                      key={st.traceId}
                      onClick={() => setSelectedTraceId(st.traceId)}
                      style={{ paddingLeft: "2.5rem" }}
                    >
                      <Label>{st.traceName || st.traceId}</Label>
                      <ResultContainer title={st.classification === "conforming" ? "Conforming" : st.classification === "partiallyViolating" ? "Partially Violating" : "Violating"}>
                        {classificationIcon(st.classification)}
                      </ResultContainer>
                      <ResultContainer title="Structural Violations">
                        {structViol}
                        <RelationViolationIcon />
                      </ResultContainer>
                      {hasTimeConstraints && (
                        <ResultContainer title="Temporal Violations">
                          {st.results?.totalTimeViolations ?? 0}
                          <BiTime style={{ color: st.results?.totalTimeViolations ? "goldenrod" : "grey" }} />
                        </ResultContainer>
                      )}
                    </ResultsElement>
                  );
                })}
            </Fragment>
          );
        })}
      </ul>
    </ResultsWindow>
  );
};

export default HeatmapResults;
