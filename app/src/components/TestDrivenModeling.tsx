import { moddleToDCR, runTest, Trace } from "dcr-engine"
import { ResultsWindow } from "../utilComponents/ConformanceUtil"
import styled from "styled-components";
import { BiDislike, BiLike, BiQuestionMark, BiTrash, BiX } from "react-icons/bi";
import { useState } from "react";
import Popup from "../utilComponents/Popup";
import FlexBox from "../utilComponents/FlexBox";
import Button from "../utilComponents/Button";
import Form from "../utilComponents/Form";
import { toast } from "react-toastify";

import { saveAs } from 'file-saver';
import { parseSerialized, writeSerialized } from "dcr-engine/src/utility";
import FileUpload from "../utilComponents/FileUpload";
import { graphToGraphPP } from "dcr-engine/src/align";

interface TestDrivenModelingProps {
    modelerRef: React.RefObject<DCRModeler | null>,
    show: boolean,
}

const EventLogInput = styled.input`
    font-size: 30px;
    width: fit-content;
    background: transparent;
    appearance: none;
    border: none;
    margin-bottom: 0.5rem;
    padding: 0.25rem 0.5rem 0.25rem 0.5rem;
    margin: 0.25rem 0.5rem 0.25rem 0.5rem;
    &:focus {
      outline: 2px dashed black;
    }
`

const ResultsElement = styled.li<{ $selected: boolean; }>`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  width: 100%;
  padding: 0.5rem 1rem 0.5rem 1rem;
  cursor: "pointer";
  box-sizing: border-box;
  color: ${props => props.$selected ? "white" : "black"};
  background-color: ${props => props.$selected ? "gainsboro" : "white"};

  &:hover {
    color: white;
    background-color: Gainsboro;
  }

  & > svg {
    color: white;
    border-radius: 50%;
  }
`

const DeleteTest = styled(BiTrash)`
    display: block;
    height: 20px;
    width: 20px;
    margin: auto;
    margin-left: 0.5rem;
    margin-right: 0.5rem;
    cursor: pointer;
    color: black !important;
    &:hover {
      color: white !important;
    }
`

const CreateTest = styled.div`
    display: flex;
    flex-direction: column;
    padding: 1rem;
    box-sizing: border-box;
    font-size: 20px;
    width: 20rem;

    & > form {
        box-sizing: border-box;
    }

    & > form > textarea {
        display: flex;
        margin: 1rem;
        margin-right: auto;
        margin-left: auto;
        box-sizing: border-box;
        width: 12rem;
        height: 10rem;
        font-size: 15px;
    }
`

const Input = styled.input`
    display: flex;
    width: 7rem; 
    font-size: 20px; 
    margin: 1rem;
    margin-right: auto;
    margin-left: auto;
    width: 12rem;
`

const TestWindow = styled.div`
    position: fixed;
    top: 0;
    left: 30rem;
    height: 100vh;
    box-shadow: 0px 0 5px 0px grey;
    display: flex;
    flex-direction: column;
    padding-top: 2rem;
    padding-bottom: 2rem;
    font-size: 20px;
    background-color: gainsboro;
    box-sizing: border-box;
    overflow: scroll;
    z-index: 4;
    padding-left: 1rem;
`

const ResultsHeader = styled.h1`
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    font-size: 30px;
    font-weight: normal;
    padding: 0.5rem 1rem 0.5rem 1rem;
    margin: 0;
`

const CloseTrace = styled(BiX)`
  display: block;
  height: 30px;
  width: 30px;
  margin: auto;
  margin-left: 1rem;
  margin-right: 1rem;
  cursor: pointer;
  color: black;
  &:hover {
    color: white;
  }
`

const TraceNameInput = styled.input`
    font-size: 20px;
    width: fit-content;
    background: transparent;
    appearance: none;
    border: none;
    margin-bottom: 0.5rem;
    padding: 0.25rem 0.5rem 0.25rem 0.5rem;
    margin: 0.25rem 0.5rem 0.25rem 0.5rem;
    &:focus {
      outline: 2px dashed black;
    }
`

const Activity = styled.li`
  width: 100%;
  padding: 0.5rem 1rem 0.5rem 1rem;
  box-sizing: border-box;
`

