"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileArrowUp,
  Info,
  ShieldCheck,
  SpinnerGap,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { z } from "zod";

import { ApiRequestError, apiFetch, idempotencyHeaders } from "@/lib/api";
import type { CaseRecord, SystemStatus } from "@/lib/types";

const intakeSchema = z.object({
  legal_business_name: z.string().trim().min(2, "Enter the legal business name."),
  trading_name: z.string().trim().optional(),
  registration_number: z.string().trim().min(2, "Enter a registration number."),
  jurisdiction: z.string().trim().min(2, "Choose a jurisdiction."),
  industry: z.string().trim().min(2, "Enter the operating industry."),
  requested_amount: z.coerce.number().positive("Enter a request greater than zero."),
  currency: z.string().length(3),
  funding_purpose: z.string().trim().min(10, "Describe the use of funds in one sentence."),
  annual_revenue: z.coerce.number().nonnegative("Annual revenue cannot be negative."),
  contact_name: z.string().trim().min(2, "Enter the primary contact."),
  contact_email: z.email("Enter a valid email address."),
});

const documentInputs = [
  {
    name: "registration_file",
    type: "REGISTRATION_EVIDENCE",
    label: "Business registration",
    help: "PDF with the registered name and number",
    accept: ".pdf,application/pdf",
  },
  {
    name: "revenue_file",
    type: "REVENUE_STATEMENT",
    label: "Revenue records",
    help: "Spreadsheet showing recent revenue",
    accept: ".xlsx,.csv",
  },
  {
    name: "bank_file",
    type: "BANK_STATEMENT",
    label: "Bank statement",
    help: "CSV or spreadsheet of recent transactions",
    accept: ".xlsx,.csv",
  },
  {
    name: "ownership_file",
    type: "OWNERSHIP_DECLARATION",
    label: "Ownership form",
    help: "PDF listing the owner and signature date",
    accept: ".pdf,application/pdf",
  },
] as const;

const initialProgress = [
  "Save the application",
  "Add the documents",
  "Check the details",
  "Prepare the summary",
];

function TextField({
  name,
  label,
  error,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  name: string;
  label: string;
  error?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        className={`input ${error ? "input-error" : ""}`}
        name={name}
        aria-invalid={Boolean(error)}
        {...props}
      />
      {error ? <span className="field-error">{error}</span> : null}
    </label>
  );
}

