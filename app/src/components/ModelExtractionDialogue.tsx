import Popup from "../utilComponents/Popup";
import styled, {keyframes} from "styled-components";
import {AiOutlineLoading} from "react-icons/ai";
import type {ExtractionConfig} from "dcr-engine/src/extraction.ts";
import {models, examples} from "../resources/llmResources";

export interface Props {
    config: ExtractionConfig;
    busy: boolean;
    onChange: (config: ExtractionConfig) => void;
    onClose: () => void;
    onSubmit: (config: ExtractionConfig) => void;
}

const FormContainer = styled.div`
    display: block;
    width: 500px;
`;

const Input = styled.input`
    display: block;
    width: 100%;
    border-radius: 3px;
`;

const Select = styled.select`
    display: block;
    width: 100%;
    border-radius: 3px;
    padding: 5px 10px;
`;

const Label = styled.label`
    display: block;
    width: 100%;
    margin-top: 20px;
    margin-bottom: 5px;
    padding-top: 10px;
    border-top: solid 1px darkgrey;
`;

const TextArea = styled.textarea`
    display: block;
    width: 100%;
    border-radius: 3px;
    padding: 5px 10px;
    min-height: 100px;
`;

const Button = styled.button`
    margin-top: 10px;
    border-radius: 3px;
    padding: 5px 10px;
    border: solid 1px black;
    background-color: #f6f6f6;

    &:disabled {
        cursor: not-allowed;
    }

    &:hover {
        background-color: #e6e6e6;
    }
`;

const SubmitButton = styled(Button)`
    /*TODO: fix colors, take from theme?*/
    display: block;
    padding-left: 15px;
    padding-right: 15px;
    margin-left: auto;
    margin-right: auto;
    background-color: #d0d0ef;

    &:hover {
        background-color: #b4b4e8;
    }
`

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

const ModelExtractionDialogue = (props: Props) => {
    
    const renderSubmit = ( )=> {
        if (props.busy) return <Spinner size="25" />;

        return (
            <SubmitButton
                disabled={!props.config.apiKey || !props.config.modelName || !props.config.text}
                onClick={() => {
                    props.onSubmit(props.config)
                }}
            >
                Extract
            </SubmitButton>
        );
    }

    return (
        <Popup close={() => props.onClose()}>
            <div>
                <h2>Extract Model from Text</h2>

                <FormContainer>
                    <Label htmlFor={"api-key"}>API Key</Label>
                    <Input name={"api-key"} value={props.config.apiKey} onChange={e => props.onChange({
                        ...props.config,
                        apiKey: e.target.value,
                    })} />

                    <Label htmlFor={"model"}>Model Name</Label>
                    <Select value={props.config.modelName} name="model" onChange={e => props.onChange({
                        ...props.config,
                        modelName: e.target.value,
                    })}>
                        <option id={""} value={""}>Select Model</option>
                        {
                            models.map(m => (
                                <option id={m.id} value={m.id}>
                                    {m.label}
                                </option>
                            ))
                        }
                    </Select>

                    <Label>Textual Description</Label>
                    <div style={{fontSize: ".85em"}}>Examples</div>
                    {
                        examples.map(e => <Button id={e.id} onClick={() => {props.onChange({...props.config, text: e.text})}}>{e.id}</Button>)
                    }

                    <div style={{fontSize: ".85em"}}>Custom</div>
                    <TextArea value={props.config.text} onChange={e => props.onChange({
                        ...props.config,
                        text: e.target.value,
                    })}/>

                    <Label>Descriptions</Label>
                    <div style={{fontSize: ".85em"}}>Entities</div>
                    <TextArea value={props.config.mentionDescription} onChange={e => props.onChange({
                        ...props.config,
                        mentionDescription: e.target.value,
                    })}/>

                    <div style={{fontSize: ".85em"}}>Relations</div>
                    <TextArea value={props.config.relationDescription} onChange={e => props.onChange({
                        ...props.config,
                        relationDescription: e.target.value,
                    })}/>

                    <div style={{fontSize: ".85em"}}>Data and Time</div>
                    <TextArea value={props.config.dataDescription} onChange={e => props.onChange({
                        ...props.config,
                        dataDescription: e.target.value,
                    })}/>
                    {renderSubmit()}
                </FormContainer>
            </div>
        </Popup>
    );
}

export default ModelExtractionDialogue;
