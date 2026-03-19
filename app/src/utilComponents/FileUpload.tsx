import { useId } from "react";

interface FileUploadProps {
  fileCallback: (name: string, contents: string) => void | Promise<void>;
  children: React.ReactNode;
  accept?: string;
  name?: string;
}

const FileUpload = ({
  fileCallback,
  accept,
  children,
  name,
}: FileUploadProps) => {
  const id = useId();

  function openFile(file: File): Promise<{ name: string; contents: string }> {
    return new Promise((resolve, reject) => {
      // check file api availability
      if (!window.FileReader) {
        window.alert(
          "Looks like you use an older browser that does not support drag and drop. " +
            "Try using a modern browser such as Chrome, Firefox or Internet Explorer > 10."
        );
        reject();
      }

      // no file chosen
      if (!file) {
        reject();
      }

      const reader = new FileReader();

      reader.onload = function (e: ProgressEvent<FileReader>) {
        const contents = e.target?.result?.toString() || "";
        resolve({ name: file.name, contents });
      };

      reader.readAsText(file);
    });
  }

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    if (event.target.files && event.target.files.length > 0) {
      console.info("Started reading file...");
      console.time("read-file");
      performance.mark("read-file-start");

      const { name, contents } = await openFile(event.target.files[0]);

      performance.mark("read-file-end");
      performance.measure("read-file", "read-file-start", "read-file-end");
      console.info("Finished reading file!");
      console.timeEnd("read-file");

      await fileCallback(name, contents);
    }
  };

  return (
    <>
      <label htmlFor={id}>
        <input
          type="file"
          accept={accept ? accept : ""}
          style={{ display: "none" }}
          id={id}
          onChange={handleFileChange}
          name={name}
        />
        {children}
      </label>
    </>
  );
};

export default FileUpload;
