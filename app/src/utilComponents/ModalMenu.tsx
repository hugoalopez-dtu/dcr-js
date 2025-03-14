import styled from "styled-components";

import { BiMenu } from "react-icons/bi";
import React from "react";


const MenuIcon = styled(BiMenu) <{ open: boolean; }>`
    border-radius: 50%;
    padding: 5px;
    font-size: 30px;
    height: 30px;
    width: 30px;
    color: ${props => props.open ? "White" : "Black"};
    background-color: ${props => props.open ? "Black" : "White"};
    cursor: pointer;
`

const Menu = styled.div`
    position: fixed;
    top: 0;
    right: 0;
    height: 100vh;
    width: 30rem;
    box-shadow: 0px 0px 5px 0px grey;
    display: flex;
    flex-direction: column;
    padding-top: 5rem;
    padding-bottom: 5rem;
    font-size: 20px;
    background-color: white;
    justify-content: space-between;
    box-sizing: border-box;
    overflow: scroll;
`

const MenuItem = styled.li`
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    padding: 1rem;
    cursor: pointer;
    &:hover {
        color: white;
        background-color: Gainsboro;
    }
    & > svg {
        font-size: 25px;
    }
`

const CustomMenuItem = styled.li`
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    cursor: pointer;
    & > svg {
        font-size: 25px;
    }
`

type RegularModalMenuElement = {
    icon: React.JSX.Element,
    text: string,
    onClick: () => void
}

type CustomModelMenuElement = {
    element: React.JSX.Element,
}

export type ModalMenuElement = RegularModalMenuElement | CustomModelMenuElement;

interface ModalMenuProps {
    elements: Array<ModalMenuElement>,
    bottomElements?: Array<ModalMenuElement>,
    open: boolean,
    setOpen: (val: boolean) => void
}

const isRegularElement = (obj: unknown): obj is RegularModalMenuElement => {
    return ((obj as RegularModalMenuElement).icon) !== undefined;
}

// Renders a modal menu that toggles in the top right corner.
// Elements can either be objects with an icon, a description, and an onClick handler, or they can be a concrete element.
// If the Element is custom, styling is your own job!!!
const ModalMenu = ({ elements, bottomElements, open, setOpen }: ModalMenuProps) => {


    const renderElement = (element: ModalMenuElement, idx: number) => {
        if (isRegularElement(element)) {
            const { icon, text, onClick } = element;
            return (
                <MenuItem key={idx} onClick={onClick}>
                    <>{icon}</>
                    <>{text}</>
                </MenuItem>
            )
        } else {
            return (
                <CustomMenuItem key={idx} >
                    {element.element}
                </CustomMenuItem>
            )
        }
    }

    return (
        <>
            {open ?
                <Menu>
                    <ul>
                        {elements.map((element, idx) => renderElement(element, idx))}
                    </ul>
                    {bottomElements && <ul>
                        {bottomElements.map((element, idx) => renderElement(element, idx + elements.length))}
                    </ul>}
                </Menu> : null}
            <MenuIcon onClick={() => setOpen(!open)} open={open} />
        </>
    )
}

export default ModalMenu;