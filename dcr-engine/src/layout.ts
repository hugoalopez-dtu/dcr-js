import { EventMap, RelationType, Event, DCRGraph } from "./types";

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

type Nestings = { nestingIds: Set<string>, nestingRelations: { [event: Event]: string } };

const createNodeArrayXML = (nodes: Array<AbstractNode>, nestings: Nestings): string => {
    let retval = "";
    nodes.forEach((node) => {
        if (nestings.nestingIds.has(node.id)) {
            retval += `<dcr:nesting id="${node.id}" description="${node.id}">\n`;
            if (node.children) retval += createNodeArrayXML(node.children, nestings);
            retval += "</dcr:nesting>\n";
        } else {
            retval += ` <dcr:event id="${node.id}" description="${node.id}" included="${node.included}" executed="${node.executed}" pending="${node.pending}" enabled="false" />\n`;
        }
    })
    return retval;
}

const createElkNodeArrayXML = (nodes: Array<ElkNode>): string => {
    let retval = "";
    nodes.forEach((node) => {
        retval += `<dcrDi:dcrShape id="${node.id}_di" boardElement="${node.id}">\n`;
        retval += ` <dc:Bounds x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}"/>\n`;
        retval += ' </dcrDi:dcrShape>\n';
        if (node.children) retval += createElkNodeArrayXML(node.children);
    })
    return retval;
}

const createXML = (laidOutGraph: LayoutType, nodesAndEdges: AbstractGraph, nestings?: Nestings) => {
    var xmlContent = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xmlContent += '<dcr:definitions xmlns:dcr="http://tk/schema/dcr" xmlns:dcrDi="http://tk/schema/dcrDi" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC">\n';
    xmlContent += ' <dcr:dcrGraph id="Graph">\n';

    if (nestings) {
        xmlContent += createNodeArrayXML(nodesAndEdges.nodes, nestings);
    } else {
        nodesAndEdges.nodes.forEach((node) => {
            xmlContent += ` <dcr:event id="${node.id}" description="${node.id}" included="${node.included}" executed="${node.executed}" pending="${node.pending}" enabled="false" />\n`;
        })
    }

    var id = 0
    nodesAndEdges.edges.forEach((edge) => {
        xmlContent += ` <dcr:relation id="Relation_${id++}" type="${edge.type}" sourceRef="${edge.source}" targetRef="${edge.target}"/>\n`;
    })

    xmlContent += ' </dcr:dcrGraph>\n';
    xmlContent += ' <dcrDi:dcrRootBoard id="RootBoard">\n';
    xmlContent += ' <dcrDi:dcrPlane id="Plane" boardElement="Graph">\n';

    if (laidOutGraph.children) xmlContent += createElkNodeArrayXML(laidOutGraph.children);

    id = 0;
    laidOutGraph.edges?.forEach((edge) => {
        if (edge.sections) {
            xmlContent += `<dcrDi:relation id="Relation_${id++}_di" boardElement="Relation_${id}">\n`;
            xmlContent += ` <dcrDi:waypoint x="${edge.sections[0].startPoint.x}" y="${edge.sections[0].startPoint.y}" />\n`;

            edge.sections[0].bendPoints?.forEach((bendPoint) => {
                xmlContent += ` <dcrDi:waypoint x="${bendPoint.x}" y="${bendPoint.y}" />\n`;
            })

            xmlContent += ` <dcrDi:waypoint x="${edge.sections[0].endPoint.x}" y="${edge.sections[0].endPoint.y}" />\n`;
            xmlContent += ' </dcrDi:relation>\n';
        }

        //for self referencing nodes when using layouts without bendpoints
        else {
            xmlContent += `<dcrDi:relation id="Relation_${id++}_di" boardElement="Relation_${id}">\n`;
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