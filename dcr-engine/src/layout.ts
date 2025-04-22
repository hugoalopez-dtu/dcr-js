import { EventMap, RelationType, Event, DCRGraph, Nestings } from "./types";

import ELK, { ElkExtendedEdge, ElkNode } from "elkjs";

interface AbstractNode extends ElkNode {
    id: Event,
    width: number,
    height: number,
    included: boolean,
    pending: boolean,
    executed: boolean,
    children?: Array<AbstractNode>
}

interface AbstractEdge extends ElkExtendedEdge {
    id: string,
    type: RelationType,
    source: Event,
    target: Event
}

type AbstractGraph = {
    nodes: Array<AbstractNode>,
    edges: Array<AbstractEdge>
}

type LayoutType = Omit<ElkNode, "children"> & {
    children?: ElkNode[] | undefined;
};

const createXML = (laidOutGraph: LayoutType, nodesAndEdges: AbstractGraph, nestings?: Nestings) => {
    var xmlContent = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xmlContent += '<dcr:definitions xmlns:dcr="http://tk/schema/dcr" xmlns:dcrDi="http://tk/schema/dcrDi" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC">\n';
    xmlContent += ' <dcr:dcrGraph id="dcrGraph">\n';

    let nodeId = 0;
    const descToIdMap: { [desc: string]: number } = {}

    const descToId = (desc: string): string => {
        if (!descToIdMap[desc]) descToIdMap[desc] = ++nodeId;
        return "Event_" + descToIdMap[desc];
    }

    const createNodeArrayXML = (nodes: Array<AbstractNode>, nestings: Nestings): string => {
        let retval = "";
        nodes.forEach((node) => {
            if (nestings.nestingIds.has(node.id)) {
                retval += `<dcr:nesting id="${descToId(node.id)}" description="${node.id}">\n`;
                if (node.children) retval += createNodeArrayXML(node.children, nestings);
                retval += "</dcr:nesting>\n";
            } else {
                retval += ` <dcr:event id="${descToId(node.id)}" description="${node.id}" included="${node.included}" executed="${node.executed}" pending="${node.pending}" enabled="false" />\n`;
            }
        })
        return retval;
    }

    if (nestings) {
        xmlContent += createNodeArrayXML(nodesAndEdges.nodes, nestings);
    } else {
        nodesAndEdges.nodes.forEach((node) => {
            xmlContent += ` <dcr:event id="${descToId(node.id)}" description="${node.id}" included="${node.included}" executed="${node.executed}" pending="${node.pending}" enabled="false" />\n`;
        })
    }

    let id = 0
    nodesAndEdges.edges.forEach((edge) => {
        xmlContent += ` <dcr:relation id="Relation_${++id}" type="${edge.type}" sourceRef="${descToId(edge.source)}" targetRef="${descToId(edge.target)}"/>\n`;
    })

    xmlContent += ' </dcr:dcrGraph>\n';
    xmlContent += ' <dcrDi:dcrRootBoard id="RootBoard">\n';
    xmlContent += ' <dcrDi:dcrPlane id="Plane" boardElement="dcrGraph">\n';

    const parentCoordinates: { [nodeId: string]: { parent: string, parentX: number, parentY: number } } = {};

    const createElkNodeArrayXML = (nodes: Array<ElkNode>, x: number, y: number, parent: string): string => {
        let retval = "";
        nodes.forEach((node) => {
            if (!node.x || !node.y) throw new Error("Coordinates missing...");
            parentCoordinates[node.id] = { parent, parentX: x, parentY: y };
            const newX = x + node.x;
            const newY = y + node.y;
            retval += `<dcrDi:dcrShape id="${descToId(node.id)}_di" boardElement="${descToId(node.id)}">\n`;
            retval += ` <dc:Bounds x="${newX}" y="${newY}" width="${node.width}" height="${node.height}"/>\n`;
            retval += ' </dcrDi:dcrShape>\n';
            if (node.children) retval += createElkNodeArrayXML(node.children, newX, newY, node.id);
        })
        return retval;
    }

    if (laidOutGraph.children) xmlContent += createElkNodeArrayXML(laidOutGraph.children, 0, 0, laidOutGraph.id);

    const getBaselineChords = (aId: string, a: { parentX: number, parentY: number, parent: string }, bId: string, b: { parentX: number, parentY: number, parent: string }): { baseX: number, baseY: number } => {
        if (a.parent === b.parent) return { baseX: a.parentX, baseY: a.parentY }
        else if (a.parent === bId) return { baseX: a.parentX, baseY: a.parentY }
        else if (b.parent === aId) return { baseX: b.parentX, baseY: b.parentY }
        else return { baseX: 0, baseY: 0 };
    }

    id = 0;
    laidOutGraph.edges?.forEach((edge) => {
        const { baseX, baseY } = getBaselineChords(edge.sources[0], parentCoordinates[edge.sources[0]], edge.targets[0], parentCoordinates[edge.targets[0]]);
        if (edge.sections) {
            xmlContent += `<dcrDi:relation id="Relation_${++id}_di" boardElement="Relation_${id}">\n`;
            xmlContent += ` <dcrDi:waypoint x="${baseX + edge.sections[0].startPoint.x}" y="${baseY + edge.sections[0].startPoint.y}" />\n`;

            edge.sections[0].bendPoints?.forEach((bendPoint) => {
                xmlContent += ` <dcrDi:waypoint x="${baseX + bendPoint.x}" y="${baseY + bendPoint.y}" />\n`;
            })

            xmlContent += ` <dcrDi:waypoint x="${baseX + edge.sections[0].endPoint.x}" y="${baseY + edge.sections[0].endPoint.y}" />\n`;
            xmlContent += ' </dcrDi:relation>\n';
        }

        //for self referencing nodes when using layouts without bendpoints
        else {
            xmlContent += `<dcrDi:relation id="Relation_${++id}_di" boardElement="Relation_${id}">\n`;
            xmlContent += ` <dcrDi:waypoint x="${NaN}" y="${NaN}" />\n`;
            xmlContent += ' </dcrDi:relation>\n';
        }
    })

    xmlContent += ' </dcrDi:dcrPlane>\n';
    xmlContent += ' </dcrDi:dcrRootBoard>\n';
    xmlContent += '</dcr:definitions>\n';

    return xmlContent
}

