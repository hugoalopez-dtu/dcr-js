import styled from 'styled-components'

const Button = styled.button`
    align-items: center;
    padding: 8px;
    border: 1px solid black;
    border-radius: 5px;
    background-color: white;
    font-size: 20px;

    &:hover {
        color: white;
        border: 1px solid white;
        background-color: gainsboro;
    }
`

export default Button