import styled from "styled-components";
import Button from "./Button";

interface FormProps {
  children?: React.ReactNode;
  submit: (formData: FormData) => void | Promise<void>;
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
  padding-bottom: 1rem;
`;

const Form = ({ children, submit, submitText }: FormProps) => {
  return (
    <StyledForm action={submit}>
      {children}
      <Button type="submit">{submitText ? submitText : "Submit"}</Button>
    </StyledForm>
  );
};

export default Form;
