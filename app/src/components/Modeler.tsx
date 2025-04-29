import { useEffect } from "react";
import DCRModeler from "modeler";
import emptyBoardXML from "../resources/emptyBoard";
import { copyMarking, DCRGraph, moddleToDCR } from "dcr-engine";
import { DCRGraphS } from "dcr-engine";

interface ModelerProps {
    modelerRef: React.RefObject<DCRModeler | null>,
    initXml?: string,
    override?: {
        graphRef: React.RefObject<{ initial: DCRGraph, current: DCRGraph } | { initial: DCRGraphS, current: DCRGraphS } | null>,
        overrideOnclick: (e: any) => void;
        canvasClassName?: string;
        onLoadCallback?: (graph: DCRGraphS) => void,
        noRendering?: boolean
    }
}

const Modeler = ({ modelerRef, override, initXml }: ModelerProps) => {

    useEffect(() => {
        let initModeler: DCRModeler;

        if (!modelerRef.current) {
            initModeler = new DCRModeler(override ? {
                container: document.getElementById("canvas"),
                keyboard: {
                    bindTo: window
                },
                additionalModules: [{
                    palette: ['value', null],
                    paletteProvider: ['value', null],
                    bendpoints: ['value', null],
                    move: ['value', null],
                    keyboard: ['value', null],
                    keyboardMove: ['value', null],
                    keyboardMoveSelection: ['value', null],
                    keyboardBindings: ['value', null],
                    labelEditing: ['value', null],
                    labelEditingProvider: ['value', null],
                }],
            } : {
                container: document.getElementById("canvas"),
                keyboard: {
                    bindTo: window
                },
            });

            initModeler.importXML(initXml ? initXml : emptyBoardXML).then(() => {
                modelerRef.current = initModeler;
                if (override) {
                    const graph = moddleToDCR(modelerRef.current.getElementRegistry());
                    override.graphRef.current = { initial: graph, current: { ...graph, marking: copyMarking(graph.marking) } };

                    const selection = initModeler.getSelection();
                    selection.select([]);

                    initModeler.setSimulating(true);
                    !override.noRendering && initModeler.updateRendering(graph);

                    // Override clicks on events
                    initModeler.on('element.click', (e) => {
                        override.overrideOnclick(e); // Unselect everything, prevents selecting elements during simulation
                        const selection = initModeler.getSelection();
                        selection.select([]);
                    });
                    try {
                        override.onLoadCallback && override.onLoadCallback(graph);
                    } catch (e) {
                        console.log(e);
                    }
                }
            }).catch((e: any) => console.log(`
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
        <div className={override?.canvasClassName ? override.canvasClassName : ""} id="canvas" />
    );
}

export default Modeler;