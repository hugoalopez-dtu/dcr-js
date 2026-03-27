import { useState } from 'react';
import { toast } from 'react-toastify';
import DCRModeler from 'modeler';
declare global {
  function loadPyodide(): Promise<any>;
}

export const useBPMN = (
  modeler: DCRModeler | null,
  setGraphName: (name: string) => void,
  setLoading: (loading: boolean) => void,
  autoLayout: () => void
) => {

  const [pyodideState, setPyodideState] = useState<{
    pyodide: any | null;
    loading: boolean;
    error: string | null;
  }>({ pyodide: null, loading: false, error: null });

  const initializePyodide = async () => {
    if (pyodideState.pyodide) {
      return pyodideState.pyodide;
    }

    if (pyodideState.loading) {
      return new Promise((resolve) => {
        const checkInit = () => {
          if (pyodideState.pyodide) {
            resolve(pyodideState.pyodide);
          } else if (!pyodideState.loading && pyodideState.error) {
            throw new Error(pyodideState.error);
          } else {
            setTimeout(checkInit, 100);
          }
        };
        checkInit();
      });
    }

    setPyodideState({ pyodide: null, loading: true, error: null });

    try {
      if (typeof loadPyodide === 'undefined') {
        throw new Error('Pyodide CDN script not loaded');
      }

      const pyodideInstance = await loadPyodide();

      await pyodideInstance.loadPackagesFromImports(`
import xml.etree.ElementTree as ET
from xml.dom import minidom
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Literal, Set, Tuple
      `);

      setPyodideState({ pyodide: pyodideInstance, loading: false, error: null });
      return pyodideInstance;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setPyodideState({ pyodide: null, loading: false, error: errorMessage });
      throw new Error(`Failed to initialize Pyodide: ${errorMessage}`);
    }
  };

const convertBpmnToDcr = async (bpmnXmlContent: string, fileName?: string) => {
    try {
      setLoading(true);

      const pyodide = await initializePyodide();

      await pyodide.loadPackagesFromImports(`
import tempfile
import os
from xml.dom import minidom
      `);

      const bpmnParserCode = await fetch('/dcr-js/bpmn2dcr-pycore/bpmn_parser.py').then(r => r.text());
      const translationEngineCode = await fetch('/dcr-js/bpmn2dcr-pycore/translation_engine.py').then(r => r.text());
      const dcrGeneratorCode = await fetch('/dcr-js/bpmn2dcr-pycore/dcr_generator.py').then(r => r.text());

      const cleanBpmnParserCode = bpmnParserCode;
      const cleanTranslationEngineCode = translationEngineCode.replace('from bpmn_parser import BPMNProcess, BPMNObject', '');
      const cleanDcrGeneratorCode = dcrGeneratorCode.replace('from translation_engine import DCRGraph', '');

      const combinedPythonCode = `
${cleanBpmnParserCode}

${cleanTranslationEngineCode}

${cleanDcrGeneratorCode}

def convert_bpmn_to_dcr_xml(bpmn_xml_content):
    import tempfile
    import os
    
    with tempfile.NamedTemporaryFile(mode='w', suffix='.bpmn', delete=False, encoding='utf-8') as temp_bpmn:
        temp_bpmn.write(bpmn_xml_content)
        temp_bpmn_path = temp_bpmn.name
    
    try:
        parser = BPMNParser(temp_bpmn_path)
        bpmn_process, errors = parser.parse_and_validate()
        
        if errors:
            error_message = "\\n".join(errors)
            raise Exception(f"BPMN validation failed:\\n{error_message}")
        
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
      `;

      await pyodide.runPython(combinedPythonCode);

      pyodide.globals.set('bpmn_xml_content', bpmnXmlContent);

      const result = await pyodide.runPython(`
try:
    dcr_xml_result = convert_bpmn_to_dcr_xml(bpmn_xml_content)
    conversion_success = True
    error_message = ""
except Exception as e:
    dcr_xml_result = ""
    conversion_success = False
    error_message = str(e)

{'success': conversion_success, 'dcr_xml': dcr_xml_result, 'error': error_message}
      `);

      if (result.success) {
        const dcrXmlContent = result.dcr_xml;

        if (modeler && modeler.importDCRPortalXML) {
          await modeler.importDCRPortalXML(dcrXmlContent);
          const importName = fileName?.replace(/\.(bpmn|xml)$/, '') || 'Converted from BPMN';
          setGraphName(importName);

          setTimeout(() => {
            autoLayout();
          }, 500);
        } else {
          toast.error("Unable to import converted DCR graph");
        }
      } else {
        toast.error(`Conversion failed: ${result.error}`);
      }
    } catch (error) {
      console.error("Error during BPMN conversion:", error);
      toast.error(`Conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

return {
  convertBpmnToDcr,
  loading: pyodideState.loading
};

};
