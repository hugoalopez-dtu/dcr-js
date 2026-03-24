import { useMemo } from "react";
import type { EmptyLogResults } from "../types";
import Label from "../utilComponents/Label";
import {
  ResultsElement,
  ResultsHeader,
  ResultsWindow,
} from "../utilComponents/ConformanceUtil";
import FlexBox from "../utilComponents/FlexBox";
import Form from "../utilComponents/Form";

interface EmptyResultsProps {
  logName: string;
  emptyLogResults: EmptyLogResults;
  selectedTrace: EmptyLogResults[number] | null;
  setSelectedTraceId: React.Dispatch<React.SetStateAction<string | null>>;
  onCheck: () => void;
}

const EmptyResults = ({
  logName,
  emptyLogResults,
  selectedTrace,
  setSelectedTraceId,
  onCheck,
}: EmptyResultsProps) => {
  const { traceCount, traceVariantsCount } = useMemo(() => {
    return {
      traceCount: emptyLogResults.reduce((acc, result) => {
        return acc + result.count;
      }, 0),
      traceVariantsCount: emptyLogResults.length,
    };
  }, [emptyLogResults]);

  return (
    <ResultsWindow $traceSelected={selectedTrace !== null}>
      <ResultsHeader>
        <FlexBox direction="column" $justify="start">
          <div>{logName}</div>
          <p>{`${traceCount} traces | ${traceVariantsCount} trace variants`}</p>
        </FlexBox>
      </ResultsHeader>
      <Form submitText="Check!" submit={onCheck} />
      <ul>
        {emptyLogResults.map(({ traceName, traceId, count, frequency }) => (
          <ResultsElement
            $selected={selectedTrace?.traceId === traceId}
            key={traceId}
            onClick={() => setSelectedTraceId(traceId)}
          >
            <Label>
              {traceName || traceId} {`(${count} occurrences)`}{" "}
              {frequency ? `(${(frequency * 100).toFixed(2)}%)` : ""}
            </Label>
          </ResultsElement>
        ))}
      </ul>
    </ResultsWindow>
  );
};

export default EmptyResults;
