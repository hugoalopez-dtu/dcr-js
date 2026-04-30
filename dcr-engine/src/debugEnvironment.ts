import { xmlToDCR } from "./graphConversion.js";
import { RLDCREnvironment } from "./generation.js";
import * as fs from "fs";
import { computeStepReward, countPendingIncluded } from "./reward.js";

/**
 * DEFINITIVE DCR VALIDATION SCRIPT
 * Focus: Verifying Compliance (Test 1) and Trace Discovery (Test 2)
 */

const loadDCRGraph = (filePath: string) => {
    const xmlContent = fs.readFileSync(filePath, "utf-8");
    return xmlToDCR(xmlContent);
};

const runStandardDebug = (xmlPath: string) => {
    const graph = loadDCRGraph(xmlPath);
    const env = new RLDCREnvironment(graph);

    console.log(`\n================================================`);
    console.log(`--- STANDARDIZED DCR VALIDATION ---`);
    console.log(`Target XML: ${xmlPath}`);
    console.log(`================================================`);

    let totalReward = 0;

    // --- PHASE 1: COMPLIANCE TEST (FORBIDDEN ACTION) ---
    const allEvents = Array.from(graph.events);
    const initialAllowed = env.getValidActions();
    const forbiddenCandidate = allEvents.find(id => !initialAllowed.includes(id));

    if (forbiddenCandidate) {
        const label = graph.labelMap[forbiddenCandidate] || forbiddenCandidate;
        console.log(`\n[TEST 1] Testing Forbidden Action: "${label}" (${forbiddenCandidate})`);
        const res = env.step(forbiddenCandidate);
        console.log(`> Verdict:          ${res.msg}`);
        console.log(`> Expected Reward:  -10 | Received: ${res.reward}`);
        totalReward += res.reward;
    }

    // --- PHASE 2: GOAL-ORIENTED EXPLORATION ---
    console.log(`\n--- [TEST 2] RL Framework Demo: Random Exploration ---`);
    env.reset();

    const traceSequence: string[] = [];
    let isFinished = false;
    const executedInEpisode = new Set<string>();

    for (let step = 1; step <= 20; step++) {
        const allEvents = Array.from(graph.events);
        const action = allEvents[Math.floor(Math.random() * allEvents.length)];
        const label = graph.labelMap[action] || action;

        // Capture pending count BEFORE the step (needed for progress signal)
        const pendingBefore = countPendingIncluded(env.getState());

        const result = env.step(action);

        // New signature: (result, pendingBefore, visitedStates)
        // No GOAL_LABEL — termination is structural (Pending ∩ Included = ∅)
        result.action = action;
        const { stepReward, baseMapped, noveltyDelta, progressDelta } =
            computeStepReward(result, pendingBefore, executedInEpisode);

        totalReward += stepReward;
        traceSequence.push(label);

        const pendingAfter = countPendingIncluded(result.state);
        console.log(
            `Step ${step}: [${label}] | engine:${result.reward} | base:${baseMapped} ` +
            `| novelty:${noveltyDelta} | progress:${progressDelta} ` +
            `| pending:${pendingBefore}→${pendingAfter} | step:${stepReward} | total:${totalReward}`
        );

        // Termination: structural acceptance (Pending ∩ Included = ∅)
        if (result.done && result.reward >= 0) {
            console.log(`\n[🏁] SUCCESS: Process reached an acceptance state.`);
            isFinished = true;
            break;
        }
    }

    console.log(`\n================================================`);
    console.log(`--- VALIDATION SUMMARY ---`);
    console.log(`Final Sequence:  ${traceSequence.join(" -> ")}`);
    console.log(`Total Score:     ${totalReward}`);
    console.log(`Status:          ${isFinished ? "ACCEPTED" : "INCOMPLETE"}`);
    console.log(`================================================\n`);
};

runStandardDebug("/Users/sofia/dcr-js/app/public/examples/diagrams/PizzaDelivery.xml");