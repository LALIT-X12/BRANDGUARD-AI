import io
import zipfile

from bs4 import BeautifulSoup
import docx
import fitz  # PyMuPDF
from PIL import Image
import pytesseract

MAX_ZIP_UNCOMPRESSED_BYTES = 25 * 1024 * 1024  # 25 MB decompression guard
MAX_EXTRACTED_TEXT_CHARS = 500_000


def _validate_zip_bomb(content: bytes) -> None:
    """Reject ZIP/DOCX archives whose uncompressed size exceeds safe limits."""
    with zipfile.ZipFile(io.BytesIO(content)) as zf:
        total_uncompressed = sum(info.file_size for info in zf.infolist())
        if total_uncompressed > MAX_ZIP_UNCOMPRESSED_BYTES:
            raise ValueError("Archive uncompressed size exceeds safety limit")


def extract_text_from_bytes(content: bytes, content_format: str) -> str:
    """Extract plain text from supported BrandGuard submission formats with safety limits."""
    fmt = content_format.lower()

    if fmt in {"text", "markdown", "social"}:
        text = content.decode("utf-8", errors="replace")
    elif fmt == "html":
        soup = BeautifulSoup(content.decode("utf-8", errors="replace"), "html.parser")
        for tag in soup(["script", "style", "noscript"]):
            tag.decompose()
        text = soup.get_text(separator="\n", strip=True)
    elif fmt == "docx":
        if not content.startswith(b"PK\x03\x04"):
            raise ValueError("Invalid DOCX file signature")
        _validate_zip_bomb(content)
        document = docx.Document(io.BytesIO(content))
        text = "\n".join(p.text for p in document.paragraphs if p.text.strip())
    elif fmt == "pdf":
        if not content.startswith(b"%PDF-"):
            raise ValueError("Invalid PDF file signature")
        text_parts: list[str] = []
        with fitz.open(stream=content, filetype="pdf") as pdf_doc:
            for page in pdf_doc:
                page_text = page.get_text("text").strip()
                if page_text:
                    text_parts.append(page_text)
        text = "\n".join(text_parts)
    elif fmt == "image":
        image = Image.open(io.BytesIO(content))
        text = pytesseract.image_to_string(image).strip()
    else:
        raise ValueError(f"Unsupported content format: {content_format}")

    if len(text) > MAX_EXTRACTED_TEXT_CHARS:
        raise ValueError("Extracted content exceeds maximum character limit")
    return text
