import { useState } from "react";
import { BiCheck, BiErrorCircle, BiQuestionMark, BiReset, BiX } from "react-icons/bi";
import styled from "styled-components";
import type { RoleTrace } from "dcr-engine/src/types";
import type { TraceClassification } from "../types";
import { PartialViolationIcon } from "./ConformanceUtil";

const TraceWindow = styled.div<{ $hugLeft: boolean }>`
  position: fixed;
  top: 0;
  left: ${(props) => (props.$hugLeft ? "0rem" : "30rem")};
  height: 100vh;
  box-shadow: 0px 0 5px 0px grey;
  display: flex;
  flex-direction: column;
  padding-top: 2rem;
  padding-bottom: 2rem;
  font-size: 20px;
  background-color: gainsboro;
  box-sizing: border-box;
  overflow: scroll;
  z-index: 4;
`;

const ResultsHeader = styled.h1`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  font-size: 30px;
  font-weight: normal;
  padding: 0.5rem 1rem 0.5rem 1rem;
  margin: 0;
`;

const CloseTrace = styled(BiX)`
  display: block;
  height: 30px;
  width: 30px;
  margin: auto;
  margin-left: 1rem;
  margin-right: 1rem;
  cursor: pointer;
  color: black;
  &:hover {
    color: white;
  }
`;

const ResetTrace = styled(BiReset)`
  display: block;
  height: 30px;
  width: 30px;
  margin: auto;
  margin-left: 1rem;
  margin-right: 1rem;
  cursor: pointer;
  color: black;
  &:hover {
    color: white;
  }
`;

const TraceNameInput = styled.input`
  font-size: 20px;
  width: fit-content;
  background: transparent;
  appearance: none;
  border: none;
  margin-bottom: 0.5rem;
  padding: 0.25rem 0.5rem 0.25rem 0.5rem;
  margin: 0.25rem 0.5rem 0.25rem 0.5rem;
  &:focus {
    outline: 2px dashed black;
  }
`;

const GreenCheck = styled(BiCheck)`
  display: block;
  color: white;
  border-radius: 50%;
  margin: auto;
  margin-right: 1rem;
  margin-left: 1rem;
  background-color: green;
`;

const RedX = styled(BiX)`
  display: block;
  color: white;
  border-radius: 50%;
  margin: auto;
  margin-right: 1rem;
  margin-left: 1rem;
  background-color: red;
`;

const OrangeQuestion = styled(BiQuestionMark)`
  display: block;
  color: white;
  border-radius: 50%;
  margin: auto;
  margin-right: 1rem;
  margin-left: 1rem;
  background-color: orange;
`;

const NotAllowedIcon = styled(BiErrorCircle)`
  display: inline-block;
  vertical-align: middle;
  color: #f39c12;
  margin-left: 0.4em;
  font-size: 0.9em;
`;

const Activity = styled.li<{ $color?: "green" | "red" | "yellow" }>`
  width: 100%;
  padding: 0.5rem 1rem 0.5rem 1rem;
  box-sizing: border-box;
  background-color: ${({ $color }) =>
    $color === "red" ? "#ffe0e0" :
    $color === "yellow" ? "#fff8d0" :
    $color === "green" ? "#e0f5e0" :
    "transparent"};
`;

const ClockMarker = styled.li`
  width: 100%;
  padding: 0.35rem 1rem 0.35rem 1rem;
  box-sizing: border-box;
  font-style: italic;
  font-size: 0.85em;
  color: #555;
  text-align: center;
`;

const resultIcon = (val: boolean | undefined) => {
  switch (val) {
    case undefined:
      return <OrangeQuestion title="free trace" />;
    case true:
      return <GreenCheck title="accepting" />;
    case false:
      return <RedX title="not accepting" />;
  }
};

const classificationIcon = (c: TraceClassification) => {
  switch (c) {
    case "conforming":
      return <GreenCheck title="Conforming" />;
    case "partiallyViolating":
      return (
        <PartialViolationIcon
          title="Partially Violating"
          style={{ display: "block", margin: "auto", marginLeft: "1rem", marginRight: "1rem", width: "1em", height: "1em" }}
        />
      );
    case "violating":
      return <RedX title="Violating" />;
  }
};

