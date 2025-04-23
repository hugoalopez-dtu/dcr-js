import { useState } from "react";
import Popup from "../utilComponents/Popup";
import styled from "styled-components";
import FlexBox from "../utilComponents/FlexBox";
import { toast } from "react-toastify";


const TextBox = styled.div`
    margin: 2rem;
`

const Example = styled.div`
    height: 20rem;
    width: 20rem;
    margin: 0.5rem;
    padding: 0.5rem;
    &:hover {
        background: Gainsboro
    }
    border-radius: 10px;
    cursor: pointer;
`
const Img = styled.img`
    height: auto;
    width: 100%;
`

const ExampleText = styled.h3`
    text-align: center;
    margin: 0 0 1rem 0;
`

interface ExampleProps {
    examplesData: Array<string>;
    setExamplesOpen: (val: boolean) => void;
    openCustomXML: (xml: string) => void;
    openDCRXML: (dcrXML: string) => void;
    setLoading: (val: boolean) => void;
}

const Examples = ({ examplesData, setExamplesOpen, openCustomXML, openDCRXML, setLoading }: ExampleProps) => {

    const [searchStr, setSearchStr] = useState("");

    const exampleClick = (exampleStr: string) => {
        if (confirm("Are you sure? This will override your current diagram!")) {
            setLoading(true);

            fetch('/dcr-js/examples/diagrams/' + exampleStr + '.xml')
                .then(response => {
                    if (!response.ok) {
                        toast.error("Failed to fetch example...");
                    } else {
                        return response.text();
                    }
                }).then(data => {
                    setLoading(false);
                    if (data) {
                        if (data.includes('<?xml')) { // type check which type of save file. Only one of them has magic number '<?xml'
                            openCustomXML(data);
                        } else {
                            openDCRXML(data);
                        }
                        setExamplesOpen(false);
                    } else {
                        toast.error("Unable to load example...");
                    }

                }).catch(err => {
                    console.log(err);
                })
        }
    }

    return (
        <>
            <Popup close={() => setExamplesOpen(false)} >
                <TextBox>
                    <h1>Examples</h1>
                    <p>Choose an example to to view it in the editor. Warning this will override your current diagram!</p>
                    <p>Search examples:</p>
                    <input type="text" onChange={(event) => setSearchStr(event.target.value)} />
                </TextBox>
                <FlexBox direction="row" $justify="space-around">
                    {examplesData.map((exampleStr) => {
                        if (exampleStr.toLowerCase().includes(searchStr.toLowerCase())) {
                            return (
                                <Example key={exampleStr} onClick={() => exampleClick(exampleStr)}>
                                    <ExampleText>{exampleStr}</ExampleText>
                                    <Img src={`/dcr-js/examples/images/${exampleStr}.svg`} />
                                </Example>
                            )
                        } else {
                            <></>
                        }
                    })}
                </FlexBox>
            </Popup>
        </>
    )
}

export default Examples;