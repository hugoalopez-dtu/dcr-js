import styled from "styled-components";

import { BiMenu, BiSolidDownArrow, BiSolidRightArrow } from "react-icons/bi";
import React, { useState } from "react";


const MenuIcon = styled(BiMenu) <{ open: boolean; }>`
    border-radius: 50%;
    padding: 5px;
    font-size: 30px;
    height: 30px;
    width: 30px;
    color: ${props => props.open ? "White" : "Black"};
    background-color: ${props => props.open ? "Black !important" : "White"};
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

const MenuItem = styled.li <{ $isOpen?: boolean }>`
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    padding: 1rem;
    cursor: pointer;
    & > svg {
        font-size: 25px;
    }
    ${props => props.$isOpen ? `
        background-color: #e6e6e6;
        &:hover {
            color: white;
            background-color: Gainsboro;
        }    
    ` : `
        &:hover {
            color: white;
            background-color: Gainsboro;
        }    
    `}
`

const CustomMenuItem = styled.li`
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    cursor: pointer;
    box-sizing: border-box;
    & > svg {
        font-size: 25px;
    }
`

const Divider = styled.div`
    margin: 5px;
    margin-left: auto;
    margin-right: auto;
    border-bottom: 1px solid grey;
    width: 50%;
`

type RegularModalMenuElement = {
    icon: React.JSX.Element,
    text: string,
    onClick: () => void
}

type CustomModalMenuElement = {
    customElement: React.JSX.Element,
}

type ExpandingModalMenuElement = {
    text: string,
    elements: Array<ModalMenuElement>
}

export type ModalMenuElement = RegularModalMenuElement | CustomModalMenuElement | ExpandingModalMenuElement;

interface ModalMenuProps {
    elements: Array<ModalMenuElement>,
    bottomElements?: Array<ModalMenuElement>,
    open: boolean,
    setOpen: (val: boolean) => void
}

const isRegularElement = (obj: unknown): obj is RegularModalMenuElement => {
    return ((obj as RegularModalMenuElement).icon) !== undefined;
}

const isExpandingElement = (obj: unknown): obj is ExpandingModalMenuElement => {
    return ((obj as ExpandingModalMenuElement).elements !== undefined)
}

const isCustomElement = (obj: unknown): obj is CustomModalMenuElement => {
    return ((obj as CustomModalMenuElement).customElement !== undefined)
}

// Renders a modal menu that toggles in the top right corner.
// Elements can either be objects with an icon, a description, and an onClick handler, or they can be a concrete element.
// If the Element is custom, styling is your own job!!!
let id = 0;

const ModalMenu = ({ elements, bottomElements, open, setOpen }: ModalMenuProps) => {
    const [openElements, setOpenElements] = useState<Set<string>>(new Set());

    const clickExpanding = (elementId: string) => {
        if (openElements.has(elementId)) {
            const copy = new Set(openElements);
            copy.delete(elementId);
            setOpenElements(copy);
        } else {
            const copy = new Set(openElements);
            copy.add(elementId);
            setOpenElements(copy)
        }
    }

    const renderElement = (element: ModalMenuElement) => {
        if (isRegularElement(element)) {
            const { icon, text, onClick } = element;
            return (
                <MenuItem key={"Modal" + id++} onClick={onClick}>
                    <>{icon}</>
                    <>{text}</>
                </MenuItem>
            )
        } else if (isExpandingElement(element)) {
            const { text, elements } = element;
            const isOpen = openElements.has(text);
            return (
                <>
                    <MenuItem $isOpen={isOpen} key={"Modal" + id++} onClick={() => clickExpanding(text)}>
                        {isOpen ? <BiSolidDownArrow /> : <BiSolidRightArrow />}
                        <>{text}</>
                    </MenuItem>
                    {isOpen ? <li key={"Modal" + id++}>
                        <ul>
                            {elements.map((element) => renderElement(element))}
                        </ul>
                        <Divider key={"Modal" + id++} />
                    </li> : null}
                </>
            )
        } else if (isCustomElement(element)) {
            return (
                <CustomMenuItem key={"Modal" + id++} >
                    {element.customElement}
                </CustomMenuItem>
            )
        }
    }

    return (
        <>
            {open ?
                <Menu>
                    <ul>
                        {elements.map((element) => renderElement(element))}
                    </ul>
                    {bottomElements && <ul>
                        {bottomElements.map((element) => renderElement(element))}
                    </ul>}
                </Menu> : null}
            <MenuIcon onClick={() => setOpen(!open)} open={open} />
        </>
    )
}

export default ModalMenu;