import { useEffect, useState } from 'react';
import DCRModeler from 'modeler';
import styled from 'styled-components';

interface Props {
  modelerRef: React.RefObject<DCRModeler | null>;
}

const Panel = styled.div`
  position: fixed;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 13rem;
  background: #fff;
  border: 1px solid #ddd;
  border-left: none;
  border-radius: 0 8px 8px 0;
  box-shadow: 2px 2px 8px rgba(0,0,0,0.12);
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  z-index: 100;
`;

const EventName = styled.div`
  font-weight: 600;
  font-size: 0.85rem;
  color: #222;
  border-bottom: 1px solid #eee;
  padding-bottom: 0.5rem;
  word-break: break-word;
`;

const FieldLabel = styled.label`
  font-size: 0.75rem;
  color: #555;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
`;

const NumberInput = styled.input`
  width: 100%;
  padding: 0.3rem 0.4rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 0.85rem;
  box-sizing: border-box;
  &:focus {
    outline: none;
    border-color: #9b0000;
  }
`;

const UnitHint = styled.span`
  font-size: 0.7rem;
  color: #999;
`;

export default function EventPropertiesPanel({ modelerRef }: Props) {
  const [selectedEl, setSelectedEl] = useState<any>(null);
  const [cost, setCost] = useState<string>('');
  const [duration, setDuration] = useState<string>('');

  useEffect(() => {
    const modeler = modelerRef.current;
    if (!modeler) return;

    const handler = (e: any) => {
      const el = e.newSelection?.[0];
      if (el?.type === 'dcr:Event') {
        setSelectedEl(el);
        const bo = el.businessObject;
        setCost(bo.cost !== undefined && bo.cost !== null ? String(bo.cost) : '');
        setDuration(bo.duration !== undefined && bo.duration !== null ? String(bo.duration) : '');
      } else {
        setSelectedEl(null);
      }
    };

    modeler.on('selection.changed', handler);
    return () => modeler.off('selection.changed', handler);
  }, []);

  const updateProperty = (key: 'cost' | 'duration', raw: string) => {
    if (!modelerRef.current || !selectedEl) return;
    const val = raw === '' ? null : parseInt(raw, 10);
    if (raw !== '' && isNaN(val as number)) return;
    const modeling = modelerRef.current.get('modeling');
    modeling.updateProperties(selectedEl, { [key]: val });
  };

  if (!selectedEl) return null;

  const label = selectedEl.businessObject?.description || selectedEl.businessObject?.id || 'Event';

  return (
    <Panel>
      <EventName title={label}>{label}</EventName>

      <FieldLabel>
        Cost
        <UnitHint>monetary units (≥ 0)</UnitHint>
        <NumberInput
          type="number"
          min={0}
          value={cost}
          placeholder="e.g. 100"
          onChange={e => { setCost(e.target.value); updateProperty('cost', e.target.value); }}
        />
      </FieldLabel>

      <FieldLabel>
        Duration
        <UnitHint>time units (≥ 0)</UnitHint>
        <NumberInput
          type="number"
          min={0}
          value={duration}
          placeholder="e.g. 20"
          onChange={e => { setDuration(e.target.value); updateProperty('duration', e.target.value); }}
        />
      </FieldLabel>
    </Panel>
  );
}
