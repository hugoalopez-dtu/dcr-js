// Actualiza estas líneas al principio de generation.ts:
import { executeS, isAcceptingS, isEnabledS, printEventLabels } from "./executionEngine.js";
import { DCRGraphS, EventLog, RoleTrace, Marking } from "./types.js";
import { copyMarking, copySet, getRandomInt, getRandomItem, randomChoice } from "./utility.js";


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
                // Log the event and its corresponding activity name
                console.log(`${event} (${graph.labelMap[event]}) is enabled`);
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

    // Log the mapping of events to labels
    printEventLabels(graph);

    while (goodTraces < noTraces) {
        let trace: RoleTrace = [];
        while (trace.length <= maxTraceLen) {
            if (trace.length >= minTraceLen && isAcceptingS(graph, graph) && randomChoice()) {
                console.log("Good! ", trace.length);
                const noisyTrace = noisify(trace, noisePercentage, graph);
                retval.traces["Trace " + goodTraces++] = noisyTrace;
                break;
            }
            // Log the trace number being analyzed
            console.log(`Analyzing trace number: ${goodTraces + 1}`);
            const enabled = allEnabled();
            if (enabled.size === 0) break;
            const event = getRandomItem(enabled);
            console.log(`Chosen event: ${event} (${graph.labelMap[event]})`);
            executeS(event, graph);
            trace.push({ activity: graph.labelMap[event], role: graph.roleMap[event] });
            console.log(`Current trace: ${trace.map(t => `${t.role}: ${t.activity}`).join(" | ")}`);
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

class DCREnvironment {
    private graph: DCRGraphS;
    private initialMarking: Marking;
    private maxSteps: number;
    private currentStep: number;

    constructor(graph: DCRGraphS, maxSteps: number = 100) {
        this.graph = graph;
        this.initialMarking = copyMarking(graph.marking);
        this.maxSteps = maxSteps;
        this.currentStep = 0;
    }

    reset() {
        this.graph.marking = copyMarking(this.initialMarking);
        this.currentStep = 0;
        return this.getState();
    }

    getState() {
        return {
            included: Array.from(this.graph.marking.included),
            executed: Array.from(this.graph.marking.executed),
            pending: Array.from(this.graph.marking.pending),
        };
    }

    getValidActions() {
        const allEvents = Object.values(this.graph.subProcesses).reduce(
            (acc, cum) => acc.union(cum.events),
            copySet(this.graph.events)
        );

        const enabledEvents = new Set<string>();
        for (const event of allEvents) {
            const group = this.graph.subProcessMap[event] ? this.graph.subProcessMap[event] : this.graph;
            if (isEnabledS(event, this.graph, group).enabled) {
                enabledEvents.add(event);
            }
        }
        return Array.from(enabledEvents);
    }

    step(action: string) {
        const validActions = this.getValidActions();
        if (!validActions.includes(action)) {
            throw new Error(`Invalid action: ${action}`);
        }

        executeS(action, this.graph);
        this.currentStep++;

        const reward = -1; // Simple reward for now
        const done = isAcceptingS(this.graph, this.graph) || this.currentStep >= this.maxSteps;

        return {
            state: this.getState(),
            reward,
            done,
            info: { step: this.currentStep },
        };
    }
}

class RLDCREnvironment {
    private graph: DCRGraphS;
    private initialMarking: Marking;
    private maxSteps: number;
    private currentStep: number;

    constructor(graph: DCRGraphS, maxSteps: number = 100) {
        this.graph = graph;
        this.initialMarking = copyMarking(graph.marking);
        this.maxSteps = maxSteps;
        this.currentStep = 0;
    }

    reset() {
        this.graph.marking = copyMarking(this.initialMarking);
        this.currentStep = 0;
        return this.getState();
    }

    getState() {
        return {
            included: Array.from(this.graph.marking.included),
            executed: Array.from(this.graph.marking.executed),
            pending: Array.from(this.graph.marking.pending),
        };
    }
    getValidActions() {
        const enabledEvents = new Set<string>();
        for (const event of this.graph.events) {
            const group = this.graph.subProcessMap[event] ? this.graph.subProcessMap[event] : this.graph;
            if (isEnabledS(event, this.graph, group).enabled) {
                enabledEvents.add(event);
            }
        }
        return Array.from(enabledEvents);
    }

    step(action: string): {
        action: string; 
        state: any, 
        reward: number, 
        done: boolean, 
        msg: string, 
        info: { compliant: boolean, step: number } 
    } {
        const validActions = this.getValidActions();
        const isCompliant = validActions.includes(action);
        const shieldDisabled = process.env.SHIELD_DISABLED === "1";

        if (!isCompliant && !shieldDisabled) {
            // OPTION B: Penalty for non-compliant action. State does NOT change.
            return {
                action,
                state: this.getState(),
                reward: -10,
                done: false,
                msg: `Non-compliant move attempted: ${action}`,
                info: { compliant: false, step: this.currentStep },
            };
        }

        // Execute transition (compliant, or ablation: shield disabled).
        executeS(action, this.graph);
        this.currentStep++;

        const accepting = isAcceptingS(this.graph, this.graph);
        // Reward: 100 if completed, -1 for each step taken (to optimize length)
        const reward = accepting ? 100 : -1;
        const done = accepting || this.currentStep >= this.maxSteps;

        return {
            action,
            state: this.getState(),
            reward,
            done,
            // isCompliant always reflects DCR validity, regardless of SHIELD_DISABLED.
            // Needed to track illegal action rate in rl_only ablation logs.
            msg: isCompliant ? `Compliant move: ${action}` : `Shield disabled — illegal move executed: ${action}`,
            info: { compliant: isCompliant, step: this.currentStep },
        };
    }
}

// Example usage for testing
const testEnvironment = (graph: DCRGraphS) => {
    const env = new DCREnvironment(graph);

    console.log("Initial State:", env.reset());

    const validActions = env.getValidActions();
    console.log("Valid Actions:", validActions);

    if (validActions.length > 0) {
        const action = validActions[0];
        console.log(`Executing action: ${action}`);
        const result = env.step(action);
        console.log("New State:", result.state);
        console.log("Reward:", result.reward);
        console.log("Done:", result.done);
    } else {
        console.log("No valid actions available.");
    }
};

export { DCREnvironment, RLDCREnvironment, testEnvironment, generateEventLog };