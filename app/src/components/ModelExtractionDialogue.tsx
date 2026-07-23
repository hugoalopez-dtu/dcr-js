import Popup from "../utilComponents/Popup";
import styled, {keyframes} from "styled-components";
import {AiOutlineLoading} from "react-icons/ai";
import type {ExtractionConfig} from "dcr-engine/src/extraction.ts";

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

const examples = [
    {id: "261/2004 (13)", text: "(13) Passengers whose flights are cancelled should be able either to obtain reimbursement of their tickets or to obtain re-routing under satisfactory conditions, and should be adequately cared for while awaiting a later flight."},
    {id: "261/2004 (10)", text: "(10) Passengers denied boarding against their will should be able either to cancel their flights, with reimbursement of their tickets, or to continue them under satisfactory conditions, and should be adequately cared for while awaiting a later flight."},
    {id: "261/2004 (12)", text: "(12) The trouble and inconvenience to passengers caused by cancellation of flights should also be reduced. This should be achieved by inducing carriers to inform passengers of cancellations before the scheduled time of departure and in addition to offer them reasonable re-routing, so that the passengers can make other arrangements. Air carriers should compensate passengers if they fail to do this, except when the cancellation occurs in extraordinary circumstances which could not have been avoided even if all reasonable measures had been taken."},
    {id: "261/2004 Article 5", text: `Article 5

Cancellation

1. In case of cancellation of a flight, the passengers concerned shall:

(a) be offered assistance by the operating air carrier in accordance with Article 8; and

(b) be offered assistance by the operating air carrier in accordance with Article 9(1)(a) and 9(2), as well as, in event of re-routing when the reasonably expected time of departure of the new flight is at least the day after the departure as it was planned for the cancelled flight, the assistance specified in Article 9(1)(b) and 9(1)(c); and

(c) have the right to compensation by the operating air carrier in accordance with Article 7, unless:

(i) they are informed of the cancellation at least two weeks before the scheduled time of departure; or

(ii) they are informed of the cancellation between two weeks and seven days before the scheduled time of departure and are offered re-routing, allowing them to depart no more than two hours before the scheduled time of departure and to reach their final destination less than four hours after the scheduled time of arrival; or

(iii) they are informed of the cancellation less than seven days before the scheduled time of departure and are offered re-routing, allowing them to depart no more than one hour before the scheduled time of departure and to reach their final destination less than two hours after the scheduled time of arrival.

2. When passengers are informed of the cancellation, an explanation shall be given concerning possible alternative transport.

3. An operating air carrier shall not be obliged to pay compensation in accordance with Article 7, if it can prove that the cancellation is caused by extraordinary circumstances which could not have been avoided even if all reasonable measures had been taken.

4. The burden of proof concerning the questions as to whether and when the passenger has been informed of the cancellation of the flight shall rest with the operating air carrier.`},
]

const ModelExtractionDialogue = (props: Props) => {
    const models = [
        {"label": "GPT 5.4 mini", "id": "gpt-5.4-mini-2026-03-17"},
        {"label": "GPT 5.5", "id": "gpt-5.5-2026-04-23"},
        {"label": "GPT 5.4", "id": "gpt-5.4-2026-03-05"},
    ];

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