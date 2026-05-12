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

const PanelTitle = styled.div`
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #9b0000;
`;

const EventName = styled.div`
  font-weight: 600;
  font-size: 0.85rem;
  color: #222;
  border-bottom: 1px solid #eee;
  padding-bottom: 0.5rem;
  word-break: break-word;
`;

const FieldRow = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
`;

const FieldHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: baseline;
`;

const FieldLabel = styled.label`
  font-size: 0.75rem;
  font-weight: 600;
  color: #444;
`;

const OptionalBadge = styled.span`
  font-size: 0.65rem;
  color: #aaa;
  font-style: italic;
`;

const ClearButton = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  color: #bbb;
  font-size: 0.75rem;
  padding: 0;
  line-height: 1;
  &:hover { color: #9b0000; }
`;

const InputWrapper = styled.div`
  display: flex;
  align-items: center;
  border: 1px solid #ccc;
  border-radius: 4px;
  overflow: hidden;
  &:focus-within { border-color: #9b0000; }
`;

const NumberInput = styled.input`
  flex: 1;
  padding: 0.3rem 0.4rem;
  border: none;
  font-size: 0.85rem;
  box-sizing: border-box;
  &:focus { outline: none; }
`;


const ParetoNote = styled.div`
  font-size: 0.65rem;
  color: #aaa;
  border-top: 1px solid #f0f0f0;
  padding-top: 0.5rem;
  line-height: 1.4;
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

  const clearField = (key: 'cost' | 'duration') => {
    if (key === 'cost') setCost('');
    else setDuration('');
    updateProperty(key, '');
  };

  if (!selectedEl) return null;

  const label = selectedEl.businessObject?.description || selectedEl.businessObject?.id || 'Event';

  return (
    <Panel>
      <PanelTitle>Event Properties</PanelTitle>
      <EventName title={label}>{label}</EventName>

      <FieldRow>
        <FieldHeader>
          <FieldLabel>Cost <OptionalBadge>(optional)</OptionalBadge></FieldLabel>
          {cost !== '' && <ClearButton onClick={() => clearField('cost')} title="Remove cost">×</ClearButton>}
        </FieldHeader>
        <InputWrapper>
          <NumberInput
            type="number"
            min={0}
            value={cost}
            placeholder="not set"
            onChange={e => { setCost(e.target.value); updateProperty('cost', e.target.value); }}
          />
        </InputWrapper>
      </FieldRow>

      <FieldRow>
        <FieldHeader>
          <FieldLabel>Duration <OptionalBadge>(optional)</OptionalBadge></FieldLabel>
          {duration !== '' && <ClearButton onClick={() => clearField('duration')} title="Remove duration">×</ClearButton>}
        </FieldHeader>
        <InputWrapper>
          <NumberInput
            type="number"
            min={0}
            value={duration}
            placeholder="not set"
            onChange={e => { setDuration(e.target.value); updateProperty('duration', e.target.value); }}
          />
        </InputWrapper>
      </FieldRow>

      <ParetoNote>
        Events without cost or duration are excluded from Pareto analysis.
      </ParetoNote>
    </Panel>
  );
}
