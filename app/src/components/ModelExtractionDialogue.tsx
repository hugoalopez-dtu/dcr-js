import {useState} from "react";
import styled, {keyframes} from "styled-components";
import {AiOutlineLoading} from "react-icons/ai";
import Popup from "../utilComponents/Popup";
import type {ExtractionConfig} from "dcr-engine/src/extraction";
import {examples} from "../resources/llmResources";

interface ModelInfo {
    label: string;
    id: string;
    pricing: {
        inputPer1M: number;
        outputPer1M: number;
    }
}

interface ProviderMap {
    [providerName: string]: ModelInfo[];
}

const modelsByProvider: ProviderMap = {
    "OpenAI": [
        {
            label: "GPT-6 Astra",
            id: "gpt-6-astra",
            pricing: { inputPer1M: 10.00, outputPer1M: 50.00 }
        },
        {
            label: "GPT-6.1 Sol",
            id: "gpt-6.1-sol",
            pricing: { inputPer1M: 2.00, outputPer1M: 10.00 }
        },
        {
            label: "GPT-6.1 Terra",
            id: "gpt-6.1-terra",
            pricing: { inputPer1M: 1.00, outputPer1M: 5.00 }
        },
        {
            label: "GPT-6 Luna",
            id: "gpt-6-luna",
            pricing: { inputPer1M: 0.10, outputPer1M: 0.50 }
        },
    ],

    "Anthropic": [
        {
            label: "Claude Opus 5.5",
            id: "claude-opus-5-5",
            pricing: { inputPer1M: 4.00, outputPer1M: 20.00 }
        },
        {
            label: "Claude Sonnet 5.5",
            id: "claude-sonnet-5-5",
            pricing: { inputPer1M: 2.00, outputPer1M: 10.00 }
        },
        {
            label: "Claude Haiku 5.5",
            id: "claude-haiku-5-5",
            pricing: { inputPer1M: 0.10, outputPer1M: 0.50 }
        },
        {
            label: "Claude Sonnet 5",
            id: "claude-sonnet-5",
            pricing: { inputPer1M: 2.00, outputPer1M: 10.00 }
        },
        {
            label: "Claude Opus 4.8",
            id: "claude-opus-4-8",
            pricing: { inputPer1M: 5.00, outputPer1M: 25.00 }
        },
        {
            label: "Claude Sonnet 4.6",
            id: "claude-sonnet-4-6",
            pricing: { inputPer1M: 3.00, outputPer1M: 15.00 }
        },
    ],

    "Google": [
        {
            label: "Gemini 4 Argon",
            id: "gemini-4-argon",
            pricing: { inputPer1M: 2.00, outputPer1M: 10.00 }
        },
        {
            label: "Gemini 3.8 Flash",
            id: "gemini-3.8-flash",
            pricing: { inputPer1M: 0.75, outputPer1M: 3.75 }
        },
        {
            label: "Gemini 3.6 Flash",
            id: "gemini-3.6-flash",
            pricing: { inputPer1M: 0.75, outputPer1M: 3.75 }
        },
        {
            label: "Gemini 3.5 Flash-Lite",
            id: "gemini-3.5-flash-lite",
            pricing: { inputPer1M: 0.30, outputPer1M: 2.50 }
        },
        {
            label: "Gemini 3.1 Flash-Lite",
            id: "gemini-3.1-flash-lite",
            pricing: { inputPer1M: 0.25, outputPer1M: 1.50 }
        },
    ],
};

export interface Props {
    config: ExtractionConfig;
    busy: boolean;
    step?: string | null;
    onChange: (config: ExtractionConfig) => void;
    onClose: () => void;
    onSubmit: (config: ExtractionConfig) => void;
}

const Root = styled.div`
    font-size: 14px;
    width: 500px;
`;

const Heading = styled.h2`
    margin: 0 0 0.75rem;
    font-size: 1.1rem;
    font-weight: 600;
`;

const Accordion = styled.div`
    border: 1px solid gainsboro;
    border-radius: 6px;
    overflow: hidden;
`;

const DrawerHeader = styled.button<{ $open: boolean }>`
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: none;
    border-bottom: 1px solid gainsboro;
    background: ${(props) => (props.$open ? "gainsboro" : "white")};
    cursor: pointer;
    font-weight: 600;
    text-align: left;

    &:hover {
        background: gainsboro;
    }
`;

const DrawerBody = styled.div`
    padding: 0.75rem;
    border-bottom: 1px solid gainsboro;
`;

const Field = styled.div`
    display: block;
    margin-bottom: 0.75rem;
    position: relative;
`;

const FieldLabelRow = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.25rem;
    position: relative;
`;

const FieldLabel = styled.span`
    display: block;
    font-weight: 600;
`;

const ExamplesList = styled.div`
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0.75rem;
    border: 1px solid gainsboro;
    border-radius: 6px;