export default function NewCasePage() {
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(-1);
  const [publicWritesLocked, setPublicWritesLocked] = useState(false);

  useEffect(() => {
    void apiFetch<SystemStatus>("/system")
      .then((status) => setPublicWritesLocked(status.public_writes_locked))
      .catch(() => undefined);
  }, []);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrors({});
    setSubmitError(null);
    const form = event.currentTarget;
    const data = new FormData(form);
    const raw = Object.fromEntries(data.entries());
    const parsed = intakeSchema.safeParse(raw);
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message]),
        ),
      );
      form.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
      return;
    }

    setBusy(true);
    try {
      setProgress(0);
      const created = await apiFetch<CaseRecord>("/cases", {
        method: "POST",
        body: JSON.stringify({
          ...parsed.data,
          trading_name: parsed.data.trading_name || null,
          requested_amount: parsed.data.requested_amount.toFixed(2),
          annual_revenue: parsed.data.annual_revenue.toFixed(2),
        }),
      });

      setProgress(1);
      for (const definition of documentInputs) {
        const value = data.get(definition.name);
        if (!(value instanceof File) || value.size === 0) continue;
        const upload = new FormData();
        upload.append("document_type", definition.type);
        upload.append("file", value);
        await apiFetch(`/cases/${created.id}/documents`, {
          method: "POST",
          body: upload,
        });
      }

      setProgress(2);
      await apiFetch(`/cases/${created.id}/process`, {
        method: "POST",
        headers: idempotencyHeaders(),
      });

      setProgress(3);
      await apiFetch(`/cases/${created.id}/agent-review`, {
        method: "POST",
        headers: idempotencyHeaders(),
      });

      router.push(`/cases/${created.id}`);
    } catch (caught) {
      if (caught instanceof ApiRequestError) {
        setSubmitError(caught.message);
        setErrors(caught.fieldErrors);
      } else {
        setSubmitError("We couldn't create the application. Try again.");
      }
      setBusy(false);
    }
  };

  return (
    <div className="intake-page">
      <header className="intake-header">
        <Link href="/cases" className="back-link"><ArrowLeft size={15} /> Applications</Link>
        <div>
          <span className="mono-label">New</span>
          <strong>Add application</strong>
        </div>
        <span className="save-state"><i /> {publicWritesLocked ? "View-only demo" : "New application"}</span>
      </header>

      <form onSubmit={onSubmit} className="intake-layout">
        <div className="intake-main">
          <section className="intake-intro">
            <span className="step-number">01</span>
            <div>
              <h1>Business and request</h1>
              <p>Enter the details from the application.</p>
            </div>
          </section>

          <div className="form-section">
            <div className="form-grid two-column">
              <TextField
                name="legal_business_name"
                label="Registered business name"
                placeholder="e.g. Island Harvest Foods Ltd."
                autoComplete="organization"
                error={errors.legal_business_name}
              />
              <TextField
                name="trading_name"
                label="Trading name (optional)"
                placeholder="Name customers know"
                error={errors.trading_name}
              />
              <TextField
                name="registration_number"
                label="Registration number"
                placeholder="e.g. ABR-4421-A"
                error={errors.registration_number}
              />
              <label className="field">
                <span>Country or territory</span>
                <select name="jurisdiction" className="select" defaultValue="Antigua and Barbuda">
                  <option>Antigua and Barbuda</option>
                  <option>Barbados</option>
                  <option>Dominica</option>
                  <option>Grenada</option>
                  <option>Jamaica</option>
                  <option>Saint Kitts and Nevis</option>
                  <option>Saint Lucia</option>
                  <option>Saint Vincent and the Grenadines</option>
                  <option>Trinidad and Tobago</option>
                </select>
              </label>
              <TextField
                name="industry"
                label="Industry"
                placeholder="e.g. Food manufacturing"
                error={errors.industry}
              />
              <div className="amount-group">
                <label className="field currency-field">
                  <span>Currency</span>
                  <select name="currency" className="select" defaultValue="XCD">
                    <option>XCD</option><option>USD</option><option>BBD</option>
                    <option>JMD</option><option>TTD</option>
                  </select>
                </label>
                <TextField
                  name="requested_amount"
                  label="Amount requested"
                  type="number"
                  min="1"
                  step="0.01"
                  placeholder="85000"
                  inputMode="decimal"
                  error={errors.requested_amount}
                />
              </div>
              <TextField
                name="annual_revenue"
                label="Annual revenue"
                type="number"
                min="0"
                step="0.01"
                placeholder="480000"
                inputMode="decimal"
                error={errors.annual_revenue}
              />
              <div className="field full-span">
                <span>How will the funds be used?</span>
                <textarea
                  name="funding_purpose"
                  className={`textarea ${errors.funding_purpose ? "input-error" : ""}`}
                  placeholder="For example: purchase equipment and expand delivery capacity."
                  aria-invalid={Boolean(errors.funding_purpose)}
                />
                {errors.funding_purpose ? <span className="field-error">{errors.funding_purpose}</span> : null}
              </div>
            </div>
          </div>

          <section className="intake-intro section-step">
            <span className="step-number">02</span>
            <div>
              <h2>Main contact</h2>
              <p>Who should the reviewer contact if something is missing?</p>
            </div>
          </section>
          <div className="form-section">
            <div className="form-grid two-column">
              <TextField
                name="contact_name"
                label="Contact name"
                placeholder="Full name"
                autoComplete="name"
                error={errors.contact_name}
              />
              <TextField
                name="contact_email"
                label="Contact email"
                type="email"
                placeholder="name@business.example"
                autoComplete="email"
                error={errors.contact_email}
              />
            </div>
          </div>

          <section className="intake-intro section-step">
            <span className="step-number">03</span>
            <div>
              <h2>Documents</h2>
              <p>Add the files included with this application.</p>
            </div>
          </section>
          <div className="upload-grid">
            {documentInputs.map((definition) => (
              <label className="upload-field" key={definition.name}>
                <FileArrowUp size={21} weight="duotone" />
                <span>
                  <strong>{definition.label}</strong>
                  <small>{definition.help}</small>
                </span>
                <input name={definition.name} type="file" accept={definition.accept} />
              </label>
            ))}
          </div>
        </div>

        <aside className="intake-aside">
          <div className="intake-summary">
            <span className="mono-label">After you submit</span>
            <h2>We'll prepare the application</h2>
            <div className="progress-list">
              {initialProgress.map((item, index) => (
                <div
                  key={item}
                  className={progress > index ? "done" : progress === index ? "current" : ""}
                >
                  <span>{progress > index ? <Check size={13} weight="bold" /> : index + 1}</span>
                  <p>{item}</p>
                  {busy && progress === index ? <SpinnerGap className="spinner" size={14} /> : null}
                </div>
              ))}
            </div>
            {publicWritesLocked ? (
              <div className="notice notice-info">
                <ShieldCheck size={19} weight="duotone" />
                <div>
                  <strong>Demo mode</strong>
                  Creating applications is turned off.
                </div>
              </div>
            ) : null}
            <div className="synthetic-note">
              <Info size={16} />
              Use sample files in this demo.
            </div>
            {submitError ? <div className="notice notice-error">{submitError}</div> : null}
            <button className="button button-primary submit-intake" type="submit" disabled={busy || publicWritesLocked}>
              {busy ? <><SpinnerGap className="spinner" size={17} /> Creating application</> : publicWritesLocked ? <>View-only demo <ShieldCheck size={16} /></> : <>Create application <ArrowRight size={16} /></>}
            </button>
          </div>
        </aside>
      </form>
    </div>
  );
}