const FakeButton = styled.div`
    align-items: center;
    padding: 8px;
    border: 1px solid black;
    border-radius: 5px;
    background-color: white;
    cursor: pointer;

    &:hover {
        color: white;
        cursor: pointer;
        border: 1px solid white;
        background-color: gainsboro;
    }

    & > label {
    cursor: pointer;
    }
`

type Test = {
    testId: string,
    testName: string,
    trace: Trace,
    context: Set<string>,
    polarity: "+" | "-",
    result?: boolean,
}

type Tests = {
    [testId: string]: Test
}

const textInputToArray = (input: string): Array<string> => {
    return input.split("\n").map(substr => substr.trim()).filter(elem => elem !== "");
}

let id = 0;


const resultIcon = (val: boolean | undefined) => {
    switch (val) {
        case undefined:
            return <BiQuestionMark style={{ backgroundColor: "orange" }} />
        case true:
            return <BiLike title="Test Passed" style={{ backgroundColor: "green" }} />
        case false:
            return <BiDislike title="Test Failed" style={{ backgroundColor: "red" }} />
    }
}


const TestDrivenModeling = ({ modelerRef, show }: TestDrivenModelingProps) => {
    const [name, setName] = useState<string>("New Tests");
    const [testName, setTestName] = useState<string>("");
    const [tests, setTests] = useState<Tests>({});
    const [selectedTest, setSelectedTest] = useState<Test | null>(null);
    const [creatingTest, setCreatingTest] = useState<boolean>(false);

    const [currentTest, setCurrentTest] = useState({
        trace: "",
        context: "",
    })

    const [depth, setDepth] = useState<number>(50);

    const downloadTests = () => {
        const testsToWrite = { ...tests };
        Object.keys(testsToWrite).forEach(key => testsToWrite[key].result = undefined);
        const data = writeSerialized(testsToWrite);
        const blob = new Blob([data]);
        saveAs(blob, `${name}.json`);
    }

    const loadTests = (name: string, contents: string) => {
        try {
            const newTests = parseSerialized<Tests>(contents);
            if (!Object.values(newTests)[0]?.testId) throw new Error("bad!");
            setTests(newTests);
            setName(name.slice(0, -5));
        } catch (e) {
            console.log(e);
            toast.error("Cannot parse tests...");
        }
    }

    const runTests = () => {
        if (!modelerRef.current) return;
        const elementRegistry = modelerRef.current.getElementRegistry();

        if (Object.keys(elementRegistry._elements).find((element) => element.includes("SubProcess") || elementRegistry._elements[element].element.businessObject.role)) {
            toast.warning("Test driven modeling not supported for subprocesses and roles...");
            return;
        }

        const graph = moddleToDCR(elementRegistry, true);
        const graphPP = graphToGraphPP(graph);

        console.log(graph);

        const newTests = { ...tests };
        try {
            for (const testId in newTests) {
                const test = newTests[testId];
                const maxDepth = depth <= 0 ? Infinity : depth;
                newTests[testId].result = runTest(test, graphPP, maxDepth, true);
            }
            setTests(newTests);
        } catch (e) {
            toast.error("Error running tests...");
            console.log(e);
        }
    }

    return (<>
        {creatingTest && <Popup close={() => setCreatingTest(false)}>
            <CreateTest>
                <Form inputFields={[
                    <>Name<Input name="testName" type="text" required defaultValue={"Test " + id} /></>,
                    <>Trace<textarea title="The partial trace of the test. Input one activity per line." name="trace" required defaultValue={currentTest.trace} /></>,
                    <>Context<textarea title="The context of the test. Input one activity per line." name="context" required defaultValue={currentTest.context} /></>,
                    <>Polarity<Input title="The polarity of the test. Checked means a positive test case." name="polarity" type="checkbox" defaultChecked={true} /></>
                ]}
                    submit={(formData: FormData) => {
                        const rawTrace = formData.get("trace")?.toString();
                        const rawContext = formData.get("context")?.toString();
                        const testName = formData.get("testName")?.toString();
                        const polarity = !!formData.get("polarity");

                        if (!modelerRef) return;

                        if (!rawTrace || !rawContext || !testName) {
                            toast.error("Can't parse test inputs...");
                            return;
                        }

                        const graph = moddleToDCR(modelerRef.current?.getElementRegistry(), true);

                        const trace = textInputToArray(rawTrace);
                        const context = textInputToArray(rawContext);

                        for (const event of trace.concat(context)) {
                            if (!graph.events.has(event)) {
                                setCurrentTest({ trace: rawTrace, context: rawContext });
                                toast.error(`Activity ${event} not found in graph...`);
                                return;
                            }
                        }

                        const testId = "Test " + id++;

                        const newTests = { ...tests };
                        newTests[testId] = {
                            testId,
                            testName,
                            context: new Set(context),
                            trace,
                            polarity: polarity ? "+" : "-"
                        }

                        setTests(newTests);
                        setCreatingTest(false);
                    }}
                    submitText="Add Test!" />
            </CreateTest >
        </Popup>}
        {show && <ResultsWindow $traceSelected={selectedTest !== null}>
            <EventLogInput value={name} onChange={(e) => setName(e.target.value)} />
            {Object.values(tests).map(({ trace, testName, testId, context, polarity, result }) =>
                <ResultsElement
                    $selected={selectedTest !== null && selectedTest.testId === testId}
                    key={testId}
                    onClick={() => {
                        setSelectedTest({ trace, testName, testId, context, polarity, result });
                        setTestName(testName);
                    }
                    }
                >
                    {testName}
                    {polarity}
                    {resultIcon(result)}
                    {<DeleteTest onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`This will delete the test '${testName}'. Are you sure?`)) {
                            const newTests = { ...tests };
                            delete newTests[testId];
                            if (testId === selectedTest?.testId) {
                                setSelectedTest(null);
                            }
                            setTests(newTests);
                        }
                    }} />}
                </ResultsElement>)}
            <FlexBox direction="column" $justify="space-around" style={{ marginTop: "auto" }}>
                <FlexBox direction="row" $justify="space-around">
                    <Button onClick={runTests} title="Length of traces to check test against. 0 for infinite length." style={{ margin: "1rem" }}>Run tests to depth:</Button>
                    <Input type="number" value={depth} min={0} step={1} onChange={(e) => e.target.value === "-" ? setDepth(-1) : setDepth(parseInt(e.target.value))}></Input>
                </FlexBox>
                <FlexBox direction="row" $justify="space-around" style={{ marginTop: "1rem" }}>
                    <Button onClick={() => {
                        if (!modelerRef.current) return;
                        const elementRegistry = modelerRef.current?.getElementRegistry();

                        if (Object.keys(elementRegistry._elements).find((element) => element.includes("SubProcess") || elementRegistry._elements[element].element.businessObject.role)) {
                            toast.warning("Test driven modeling not supported for subprocesses and roles...");
                            return;
                        }
                        const graph = moddleToDCR(modelerRef.current.getElementRegistry());
                        const exampleEvents = [...graph.events].slice(0, 3).map(event => graph.labelMap[event]);
                        const exampleString = exampleEvents.join("\n") + "\n...";
                        setCurrentTest({ trace: exampleString, context: exampleString });

                        setCreatingTest(true);
                    }}>New Test</Button>
                    <Button onClick={() => downloadTests()}>Download Tests</Button>
                    <FakeButton><FileUpload accept=".json" fileCallback={(name, contents) => {
                        loadTests(name, contents);
                    }}>Import tests</FileUpload>
                    </FakeButton>
                </FlexBox>
            </FlexBox>
        </ResultsWindow >}
        {
            selectedTest && <TestWindow>
                <ResultsHeader>
                    <TraceNameInput value={testName} onChange={(e) => setTestName(e.target.value)} />
                    {selectedTest.polarity}
                    <CloseTrace onClick={() => {
                        setSelectedTest(null);
                        const newTests = { ...tests };
                        newTests[selectedTest.testId].testName = testName;
                        setTests(newTests);
                    }} />
                </ResultsHeader>
                Trace:
                <ul>
                    {selectedTest.trace.map((event, idx) => <Activity key={event + idx}>{event}</Activity>)}
                </ul>
                Context:
                <ul>
                    {[...selectedTest.context].map((event, idx) => <Activity key={event + idx}>{event}</Activity>)}
                </ul>
            </TestWindow>
        }
    </>)
}

export default TestDrivenModeling