`;

const Input = styled.input`
    display: block;
    width: 100%;
    box-sizing: border-box;
    padding: 0.4rem 0.5rem;
    border: 1px solid gainsboro;
    border-radius: 6px;
    font-size: 14px;
`;

const Select = styled.select`
    display: block;
    width: 100%;
    box-sizing: border-box;
    padding: 0.4rem 0.5rem;
    border: 1px solid gainsboro;
    border-radius: 6px;
    font-size: 14px;
`;



const TextArea = styled.textarea`
    display: block;
    width: 100%;
    box-sizing: border-box;
    padding: 0.4rem 0.5rem;
    border: 1px solid gainsboro;
    border-radius: 6px;
    font-size: 14px;
    min-height: 80px;
    font-family: inherit;
`;

const Button = styled.button`
    padding: 0.4rem 0.75rem;
    border: 1px solid gainsboro;
    border-radius: 6px;
    background: white;
    cursor: pointer;
    font-weight: 600;

    &:hover {
        background: gainsboro;
    }
`;

const ExampleToggle = styled(Button)`
    padding: 0.15rem 0.5rem;
    font-size: 0.8em;
    font-weight: 500;
`;

const SubmitButton = styled(Button)`
    display: block;
    margin: 0.75rem auto 0;
    padding-left: 1.5rem;
    padding-right: 1.5rem;
`;

const spin = keyframes`
    0%{transform: rotate(0deg);}
    100%{transform: rotate(360deg);}
`;

const Spinner = styled(AiOutlineLoading)`
    display: block;
    margin-top: 10px;
    margin-left: auto;
    margin-right: auto;
    width: 25px;
    height: 25px;
    animation: ${spin} 2s linear infinite;
`;

const ProgressText = styled.div`
    margin-top: 10px;
    text-align: center;
    color: #555;
    font-size: 0.9em;
