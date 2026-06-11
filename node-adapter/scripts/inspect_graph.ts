import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { xmlToDCR } from "../../dcr-engine/src/graphConversion.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const xml = fs.readFileSync(path.join(__dirname, "../../app/public/examples/diagrams/LoanApp_junior_senior.xml"), "utf-8");
const graph = xmlToDCR(xml);
console.log("events:", graph.events.size);
console.log(JSON.stringify(graph.labelMap, null, 2));
console.log("initial pending:", [...graph.marking.pending]);
console.log("initial included:", [...graph.marking.included]);
