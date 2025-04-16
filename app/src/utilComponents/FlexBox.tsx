import styled from "styled-components";

const FlexBox = styled.div<{ direction?: "column" | "row"; $justify: string }>`
    display: flex;
    flex-direction: ${props => props.direction ? props.direction : ""};
    justify-content: ${props => props.$justify ? props.$justify : ""};
    flex-wrap: wrap;
`

export default FlexBox;