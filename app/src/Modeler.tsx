import React, { useState, useEffect } from "react";
import DCRModeler from "modeler";
import ColumnContainer from "./utilComponents/ColumnContainer";

interface ModelerProps {
    initXml: string
}

const Modeler = ({ initXml }: ModelerProps) => {
    const [viewer, setViewer] = useState<DCRModeler | null>(null);

    useEffect(() => {
        const initViewer = new DCRModeler({
            container: document.getElementById("canvas"),
            keyboard: {
                bindTo: window
            },
        })
        setViewer(initViewer);

        console.log(initXml);
        initViewer.importXML(initXml).catch(function (err: any) {
            if (err) {
                return console.error('could not import dcr board', err);
            }
        });
    }, [initXml])

    return (
        <div id="canvas" />
    );
}

export default Modeler;