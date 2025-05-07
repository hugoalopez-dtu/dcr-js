import { executeS, isAcceptingS, isEnabledS } from "./executionEngine";
import { DCRGraphS, EventLog, RoleTrace } from "./types";
import { copyMarking, copySet, getRandomInt, getRandomItem, randomChoice } from "./utility";

const noisify = (trace: RoleTrace, noisePercentage: number, graph: DCRGraphS): RoleTrace => {
    const retTrace: RoleTrace = [];

    for (let i = 0; i < trace.length; i++) {
        if (Math.random() <= noisePercentage) {
            console.log("Noising it up!");
            const choice = getRandomInt(0, 3);
            switch (choice) {
                // Insert
                case 0:
                    retTrace.push(trace[i]);
                    const activity = getRandomItem(graph.labels);
                    const event = getRandomItem(graph.labelMapInv[activity]);
                    retTrace.push({ activity, role: graph.roleMap[event] });
                    break;
                // Delete
                case 1:
                    break;
                // Swap
                case 2:
                    const elem = retTrace.pop();
                    retTrace.push(trace[i]);
                    if (elem !== undefined) {
                        retTrace.push(elem);
                    }
                    break;
                default: throw new Error("Wrong integer mate " + choice);
            }
        } else {
            retTrace.push(trace[i]);
        }
    }
    return retTrace;
}


const generateEventLog = (graph: DCRGraphS, noTraces: number, minTraceLen: number, maxTraceLen: number, noisePercentage: number): EventLog<RoleTrace> => {
    const allEvents = Object.values(graph.subProcesses).reduce(
        (acc, cum) => acc.union(cum.events),
        copySet(graph.events));

    const allEnabled = () => {
        const retval = new Set<string>();
        for (const event of allEvents) {
            const group = graph.subProcessMap[event] ? graph.subProcessMap[event] : graph;
            if (isEnabledS(event, graph, group).enabled) {
                console.log(event, " is enabled");
                retval.add(event);
            }
        }
        return retval;
    }

    const retval: EventLog<RoleTrace> = {
        events: allEvents,
        traces: {},
    }

    let goodTraces = 0;
    let botchedTraces = 0;

    const initMarking = copyMarking(graph.marking);
    while (goodTraces < noTraces) {
        let trace: RoleTrace = [];
        while (trace.length <= maxTraceLen) {
            if (trace.length >= minTraceLen && isAcceptingS(graph, graph) && randomChoice()) {
                console.log("Good! ", trace.length);
                const noisyTrace = noisify(trace, noisePercentage, graph);
                retval.traces["Trace " + goodTraces++] = noisyTrace;
                break;
            }
            const enabled = allEnabled();
            if (enabled.size === 0) break;
            const event = getRandomItem(enabled);
            executeS(event, graph);
            trace.push({ activity: graph.labelMap[event], role: graph.roleMap[event] })
        }
        if (trace.length > maxTraceLen || trace.length < minTraceLen) {
            botchedTraces++;
            if (botchedTraces > 2 * noTraces) {
                throw new Error("Unable to generate log from parameters...");
            }
        }

        graph.marking = copyMarking(initMarking);
    }

    return retval;
}

export default generateEventLog