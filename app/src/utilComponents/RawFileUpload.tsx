import { useId } from "react";

interface RawFileUploadProps {
  fileCallback: (file: File) => void;
  children: React.ReactNode;
  accept?: string;
  name?: string;
}

const RawFileUpload = ({
  fileCallback,
  accept,
  children,
  name,
}: RawFileUploadProps) => {
  const id = useId();

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    if (event.target.files && event.target.files.length > 0) {
      fileCallback(event.target.files[0]);
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

export default RawFileUpload;
