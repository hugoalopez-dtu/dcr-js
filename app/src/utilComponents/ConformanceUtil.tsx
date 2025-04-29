import { BiX } from "react-icons/bi";
import styled from "styled-components";

export const ResultsWindow = styled.div<{ $traceSelected: boolean; }>`
    position: fixed;
    top: 0;
    left: 0;
    height: 100vh;
    width: 30rem;
    box-shadow: ${props => props.$traceSelected ? "none" : "0px 0px 5px 0px grey"};
    display: flex;
    flex-direction: column;
    padding-top: 1rem;
    padding-bottom: 1rem;
    font-size: 20px;
    background-color: white;
    box-sizing: border-box;
    overflow: scroll;
    z-index: 5;
`
export const ResultsElement = styled.li<{ $selected: boolean; }>`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  width: 100%;
  padding: 0.5rem 1rem 0.5rem 1rem;
  cursor: pointer;
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

export const ResultsHeader = styled.h1`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  font-size: 30px;
  font-weight: normal;
  margin: 1rem;
`

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
`