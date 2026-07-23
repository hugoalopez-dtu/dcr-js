import { Fragment, useMemo, useState } from "react";
import { BiCheck, BiChevronDown, BiChevronRight, BiQuestionMark, BiX } from "react-icons/bi";
import type { ReplayLogResults, TraceClassification } from "../types";
import Label from "../utilComponents/Label";
import {
  PartialViolationIcon,
  ResultsElement,
  ResultsHeader,
  ResultsWindow,
} from "../utilComponents/ConformanceUtil";
import FlexBox from "../utilComponents/FlexBox";
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

interface ReplayResultsProps {
  logName: string;
  replayLogResults: ReplayLogResults;
  selectedTrace: ReplayLogResults[number] | null;
  setSelectedTraceId: React.Dispatch<React.SetStateAction<string | null>>;
  onCheck: () => void;
}

const ReplayResults = ({
  logName,
  replayLogResults,
  selectedTrace,
  setSelectedTraceId,
  onCheck,
}: ReplayResultsProps) => {
  const [expandedVariantId, setExpandedVariantId] = useState<string | null>(null);

  const { conformingCount, partiallyViolatingCount, violatingCount } = useMemo(() => {
    let conformingCount = 0;
    let partiallyViolatingCount = 0;
    let violatingCount = 0;

    for (const result of replayLogResults) {
      if (result.classification === "conforming") conformingCount++;
      else if (result.classification === "partiallyViolating") partiallyViolatingCount++;
      else violatingCount++;
    }

    return { conformingCount, partiallyViolatingCount, violatingCount };
  }, [replayLogResults]);

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
          </FlexBox>
        </FlexBox>
      </ResultsHeader>
      <Form submitText="Check!" submit={onCheck} />
      <ul>
        {replayLogResults.map(
          ({ traceName, traceId, classification, count, frequency, subTraces }) => {
            const hasSubTraces = !!subTraces?.length;
            const isExpanded =
              expandedVariantId === traceId ||
              (hasSubTraces && subTraces!.some((st) => st.traceId === selectedTrace?.traceId));

            return (
              <Fragment key={traceId}>
                <ResultsElement
                  $selected={!hasSubTraces && selectedTrace?.traceId === traceId}
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
                  {classificationIcon(classification)}
                </ResultsElement>
                {hasSubTraces && isExpanded &&
                  subTraces!.map((st) => (
                    <ResultsElement
                      $selected={selectedTrace?.traceId === st.traceId}
                      key={st.traceId}
                      onClick={() => setSelectedTraceId(st.traceId)}
                      style={{ paddingLeft: "2.5rem" }}
                    >
                      <Label>{st.traceName || st.traceId}</Label>
                      {classificationIcon(st.classification)}
                    </ResultsElement>
                  ))}
              </Fragment>
            );
          },
        )}
      </ul>
    </ResultsWindow>
  );
};

export default ReplayResults;
