import { useEffect, useState } from "react";
import { Children } from "../types";
import Popup from "../utilComponents/Popup";
import styled from "styled-components";
import FlexBox from "../utilComponents/FlexBox";
import { toast } from "react-toast";


const TextBox = styled.div`
    margin: 2em;
`

const Loading = styled.div`
    z-index: 1000;
    position: fixed;
    height: 100%;
    width: 100%;
    top: 0;
    left: 0;
    cursor: wait;
`

const Example = styled.div`
    height: 20em;
    width: 20em;
    margin: 0.5em;
    padding: 0.5em;
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
    margin: 0 0 1em 0;
`

interface ExampleProps {
    examplesData: Array<string>;
    setExamplesOpen: (val: boolean) => void;
    openCustomXML: (xml: string) => void;
    openDCRXML: (dcrXML: string) => void;
}

const Examples = ({ examplesData, setExamplesOpen, openCustomXML, openDCRXML }: ExampleProps) => {
    const [loading, setLoading] = useState(false);
    const [searchStr, setSearchStr] = useState("");

    const exampleClick = (exampleStr: string) => {
        if (confirm("Are you sure? This will override your current diagram!")) {
            console.log(document.body.style.cursor);
            setLoading(true);

            fetch('examples/diagrams/' + exampleStr + '.xml')
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
        {loading && <Loading />}
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
                                <Img src={`examples/images/${exampleStr}.svg`} />
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