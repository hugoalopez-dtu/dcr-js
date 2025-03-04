import { useEffect } from "react";
import DCRModeler from "modeler";
import emptyBoardXML from "../resources/emptyBoard";

interface ModelerProps {
    modelerRef: React.RefObject<DCRModeler | null>
}

const Modeler = ({ modelerRef }: ModelerProps) => {

    useEffect(() => {
        let initModeler: DCRModeler;

        if (!modelerRef.current) {
            initModeler = new DCRModeler({
                container: document.getElementById("canvas"),
                keyboard: {
                    bindTo: window
                },
            })

            initModeler.importXML(emptyBoardXML).then(() => {
                modelerRef.current = initModeler;
            }).catch((e) => console.log(`
                This error happens in development because the component is mounted twice due to Strict Mode. 
                This means that the async importXML call of the first mount returns this error, 
                since the corresponding modeler has since been destroyed by cleanup. 
                I.e. it should be harmless
            `, e));
        }
        return () => {
            // Ensure that all modelers that are set are also destroyed
            initModeler?.destroy();
            modelerRef.current = null;
        }
    }, [])

    return (
        <div id="canvas" />
    );
}

export default Modeler;