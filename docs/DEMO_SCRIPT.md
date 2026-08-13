# Demo script

Target length: 3 minutes 45 seconds. Record with only the deployed app, architecture page, test result, and repository visible. Use a signed-out browser profile and hide unrelated tabs, notifications, credentials, local paths, and private account details.

## 0:00–0:25 · Introduction

“I’m Terry Benjamin Jr., a software engineer from Antigua and Barbuda. I build backend systems, workflow automation, and applied AI for document-heavy finance and operations work. OpsLedger AI helps small-business financing teams turn scattered applications and supporting files into reviewed, traceable next actions.”

Open [the live signed-out demo](https://opsledger-web-production.up.railway.app). Show the dashboard and pause long enough for the three queue outcomes to be readable. Point out that the public showcase is read-only; the full workflow runs locally with authorized reviewer access.

## 0:25–0:55 · System boundary

Show the architecture diagram.

“OpsLedger checks the files, dates, totals, and matching business details the same way every time. AI turns those results into a short review summary, but it cannot change the application status. A reviewer chooses what happens next and adds a reason.”

Do not call the readiness score a credit or risk score.

## 0:55–1:40 · Case A

Open `OPS-2026-0001`.

- Show that all four required documents are present and there are no open issues.
- Open **Documents** and point to the extracted details and original-file links.
- Show the short review summary and open **Information used for this summary**.
- Click **Approve for next step** to show the confirmation dialog.
- Explain that a reason is required before the reviewer can save the step.
- In the public link, show that the final control requires reviewer authorization and cancel the dialog. For an authorized local recording only, record approval, show the resulting audit event and PDF packet, then reset the synthetic fixture.

## 1:40–2:25 · Case B

Open `OPS-2026-0002`.

- Point to **Missing document** and **Financial record is out of date**.
- Show the clear instructions to add the ownership form and a newer revenue record.
- Edit one sentence in the message draft. In the public link, explain that saving is locked; in an authorized local take, save the edit.
- Say: “OpsLedger has no send control. This remains a draft until a person uses an approved external channel.”
- Open **History** to show the edit without a message event.

## 2:25–3:05 · Case C

Open `OPS-2026-0003`.

- Show the registration document’s different legal name.
- Show the registration number collision with `OPS-2026-0001`.
- Point out the plain **Needs a closer look** status.
- Show the resolution-note control but do not invent a resolution.

## 3:05–3:30 · Evidence and business path

Show `docs/TESTING.md` or a clean terminal run.

“The build currently passes 35 backend tests, seven frontend unit tests, seven real-browser flows, 20 live API checks, and an optimized production build. Railway built both application containers and serves the signed-out system against PostgreSQL. The first buyer hypothesis is a credit union, MSME support program, or advisory team with a document-heavy intake. A pilot would run beside the existing process and measure turnaround time, missing-document cycles, and reviewer overrides.”

## 3:30–3:45 · Close

“OpsLedger gives lean teams more operating capacity without hiding decisions inside a model. The next step is one controlled institution, one policy, synthetic-to-consented data validation, and measured operational results.”

## Recording checklist

- Keep final duration between 3:00 and 5:00.
- Use 1080p or higher and readable browser zoom.
- Verify audio before the final take.
- Do not show Railway/GitHub tokens, Gmail, the builder login, former client names, or private folders.
- Upload the final video only after Terry reviews the take.
- Test the final video URL while signed out.
- If no video is recorded, submit the verified live demo link under the published “video or live demo link” option.
