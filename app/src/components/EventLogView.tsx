import styled from "styled-components";
import FlexBox from "../utilComponents/FlexBox";
import React from "react";
import { BiTrash } from "react-icons/bi";
import type { RoleTrace } from "dcr-engine/src/types";
import { ResultsWindow } from "../utilComponents/ConformanceUtil";

const EventLogInput = styled.input`
  font-size: 30px;
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

const ResultsElement = styled.li<{ $selected: boolean }>`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  width: 100%;
  padding: 0.5rem 1rem 0.5rem 1rem;
  cursor: "pointer";
  box-sizing: border-box;
  color: ${(props) => (props.$selected ? "white" : "black")};
  background-color: ${(props) => (props.$selected ? "gainsboro" : "white")};

  &:hover {
    color: white;
    background-color: Gainsboro;
  }

  & > svg {
    color: white;
    border-radius: 50%;
  }
`;

const DeleteTrace = styled(BiTrash)`
  display: block;
  height: 20px;
  width: 20px;
  margin: auto;
  margin-left: 0.5rem;
  margin-right: 0.5rem;
  cursor: pointer;
  color: black !important;
  &:hover {
    color: white !important;
  }
`;

type EL = {
  name: string;
  traces: {
    [traceId: string]: { traceId: string; traceName: string; trace: RoleTrace };
  };
};

interface EventLogViewProps {
  children?: React.ReactNode;
  selectedTrace: {
    traceId: string;
    traceName: string;
    trace: RoleTrace;
  } | null;
  setSelectedTraceId: React.Dispatch<React.SetStateAction<string | null>>;
  eventLog: EL;
  onEditLog?: (newName: string) => void;
  onDeleteTrace?: (traceId: string) => void;
}

const EventLogView = ({
  children,
  selectedTrace,
  eventLog,
  setSelectedTraceId,
  onEditLog,
  onDeleteTrace,
}: EventLogViewProps) => {
  return (
    <ResultsWindow $traceSelected={selectedTrace !== null}>
      {onEditLog ? (
        <EventLogInput
          value={eventLog.name}
          onChange={(e) => onEditLog(e.target.value)}
        />
      ) : (
        eventLog.name
      )}
      {Object.values(eventLog.traces).map(({ traceName, traceId }) => (
        <ResultsElement
          $selected={
            selectedTrace !== null && selectedTrace.traceId === traceId
          }
          key={traceId}
          onClick={() => {
            setSelectedTraceId(traceId);
          }}
        >
          {traceName}
          {onDeleteTrace && (
            <DeleteTrace
              onClick={(e) => {
                e.stopPropagation();
                if (
                  confirm(
                    `This will delete the trace '${traceName}'. Are you sure?`
                  )
                ) {
                  onDeleteTrace(traceId);
                }
              }}
            />
          )}
        </ResultsElement>
      ))}
      {children && (
        <FlexBox
          direction="row"
          $justify="space-around"
          style={{ marginTop: "auto" }}
        >
          {children}
        </FlexBox>
      )}
    </ResultsWindow>
  );
};

export default EventLogView;
