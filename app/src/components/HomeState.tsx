import styled from "styled-components";
import { StateEnum, StateProps } from "../App";
import FlexBox from "../utilComponents/FlexBox";

const Header = styled.h1`
    font-size: 100px;
    text-align: center;
`

const ImgContainer = styled.div`
    display: flex;
    flex-direction: column;
    border-radius: 50%;
    width: 30rem;
    height: 30rem;
    color: white;
    cursor: pointer;
    &:hover {
        background-color: black;
    }
`

const Img = styled.img`
    width: 20rem;
    height: 20rem;
    background-color: gainsboro;
    border-radius: 50%;
    margin: auto;
`

const ImgLabel = styled.label`
    text-align: center;
    font-size: 40px;
    margin-top: 1rem;
`

// Logos from https://www.svgrepo.com/collection/education-sephia-filled-icons/
const HomeState = ({ setState }: StateProps) => {
    return (
        <>
            <Header>DCR-JS</Header>
            <FlexBox direction="row" $justify="space-around">
                <ImgContainer onClick={() => setState(StateEnum.Modeler)}>
                    <ImgLabel><br/>Modeling</ImgLabel>
                    <Img src="icons/modeling.svg" />
                </ImgContainer>
                <ImgContainer onClick={() => setState(StateEnum.Simulator)}>
                    <ImgLabel><br/>Simulation</ImgLabel>
                    <Img src="icons/simulation.svg" />
                </ImgContainer>
                <ImgContainer onClick={() => setState(StateEnum.Conformance)}>
                    <ImgLabel>Conformance <br/> Checking</ImgLabel>
                    <Img src="icons/conformance.svg" />
                </ImgContainer>
            </FlexBox>
        </>
    )
}

export default HomeState