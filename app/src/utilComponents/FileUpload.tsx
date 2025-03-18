import { useId } from 'react';
import { Children } from "../types";

interface FileUploadProps {
    fileCallback: (contents: string) => void;
    children: Children;
    accept?: string;
}

const FileUpload = ({ fileCallback, accept, children }: FileUploadProps) => {

    const id = useId();

    function openFile(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            // check file api availability
            if (!window.FileReader) {
                window.alert(
                    'Looks like you use an older browser that does not support drag and drop. ' +
                    'Try using a modern browser such as Chrome, Firefox or Internet Explorer > 10.'
                );
                reject();
            }

            // no file chosen
            if (!file) {
                reject();
            }

            var reader = new FileReader();

            reader.onload = function (e: any) {
                var contents = e.target.result;

                resolve(contents);
            };

            reader.readAsText(file);
        })
    }

    const handleFileChange = (event: any) => {
        if (event.target.files.length > 0) {
            openFile(event.target.files[0]).then((contents) => fileCallback(contents));
        }
    };

    return (<>
        <input
            type="file"
            accept={accept ? accept : ""}
            style={{ display: "none" }}
            id={id}
            onChange={handleFileChange}
        />
        <label htmlFor={id}>
            {children}
        </label >
    </>)
}

export default FileUpload;