interface TraceViewProps {
  selectedTrace: {
    traceId: string;
    traceName?: string;
    trace: RoleTrace;
    isPositive?: boolean;
    classification?: TraceClassification;
    clockAdvancements?: Array<{ afterEventCount: number; timestamp: Date }>;
    executionCompliance?: Array<{
      deadline?: { time: Date; met: boolean };
      delay?: { time: Date; met: boolean };
      allowed: boolean;
    } | undefined>;
  };
  setSelectedTraceId: React.Dispatch<React.SetStateAction<string | null>>;
  onResetTrace?: () => void;
  onEditTrace?: (newName: string) => void;
  onCloseCallback?: () => void;
  hugLeft?: boolean;
  children?: React.ReactNode;
  stepViolations?: number[];
  stepTimeViolations?: number[];
  showDataFields?: boolean;
}

const TraceView = ({
  selectedTrace,
  setSelectedTraceId,
  onResetTrace,
  onEditTrace,
  onCloseCallback,
  hugLeft,
  children,
  stepViolations,
  stepTimeViolations,
  showDataFields = true,
}: TraceViewProps) => {
  const [traceName, setTraceName] = useState(
    selectedTrace.traceName || selectedTrace.traceId,
  );

  return (
    <TraceWindow $hugLeft={!!hugLeft}>
      <ResultsHeader>
        {onEditTrace ? (
          <TraceNameInput
            value={traceName}
            onChange={(e) => setTraceName(e.target.value)}
            onBlur={() => {
              onEditTrace(traceName);
            }}
          />
        ) : (
          traceName
        )}
        {selectedTrace.classification
          ? classificationIcon(selectedTrace.classification)
          : "isPositive" in selectedTrace
          ? resultIcon(selectedTrace.isPositive)
          : null}
        {onResetTrace && <ResetTrace onClick={onResetTrace} />}
        <CloseTrace
          onClick={() => {
            if (onCloseCallback) {
              onCloseCallback();
            }
            setSelectedTraceId(null);
          }}
        />
      </ResultsHeader>
      <ul>
        {(() => {
          const clockAdvancements = selectedTrace.clockAdvancements ?? [];
          const advancementsAt = (afterEventCount: number) =>
            clockAdvancements.filter((a) => a.afterEventCount === afterEventCount);
          const clockMarker = (timestamp: Date, key: string) => (
            <ClockMarker key={key}>
              ⏱ Clock advanced to{" "}
              {timestamp.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
            </ClockMarker>
          );
          const items: React.ReactNode[] = [];
          advancementsAt(0).forEach((a, i) => items.push(clockMarker(a.timestamp, `clock-0-${i}`)));
          selectedTrace.trace.forEach((event, idx) => {
            const sv = stepViolations?.[idx];
            const stv = stepTimeViolations?.[idx];
            const color = stepViolations === undefined ? undefined
              : (sv !== undefined && sv - (stv ?? 0) > 0) ? "red"
              : (stv !== undefined && stv > 0) ? "yellow"
              : "green";
            const compliance = selectedTrace.executionCompliance?.[idx];
            items.push(
              <Activity key={event.activity + event.role + idx} $color={color}>
                <div>
                  {event.role !== ""
                    ? event.role + ": " + event.activity
                    : event.activity}
                  {compliance?.allowed === false && (
                    <NotAllowedIcon title="Executed while not allowed by the model" />
                  )}
                  {compliance?.deadline && (
                    <span style={{ fontSize: "0.75em", marginLeft: "0.5em", color: compliance.deadline.met ? "#27ae60" : "#c0392b" }}>
                      Deadline: {compliance.deadline.time.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                  {compliance?.delay && (
                    <span style={{ fontSize: "0.75em", marginLeft: "0.5em", color: compliance.delay.met ? "#27ae60" : "#c0392b" }}>
                      Delay: {compliance.delay.time.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                </div>
                {showDataFields && (event.timestamp || (event.varName !== undefined && event.value !== undefined)) && (
                  <div>
                    {event.timestamp && (
                      <span style={{ fontSize: "0.75em", color: "#555" }}>
                        {event.timestamp.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                    {event.varName !== undefined && event.value !== undefined && (
                      <span style={{ fontSize: "0.75em", color: "#555", marginLeft: event.timestamp ? "0.5em" : undefined }}>
                        ({event.varName} = {String(event.value)})
                      </span>
                    )}
                  </div>
                )}
              </Activity>,
            );
            advancementsAt(idx + 1).forEach((a, i) => items.push(clockMarker(a.timestamp, `clock-${idx + 1}-${i}`)));
          });
          return items;
        })()}
      </ul>
      {children}
    </TraceWindow>
  );
};

export default TraceView;
