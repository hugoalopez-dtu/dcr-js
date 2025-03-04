import Button from "./Button"
import React from 'react';

interface FileUploadButtonProps {
    fileCallback: (contents: string) => void;
    children: string | React.JSX.Element | React.JSX.Element[];
}

const FileUploadButton = ({ fileCallback, children }: FileUploadButtonProps) => {

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
            style={{ display: "none" }}
            id="contained-button-file"
            onChange={handleFileChange}
        />
        <label htmlFor="contained-button-file" style={{ cursor: "pointer" }}>
            <Button style={{ pointerEvents: "none" }}>
                {children}
            </Button>
        </label >
    </>
    )
}

export default FileUploadButton;