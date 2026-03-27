import xml.etree.ElementTree as ET
from xml.dom import minidom
from translation_engine import DCRGraph


class DCRGenerator:

    def __init__(self, dcr_graph: DCRGraph):
        self.dcr_graph = dcr_graph

    def to_xml(self, output_file_path: str):
        dcrgraph_root = ET.Element('dcrgraph')

        specification = self._create_specification()
        dcrgraph_root.append(specification)

        runtime = self._create_runtime()
        dcrgraph_root.append(runtime)

        xml_str = ET.tostring(dcrgraph_root, 'unicode')
        dom = minidom.parseString(xml_str)
        pretty_xml_str = dom.toprettyxml(indent="  ")

        with open(output_file_path, 'w', encoding='utf-8') as f:
            f.write(pretty_xml_str)

    def _create_specification(self):
        specification = ET.Element('specification')

        resources = ET.SubElement(specification, 'resources')
        events_xml = ET.SubElement(resources, 'events')
        labels_xml = ET.SubElement(resources, 'labels')
        label_mappings_xml = ET.SubElement(resources, 'labelMappings')

        ET.SubElement(resources, 'subProcesses')
        ET.SubElement(resources, 'variables')
        ET.SubElement(resources, 'expressions')
        variable_accesses = ET.SubElement(resources, 'variableAccesses')
        ET.SubElement(variable_accesses, 'readAccessess')
        ET.SubElement(variable_accesses, 'writeAccessess')

        unique_labels = set(self.dcr_graph.labelling_function.values())
        for label_text in sorted(list(unique_labels)):
            ET.SubElement(labels_xml, 'label', {'id': label_text})

        x_pos, y_pos, x_step, y_step, max_x = 100, 100, 180, 200, 900
        for event in self.dcr_graph.events.values():
            event_el = ET.SubElement(events_xml, 'event', {'id': event.id})

            custom = ET.SubElement(event_el, 'custom')
            visualization = ET.SubElement(custom, 'visualization')
            ET.SubElement(visualization, 'location', {
                          'xLoc': str(x_pos), 'yLoc': str(y_pos)})
            ET.SubElement(visualization, 'size', {
                          'width': "130", 'height': "150"})
            x_pos += x_step
            if x_pos > max_x:
                x_pos = 100
                y_pos += y_step

            ET.SubElement(label_mappings_xml, 'labelMapping', {
                          'eventId': event.id, 'labelId': event.label})

        constraints = ET.SubElement(specification, 'constraints')
        conditions = ET.SubElement(constraints, 'conditions')
        responses = ET.SubElement(constraints, 'responses')
        includes = ET.SubElement(constraints, 'includes')
        excludes = ET.SubElement(constraints, 'excludes')

        ET.SubElement(constraints, 'coresponces')
        ET.SubElement(constraints, 'milestones')
        ET.SubElement(constraints, 'updates')
        ET.SubElement(constraints, 'spawns')

        relation_counter = 1
        for rel in self.dcr_graph.relations:
            rel_attrs = {'sourceId': rel.source_id, 'targetId': rel.target_id}

            relation_map = {
                'condition': conditions,
                'response': responses,
                'exclude': excludes,
                'include': includes
            }

            if rel.relation_type in relation_map:
                parent_xml_element = relation_map[rel.relation_type]
                rel_el = ET.SubElement(
                    parent_xml_element, rel.relation_type, rel_attrs)

                custom = ET.SubElement(rel_el, 'custom')
                ET.SubElement(custom, 'waypoints')
                ET.SubElement(
                    custom, 'id', {'id': f'Relation_{relation_counter}'})
                relation_counter += 1

        return specification

    def _create_runtime(self):
        runtime = ET.Element('runtime')
        marking = ET.SubElement(runtime, 'marking')

        executed = ET.SubElement(marking, 'executed')
        included = ET.SubElement(marking, 'included')
        pending_responses = ET.SubElement(marking, 'pendingResponses')
        ET.SubElement(marking, 'globalStore')

        for event_id, (is_executed, is_included, is_pending) in self.dcr_graph.initial_marking.items():
            if is_executed: 
                ET.SubElement(executed, 'event', {'id': event_id})
            if is_included:
                ET.SubElement(included, 'event', {'id': event_id})
            if is_pending:
                ET.SubElement(pending_responses, 'event', {'id': event_id})

        return runtime
