import { EventMap, RelationType, Event, DCRGraph } from "./types";

import ELK from "elkjs";

type AbstractNode = {
    id: Event,
    width: number,
    height: number,
    included: boolean,
    pending: boolean,
    executed: boolean
}

type AbstractEdge = {
    id: string,
    type: RelationType,
    source: Event,
    target: Event,
    sources: [Event],
    targets: [Event],
}

type AbstractGraph = {
    nodes: Array<AbstractNode>,
    edges: Array<AbstractEdge>
}

const createXML = (laidOutGraph: any, nodesAndEdges: AbstractGraph) => {
    var xmlContent = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xmlContent += '<dcr:definitions xmlns:dcr="http://tk/schema/dcr" xmlns:dcrDi="http://tk/schema/dcrDi" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC">\n';
    xmlContent += ' <dcr:dcrGraph id="Graph">\n';

    nodesAndEdges.nodes.forEach((node) => {
        xmlContent += ` <dcr:event id="${node.id}" description="${node.id}" included="${node.included}" executed="false" pending="false" enabled="false" />\n`;
    })

    var id = 0
    nodesAndEdges.edges.forEach((edge) => {
        xmlContent += ` <dcr:relation id="relation_${id++}" type="${edge.type}" sourceRef="${edge.source}" targetRef="${edge.target}"/>\n`;
    })

    xmlContent += ' </dcr:dcrGraph>\n';
    xmlContent += ' <dcrDi:dcrRootBoard id="RootBoard">\n';
    xmlContent += ' <dcrDi:dcrPlane id="Plane" boardElement="Graph">\n';

    id = 0;
    laidOutGraph.edges.forEach((edge: any) => {
        if (edge.sections) {
            xmlContent += `<dcrDi:relation id="Relation_${id}_di" boardElement="Relation_${id}">\n`;
            xmlContent += ` < dcrDi:waypoint x = "${edge.sections[0].startPoint.x}" y = "${edge.sections[0].startPoint.y}" />\n`;

            edge.sections[0].bendPoints?.forEach((bendPoint: any) => {
                xmlContent += ` < dcrDi:waypoint x = "${bendPoint.x}" y = "${bendPoint.y}" />\n`;
            })

            xmlContent += ` < dcrDi:waypoint x = "${edge.sections[0].endPoint.x}" y = "${edge.sections[0].endPoint.y}" />\n`;
            xmlContent += ' </dcrDi:relation>\n';
        }

        //for self referencing nodes when using layouts without bendpoints
        else {
            xmlContent += `<dcrDi:relation id="Relation_${id}_di" boardElement="Relation_${id}">\n`;
            xmlContent += ` < dcrDi:waypoint x = "${NaN}" y = "${NaN}" />\n`;
            xmlContent += ' </dcrDi:relation>\n';
        }
    })

    laidOutGraph.children.forEach((node: any) => {
        xmlContent += `< dcrDi:dcrShape id = "${node.id}_di" boardElement = "${node.id}"/>\n`;
        xmlContent += ` <dc:Bounds x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}"/>\n`;
        xmlContent += ' </dcrDi:dcrShape>\n';
    })

    xmlContent += ' </dcrDi:dcrPlane>\n';
    xmlContent += ' </dcrDi:dcrRootBoard>\n';
    xmlContent += '</dcr:definitions>\n';

    return xmlContent
}



const getAbstractGraph = (graph: DCRGraph): AbstractGraph => {
    const nodes: Array<AbstractNode> = [];
    const edges: Array<AbstractEdge> = [];

    const loadEdge = (rel: EventMap, type: RelationType) => {
        if (type == 'condition' || type == 'milestone') {
            Object.keys(rel).forEach(target => {
                rel[target].forEach(source => {
                    edges.push({
                        id: `${source}-${target}-${type}`,
                        source,
                        target,
                        sources: [source],
                        targets: [target],
                        type
                    })
                })
            })
        }
        else {
            Object.keys(rel).forEach(source => {
                rel[source].forEach(target => {
                    edges.push({
                        id: `${source}-${target}-${type}`,
                        source,
                        target,
                        sources: [source],
                        targets: [target],
                        type
                    })
                })
            })
        }
    }

    graph.events.forEach(event => {
        nodes.push({
            id: event,
            width: 130,
            height: 150,
            included: graph.marking.included.has(event),
            pending: graph.marking.pending.has(event),
            executed: graph.marking.executed.has(event)
        })
    });

    loadEdge(graph.conditionsFor, 'condition');
    loadEdge(graph.milestonesFor, 'milestone');
    loadEdge(graph.responseTo, 'response');
    loadEdge(graph.excludesTo, 'exclude');
    loadEdge(graph.includesTo, 'include');

    return { nodes, edges };
}

const layoutGraph = async (graph: DCRGraph) => {

    const abstractGraph = getAbstractGraph(graph);

    const layout = {
        id: "root",
        layoutOptions: {
            'elk.algorithm': 'layered',
            'org.eclipse.elk.spacing.nodeNode': "80",
            'org.eclipse.elk.spacing.edgeNode': "50",
            'org.eclipse.elk.spacing.edgeEdge': "50",

            'org.eclipse.elk.layered.spacing.edgeNodeBetweenLayers': "50",
        },
        children: abstractGraph.nodes,
        edges: abstractGraph.edges
    }
    const elk = new ELK();
    const result = await elk.layout(layout);
    const xmlContent = createXML(result, abstractGraph);

    return xmlContent;
}

export default layoutGraph;