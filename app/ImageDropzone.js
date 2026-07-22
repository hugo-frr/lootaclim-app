"use client";

import { useRef, useState } from "react";

// Zone de glisser-déposer pour une image, avec aperçu si une image est déjà
// définie. Alimente un <input type="file"> caché (via l'API DataTransfer)
// pour que la soumission normale du formulaire (Server Action) porte le
// fichier — aucun envoi séparé, aucune logique côté client au-delà de l'UX.
export default function ImageDropzone({ name, currentUrl, currentAlt }) {
  const inputRef = useRef(null);
  const [preview, setPreview] = useState(currentUrl ?? null);
  const [fileName, setFileName] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  function applyFiles(files) {
    const file = files?.[0];
    if (!file) return;
    if (inputRef.current) {
      const transfer = new DataTransfer();
      transfer.items.add(file);
      inputRef.current.files = transfer.files;
    }
    setPreview(URL.createObjectURL(file));
    setFileName(file.name);
  }

  return (
    <div
      className={`dropzone${dragOver ? " dragover" : ""}`}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
      }}
      role="button"
      tabIndex={0}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        applyFiles(e.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        name={name}
        accept="image/jpeg,image/png,image/webp"
        onChange={(e) => applyFiles(e.target.files)}
        style={{ display: "none" }}
      />
      {preview ? (
        <img src={preview} alt={currentAlt ?? "Aperçu de l'image"} className="dropzone-preview" />
      ) : (
        <span className="dropzone-hint">Glissez une image ici, ou cliquez pour en choisir une</span>
      )}
      {fileName && <span className="dropzone-filename">{fileName}</span>}
    </div>
  );
}
