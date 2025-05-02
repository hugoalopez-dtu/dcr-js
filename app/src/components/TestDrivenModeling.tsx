import { DCRGraphS } from "dcr-engine"
import { ResultsWindow } from "../utilComponents/ConformanceUtil"

interface TestDrivenModelingProps {
    modelerRef: React.RefObject<DCRModeler | null>,
}

const TestDrivenModeling = ({ modelerRef }: TestDrivenModelingProps) => {
    return (
        <ResultsWindow $traceSelected={false}>
            Hello
        </ResultsWindow>
    )
}

export default TestDrivenModeling