// https://stackoverflow.com/questions/18017869/build-tree-array-from-flat-array-in-javascript
type TempNode = { id: string, parent: string, children: Array<TempNode> };
const listToTree = (list: Array<{ id: string, parent: string }>) => {
    const map: { [id: string]: number } = {};

    let trees = [];

    const newList: Array<TempNode> = list.map((elem) => ({ ...elem, children: [] }));
    for (let i = 0; i < newList.length; i += 1) {
        map[newList[i].id] = i; // initialize the map
    }

    console.log(map);
    console.log(list);

    for (let i = 0; i < newList.length; i += 1) {
        const node = newList[i];
        if (node.parent) {
            // if you have dangling branches check that map[node.parent] exists
            newList[map[node.parent]].children.push(node);
        } else {
            trees.push(node);
        }
    }
    return trees;
}

const treesToAbstractNodeArray = (trees: Array<TempNode>, graph: DCRGraph, nestings: Nestings): Array<AbstractNode> => {
    return trees.map(node => {
        return {
            id: node.id,
            width: 130,
            height: 150,
            included: graph.marking.included.has(node.id),
            pending: graph.marking.pending.has(node.id),
            executed: graph.marking.executed.has(node.id),
            children: node.children.length > 0 ? treesToAbstractNodeArray(node.children, graph, nestings) : undefined,
            layoutOptions: nestings.nestingIds.has(node.id) ? {
                "elk.padding": "[left=50, top=100, right=25, bottom=50]",
            } : undefined
        }
    })
}

const getAbstractGraph = (graph: DCRGraph, nestings?: Nestings): AbstractGraph => {
    let nodes: Array<AbstractNode> = [];
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
    if (nestings) {
        const trees = listToTree([...graph.events].map(id => ({ id, parent: nestings.nestingRelations[id] })));
        nodes = treesToAbstractNodeArray(trees, graph, nestings);
    } else {
        graph.events.forEach(event => {
            nodes.push({
                id: event,
                width: 130,
                height: 150,
                included: graph.marking.included.has(event),
                pending: graph.marking.pending.has(event),
                executed: graph.marking.executed.has(event),
            })
        });
    }

    loadEdge(graph.conditionsFor, 'condition');
    loadEdge(graph.milestonesFor, 'milestone');
    loadEdge(graph.responseTo, 'response');
    loadEdge(graph.excludesTo, 'exclude');
    loadEdge(graph.includesTo, 'include');

    return { nodes, edges };
}

const layoutGraph = async (graph: DCRGraph, nestings?: Nestings) => {

    const abstractGraph = getAbstractGraph(graph, nestings);

    const layout: ElkNode = {
        id: "root",
        layoutOptions: {
            "org.eclipse.elk.hierarchyHandling": "INCLUDE_CHILDREN",
            "elk.layered.spacing.nodeNodeBetweenLayers": "50",
            "elk.spacing.nodeNode": "50",
            "elk.spacing.edgeNode": "5",
        },
        children: abstractGraph.nodes,
        edges: abstractGraph.edges
    }
    const elk = new ELK();
    const result = await elk.layout(layout);
    console.log(graph);
    console.log(layout);
    const xmlContent = createXML(result, abstractGraph, nestings);

    return xmlContent;
}

export default layoutGraph;

/*{
            'elk.algorithm': 'org.eclipse.elk.layered',
            "elk.hierarchyHandling": "INCLUDE_CHILDREN",
            "elk.nodeSizeOptions": "COMPUTE_PADDING",
            "spacing.nodeNodeBetweenLayers": '50',
            "elk.layered.spacing.nodeNodeBetweenLayers": "50",
            "elk.spacing.nodeNode": "500",
            "elk.spacing.edgeNode": "50",
            "elk.spacing.edgeEdge": "5",
        },*/