from __future__ import annotations

import io
import zipfile

import pytest

from opsledger.storage import FileRejected, sanitize_filename, validate_upload


def test_filename_is_reduced_to_a_safe_basename() -> None:
    assert sanitize_filename("../../Proof of Registration!!.PDF") == "Proof-of-Registration.pdf"


def test_disallowed_file_type_is_rejected() -> None:
    with pytest.raises(FileRejected, match="PDF, CSV, or XLSX") as error:
        validate_upload("payload.exe", "application/octet-stream", b"data", 8)

    assert error.value.code == "FILE_TYPE_NOT_ALLOWED"


def test_mime_mismatch_is_rejected() -> None:
    with pytest.raises(FileRejected) as error:
        validate_upload("statement.pdf", "text/csv", b"not a PDF", 8)

    assert error.value.code == "MIME_TYPE_MISMATCH"


def test_oversized_file_is_rejected() -> None:
    with pytest.raises(FileRejected) as error:
        validate_upload("statement.csv", "text/csv", b"x" * 1025, 0)

    assert error.value.code == "FILE_TOO_LARGE"


@pytest.mark.parametrize(
    ("filename", "mime_type", "content"),
    [
        ("statement.pdf", "application/pdf", b"This is plain text."),
        (
            "statement.xlsx",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            b"PK\x03\x04not-a-workbook",
        ),
        ("statement.csv", "text/csv", b"period,revenue\x00binary"),
    ],
)
def test_spoofed_or_binary_content_is_rejected(
    filename: str,
    mime_type: str,
    content: bytes,
) -> None:
    with pytest.raises(FileRejected) as error:
        validate_upload(filename, mime_type, content, 8)

    assert error.value.code == "CONTENT_INVALID"


def test_utf8_csv_content_is_accepted() -> None:
    safe_name, digest = validate_upload(
        "Revenue export.csv",
        "text/csv",
        b"period,revenue\n2026-07,12000\n",
        8,
    )

    assert safe_name == "Revenue-export.csv"
    assert len(digest) == 64


def test_workbook_with_macro_payload_is_rejected() -> None:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as workbook:
        workbook.writestr("[Content_Types].xml", "<Types />")
        workbook.writestr("xl/workbook.xml", "<workbook />")
        workbook.writestr("xl/vbaProject.bin", b"synthetic macro payload")

    with pytest.raises(FileRejected) as error:
        validate_upload(
            "statement.xlsx",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            buffer.getvalue(),
            8,
        )

    assert error.value.code == "CONTENT_NOT_ALLOWED"
