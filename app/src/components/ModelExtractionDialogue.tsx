import {useState} from "react";
import styled, {keyframes} from "styled-components";
import {AiOutlineLoading} from "react-icons/ai";
import Popup from "../utilComponents/Popup";
import type {ExtractionConfig} from "dcr-engine/src/extraction.ts";
import {models, examples} from "../resources/llmResources";

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

    const fields = [
        {
            id: "mentionDescription",
            caption: "Entities",
        },
        {
            id: "entityDescription",
            caption: "Entity Resolution",
        },
        {
            id: "relationDescription",
            caption: "Relations",
        },
        {
            id: "dataDescription",
            caption: "Data and Time",
        },
    ] as const;

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
                            <FieldLabel>Model Name</FieldLabel>
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
                                {models.map((m) => (
                                    <option key={m.id} value={m.id}>
                                        {m.label}
                                    </option>
                                ))}
                            </Select>
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
                            {fields.map((field) => (
                                <Field key={field.id}>
                                    <FieldLabel>{field.caption}</FieldLabel>
                                    <TextArea
                                        value={props.config[field.id]}
                                        onChange={(e) =>
                                            props.onChange({
                                                ...props.config,
                                                [field.id]: e.target.value,
                                            })
                                        }
                                    />
                                </Field>
                            ))}
                        </DrawerBody>
                    )}
                </Accordion>

                {renderSubmit()}
            </Root>
        </Popup>
    );
};

export default ModelExtractionDialogue;