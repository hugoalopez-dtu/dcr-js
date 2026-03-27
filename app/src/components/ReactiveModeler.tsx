import { useEffect, useRef } from "react";
import DCRModeler from "modeler";
import type { ColoredRelations, MarkerNotation } from "../types";

export type TargetElement = {
  type: string;
  id: string;
  businessObject: { description?: string | null; role?: string | null };
};

type ClickElementEventData = {
  element: TargetElement;
};

interface ModelerProps {
  modeler: DCRModeler | null;
  setModeler: (modeler: DCRModeler | null) => void;
  coloredRelations: ColoredRelations;
  markerNotation: MarkerNotation;
  isSimulating: boolean;
  disableControls: boolean;
  onView?(event: unknown): void;
  onSelect?(event: unknown): void;
  onImport?(event: unknown): void;
  onClickElement?(event: ClickElementEventData): void;
  onDoubleClickElement?(event: unknown): void;
  onHoverElement?(event: unknown): void;
  onElementChanged?(event: unknown): void;
  onConnectionChanged?(event: unknown): void;
  className?: string;
}

function Modeler({
  modeler,
  setModeler,
  coloredRelations,
  markerNotation,
  isSimulating,
  disableControls,
  onView,
  onSelect,
  onImport,
  onClickElement,
  onDoubleClickElement,
  onHoverElement,
  onElementChanged,
  onConnectionChanged,
  className,
}: ModelerProps) {
  const canvasRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const options: any = {
      container: canvasRef.current,
      keyboard: {
        bindTo: window,
      },
    };

    if (disableControls) {
      options.additionalModules = [
        {
          palette: ["value", null],
          paletteProvider: ["value", null],
          bendpoints: ["value", null],
          move: ["value", null],
          keyboard: ["value", null],
          keyboardMove: ["value", null],
          keyboardMoveSelection: ["value", null],
          keyboardBindings: ["value", null],
          labelEditing: ["value", null],
          labelEditingProvider: ["value", null],
        },
      ];
    }

    const modeler = new DCRModeler(options);
    setModeler(modeler);

    return () => {
      setModeler(null);
      modeler.destroy();
    };
  }, [disableControls, setModeler]);

  useEffect(() => {
    if (modeler) {
      modeler.setSimulating(isSimulating);
    }
  }, [isSimulating, modeler]);

  useEffect(() => {
    if (modeler) {
      modeler.setSetting("blackRelations", !coloredRelations);
    }
  }, [modeler, coloredRelations]);

  useEffect(() => {
    if (modeler) {
      modeler.setSetting("markerNotation", markerNotation);
    }
  }, [modeler, markerNotation]);

  useEffect(() => {
    if (!modeler || !onView) {
      return;
    }

    modeler.on("canvas.viewbox.changed", onView);
    return () => modeler.off("canvas.viewbox.changed", onView);
  }, [modeler, onView]);

  useEffect(() => {
    if (!modeler || !onSelect) {
      return;
    }

    modeler.on("selection.changed", onSelect);
    return () => modeler.off("selection.changed", onSelect);
  }, [modeler, onSelect]);

  useEffect(() => {
    if (!modeler || !onImport) {
      return;
    }

    modeler.on("import.done", onImport);
    return () => modeler.off("import.done", onImport);
  }, [modeler, onImport]);

  useEffect(() => {
    if (!modeler || !onClickElement) {
      return;
    }

    modeler.on("element.click", onClickElement);
    return () => modeler.off("element.click", onClickElement);
  }, [onClickElement, modeler]);

  useEffect(() => {
    if (!modeler || !onDoubleClickElement) {
      return;
    }

    modeler.on("element.dblclick", onDoubleClickElement);
    return () => modeler.off("element.dblclick", onDoubleClickElement);
  }, [modeler, onDoubleClickElement]);

  useEffect(() => {
    if (!modeler || !onHoverElement) {
      return;
    }

    modeler.on("element.hover", onHoverElement);
    return () => modeler.off("element.hover", onHoverElement);
  }, [modeler, onHoverElement]);

  useEffect(() => {
    if (!modeler || !onElementChanged) {
      return;
    }
    modeler.on("element.changed", onElementChanged);
    return () => modeler.off("element.changed", onElementChanged);
  }, [modeler, onElementChanged]);

  useEffect(() => {
    if (!modeler || !onConnectionChanged) {
      return;
    }
    modeler.on("connection.changed", onConnectionChanged);
    return () => modeler.off("connection.changed", onConnectionChanged);
  }, [modeler, onConnectionChanged]);

  return <div ref={canvasRef} id="canvas" className={className} />;
}

export default Modeler;
