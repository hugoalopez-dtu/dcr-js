import { useId } from 'react';
import { Children } from "../types";

interface FileUploadProps {
    fileCallback: (name: string, contents: string) => void;
    children: Children;
    accept?: string;
    name?: string;
}

const FileUpload = ({ fileCallback, accept, children, name }: FileUploadProps) => {

    const id = useId();

    function openFile(file: File): Promise<{ name: string, contents: string }> {
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

                resolve({ name: file.name, contents });
            };

            reader.readAsText(file);
        })
    }

    const handleFileChange = (event: any) => {
        if (event.target.files.length > 0) {
            openFile(event.target.files[0]).then(({ name, contents }) => fileCallback(name, contents));
        }
    };

    return (<>
        <input
            type="file"
            accept={accept ? accept : ""}
            style={{ display: "none" }}
            id={id}
            onChange={handleFileChange}
            name={name}
        />
        <label htmlFor={id}>
            {children}
        </label >
    </>)
}

export default FileUpload;