import xml.etree.ElementTree as ET
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Literal, Set, Tuple


@dataclass
class BPMNObject:
    id: str
    element_type: Literal['Task', 'Event', 'Gateway']
    name: Optional[str] = None
    system_name: str = ""
    event_type: Optional[Literal['StartEvent', 'EndEvent']] = None
    gateway_type: Optional[Literal['Exclusive',
                                   'Parallel', 'Inclusive']] = None
    gateway_function: Optional[Literal['Split', 'Join']] = None
    incoming_flows: List[str] = field(default_factory=list)
    outgoing_flows: List[str] = field(default_factory=list)


@dataclass
class InclusiveTrace:
    trace_id: int
    start_object_id: str
    end_object_id: str


@dataclass
class BPMNGatewayPair:
    pair_id: int
    gateway_type: Literal['Exclusive', 'Parallel', 'Inclusive']
    split_gateway_id: str
    join_gateway_id: str
    is_loop: bool = False
    inclusive_traces: List[InclusiveTrace] = field(default_factory=list)


@dataclass
class BPMNProcess:
    process_id: str
    objects: Dict[str, BPMNObject] = field(default_factory=dict)
    sequence_flows: Dict[str, Tuple[str, str]] = field(default_factory=dict)
    gateway_pairs: Dict[int, BPMNGatewayPair] = field(default_factory=dict)


