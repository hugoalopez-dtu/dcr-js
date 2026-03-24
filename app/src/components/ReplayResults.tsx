import { useMemo } from "react";
import { BiCheck, BiQuestionMark, BiX } from "react-icons/bi";
import type { ReplayLogResults } from "../types";
import Label from "../utilComponents/Label";
import {
  ResultsElement,
  ResultsHeader,
  ResultsWindow,
} from "../utilComponents/ConformanceUtil";
import FlexBox from "../utilComponents/FlexBox";
import ResultContainer from "../utilComponents/ResultContainer";
import Form from "../utilComponents/Form";

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
  const { positiveCount, negativeCount } = useMemo<{
    positiveCount: number;
    negativeCount: number;
  }>(() => {
    let positiveCount = 0;
    let negativeCount = 0;

    for (const result of replayLogResults) {
      if (result.isPositive !== undefined && result.isPositive) {
        positiveCount++;
      } else {
        negativeCount++;
      }
    }

    return { positiveCount, negativeCount };
  }, [replayLogResults]);

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
          </FlexBox>
        </FlexBox>
      </ResultsHeader>
      <Form submitText="Check!" submit={onCheck} />
      <ul>
        {replayLogResults.map(
          ({ traceName, traceId, isPositive, count, frequency }) => (
            <ResultsElement
              $selected={selectedTrace?.traceId === traceId}
              key={traceId}
              onClick={() => setSelectedTraceId(traceId)}
            >
              <Label>
                {traceName || traceId} {`(${count} occurrences)`}{" "}
                {frequency ? `(${(frequency * 100).toFixed(2)}%)` : ""}
              </Label>
              {resultIcon(isPositive)}
            </ResultsElement>
          ),
        )}
      </ul>
    </ResultsWindow>
  );
};

export default ReplayResults;
