import styled from "styled-components";

import { BiMenu } from "react-icons/bi";
import React, { useState } from "react";
import { IconType } from "react-icons";


const MenuIcon = styled(BiMenu)<{ open: boolean; }>`
    position: fixed;
    top: 0;
    right: 0;
    overflow: hidden;
    margin-top: 1em;
    margin-right: 1em;
    border: 2px solid ${props => props.open ? "White" : "Black"};
    border-radius: 50%;
    padding: 5px;
    font-size: 30px;
    height: 30px;
    width: 30px;
    color: ${props => props.open ? "White" : "Black"};
    background-color: ${props => props.open ? "Black" : "White"};
    cursor: pointer;
`

const Menu = styled.ul`
    position: fixed;
    top: 0;
    right: 0;
    height: 100%;
    width: 18em;
    border-left: 2px solid Black;
    display: flex;
    flex-direction: column;
    padding-top: 5em;
    font-size: 20px;
`

const MenuItem = styled.li`
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    padding: 1em;
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
    &:hover {
        color: white;
        background-color: Gainsboro;
    }
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
    elements: Array<ModalMenuElement>
}

const isRegularElement = (obj: unknown): obj is RegularModalMenuElement => {
    return ((obj as RegularModalMenuElement).icon) !== undefined;
}

// Renders a modal menu that toggles in the top right corner.
// Elements can either be objects with an icon, a description, and an onClick handler, or they can be a concrete element.
// If the Element is custom, styling is your own job!!!
const ModalMenu = ({ elements }: ModalMenuProps) => {
    const [open, setOpen] = useState(false);
    
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
                <CustomMenuItem key={idx}>
                    {element.element}
                </CustomMenuItem>
            )
        }
    }
    
    return (
        <>
            {open ? 
                <Menu>
                    {elements.map( (element, idx) => renderElement(element, idx))}
                </Menu> : null}
            <MenuIcon onClick={()=> setOpen(!open)} open={open} />
        </>
    )
}

 export default ModalMenu;