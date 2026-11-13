import { useState } from 'react';

declare global {
  function loadPyodide(): Promise<any>;
}

// Runs Jonas's thesis DCR->SMV translation script (dcr_smv.py, bundled as a
// static asset) inside a Pyodide (WASM Python) instance — same approach
// useBPMN.ts already uses for the BPMN->DCR import feature. No server-side
// Python involved; runs entirely in this browser tab.
export const useSMVExport = () => {
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
      `);

      setPyodideState({ pyodide: pyodideInstance, loading: false, error: null });
      return pyodideInstance;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setPyodideState({ pyodide: null, loading: false, error: errorMessage });
      throw new Error(`Failed to initialize Pyodide: ${errorMessage}`);
    }
  };

  // xmlContent must be the flat "Editor XML" shape (modeler.saveXML) — the
  // dcr:event id=.../description=.../ dcr:relation sourceRef=.../ shape,
  // NOT modeler.saveDCRXML()'s nested DCR Portal format. The script parses
  // the former; verified against modeler/lib/DCRXML.js before wiring this.
  const exportSMV = async (xmlContent: string): Promise<string> => {
    const pyodide = await initializePyodide();

    const dcrSmvCode = await fetch(`${import.meta.env.BASE_URL}dcr-smv/dcr_smv.py`).then(r => r.text());
    await pyodide.runPython(dcrSmvCode);

    pyodide.globals.set('xml_content', xmlContent);

    const result = await pyodide.runPython(`
try:
    smv_result = xml_to_smv(xml_content)
    conversion_success = True
    error_message = ""
except Exception as e:
    smv_result = ""
    conversion_success = False
    error_message = str(e)

{'success': conversion_success, 'smv': smv_result, 'error': error_message}
    `);

    if (!result.success) {
      throw new Error(String(result.error));
    }
    return String(result.smv);
  };

  return {
    exportSMV,
    loading: pyodideState.loading,
  };
};
