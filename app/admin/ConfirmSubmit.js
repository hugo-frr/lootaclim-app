"use client";

// Bouton de soumission avec confirmation native du navigateur.
export default function ConfirmSubmit({ message, className, children }) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
