import { useEffect, useReducer } from "react";
import DCRModeler from "modeler";

interface ModelerProps {
    xml: string,
    setModeler: (modeler: DCRModeler) => void,
}

const Modeler = ({ xml,  setModeler }: ModelerProps) => {
    
    useEffect(() => {
        console.log("useEffect triggering");
        const initModeler = new DCRModeler({
            container: document.getElementById("canvas"),
            keyboard: {
                bindTo: window
            },
        })
        setModeler(initModeler);

        initModeler.importXML(xml).catch(function (err: any) {
            if (err) {
                return console.error('could not import dcr board', err);
            }
        });
    
    }, [])

    return (
        <div id="canvas" />
    );
}

export default Modeler;