import { BiX } from "react-icons/bi";
import styled from "styled-components";
import { Children } from "../types";

const Background = styled.div`
    position: absolute;
    width: 100%;
    height: 100%;
    top: 0;
    left: 0;
    opacity: 0.5;
    background-color: black;
`

const Window = styled.div`
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background-color: white;
    opacity: 1;
    box-sizing: border-box;
`

const CloseIcon = styled(BiX)`
    position: absolute;
    top: 0;
    right: 0;
    margin: 1rem;
    font-size: 30px;
    color: grey;
    cursor: pointer;
    &:hover {
        color: black
    }
`

interface PopupProps {
    close: () => void;
    children: Children;
}

const Popup = ({ close, children }: PopupProps) => {
    return (
        <>
            <Background />
            <Window>
                <CloseIcon onClick={close} />
                {children}
            </Window>
        </>
    )
}

export default Popup;