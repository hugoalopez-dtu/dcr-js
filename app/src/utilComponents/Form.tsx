interface FormProps {
    inputFields: Array<React.JSX.Element>;
    submit: (formData: FormData) => void;
    submitText?: string;
}


const Form = ({ inputFields, submit, submitText }: FormProps) => {
    return (
        <form action={submit}>
            {...inputFields}
            <button type="submit">{submitText ? submitText : "Submit"}</button>
        </form>
    );
}

export default Form;