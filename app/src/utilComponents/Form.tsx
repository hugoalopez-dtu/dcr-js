import styled from "styled-components";
import Button from "./Button";

interface FormProps {
    inputFields: Array<React.JSX.Element>;
    submit: (formData: FormData) => void;
    submitText?: string;
}

const StyledForm = styled.form`
    box-sizing: border-box;    
    width: 100%;
    text-align: center;
    & > button {
        font-size: 20px;
        margin-top: 1rem;
    }
`

const Form = ({ inputFields, submit, submitText }: FormProps) => {
    return (
        <StyledForm action={submit}>
            {...inputFields}
            <Button type="submit">{submitText ? submitText : "Submit"}</Button>
        </StyledForm>
    );
}

export default Form;