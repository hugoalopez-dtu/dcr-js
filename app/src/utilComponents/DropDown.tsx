import styled from "styled-components";

interface DropDownProps {
  options: Array<{
    title: string;
    value: string;
    tooltip?: string;
  }>;
  onChange: (option: string) => void;
  value: string;
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
`;

const DropDown = ({ options, onChange, value }: DropDownProps) => {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange?.(e.target.value);
  };

  return (
    <form>
      <Select value={value} onChange={handleChange}>
        {options.map((option) => (
          <option
            key={option.value}
            title={option.tooltip}
            value={option.value}
          >
            {option.title}
          </option>
        ))}
      </Select>
    </form>
  );
};

export default DropDown;
