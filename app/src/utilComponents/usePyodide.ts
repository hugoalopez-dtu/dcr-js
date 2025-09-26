import { useEffect, useState, useRef } from 'react';

declare global {
  function loadPyodide(): Promise<any>;
}

export interface PyodideInstance {
  runPython: (code: string) => any;
  globals: any;
  FS: any;
  loadPackagesFromImports: (code: string) => Promise<void>;
}

export const usePyodide = () => {
  const [pyodide, setPyodide] = useState<PyodideInstance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const initPromiseRef = useRef<Promise<PyodideInstance> | null>(null);

  useEffect(() => {
    const initializePyodide = async (): Promise<PyodideInstance> => {
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
        
        return pyodideInstance;
      } catch (err) {
        throw new Error(`Failed to initialize Pyodide: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    };

    const loadPyodideInstance = async () => {
      if (initPromiseRef.current) {
        return initPromiseRef.current;
      }

      initPromiseRef.current = initializePyodide();
      
      try {
        const instance = await initPromiseRef.current;
        setPyodide(instance);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load Pyodide');
        console.error('Pyodide initialization failed:', err);
      } finally {
        setLoading(false);
      }
    };

    loadPyodideInstance();
  }, []);

  const runPython = async (code: string) => {
    if (!pyodide) {
      throw new Error('Pyodide not initialized');
    }
    
    try {
      return pyodide.runPython(code);
    } catch (err) {
      console.error('Python execution error:', err);
      throw err;
    }
  };

  return {
    pyodide,
    loading,
    error,
    runPython
  };
};