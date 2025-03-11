import { useRef, useState } from "react";
import { StateEnum, StateProps } from "../App";
import { toast } from "react-toast";
import TopRightIcons from "../utilComponents/TopRightIcons";
import { BiHome, BiLeftArrowCircle, BiReset } from "react-icons/bi";
import Modeler from "./Modeler";

import { DCRGraph, SubProcess, Event, isEnabled, execute, copyMarking, moddleToDCR } from "dcr-engine";
import ModalMenu, { ModalMenuElement } from "../utilComponents/ModalMenu";

const SimulatorState = ({ setState, savedGraphs, setSavedGraphs }: StateProps) => {
    const modelerRef = useRef<DCRModeler | null>(null);
    const graphRef = useRef<{initial: DCRGraph, current: DCRGraph} | null>(null);

    const [menuOpen, setMenuOpen] = useState(false);

    const open = (data: string, parse: ((xml: string) => Promise<void>) | undefined) => {
      parse && parse(data).then( (_) => {
        if (modelerRef.current && graphRef.current) {
            const graph = moddleToDCR(modelerRef.current.getElementRegistry());
            graphRef.current = { initial: graph, current: {...graph, marking: copyMarking(graph.marking)} };
            modelerRef.current.updateRendering(graph);
        }
      }
      ).catch((e) => { console.log(e); toast.error("Unable to parse XML...") });
    }

    const findElementGroup = (event: Event, group: DCRGraph | SubProcess): DCRGraph | SubProcess | null => {
        if (group.events.has(event)) return group;
        
        let childGroup: DCRGraph | SubProcess | null = null;
        
        group.subProcesses.forEach((subProcess: SubProcess) => {
            let ret = findElementGroup(event, subProcess);
            if (ret) childGroup = ret;
        });
    
        return childGroup;
    }

    function logExcecutionString(event: any): string {
        var eventName: String = event.businessObject.description;
        if (eventName == null || eventName === "") {
            return ("Executed Unnamed event");
        } else {
            return ("Executed  "+ eventName);
        }
    }

    function traceString(event: any): string {
        var eventName: String = event.businessObject.description;
        if (eventName == null || eventName === "") {
            eventName = "Unnamed event";
        }
        return (eventName.toString());
    }

    const executeEvent  = (eventElement: any, graph: DCRGraph): { msg: string, executedEvent: string } => {
        const event: Event = eventElement.id;
        let eventName: String = eventElement.businessObject?.description;
        if (eventName == null || eventName === "") {
            eventName = "Unnamed event";
        }
    
        let group: DCRGraph | SubProcess | null = findElementGroup(event, graph);
        if (!group) {
            return { msg: "Event not found in graph", executedEvent: "" };
        }
    
        const enabledResponse = isEnabled(event, graph, group);
        if (!enabledResponse.enabled) {
            return { msg: enabledResponse.msg, executedEvent: "" };
        }
        execute(event, graph, group);
        return { msg: logExcecutionString(eventElement), executedEvent: traceString(eventElement) };
    }

    const eventClick = (event: any) => {
            event.preventDefault();
            event.stopPropagation();

            if (!modelerRef.current || !graphRef.current) return;
            
            const response = executeEvent(event.element, graphRef.current.current);
            console.log(response);
            modelerRef.current.updateRendering(graphRef.current.current);
            
            // Unselect everything, prevents selecting elements during simulation
            const selection = modelerRef.current.getSelection();
            selection.select([]);
    }

    const reset = () => {
        if (graphRef.current && modelerRef.current) {
            graphRef.current.current = {...graphRef.current.initial, marking: copyMarking(graphRef.current.initial.marking)};
            modelerRef.current.updateRendering(graphRef.current.current);
        }
    }

    const menuElements: Array<ModalMenuElement> = Object.keys(savedGraphs).map( name => {
        return ({
          icon: <BiLeftArrowCircle />,
          text: name,
          onClick: () => { open(savedGraphs[name], modelerRef.current?.importXML); setMenuOpen(false) },
        })
    });

    return (
      <>
        <Modeler modelerRef={modelerRef} override={ { graphRef: graphRef, overrideOnclick: eventClick }}/>
        <TopRightIcons>
            <BiReset onClick={reset}/>
            <BiHome onClick={() => setState(StateEnum.Home)} />
            <ModalMenu elements={menuElements} open={menuOpen} setOpen={setMenuOpen} />
        </TopRightIcons>
      </>
    )
  }
  
  export default SimulatorState