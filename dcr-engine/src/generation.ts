import { DCRGraphS, EventLog, RoleTrace } from "./types";
import { copySet, getRandomInt, getRandomItem } from "./utility";

const noisify = (trace: RoleTrace, noisePercentage: number, graph: DCRGraphS): RoleTrace => {
    const retTrace: RoleTrace = [];

    for (let i = 0; i < trace.length; i++) {
        if (Math.random() <= noisePercentage) {
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
    const retval: EventLog<RoleTrace> = {
        events: copySet(graph.events),
        traces: {},
    }

    //TODO

    return retval;
}

export default generateEventLog