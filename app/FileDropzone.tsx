"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import type { DragEvent, InputHTMLAttributes } from "react";
import { dropzoneClass } from "@/lib/ui-classes";

type FileDropzoneProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className"> & {
  label?: string;
  hint?: string;
};

export const FileDropzone = forwardRef<HTMLInputElement, FileDropzoneProps>(
  function FileDropzone({ label = "Kliknij lub przeciągnij pliki tutaj", hint, onChange, multiple, accept, name, id, ...rest }, forwardedRef) {
    const innerRef = useRef<HTMLInputElement>(null);
    useImperativeHandle(forwardedRef, () => innerRef.current as HTMLInputElement);
    const [isDragOver, setIsDragOver] = useState(false);

    function handleDrop(e: DragEvent<HTMLLabelElement>) {
      e.preventDefault();
      setIsDragOver(false);
      const input = innerRef.current;
      if (!input || e.dataTransfer.files.length === 0) return;
      input.files = e.dataTransfer.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }

    return (
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        className={dropzoneClass(isDragOver)}
      >
        <span>📎 {label}</span>
        {hint && <span className="text-xs opacity-80">{hint}</span>}
        <input
          ref={innerRef}
          type="file"
          id={id}
          name={name}
          accept={accept}
          multiple={multiple}
          onChange={onChange}
          className="hidden"
          {...rest}
        />
      </label>
    );
  }
);