class BPMNParser:

    def __init__(self, file_path):
        self.file_path = file_path
        self.namespaces = {
            'bpmn': 'http://www.omg.org/spec/BPMN/20100524/MODEL'}
        self.tree = ET.parse(file_path)
        self.root = self.tree.getroot()
        self.process_element = self.root.find('bpmn:process', self.namespaces)
        if self.process_element is None:
            raise ValueError(
                "'<bpmn:process>' element not found in the file. Please ensure it is a valid BPMN file.")

        self.elements_xml = {
            elem.get('id'): elem for elem in self.process_element}
        self.tasks_xml = {elem.get('id'): elem for elem in self.process_element.findall(
            'bpmn:task', self.namespaces)}
        self.start_events_xml = list(self.process_element.findall(
            'bpmn:startEvent', self.namespaces))
        self.end_events_xml = list(self.process_element.findall(
            'bpmn:endEvent', self.namespaces))
        self.end_event_ids = {e.get('id') for e in self.end_events_xml}

        self.gateways_xml = {}
        gateway_tags = [
            'bpmn:exclusiveGateway', 'bpmn:ExclusiveGateway',
            'bpmn:parallelGateway',  'bpmn:ParallelGateway',
            'bpmn:inclusiveGateway', 'bpmn:InclusiveGateway'
        ]
        for tag in gateway_tags:
            for elem in self.process_element.findall(tag, self.namespaces):
                self.gateways_xml[elem.get('id')] = elem

        self.flows_by_source = defaultdict(list)
        self.flows_by_target = defaultdict(list)
        for flow in self.process_element.findall('bpmn:sequenceFlow', self.namespaces):
            source_ref = flow.get('sourceRef')
            target_ref = flow.get('targetRef')
            self.flows_by_source[source_ref].append(flow)
            self.flows_by_target[target_ref].append(flow)

        self.bpmn_process = BPMNProcess(
            process_id=self.process_element.get('id'))
        self.element_names = {}

        self.graph = {elem_id: [flow.get('targetRef') for flow in flows]
                      for elem_id, flows in self.flows_by_source.items()}

    def parse_and_validate(self) -> Tuple[Optional[BPMNProcess], List[str]]:
        self._rename_events()
        pairing_errors = self._pair_and_rename_gateways()
        validation_errors = []
        validation_errors.extend(self._check_start_end_events())
        validation_errors.extend(self._check_task_connectivity())
        validation_errors.extend(self._check_gateway_structure())

        all_errors = validation_errors + pairing_errors

        if all_errors:
            return None, all_errors

        self._build_structured_process_object()

        return self.bpmn_process, []

    def _build_structured_process_object(self):
        for source_id, flows in self.flows_by_source.items():
            for flow in flows:
                self.bpmn_process.sequence_flows[flow.get('id')] = (
                    source_id, flow.get('targetRef'))

        all_xml_elements = {**self.tasks_xml, **self.gateways_xml}
        all_xml_elements.update(
            {e.get('id'): e for e in self.start_events_xml})
        all_xml_elements.update({e.get('id'): e for e in self.end_events_xml})

        for elem_id, elem_xml in all_xml_elements.items():
            name = elem_xml.get('name')
            system_name = self.element_names.get(elem_id, name or elem_id)
            incoming = [f.get('id')
                        for f in self.flows_by_target.get(elem_id, [])]
            outgoing = [f.get('id')
                        for f in self.flows_by_source.get(elem_id, [])]
            tag = elem_xml.tag.split('}')[1]

            element_type = 'Task'
            if 'Event' in tag:
                element_type = 'Event'
            elif 'Gateway' in tag:
                element_type = 'Gateway'

            node = BPMNObject(id=elem_id, element_type=element_type, name=name,
                              system_name=system_name, incoming_flows=incoming, outgoing_flows=outgoing)

            if node.element_type == 'Event':
                node.event_type = tag.replace(
                    'Event', ' Event').title().replace(' ', '')
            elif node.element_type == 'Gateway':
                gw_type_map = {
                    'exclusiveGateway': 'Exclusive', 'ExclusiveGateway': 'Exclusive',
                    'parallelGateway': 'Parallel', 'ParallelGateway': 'Parallel',
                    'inclusiveGateway': 'Inclusive', 'InclusiveGateway': 'Inclusive'
                }
                node.gateway_type = gw_type_map.get(tag, 'Unknown')
                node.gateway_function = 'Split' if len(
                    incoming) == 1 and len(outgoing) > 1 else 'Join'

            self.bpmn_process.objects[elem_id] = node

        self.bpmn_process.gateway_pairs = self.gateway_pairs_data

    def _rename_events(self):
        if self.start_events_xml:
            start_event_id = self.start_events_xml[0].get('id')
            self.element_names[start_event_id] = "Start Event"

        for i, end_event in enumerate(self.end_events_xml):
            end_event_id = end_event.get('id')
            self.element_names[end_event_id] = f"End Event {i+1}"

    def _get_all_paths(self, graph, start_node, end_nodes):
        paths = []
        stack = [(start_node, [start_node])]
        while stack:
            (vertex, path) = stack.pop()
            neighbors = graph.get(vertex, [])
            for next_node in neighbors:
                if next_node in path:
                    continue

                new_path = list(path)
                new_path.append(next_node)

                if next_node in end_nodes:
                    paths.append(new_path)
                else:
                    stack.append((next_node, new_path))
        return paths

    def _trace_inclusive_branches(self, split_id: str, join_id: str) -> List[InclusiveTrace]:
        traces = []
        trace_counter = 1

        start_nodes = self.graph.get(split_id, [])
        end_nodes = {flow.get('sourceRef')
                     for flow in self.flows_by_target.get(join_id, [])}

        if not start_nodes or not end_nodes:
            return []

        for start_node in start_nodes:
            queue = deque([start_node])
            visited = {start_node, split_id, join_id}

            reachable_end_nodes = set()

            while queue:
                current_node = queue.popleft()

                if current_node in end_nodes:
                    reachable_end_nodes.add(current_node)

                for neighbor in self.graph.get(current_node, []):
                    if neighbor not in visited:
                        visited.add(neighbor)
                        queue.append(neighbor)

            for end_node in reachable_end_nodes:
                trace = InclusiveTrace(
                    trace_id=trace_counter,
                    start_object_id=start_node,
                    end_object_id=end_node
                )
                traces.append(trace)
                trace_counter += 1

        return traces

    def _pair_and_rename_gateways(self):
        errors = []
        splits_by_type = defaultdict(list)
        joins_by_type = defaultdict(list)

        for gw_id, gw in self.gateways_xml.items():
            incoming = len(self.flows_by_target.get(gw_id, []))
            outgoing = len(self.flows_by_source.get(gw_id, []))
            tag_name = gw.tag.split('}')[1].lower()
            gw_type = ''
            if tag_name.endswith('exclusivegateway'):
                gw_type = 'exclusive'
            elif tag_name.endswith('parallelgateway'):
                gw_type = 'parallel'
            elif tag_name.endswith('inclusivegateway'):
                gw_type = 'inclusive'

            if gw_type:
                if incoming == 1 and outgoing > 1:
                    splits_by_type[gw_type].append(gw_id)
                elif incoming > 1 and outgoing == 1:
                    joins_by_type[gw_type].append(gw_id)

        all_split_ids = {sid for s_list in splits_by_type.values()
                         for sid in s_list}

        paired_gateways = set()

        pair_id_counter = 1

        naming_counters = defaultdict(lambda: 1)

        loop_counter = 1

        self.gateway_pairs_data = {}

        start_node_id = self.start_events_xml[0].get(
            'id') if self.start_events_xml else None
        if not start_node_id:
            errors.append(
                "Validation Failed: No start event found to begin path traversal.")
            return errors
        all_paths = self._get_all_paths(
            self.graph, start_node_id, self.end_event_ids)

        queue = deque([start_node_id])
        visited_for_pairing = {start_node_id}

        while queue:
            current_id = queue.popleft()

            if current_id in all_split_ids and current_id not in paired_gateways:
                split_id = current_id
                gw_element = self.gateways_xml[split_id]

                tag_name = gw_element.tag.split('}')[1].lower()
                gw_type_str = ''
                if tag_name.endswith('exclusivegateway'):
                    gw_type_str = 'exclusive'
                elif tag_name.endswith('parallelgateway'):
                    gw_type_str = 'parallel'
                elif tag_name.endswith('inclusivegateway'):
                    gw_type_str = 'inclusive'

                potential_joins = [j for j in joins_by_type.get(
                    gw_type_str, []) if j not in paired_gateways]
                match = self._find_join_for_split(
                    split_id, self.graph, potential_joins)

                if match:
                    is_loop = False
                    if gw_type_str == 'exclusive':
                        join_always_first = True
                        found_pair_in_path = False
                        for path in all_paths:
                            try:
                                idx_split, idx_join = path.index(
                                    split_id), path.index(match)
                                found_pair_in_path = True
                                if idx_split < idx_join:
                                    join_always_first = False
                                    break
                            except ValueError:
                                continue
                        if found_pair_in_path and join_always_first:
                            is_loop = True

                    paired_gateways.add(split_id)
                    paired_gateways.add(match)

                    type_name_map = {'exclusive': 'Exclusive',
                                     'parallel': 'Parallel', 'inclusive': 'Inclusive'}
                    base_name = type_name_map.get(gw_type_str, 'Gateway')

                    name_count = naming_counters[base_name]

                    if is_loop:
                        self.element_names[
                            match] = f"{base_name} {name_count} -- Join (Loop {loop_counter} In)"
                        self.element_names[
                            split_id] = f"{base_name} {name_count} -- Split (Loop {loop_counter} Out)"
                        loop_counter += 1
                    else:
                        self.element_names[match] = f"{base_name} {name_count} -- Join"
                        self.element_names[split_id] = f"{base_name} {name_count} -- Split"

                    traces = []
                    if base_name == 'Inclusive':
                        traces = self._trace_inclusive_branches(
                            split_id, match)

                    self.gateway_pairs_data[pair_id_counter] = BPMNGatewayPair(
                        pair_id=pair_id_counter,
                        gateway_type=base_name,
                        split_gateway_id=split_id,
                        join_gateway_id=match,
                        is_loop=is_loop,
                        inclusive_traces=traces
                    )

                    naming_counters[base_name] += 1
                    pair_id_counter += 1

            for neighbor in self.graph.get(current_id, []):
                if neighbor not in visited_for_pairing:
                    visited_for_pairing.add(neighbor)
                    queue.append(neighbor)

        unpaired = set(self.gateways_xml.keys()) - paired_gateways
        for gw_id in unpaired:
            errors.append(
                f"Validation Failed [Rule 4]: Gateway '{self.gateways_xml[gw_id].get('name', gw_id)}' ({gw_id}) could not be paired. This violates the SESE (Single Entry, Single Exit) principle.")
        return errors

    def _find_join_for_split(self, split_id, graph, potential_joins):
        children = graph.get(split_id, [])
        if len(children) < 2:
            return None
        visited_from_child = defaultdict(set)
        queue = deque([(child, child) for child in children])
        terminated_branches = set()
        for child in children:
            visited_from_child[child].add(child)
        max_depth = len(self.elements_xml)
        depth = 0
        nodes_at_current_depth = len(queue)
        while queue and depth < max_depth:
            current_node, origin_child = queue.popleft()
            nodes_at_current_depth -= 1
            if current_node in self.end_event_ids:
                terminated_branches.add(origin_child)
                for join_candidate in potential_joins:
                    if visited_from_child[join_candidate] | terminated_branches == set(children):
                        return join_candidate
                if nodes_at_current_depth == 0:
                    depth += 1
                    nodes_at_current_depth = len(queue)
                continue
            if current_node in potential_joins:
                if visited_from_child[current_node] | terminated_branches == set(children):
                    return current_node
            for neighbor in graph.get(current_node, []):
                if origin_child not in visited_from_child[neighbor]:
                    visited_from_child[neighbor].add(origin_child)
                    queue.append((neighbor, origin_child))
            if nodes_at_current_depth == 0:
                depth += 1
                nodes_at_current_depth = len(queue)
        if terminated_branches == set(children):
            return None
        return None

    def _check_start_end_events(self):
        errors = []
        if len(self.start_events_xml) != 1:
            errors.append(
                f"Validation Failed [Rule 1]: The process must have exactly one start event, but {len(self.start_events_xml)} were found.")
        if len(self.end_events_xml) < 1:
            errors.append(
                "Validation Failed [Rule 1]: The process must have at least one end event, but 0 were found.")
        return errors

    def _check_task_connectivity(self):

        errors = []
        for task_id, task in self.tasks_xml.items():
            task_name = task.get('name', task_id) or task_id
            incoming_count, outgoing_count = len(self.flows_by_target.get(
                task_id, [])), len(self.flows_by_source.get(task_id, []))
            if incoming_count != 1:
                errors.append(
                    f"Validation Failed [Rule 2]: Task '{task_name}' ({task_id}) must have one incoming flow, but {incoming_count} were found.")
            if outgoing_count != 1:
                errors.append(
                    f"Validation Failed [Rule 2]: Task '{task_name}' ({task_id}) must have one outgoing flow, but {outgoing_count} were found.")
        return errors

    def _check_gateway_structure(self):
        errors = []
        for gw_id, gw in self.gateways_xml.items():
            gw_name = gw.get('name', gw_id)
            incoming_count, outgoing_count = len(self.flows_by_target.get(
                gw_id, [])), len(self.flows_by_source.get(gw_id, []))
            is_split, is_join = (incoming_count == 1 and outgoing_count >
                                 1), (incoming_count > 1 and outgoing_count == 1)
            if not is_split and not is_join:
                errors.append(
                    f"Validation Failed [Rule 3]: Gateway '{gw_name}' ({gw_id}) has an incorrect structure. It has {incoming_count} incoming and {outgoing_count} outgoing flows, which fits neither a Split (1 in, >1 out) nor a Join (>1 in, 1 out) definition.")
        return errors

    def get_relation_centric_representation(self):
        relations = []
        for source_id, flows in self.flows_by_source.items():
            for flow in flows:
                target_id = flow.get('targetRef')
                source_name = self.element_names.get(source_id) or self.elements_xml.get(
                    source_id, {}).get('name') or source_id
                target_name = self.element_names.get(target_id) or self.elements_xml.get(
                    target_id, {}).get('name') or target_id
                relations.append((source_name, target_name))
        return relations
