import { Label, LabelDCRPP, Test, Event, CostFun, AlignAction } from "./types";
import alignTrace from "./align";

const getCostFun = (context: Set<Event>, labelMap: { [e: Event]: Label }): CostFun => {
    return (action: AlignAction, target: Event) => {
        switch (action) {
            case "consume": return 0;
            case "model-skip": {
                if (context.has(labelMap[target])) {
                    return Infinity;
                } else {
                    return 0;
                }
            };
            case "trace-skip": return Infinity;
        }

    }
}

// Ran depth 100 in 7710 ms
const runTest = (test: Test, model: LabelDCRPP, maxDepth: number = Infinity, pruning = false): boolean => {
    const costFun = getCostFun(test.context, model.labelMap);
    const alignment = alignTrace(test.trace, model, test.context, costFun, maxDepth, pruning);
    const cost = alignment.cost;

    if (test.polarity === "+") {
        return (cost !== Infinity)
    } else {
        return (cost === Infinity)
    }
}

export default runTest;