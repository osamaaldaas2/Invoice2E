export default function Brand() {
  return (
    <span className="brand-lockup">
      <svg viewBox="0 0 32 36" fill="none" aria-hidden="true" className="brand-symbol">
        <path d="M4 2h15l9 9v23H4V2Z" stroke="currentColor" strokeWidth="2.2" />
        <path d="M19 2v10h9M10 19h12M10 25h8" stroke="currentColor" strokeWidth="2.2" />
      </svg>
      <span>
        invoice<span className="brand-end">2e</span>
        <span className="brand-dot">.</span>
      </span>
    </span>
  );
}
