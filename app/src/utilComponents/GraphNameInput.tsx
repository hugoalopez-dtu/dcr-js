import styled from "styled-components";

const GraphNameInput = styled.input`
  position: fixed;
  top: 0;
  left: 50%;
  text-align: center;
  z-index: 5;
  margin-top: 0.5rem;
  transform: translateX(-50%);
  font-size: 30px;
  width: fit-content;
  background: transparent;
  appearance: none;
  border: none;
  &:focus {
    outline: 2px dashed black;
  }
`

export default GraphNameInput;