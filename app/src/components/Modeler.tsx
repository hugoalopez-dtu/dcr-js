import { useEffect } from "react";
import DCRModeler from "modeler";
import emptyBoardXML from "../resources/emptyBoard";
import sampleBoardXML from "../resources/sampleBoard";
import styled from "styled-components";
import { copyMarking, DCRGraph, moddleToDCR } from "dcr-engine";

interface ModelerProps {
    modelerRef: React.RefObject<DCRModeler | null>,
    override?: {
        graphRef: React.RefObject<{initial: DCRGraph, current: DCRGraph} | null>,
        overrideOnclick: (e: any) => void;
    }
}

const Modeler = ({ modelerRef, override }: ModelerProps) => {

    useEffect(() => {
        let initModeler: DCRModeler;

        if (!modelerRef.current) {
            initModeler = new DCRModeler({
                container: document.getElementById("canvas"),
                keyboard: {
                    bindTo: window
                },
            })

            const id = Math.random();

            initModeler.importXML(sampleBoardXML).then(() => {
                modelerRef.current = initModeler;
                if (override) {
                    const graph = moddleToDCR(modelerRef.current.getElementRegistry());
                    override.graphRef.current = { initial: graph, current: {...graph, marking: copyMarking(graph.marking)} };
        
                    const selection = initModeler.getSelection();
                    selection.select([]);
                    
                    initModeler.setSimulating(true);
                    initModeler.updateRendering(graph);
                    
                    // Hide palette
                    const palette = document.getElementsByClassName('djs-palette');
                    palette[0].parentNode?.removeChild(palette[0]);
                    
                    // Define events that should be prevented
                    const interactionEvents = [
                        'shape.move.start',
                        'element.dblclick',
                        'connectionSegment.move.start',
                        'commandStack.connection.updateWaypoints.canExecute',
                        'commandStack.connection.reconnect.canExecute',
                        'element.hover',
                
                    ];
                    
                    // Override interactions for certain events in diagram-js
                    interactionEvents.forEach(event => {
                        initModeler.on(event, (event) => {
                            event.preventDefault();
                            event.stopPropagation();
                        });
                    });
                    
                    // Prevent the default action for paste, undo and redo
                    document.addEventListener('keydown', function(event) {
                      if (event.ctrlKey && (event.key === 'v' || event.key === 'z'
                          || event.key === 'y' || (event.shiftKey && event.key === 'z'))) {
                          event.preventDefault(); 
                          event.stopPropagation();
                      }
                    });
                
                    // Override clicks on events
                    initModeler.on('element.click', override.overrideOnclick);
                }
            }).catch((e: any) => console.log(id, /*`
                This error happens in development because the component is mounted twice due to Strict Mode. 
                This means that the async importXML call of the first mount returns this error, 
                since the corresponding modeler has since been destroyed by cleanup. 
                I.e. it should be harmless
            `,*/ e));
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