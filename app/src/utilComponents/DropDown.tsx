import styled from "styled-components";

interface DropDownProps {
    options: Array<{
        title: string | React.JSX.Element,
        value: string
    }>;
    onChange: (option: string) => void;
}

const Select = styled.select`
    padding: 0.5rem;
    font-size: 20px;
    background-color: white;
    border: 2px solid gainsboro;
    cursor: pointer;
    &:hover {
        background-color: gainsboro;
        color: white;
    }
`

const DropDown = ({ options, onChange }: DropDownProps) => {
    return (
        <form>
            <Select onChange={(e) => onChange(e.target.value)}>
                {options.map(option => <option key={option.value} value={option.value}>{option.title}</option>)}
            </Select>
        </form>
    )
}

export default DropDown;