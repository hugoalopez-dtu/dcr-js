import tempfile
import os
import xml.etree.ElementTree as ET
from xml.dom import minidom
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Literal, Set, Tuple


def convert_bpmn_to_dcr_xml(bpmn_xml_content: str) -> str:
    
    with tempfile.NamedTemporaryFile(mode='w', suffix='.bpmn', delete=False, encoding='utf-8') as temp_bpmn:
        temp_bpmn.write(bpmn_xml_content)
        temp_bpmn_path = temp_bpmn.name
    
    try:
        parser = BPMNParser(temp_bpmn_path)
        bpmn_process, errors = parser.parse_and_validate()
        
        if errors:
            error_message = "\n".join(errors)
            raise Exception(f"BPMN validation failed:\n{error_message}")
        
        if bpmn_process is None:
            raise Exception("Failed to parse BPMN process")
        
        translator = TranslationEngine(bpmn_process)
        dcr_graph = translator.translate()
        
        generator = DCRGenerator(dcr_graph)
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.xml', delete=False, encoding='utf-8') as temp_dcr:
            temp_dcr_path = temp_dcr.name
        
        generator.to_xml(temp_dcr_path)

        with open(temp_dcr_path, 'r', encoding='utf-8') as f:
            dcr_xml_content = f.read()

        os.unlink(temp_dcr_path)
        
        return dcr_xml_content
        
    finally:
        if os.path.exists(temp_bpmn_path):
            os.unlink(temp_bpmn_path)

def get_conversion_info():
    """
    Returns information about the conversion engine.
    """
    return {
        "name": "BPMN2DCR Python Core",
        "version": "1.0.0",
        "description": "Converts BPMN 2.0 XML to DCR Solution XML format",
        "supported_bpmn_elements": [
            "StartEvent", 
            "EndEvent", 
            "Task", 
            "ExclusiveGateway", 
            "ParallelGateway", 
            "InclusiveGateway"
        ]
    }