import { useState } from "react";
import Icon from "./Icon";

function InfoButton({ label, description }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        className="info-trigger"
        aria-label={label}
        aria-expanded={isOpen}
        onClick={(event) => {
          event.stopPropagation();
          setIsOpen((open) => !open);
        }}
      >
        <Icon name="help" size={15} />
      </button>

      {isOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-20 cursor-default sm:hidden"
            aria-label="Close help message"
            onClick={() => setIsOpen(false)}
          />
          <span className="fixed inset-x-4 top-1/2 z-30 -translate-y-1/2 rounded-xl border border-slate-200 bg-white p-4 text-left text-sm font-normal leading-relaxed text-slate-600 shadow-xl sm:absolute sm:right-0 sm:left-auto sm:top-8 sm:w-64 sm:translate-y-0 sm:p-3 sm:text-xs">
            {description}
          </span>
        </>
      )}
    </span>
  );
}

export default InfoButton;
