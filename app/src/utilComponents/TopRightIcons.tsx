import styled from "styled-components";
import { Children } from "../types";

interface TopRightIconProps {
    children: Children;
}

const Container = styled.div`
    position: absolute;
    top: 0;
    right: 0;
    overflow: hidden;
    display: flex;
    & > svg {
        margin: 0.5em;
        z-index: 1000;
        border: 2px solid black;
        border-radius: 50%;
        padding: 5px;
        font-size: 30px;
        height: 30px;
        width: 30px;
        cursor: pointer;
        &:hover {
          box-shadow: 0px 0px 5px 0px grey;
        }
    }
`

const TopRightIcons = ({ children }: TopRightIconProps) => {


    return (
        <Container>
            {children}
        </Container>
    )
}

export default TopRightIcons;