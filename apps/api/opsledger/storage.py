import hashlib
import io
import re
import zipfile
from pathlib import Path

import boto3
from botocore.exceptions import ClientError

from .config import Settings, get_settings

ALLOWED_FILE_TYPES = {
    ".pdf": {"application/pdf", "application/octet-stream"},
    ".csv": {
        "text/csv",
        "application/csv",
        "application/vnd.ms-excel",
        "application/octet-stream",
    },
    ".xlsx": {
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/octet-stream",
    },
}


class FileRejected(ValueError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def _validate_file_content(suffix: str, content: bytes) -> None:
    if suffix == ".pdf":
        if b"%PDF-" not in content[:1024]:
            raise FileRejected("CONTENT_INVALID", "The file is not a readable PDF document.")
        return

    if suffix == ".xlsx":
        buffer = io.BytesIO(content)
        if not zipfile.is_zipfile(buffer):
            raise FileRejected("CONTENT_INVALID", "The file is not a readable XLSX workbook.")
        try:
            with zipfile.ZipFile(buffer) as workbook:
                members = set(workbook.namelist())
                entries = workbook.infolist()
        except zipfile.BadZipFile as exc:
            raise FileRejected(
                "CONTENT_INVALID",
                "The file is not a readable XLSX workbook.",
            ) from exc
        if not {"[Content_Types].xml", "xl/workbook.xml"}.issubset(members):
            raise FileRejected("CONTENT_INVALID", "The file is not a readable XLSX workbook.")
        if len(entries) > 1_000 or sum(entry.file_size for entry in entries) > 64 * 1024 * 1024:
            raise FileRejected(
                "CONTENT_INVALID",
                "The XLSX workbook expands beyond the safe processing limit.",
            )
        lowered_members = {member.lower() for member in members}
        if any(
            member.endswith("vbaproject.bin") or member.startswith("xl/externallinks/")
            for member in lowered_members
        ):
            raise FileRejected(
                "CONTENT_NOT_ALLOWED",
                "Macros and external workbook links are not supported.",
            )
        return

    if b"\x00" in content:
        raise FileRejected("CONTENT_INVALID", "The CSV file contains unsupported binary data.")
    try:
        content.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise FileRejected("CONTENT_INVALID", "CSV files must use UTF-8 text encoding.") from exc


def sanitize_filename(filename: str) -> str:
    name = Path(filename).name
    stem = re.sub(r"[^a-zA-Z0-9._-]+", "-", Path(name).stem).strip("-._") or "document"
    suffix = Path(name).suffix.lower()
    return f"{stem[:120]}{suffix}"


def validate_upload(
    filename: str,
    mime_type: str,
    content: bytes,
    max_upload_mb: int,
) -> tuple[str, str]:
    suffix = Path(filename).suffix.lower()
    if suffix not in ALLOWED_FILE_TYPES:
        raise FileRejected("FILE_TYPE_NOT_ALLOWED", "Use a PDF, CSV, or XLSX file.")
    if mime_type not in ALLOWED_FILE_TYPES[suffix]:
        raise FileRejected("MIME_TYPE_MISMATCH", "The file type does not match its extension.")
    if not content:
        raise FileRejected("EMPTY_FILE", "The uploaded file is empty.")
    if len(content) > max_upload_mb * 1024 * 1024:
        raise FileRejected("FILE_TOO_LARGE", f"Files must be {max_upload_mb} MB or smaller.")
    _validate_file_content(suffix, content)
    return sanitize_filename(filename), hashlib.sha256(content).hexdigest()


class Storage:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self.backend = self.settings.storage_backend.lower()
        self._s3 = None

    def _client(self):
        if self._s3 is None:
            self._s3 = boto3.client(
                "s3",
                endpoint_url=self.settings.s3_endpoint_url,
                aws_access_key_id=self.settings.s3_access_key_id,
                aws_secret_access_key=self.settings.s3_secret_access_key,
                region_name=self.settings.s3_region,
            )
        return self._s3

    def put(self, key: str, content: bytes, mime_type: str) -> None:
        if self.backend == "s3":
            self._client().put_object(
                Bucket=self.settings.storage_bucket,
                Key=key,
                Body=content,
                ContentType=mime_type,
                ServerSideEncryption="AES256",
            )
            return

        path = self.settings.local_upload_dir / key
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)

    def get(self, key: str) -> bytes:
        if self.backend == "s3":
            response = self._client().get_object(Bucket=self.settings.storage_bucket, Key=key)
            return response["Body"].read()
        return (self.settings.local_upload_dir / key).read_bytes()

    def exists(self, key: str) -> bool:
        if self.backend == "s3":
            try:
                self._client().head_object(Bucket=self.settings.storage_bucket, Key=key)
            except ClientError:
                return False
            return True
        return (self.settings.local_upload_dir / key).is_file()
