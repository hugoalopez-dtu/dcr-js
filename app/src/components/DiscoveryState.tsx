import { BiHome, BiLeftArrowCircle, BiUpload } from "react-icons/bi";
import FullScreenIcon from "../utilComponents/FullScreenIcon";
import TopRightIcons from "../utilComponents/TopRightIcons";
import ModalMenu, { ModalMenuElement } from "../utilComponents/ModalMenu";
import { StateEnum, StateProps } from "../App";
import { abstractLog, DCRGraphS, layoutGraph, mineFromAbstraction, parseLog } from "dcr-engine";
import StyledFileUpload from "../utilComponents/StyledFileUpload";
import FileUpload from "../utilComponents/FileUpload";
import MenuElement from "../utilComponents/MenuElement";
import Toggle from "../utilComponents/Toggle";
import DropDown from "../utilComponents/DropDown";
import Label from "../utilComponents/Label";
import { isSettingsVal } from "../types";
import Modeler from "./Modeler";
import { toast } from "react-toastify";
import { useRef, useState } from "react";



const DiscoveryState = ({ savedLogs, setState }: StateProps) => {
    const [menuOpen, setMenuOpen] = useState(false);

    const modelerRef = useRef<DCRModeler | null>(null);
    const graphRef = useRef<{ initial: DCRGraphS, current: DCRGraphS } | null>(null);

    const handleLogUpload = async (name: string, data: string) => {
        try {
            if (!modelerRef) return;
            const log = parseLog(data);
            const logAbs = abstractLog(log);
            const graph = mineFromAbstraction(logAbs);
            layoutGraph(graph).then(xml => {
                modelerRef.current?.importXML(xml);
            }).catch(e => {
                console.log(e);
                toast.error("Unable to layout graph...")
            });

        } catch (e) {
            console.log(e);
            toast.error("Cannot parse log...");
        }
    }

    const savedLogElements = () => {
        return Object.keys(savedLogs).length > 0 ? [{
            text: "Saved Logs:",
            elements: Object.keys(savedLogs).map(name => {
                return ({
                    icon: <BiLeftArrowCircle />,
                    text: name,
                    onClick: () => {
                        setMenuOpen(false);
                    },
                })
            })
        }] : [];
    }

    const menuElements: Array<ModalMenuElement> = [{
        customElement: (
            <StyledFileUpload>
                <FileUpload accept=".xes" fileCallback={(name, contents) => { handleLogUpload(name, contents); setMenuOpen(false); }}>
                    <BiUpload />
                    <>Upload Log</>
                </FileUpload>
            </StyledFileUpload>),
    },
    ...savedLogElements(),
    ];

    const bottomElements: Array<ModalMenuElement> = [
        {
            customElement:
                <MenuElement>
                    <Toggle initChecked={true} onChange={(e) => modelerRef.current?.setSetting("blackRelations", !e.target.checked)} />
                    <Label>Coloured Relations</Label>
                </MenuElement>
        },
        {
            customElement:
                <MenuElement>
                    <DropDown
                        options={[{ title: "TAL2023", value: "TAL2023", tooltip: "https://link.springer.com/chapter/10.1007/978-3-031-46846-9_12" }, { title: "HM2011", value: "HM2011", tooltip: "https://arxiv.org/abs/1110.4161" }, { title: "DCR Solutions", value: "DCR Solutions", tooltip: "https://dcrsolutions.net/" }]}
                        onChange={(option) => isSettingsVal(option) && modelerRef.current?.setSetting("markerNotation", option)}
                    />
                    <Label>Relation Notation</Label>
                </MenuElement>
        }
    ];

    return (
        <>
            <Modeler modelerRef={modelerRef} override={{ graphRef: graphRef, overrideOnclick: () => null, canvasClassName: "conformance" }} />
            <TopRightIcons>
                <FullScreenIcon />
                <BiHome onClick={() => setState(StateEnum.Home)} />
                <ModalMenu elements={menuElements} open={menuOpen} bottomElements={bottomElements} setOpen={setMenuOpen} />
            </TopRightIcons>
        </>
    )
}

export default DiscoveryState