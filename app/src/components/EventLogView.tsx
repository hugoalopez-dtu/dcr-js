import styled from "styled-components";
import { Children } from "../types";
import FlexBox from "../utilComponents/FlexBox";
import React from "react";
import { BiTrash } from "react-icons/bi";
import { RoleTrace } from "dcr-engine/src/types";
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
`

const ResultsElement = styled.li<{ $selected: boolean; }>`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  width: 100%;
  padding: 0.5rem 1rem 0.5rem 1rem;
  cursor: "pointer";
  box-sizing: border-box;
  color: ${props => props.$selected ? "white" : "black"};
  background-color: ${props => props.$selected ? "gainsboro" : "white"};

  &:hover {
    color: white;
    background-color: Gainsboro;
  }

  & > svg {
    color: white;
    border-radius: 50%;
  }
`

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
`

type EL = {
    name: string,
    traces: {
        [traceId: string]: { traceId: string, traceName: string, trace: RoleTrace }
    },
}

interface EventLogViewProps {
    children?: Children,
    selectedTrace: { traceId: string, traceName: string, trace: RoleTrace } | null,
    setSelectedTrace: (arg: { trace: RoleTrace, traceName: string, traceId: string } | null) => void,
    eventLog: EL,
    traceRef: React.RefObject<{ trace: RoleTrace, traceId: string } | null>
    editProps?: {
        setTraceName: (name: string) => void
        setEventLog: (log: EL) => void;
    }
}

const EventLogView = ({ children, selectedTrace, eventLog, setSelectedTrace, traceRef, editProps }: EventLogViewProps) => {
    return (
        <ResultsWindow $traceSelected={selectedTrace !== null}>
            {editProps ? <EventLogInput value={eventLog.name} onChange={(e) => editProps.setEventLog({ ...eventLog, name: e.target.value })} /> : eventLog.name}
            {Object.values(eventLog.traces).map(({ trace, traceName, traceId }) =>
                <ResultsElement
                    $selected={selectedTrace !== null && selectedTrace.traceId === traceId}
                    key={traceId}
                    onClick={() => {
                        traceRef.current = { trace, traceId };
                        editProps?.setTraceName && editProps.setTraceName(traceName);
                        setSelectedTrace({ trace, traceName, traceId })
                    }
                    }
                >
                    {traceName}
                    {editProps && <DeleteTrace onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`This will delete the trace '${traceName}'. Are you sure?`)) {
                            const newTraces = { ...eventLog.traces };
                            delete newTraces[traceId];
                            const newEL = { ...eventLog, traces: newTraces };
                            if (traceId === selectedTrace?.traceId) {
                                setSelectedTrace(null);
                            }
                            editProps.setEventLog(newEL);
                        }
                    }} />}
                </ResultsElement>)}
            {children && <FlexBox direction="row" $justify="space-around" style={{ marginTop: "auto" }}>
                {children}
            </FlexBox>}
        </ResultsWindow>)
}

export default EventLogView;