"use client";

import { CheckCircle, ShieldWarning, X } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

export function DecisionDialog({
  open,
  title,
  detail,
  confirmLabel,
  tone = "primary",
  busy = false,
  locked = false,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  detail: string;
  confirmLabel: string;
  tone?: "primary" | "danger";
  busy?: boolean;
  locked?: boolean;
  onClose: () => void;
  onConfirm: (rationale: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [rationale, setRationale] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      setRationale("");
      setError("");
      element.showModal();
    } else if (!open && element.open) {
      element.close();
    }
  }, [open]);

  const submit = () => {
    if (rationale.trim().length < 5) {
      setError("Add a short evidence-based rationale before recording this action.");
      return;
    }
    onConfirm(rationale.trim());
  };

  return (
    <dialog
      ref={dialog}
      className="decision-dialog"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClose={onClose}
    >
      <div className="dialog-head">
        <span className={tone === "danger" ? "dialog-icon danger" : "dialog-icon"}>
          {tone === "danger" ? <ShieldWarning size={21} /> : <CheckCircle size={21} />}
        </span>
        <button type="button" className="icon-button" onClick={onClose} disabled={busy} aria-label="Close dialog">
          <X size={16} />
        </button>
      </div>
      <h2>{title}</h2>
      <p>{detail}</p>
      <label className="field dialog-rationale">
        <span>Reviewer rationale</span>
        <textarea
          className={`textarea ${error ? "input-error" : ""}`}
          value={rationale}
          onChange={(event) => {
            setRationale(event.target.value);
            setError("");
          }}
          placeholder="State what you reviewed and why this is the right workflow action."
          autoFocus
        />
        {error ? <span className="field-error">{error}</span> : null}
      </label>
      <div className="dialog-boundary">
        {locked
          ? "This public showcase is read-only. An authorized reviewer can record the action in a controlled environment."
          : "This records a workflow action in the audit ledger. It does not make a lending or eligibility decision."}
      </div>
      <div className="dialog-actions">
        <button type="button" className="button button-secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button
          type="button"
          className={`button ${tone === "danger" ? "button-danger" : "button-primary"}`}
          onClick={submit}
          disabled={busy || locked}
        >
          {locked ? "Reviewer access required" : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