`;

const ModelExtractionDialogue = (props: Props) => {
    const [descriptionsOpen, setDescriptionsOpen] = useState(false);
    const [showExamples, setShowExamples] = useState(false);

    const renderSubmit = () => {
        if (props.busy) {
            return (
                <>
                    <Spinner size="25" />
                    {props.step && <ProgressText>{props.step}</ProgressText>}
                </>
            );
        }

        return (
            <SubmitButton
                disabled={!props.config.apiKey || !props.config.modelName || !props.config.text}
                onClick={() => {
                    props.onSubmit(props.config);
                }}
            >
                Extract
            </SubmitButton>
        );
    };

    return (
        <Popup close={() => props.onClose()}>
            <Root>
                <Heading>Extract Model from Text</Heading>

                <Accordion>
                    <DrawerBody>
                        <Field>
                            <FieldLabel>API Key</FieldLabel>
                            <Input
                                name={"api-key"}
                                value={props.config.apiKey}
                                onChange={(e) =>
                                    props.onChange({
                                        ...props.config,
                                        apiKey: e.target.value,
                                    })
                                }
                            />
                        </Field>

                        <Field>
                            <FieldLabel>Model</FieldLabel>
                            <Select
                                name="model"
                                value={props.config.modelName}
                                onChange={(e) =>
                                    props.onChange({
                                        ...props.config,
                                        modelName: e.target.value,
                                    })
                                }
                            >
                                <option value={""}>Select Model</option>
                                {Object.keys(modelsByProvider).map((provider) => (
                                    <optgroup key={provider} label={provider}>
                                        {modelsByProvider[provider].map((m) => (
                                            <option key={m.id} value={m.id}>
                                                {m.label}
                                            </option>
                                        ))}
                                    </optgroup>
                                ))}
                            </Select>
                        </Field>

                        <Field>
                            <FieldLabelRow>
                                <FieldLabel>Include Data &amp; Expressions</FieldLabel>
                                <input
                                    type="checkbox"
                                    checked={props.config.includeData}
                                    onChange={(e) =>
                                        props.onChange({
                                            ...props.config,
                                            includeData: e.target.checked,
                                        })
                                    }
                                />
                            </FieldLabelRow>
                        </Field>

                        <Field>
                            <FieldLabelRow>
                                <FieldLabel>Textual Description</FieldLabel>
                                <ExampleToggle
                                    type="button"
                                    onClick={() => setShowExamples((o) => !o)}
                                >
                                    {showExamples
                                        ? "Use custom description"
                                        : "Use an example"}
                                </ExampleToggle>
                            </FieldLabelRow>
                            {showExamples ? (
                                <ExamplesList>
                                    {examples.map((e) => (
                                        <Button
                                            key={e.id}
                                            type="button"
                                            onClick={() => {
                                                props.onChange({
                                                    ...props.config,
                                                    text: e.text,
                                                });
                                                setShowExamples(false);
                                            }}
                                        >
                                            {e.id}
                                        </Button>
                                    ))}
                                </ExamplesList>
                            ) : (
                                <TextArea
                                    value={props.config.text}
                                    onChange={(e) =>
                                        props.onChange({
                                            ...props.config,
                                            text: e.target.value,
                                        })
                                    }
                                />
                            )}
                        </Field>
                    </DrawerBody>

                    <DrawerHeader
                        $open={descriptionsOpen}
                        onClick={() => setDescriptionsOpen((o) => !o)}
                    >
                        <span>Descriptions</span>
                        <span aria-hidden="true">
                            {descriptionsOpen ? "▴" : "▾"}
                        </span>
                    </DrawerHeader>
                    {descriptionsOpen && (
                        <DrawerBody>
                            <Field>
                                <FieldLabel>Mention Types</FieldLabel>
                                {props.config.mentionDescriptions.map((d, i) => (
                                    <div key={i} style={{ display: 'flex', gap: '6px', marginBottom: '8px', alignItems: 'center' }}>
                                        <span style={{ width: '80px', fontSize: '12px', color: '#666', fontWeight: 500 }}>
                                            {d.type}
                                        </span>
                                        <Input
                                            style={{ width: '140px' }}
                                            value={d.name}
                                            placeholder="Name"
                                            onChange={(e) => {
                                                const next = [...props.config.mentionDescriptions];
                                                next[i] = { ...next[i], name: e.target.value };
                                                props.onChange({ ...props.config, mentionDescriptions: next });
                                            }}
                                        />
                                        <Select
                                            style={{ width: '60px' }}
                                            value={String(d.order ?? 1)}
                                            onChange={(e) => {
                                                const next = [...props.config.mentionDescriptions];
                                                next[i] = { ...next[i], order: Number(e.target.value) };
                                                props.onChange({ ...props.config, mentionDescriptions: next });
                                            }}
                                        >
                                            {Array.from({ length: 10 }, (_, k) => k + 1).map((n) => (
                                                <option key={n} value={String(n)}>{n}</option>
                                            ))}
                                        </Select>
                                        <TextArea
                                            style={{ width: 'calc(100% - 290px)', minHeight: '60px' }}
                                            value={d.description}
                                            placeholder="Description"
                                            onChange={(e) => {
                                                const next = [...props.config.mentionDescriptions];
                                                next[i] = { ...next[i], description: e.target.value };
                                                props.onChange({ ...props.config, mentionDescriptions: next });
                                            }}
                                        />
                                    </div>
                                ))}
                            </Field>
                            <Field>
                                <FieldLabel>Entity Resolution</FieldLabel>
                                <TextArea
                                    value={props.config.entityDescription}
                                    onChange={(e) =>
                                        props.onChange({
                                            ...props.config,
                                            entityDescription: e.target.value,
                                        })
                                    }
                                />
                            </Field>
                            <Field>
                                <FieldLabel>Relation Types</FieldLabel>
                                {props.config.relationDescriptions.map((d, i) => (
                                    <div key={i} style={{ display: 'flex', gap: '6px', marginBottom: '8px', alignItems: 'center' }}>
                                        <span style={{ width: '80px', fontSize: '12px', color: '#666', fontWeight: 500 }}>
                                            {d.type}
                                        </span>
                                        <Input
                                            style={{ width: '140px' }}
                                            value={d.name}
                                            placeholder="Name"
                                            onChange={(e) => {
                                                const next = [...props.config.relationDescriptions];
                                                next[i] = { ...next[i], name: e.target.value };
                                                props.onChange({ ...props.config, relationDescriptions: next });
                                            }}
                                        />
                                        <Select
                                            style={{ width: '60px' }}
                                            value={String(d.order ?? 1)}
                                            onChange={(e) => {
                                                const next = [...props.config.relationDescriptions];
                                                next[i] = { ...next[i], order: Number(e.target.value) };
                                                props.onChange({ ...props.config, relationDescriptions: next });
                                            }}
                                        >
                                            {Array.from({ length: 10 }, (_, k) => k + 1).map((n) => (
                                                <option key={n} value={String(n)}>{n}</option>
                                            ))}
                                        </Select>
                                        <TextArea
                                            style={{ width: 'calc(100% - 290px)', minHeight: '60px' }}
                                            value={d.description}
                                            placeholder="Description"
                                            onChange={(e) => {
                                                const next = [...props.config.relationDescriptions];
                                                next[i] = { ...next[i], description: e.target.value };
                                                props.onChange({ ...props.config, relationDescriptions: next });
                                            }}
                                        />
                                    </div>
                                ))}
                            </Field>
                            <Field>
                                <FieldLabel>Data and Time</FieldLabel>
                                <TextArea
                                    value={props.config.dataDescription}
                                    onChange={(e) =>
                                        props.onChange({
                                            ...props.config,
                                            dataDescription: e.target.value,
                                        })
                                    }
                                />
                            </Field>
                        </DrawerBody>
                    )}
                </Accordion>

                {renderSubmit()}
            </Root>
        </Popup>
    );
};

export default ModelExtractionDialogue;