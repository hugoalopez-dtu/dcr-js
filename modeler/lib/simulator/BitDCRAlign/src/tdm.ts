import { bitAlignWithCheck } from "./bitAlign";
import { AlignAction, CostFun, Test, Event, LabelDCRPP, Label, DCRGraph } from "../types";
import { bitDCRtoLabelDCR, bitGraphToGraphPP, dcrToBitDCR } from "./utility";
import { BitLabelDCRPP } from "../bitTypes";

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


//const model: DCRGraph;
//const bitModelPP: BitLabelDCRPP = bitGraphToGraphPP(bitDCRtoLabelDCR(dcrToBitDCR(model)));
export default (test: Test, model: BitLabelDCRPP, maxDepth: number): boolean => {
    const costFun = getCostFun(test.context, model.labelMap);
    const alignment = bitAlignWithCheck(test.trace, model, test.context, maxDepth, costFun, true)
    const cost = alignment.cost;
    console.log("Trace: " + alignment.trace.map((e) => model.labelMap[e]));
    if (test.polarity === "+") {
        return (cost !== Infinity)
    } else {
        return (cost === Infinity)
    }
}