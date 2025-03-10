import styled from "styled-components";
import { StateEnum, StateProps } from "../App";
import Button from "../utilComponents/Button";
import FlexBox from "../utilComponents/FlexBox";

const Header = styled.h1`
    font-size: 100px;
    text-align: center;
`

const ImgContainer = styled.div`
    display: flex;
    flex-direction: column;
    border-radius: 50%;
    width: 30em;
    height: 30em;
    color: white;
    cursor: pointer;
    &:hover {
        background-color: black;
    }
`

const Img = styled.img`
    width: 20em;
    height: 20em;
    background-color: gainsboro;
    border-radius: 50%;
    margin: auto;
`

const ImgLabel = styled.label`
    text-align: center;
    font-size: 40px;
    margin-top: 1em;
`

const HomeState = ({ setState, savedGraphs, setSavedGraphs }: StateProps) => {
    return (
        <>
        <Header>DCR-JS</Header>
        <FlexBox direction="row" $justify="space-around">
            <ImgContainer onClick={() => setState(StateEnum.Modeler)}>
                <ImgLabel>Modeling</ImgLabel>
                <Img src="icons/modeling.svg" />
            </ImgContainer>
            <ImgContainer onClick={() => setState(StateEnum.Simulation)}>
                <ImgLabel>Simulation</ImgLabel>
                <Img src="icons/simulation.svg" />
            </ImgContainer>
        </FlexBox>
        </>
    )
}

export default HomeState