from dataclasses import dataclass, field
from typing import List, Dict, Literal, Tuple
from bpmn_parser import BPMNProcess, BPMNObject


@dataclass
class DCREvent:
    id: str
    label: str


@dataclass(frozen=True)
class DCRRelation:
    source_id: str
    target_id: str
    relation_type: Literal['condition', 'response', 'include', 'exclude']


@dataclass
class DCRGraph:
    events: Dict[str, DCREvent] = field(default_factory=dict)
    relations: List[DCRRelation] = field(default_factory=list)
    initial_marking: Dict[str, Tuple[bool, bool, bool]
                          ] = field(default_factory=dict)
    labelling_function: Dict[str, str] = field(default_factory=dict)


class TranslationEngine:

    def __init__(self, bpmn_process: BPMNProcess):
        self.bpmn_process = bpmn_process
        self.dcr_graph = DCRGraph()
        self.auxiliary_event_counters = {"AND": 0, "OR": 0}
        self.or_join_flow_map: Dict[str, Tuple[str, str]] = {}

    def translate(self) -> DCRGraph:
        self._preprocess_bpmn_model()
        self._perform_object_mapping()
        self._prepare_dcr_mappings()
        self._perform_relation_mapping()
        self.dcr_graph.relations = list(set(self.dcr_graph.relations))
        return self.dcr_graph

    def _preprocess_bpmn_model(self):
        inclusive_pairs = [p for p in self.bpmn_process.gateway_pairs.values(
        ) if p.gateway_type == 'Inclusive']
        trigger_counter = 1

        for pair in inclusive_pairs:
            for trace in pair.inclusive_traces:
                start_obj = self.bpmn_process.objects.get(
                    trace.start_object_id)
                if start_obj and trace.start_object_id == trace.end_object_id and start_obj.element_type == 'Task':
                    task_obj = start_obj

                    trigger_id = f"or_{pair.pair_id}_trigger_{trigger_counter}"
                    trigger_name = f"OR {pair.pair_id} Trigger {trigger_counter}"
                    trigger_obj = BPMNObject(
                        id=trigger_id, element_type='Task', name=trigger_name, system_name=trigger_name)
                    self.bpmn_process.objects[trigger_id] = trigger_obj
                    trigger_counter += 1

                    flow_to_task_id = next((fid for fid, (s, t) in self.bpmn_process.sequence_flows.items(
                    ) if s == pair.split_gateway_id and t == task_obj.id), None)
                    if flow_to_task_id:
                        self.bpmn_process.sequence_flows[flow_to_task_id] = (
                            pair.split_gateway_id, trigger_id)
                        trigger_obj.incoming_flows.append(flow_to_task_id)

                    new_flow_id = f"flow_{trigger_id}_{task_obj.id}"
                    self.bpmn_process.sequence_flows[new_flow_id] = (
                        trigger_id, task_obj.id)

                    if flow_to_task_id in task_obj.incoming_flows:
                        task_obj.incoming_flows.remove(flow_to_task_id)
                    task_obj.incoming_flows.append(new_flow_id)
                    trigger_obj.outgoing_flows.append(new_flow_id)

                    trace.start_object_id = trigger_id

    def _perform_object_mapping(self):
        for bpmn_obj in self.bpmn_process.objects.values():
            event_id, label = bpmn_obj.id, bpmn_obj.system_name
            initial_marking = (False, True, True) if bpmn_obj.event_type == 'StartEvent' else (
                False, False, False)

            self.dcr_graph.events[event_id] = DCREvent(
                id=event_id, label=label)
            self.dcr_graph.initial_marking[event_id] = initial_marking
            self.dcr_graph.labelling_function[event_id] = label
            self.dcr_graph.relations.append(
                DCRRelation(event_id, event_id, 'exclude'))

    def _prepare_dcr_mappings(self):
        inclusive_pairs = [p for p in self.bpmn_process.gateway_pairs.values(
        ) if p.gateway_type == 'Inclusive']
        for pair in inclusive_pairs:
            for trace in pair.inclusive_traces:
                flow_into_join_id = next((fid for fid, (s, t) in self.bpmn_process.sequence_flows.items()
                                          if s == trace.end_object_id and t == pair.join_gateway_id), None)
                if flow_into_join_id:
                    aux_event_id = self._create_auxiliary_event(
                        "OR", trace.trace_id)
                    self.or_join_flow_map[flow_into_join_id] = (
                        aux_event_id, trace.start_object_id)

    def _create_auxiliary_event(self, event_type: Literal["AND", "OR"], unique_ref) -> str:
        self.auxiliary_event_counters[event_type] += 1
        counter = self.auxiliary_event_counters[event_type]
        event_id = f"s_{counter}_{event_type}_{unique_ref}"
        label = f"{event_type} State {counter}"

        initial_marking = (False, True, False) if event_type == "AND" else (
            False, False, False)

        if event_id not in self.dcr_graph.events:
            self.dcr_graph.events[event_id] = DCREvent(
                id=event_id, label=label)
            self.dcr_graph.initial_marking[event_id] = initial_marking
            self.dcr_graph.labelling_function[event_id] = label
            self.dcr_graph.relations.append(
                DCRRelation(event_id, event_id, 'exclude'))
        return event_id

    def _perform_relation_mapping(self):
        split_ids = {
            p.split_gateway_id for p in self.bpmn_process.gateway_pairs.values()}
        join_ids = {
            p.join_gateway_id for p in self.bpmn_process.gateway_pairs.values()}

        for flow_id, (source_id, target_id) in self.bpmn_process.sequence_flows.items():
            source_obj = self.bpmn_process.objects.get(source_id)
            if not source_obj:
                continue

            is_gateway_rel = source_id in split_ids or target_id in join_ids
            if not is_gateway_rel:
                self._map_basic_relation(source_id, target_id)
            else:
                gateway_obj = source_obj if source_id in split_ids else self.bpmn_process.objects[
                    target_id]
                if gateway_obj.gateway_type == 'Exclusive':
                    self._map_xor_gateway_relation(source_id, target_id)
                elif gateway_obj.gateway_type == 'Parallel':
                    self._map_and_gateway_relation(source_id, target_id)
                elif gateway_obj.gateway_type == 'Inclusive':
                    self._map_or_gateway_relation(
                        source_id, target_id, flow_id)

    def _map_basic_relation(self, source_id: str, target_id: str):
        self.dcr_graph.relations.append(
            DCRRelation(source_id, target_id, 'response'))
        self.dcr_graph.relations.append(
            DCRRelation(source_id, target_id, 'include'))

    def _map_xor_gateway_relation(self, source_id: str, target_id: str):
        source_obj = self.bpmn_process.objects[source_id]
        if source_obj.gateway_function == 'Split':
            self._map_basic_relation(source_id, target_id)
            all_targets = [self.bpmn_process.sequence_flows[fid][1]
                           for fid in source_obj.outgoing_flows]
            for sibling_id in all_targets:
                if target_id != sibling_id:
                    self.dcr_graph.relations.append(
                        DCRRelation(target_id, sibling_id, 'exclude'))
                    self.dcr_graph.relations.append(
                        DCRRelation(sibling_id, target_id, 'exclude'))
        else:
            self._map_basic_relation(source_id, target_id)

    def _map_and_gateway_relation(self, source_id: str, target_id: str):
        source_obj = self.bpmn_process.objects[source_id]
        if source_obj.gateway_function == 'Split':
            self._map_basic_relation(source_id, target_id)
            pair = next(p for p in self.bpmn_process.gateway_pairs.values(
            ) if p.split_gateway_id == source_id)
            self.dcr_graph.relations.append(DCRRelation(
                source_id, pair.join_gateway_id, 'response'))
        else:
            aux_id = self._create_auxiliary_event("AND", source_id)
            self.dcr_graph.relations.append(
                DCRRelation(source_id, aux_id, 'exclude'))
            self.dcr_graph.relations.append(
                DCRRelation(aux_id, target_id, 'condition'))
            self.dcr_graph.relations.append(
                DCRRelation(source_id, target_id, 'include'))

    def _map_or_gateway_relation(self, source_id: str, target_id: str, flow_id: str):
        source_obj = self.bpmn_process.objects[source_id]
        if source_obj.gateway_function == 'Split':
            pair = next(p for p in self.bpmn_process.gateway_pairs.values(
            ) if p.split_gateway_id == source_id)
            self._map_basic_relation(source_id, target_id)
            self.dcr_graph.relations.append(DCRRelation(
                source_id, pair.join_gateway_id, 'response'))
            self.dcr_graph.relations.append(DCRRelation(
                pair.join_gateway_id, target_id, 'exclude'))
        else:
            if flow_id in self.or_join_flow_map:
                aux_event_id, trace_start_id = self.or_join_flow_map[flow_id]
                self.dcr_graph.relations.append(
                    DCRRelation(source_id, aux_event_id, 'exclude'))
                self.dcr_graph.relations.append(
                    DCRRelation(aux_event_id, target_id, 'condition'))
                self.dcr_graph.relations.append(
                    DCRRelation(source_id, target_id, 'include'))
                self.dcr_graph.relations.append(DCRRelation(
                    trace_start_id, aux_event_id, 'include'))
