from __future__ import annotations

import io
import re
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

import pandas as pd
import pymupdf as fitz
from sqlalchemy import delete
from sqlalchemy.orm import Session

from .models import Document, ExtractedField
from .storage import Storage


class ExtractionFailed(ValueError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


LABEL_FIELDS = {
    "legal business name": "legal_business_name",
    "registration number": "registration_number",
    "jurisdiction": "jurisdiction",
    "registered on": "registered_on",
    "ownership declared": "ownership_declared",
    "owner name": "owner_name",
    "signed on": "signed_on",
}


def _json_value(value: Any) -> Any:
    if isinstance(value, (pd.Timestamp, datetime)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    if hasattr(value, "item"):
        return value.item()
    return value


def _add_field(
    db: Session,
    document: Document,
    name: str,
    value: Any,
    *,
    raw_value: str,
    locator: str,
    method: str,
    source_page: int | None = None,
    confidence: float = 1.0,
) -> None:
    db.add(
        ExtractedField(
            case_id=document.case_id,
            document_id=document.id,
            field_name=name,
            normalized_value=_json_value(value),
            raw_value=raw_value,
            confidence=confidence,
            source_page=source_page,
            source_locator=locator,
            extraction_method=method,
        )
    )


def _parse_pdf(
    db: Session,
    document: Document,
    content: bytes,
    max_pages: int,
) -> dict[str, Any]:
    try:
        pdf = fitz.open(stream=content, filetype="pdf")
    except Exception as exc:
        raise ExtractionFailed("PDF_UNREADABLE", "The PDF could not be read.") from exc
    if pdf.needs_pass:
        pdf.close()
        raise ExtractionFailed(
            "PDF_PASSWORD_PROTECTED",
            "Password-protected PDFs are not supported.",
        )
    if pdf.page_count < 1:
        pdf.close()
        raise ExtractionFailed("PDF_UNREADABLE", "The PDF does not contain a readable page.")
    if pdf.page_count > max_pages:
        page_count = pdf.page_count
        pdf.close()
        raise ExtractionFailed(
            "PDF_PAGE_LIMIT_EXCEEDED",
            f"PDF documents may contain at most {max_pages} pages; this file has {page_count}.",
        )

    document.page_count = pdf.page_count
    fields_found = 0
    try:
        for page_index, page in enumerate(pdf):
            text = page.get_text("text")
            for line_number, line in enumerate(text.splitlines(), start=1):
                match = re.match(r"^([^:]{2,50}):\s*(.+)$", line.strip())
                if not match:
                    continue
                label, raw_value = match.groups()
                field_name = LABEL_FIELDS.get(label.strip().lower())
                if not field_name:
                    continue
                value: Any = raw_value.strip()
                if field_name == "ownership_declared":
                    value = value.lower() in {"yes", "true", "declared"}
                _add_field(
                    db,
                    document,
                    field_name,
                    value,
                    raw_value=raw_value,
                    locator=f"page {page_index + 1}, line {line_number}",
                    method="pymupdf_label_parser",
                    source_page=page_index + 1,
                )
                fields_found += 1
        return {"fields_found": fields_found, "page_count": pdf.page_count}
    finally:
        pdf.close()


def _read_table(content: bytes, suffix: str, max_rows: int) -> pd.DataFrame:
    try:
        if suffix == ".csv":
            frame = pd.read_csv(io.BytesIO(content), nrows=max_rows + 1)
        else:
            frame = pd.read_excel(io.BytesIO(content), engine="openpyxl", nrows=max_rows + 1)
    except Exception as exc:
        raise ExtractionFailed("TABLE_UNREADABLE", "The spreadsheet could not be read.") from exc
    if len(frame) > max_rows:
        raise ExtractionFailed(
            "TABLE_ROW_LIMIT_EXCEEDED",
            f"Spreadsheet documents may contain at most {max_rows} data rows.",
        )
    return frame


def _parse_revenue(
    db: Session,
    document: Document,
    content: bytes,
    suffix: str,
    max_rows: int,
) -> dict[str, Any]:
    frame = _read_table(content, suffix, max_rows)
    required = {"period", "revenue", "currency", "as_of_date"}
    if not required.issubset(frame.columns):
        raise ExtractionFailed(
            "REVENUE_COLUMNS_MISSING",
            "The revenue file is missing required columns.",
        )

    revenue = pd.to_numeric(frame["revenue"], errors="coerce")
    if revenue.isna().any():
        raise ExtractionFailed(
            "REVENUE_VALUE_INVALID",
            "The revenue file contains an invalid amount.",
        )
    computed_total = Decimal(str(revenue.sum()))
    declared_total = computed_total
    if "declared_total" in frame.columns and frame["declared_total"].notna().any():
        declared_total = Decimal(str(frame["declared_total"].dropna().iloc[0]))
    as_of = pd.to_datetime(frame["as_of_date"], errors="coerce").max()
    if pd.isna(as_of):
        raise ExtractionFailed(
            "REVENUE_DATE_INVALID",
            "The revenue file contains an invalid date.",
        )
    currency = str(frame["currency"].dropna().iloc[0]).upper()

    metadata = {
        "row_count": int(len(frame)),
        "computed_total": str(computed_total),
        "declared_total": str(declared_total),
        "as_of_date": as_of.date().isoformat(),
        "currency": currency,
    }
    for field_name, value in metadata.items():
        _add_field(
            db,
            document,
            f"revenue_{field_name}",
            value,
            raw_value=str(value),
            locator=f"column {field_name}",
            method=f"pandas_{suffix.removeprefix('.')}_parser",
        )
    return metadata


def _parse_bank_statement(
    db: Session,
    document: Document,
    content: bytes,
    suffix: str,
    max_rows: int,
) -> dict[str, Any]:
    frame = _read_table(content, suffix, max_rows)
    required = {"date", "description", "amount", "balance", "currency"}
    if not required.issubset(frame.columns):
        raise ExtractionFailed(
            "BANK_COLUMNS_MISSING",
            "The bank-style file is missing required columns.",
        )
    dates = pd.to_datetime(frame["date"], errors="coerce")
    amounts = pd.to_numeric(frame["amount"], errors="coerce")
    balances = pd.to_numeric(frame["balance"], errors="coerce")
    if dates.isna().any() or amounts.isna().any() or balances.isna().any():
        raise ExtractionFailed(
            "BANK_VALUE_INVALID",
            "The bank-style file contains an invalid value.",
        )

    metadata = {
        "transaction_count": int(len(frame)),
        "as_of_date": dates.max().date().isoformat(),
        "ending_balance": str(Decimal(str(balances.iloc[-1]))),
        "currency": str(frame["currency"].dropna().iloc[0]).upper(),
    }
    for field_name, value in metadata.items():
        _add_field(
            db,
            document,
            f"bank_{field_name}",
            value,
            raw_value=str(value),
            locator=f"column {field_name}",
            method=f"pandas_{suffix.removeprefix('.')}_parser",
        )
    return metadata


def extract_document(db: Session, document: Document, storage: Storage) -> None:
    db.execute(delete(ExtractedField).where(ExtractedField.document_id == document.id))
    document.extraction_status = "PROCESSING"
    document.error_code = None
    document.error_message_safe = None
    content = storage.get(document.storage_key)
    suffix = Path(document.safe_filename).suffix.lower()

    try:
        if suffix == ".pdf":
            metadata = _parse_pdf(db, document, content, storage.settings.max_pdf_pages)
        elif document.document_type == "REVENUE_STATEMENT":
            metadata = _parse_revenue(
                db,
                document,
                content,
                suffix,
                storage.settings.max_table_rows,
            )
        elif document.document_type == "BANK_STATEMENT":
            metadata = _parse_bank_statement(
                db,
                document,
                content,
                suffix,
                storage.settings.max_table_rows,
            )
        else:
            raise ExtractionFailed(
                "PARSER_NOT_CONFIGURED",
                "No parser is configured for this document type.",
            )
    except ExtractionFailed as exc:
        document.extraction_status = "FAILED"
        document.error_code = exc.code
        document.error_message_safe = str(exc)
        raise

    document.metadata_json = metadata
    document.extraction_status = "EXTRACTED"
    document.extracted_at = datetime.now(UTC)
