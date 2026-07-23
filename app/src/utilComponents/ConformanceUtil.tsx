import { BiX } from "react-icons/bi";
import styled from "styled-components";

export const RelationViolationIcon = ({ title, style }: { title?: string; style?: React.CSSProperties }) => (
  <svg
    viewBox="0 0 24 24"
    width="1em"
    height="1em"
    style={{ display: "inline-block", flexShrink: 0, verticalAlign: "middle", ...style }}
    aria-label={title}
  >
    <circle cx="12" cy="12" r="10" fill="none" stroke="red" strokeWidth="2" />
    <g transform="translate(6,6) scale(0.5)">
      <path fill="red" d="M16.949 14.121 19.071 12a5.008 5.008 0 0 0 0-7.071 5.006 5.006 0 0 0-7.071 0l-.707.707 1.414 1.414.707-.707a3.007 3.007 0 0 1 4.243 0 3.005 3.005 0 0 1 0 4.243l-2.122 2.121a2.723 2.723 0 0 1-.844.57L13.414 12l1.414-1.414-.707-.707a4.965 4.965 0 0 0-3.535-1.465c-.235 0-.464.032-.691.066L3.707 2.293 2.293 3.707l18 18 1.414-1.414-5.536-5.536c.277-.184.538-.396.778-.636zm-6.363 3.536a3.007 3.007 0 0 1-4.243 0 3.005 3.005 0 0 1 0-4.243l1.476-1.475-1.414-1.414L4.929 12a5.008 5.008 0 0 0 0 7.071 4.983 4.983 0 0 0 3.535 1.462A4.982 4.982 0 0 0 12 19.071l.707-.707-1.414-1.414-.707.707z" />
    </g>
  </svg>
);

export const PartialViolationIcon = ({ title, style }: { title?: string; style?: React.CSSProperties }) => (
  <svg
    viewBox="0 0 24 24"
    width="1.3em"
    height="1.3em"
    style={{ display: "inline-block", flexShrink: 0, verticalAlign: "middle", ...style }}
    aria-label={title}
  >
    <circle cx="12" cy="12" r="10" fill="none" stroke="#fea00f" strokeWidth="2" />
    <text x="12" y="15" textAnchor="middle" fontSize="7.5" fill="#fea00f" fontFamily="sans-serif" fontWeight="bold">%×</text>
  </svg>
);

export const ResultsWindow = styled.div<{ $traceSelected: boolean }>`
  position: fixed;
  top: 0;
  left: 0;
  height: 100vh;
  width: 30rem;
  box-shadow: ${(props) =>
    props.$traceSelected ? "none" : "0px 0px 5px 0px grey"};
  display: flex;
  flex-direction: column;
  padding-top: 1rem;
  padding-bottom: 1rem;
  font-size: 20px;
  background-color: white;
  box-sizing: border-box;
  overflow: scroll;
  z-index: 5;
`;

export const ResultsElement = styled.li<{ $selected: boolean }>`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  width: 100%;
  padding: 0.5rem 1rem 0.5rem 1rem;
  cursor: pointer;
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

export const ResultsHeader = styled.h1`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  font-size: 30px;
  font-weight: normal;
  margin: 1rem;
`;

export const CloseResults = styled(BiX)`
  display: block;
  height: 30px;
  width: 30px;
  margin: auto;
  margin-left: 1rem;
  margin-right: 0;
  cursor: pointer;
  &:hover {
    color: gainsboro;
  }
`;
