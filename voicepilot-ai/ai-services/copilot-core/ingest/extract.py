"""Getting text out of a customer's documents without losing their shape.

`docs/06` §2. The extraction table lists PDF, DOCX, HTML, CSV — but the
sentence that governs this whole module is in the chunking section:

> Naive chunking destroys call-center documents, **because their structure
> *is* the content.**

Which means extraction cannot flatten. If a DOCX arrives as one long string,
the heading hierarchy is gone before `chunking.py` ever sees it, "Never say:"
floats free of the objection it belongs to, and every downstream guarantee
about grounded answers is built on rubble. So every extractor here emits
Markdown headings, and `chunking.py` rebuilds the tree from them.

Zero dependencies, which is possible for more formats than people expect: a
DOCX is a ZIP of XML, and both are in the standard library. PDF is the honest
exception — see `PDF_UNSUPPORTED` below.
"""

from __future__ import annotations

import csv
import io
import re
import zipfile
from dataclasses import dataclass
from html.parser import HTMLParser
from xml.etree import ElementTree

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


class Unsupported(Exception):
    """The format cannot be read. Raised loudly rather than returning "".

    An empty string looks exactly like a successfully-read empty document,
    and that is how a customer ends up believing their manual is loaded while
    the copilot stays silent forever.
    """


PDF_UNSUPPORTED = (
    "PDF extraction needs a parser this package deliberately does not carry. "
    "Convert to DOCX or paste the text. Note that `docs/06` §2 says old "
    "call-center manuals are *always* scans — a scanned PDF needs OCR, and a "
    "PDF parser would return an empty page for it while reporting success."
)


@dataclass(frozen=True)
class Extracted:
    """Markdown-ish text, plus what it took to get it.

    `warnings` is not decoration. It is how the ingestion gate in
    `publish.py` decides whether a document is worth accepting, and how a
    customer finds out their file was a scan *before* they go live on it.
    """

    text: str
    source: str
    format: str
    warnings: tuple[str, ...] = ()

    @property
    def words(self) -> int:
        return len(self.text.split())


# ---------------------------------------------------------------------------
# DOCX
# ---------------------------------------------------------------------------


def from_docx(data: bytes, *, source: str = "document.docx") -> Extracted:
    """A DOCX is a ZIP of XML. No dependency required — and heading levels
    live in paragraph styles, which is the part a naive text dump throws away.

    Word writes heading styles as `Heading1`, `Heading 1`, `heading 1` and,
    in documents translated from Spanish, `Ttulo1`. All of them mean the same
    thing to the person who wrote the manual, and a matcher that recognises
    only one of them silently flattens the other three.
    """
    warnings: list[str] = []
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            xml = z.read("word/document.xml")
    except (zipfile.BadZipFile, KeyError) as e:
        raise Unsupported(f"{source}: not a readable .docx ({e})") from e

    root = ElementTree.fromstring(xml)
    lines: list[str] = []

    for para in root.iter(f"{W}p"):
        text = "".join(t.text or "" for t in para.iter(f"{W}t")).strip()
        if not text:
            continue
        level = _heading_level(para)
        lines.append("#" * level + " " + text if level else text)

    if not any(l.startswith("#") for l in lines):
        warnings.append(
            "no heading styles found — the document is a flat wall of text, "
            "so retrieval will not be able to tell one section from another"
        )

    return Extracted("\n\n".join(lines), source, "docx", tuple(warnings))


_HEADING_STYLE = re.compile(r"^(?:heading|ttulo|titulo|berschrift)\s*([1-6])$", re.I)


def _heading_level(para: ElementTree.Element) -> int:
    style = para.find(f"{W}pPr/{W}pStyle")
    if style is None:
        return 0
    name = (style.get(f"{W}val") or "").strip()
    m = _HEADING_STYLE.match(name.replace("-", "").replace("_", ""))
    return int(m.group(1)) if m else 0


# ---------------------------------------------------------------------------
# HTML
# ---------------------------------------------------------------------------


class _Html(HTMLParser):
    """Main content only. `docs/06` §2: discard navigation and footers.

    Nav links and cookie banners are text, and to a retriever they are text
    that appears on every page of the corpus — which makes them look
    important to a term-frequency model and puts "Skip to main content" in
    front of an agent handling a price objection.
    """

    SKIP = {"script", "style", "nav", "footer", "header", "aside", "noscript"}
    HEAD = {"h1": 1, "h2": 2, "h3": 3, "h4": 4, "h5": 5, "h6": 6}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.out: list[str] = []
        self._skip = 0
        self._heading = 0
        self._buf: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag in self.SKIP:
            self._skip += 1
        elif tag in self.HEAD:
            self._flush()
            self._heading = self.HEAD[tag]

    def handle_endtag(self, tag):
        if tag in self.SKIP:
            self._skip = max(0, self._skip - 1)
        elif tag in self.HEAD or tag in {"p", "li", "div", "tr", "br"}:
            self._flush()

    def handle_data(self, data):
        if self._skip == 0 and data.strip():
            self._buf.append(data.strip())

    def _flush(self):
        if self._buf:
            text = " ".join(self._buf).strip()
            if text:
                self.out.append("#" * self._heading + " " + text if self._heading else text)
            self._buf.clear()
        self._heading = 0

    def close(self):
        super().close()
        self._flush()


def from_html(html: str, *, source: str = "page.html") -> Extracted:
    p = _Html()
    p.feed(html)
    p.close()
    warnings: list[str] = []
    if not any(l.startswith("#") for l in p.out):
        warnings.append("no headings in the page — structure will be lost")
    return Extracted("\n\n".join(p.out), source, "html", tuple(warnings))


# ---------------------------------------------------------------------------
# CSV
# ---------------------------------------------------------------------------


def from_csv(text: str, *, source: str = "table.csv") -> Extracted:
    """One row becomes one record. `docs/06` §2: product catalogues and price
    sheets arrive this way.

    Each row is emitted as `column: value` lines under a heading, rather than
    as a comma-joined line, because a retriever asked "what does SKU-4471
    cost" has to be able to see that `4471` and `$389` belong to the same
    row. A comma-joined dump loses that the moment two rows land in one chunk.
    """
    rows = list(csv.reader(io.StringIO(text)))
    if not rows:
        return Extracted("", source, "csv", ("empty file",))

    header, *body = rows
    header = [h.strip() or f"col{i}" for i, h in enumerate(header)]
    out: list[str] = []
    for n, row in enumerate(body, start=1):
        if not any(c.strip() for c in row):
            continue
        label = (row[0].strip() if row else "") or f"row {n}"
        out.append(f"## {label}")
        out.append("\n".join(
            f"{header[i] if i < len(header) else f'col{i}'}: {c.strip()}"
            for i, c in enumerate(row) if c.strip()
        ))

    warnings = () if body else ("header only, no rows",)
    return Extracted("\n\n".join(out), source, "csv", warnings)


# ---------------------------------------------------------------------------
# Plain text / Markdown
# ---------------------------------------------------------------------------


def from_text(text: str, *, source: str = "notes.txt") -> Extracted:
    warnings: list[str] = []
    if not re.search(r"^\s*(#{1,6}\s|\d+(\.\d+)*\.?\s)", text, re.M):
        warnings.append(
            "no headings or numbered sections — chunking will fall back to "
            "paragraph boundaries, which is materially worse for retrieval"
        )
    return Extracted(text, source, "text", tuple(warnings))


def from_pdf(data: bytes, *, source: str = "document.pdf") -> Extracted:
    raise Unsupported(f"{source}: {PDF_UNSUPPORTED}")


def extract(data: bytes | str, *, source: str) -> Extracted:
    """Dispatch on the filename. Unknown extensions are refused, not guessed.

    Guessing means an `.xlsx` gets read as text, produces a page of XML
    fragments, and lands in the corpus as garbage the copilot will one day
    quote to a customer.
    """
    name = source.lower()
    if name.endswith(".docx"):
        return from_docx(data if isinstance(data, bytes) else data.encode(), source=source)
    if name.endswith(".pdf"):
        return from_pdf(data if isinstance(data, bytes) else data.encode(), source=source)
    text = data.decode("utf-8", "replace") if isinstance(data, bytes) else data
    if name.endswith((".html", ".htm")):
        return from_html(text, source=source)
    if name.endswith(".csv"):
        return from_csv(text, source=source)
    if name.endswith((".txt", ".md", ".markdown")):
        return from_text(text, source=source)
    raise Unsupported(
        f"{source}: unsupported format. Reading an unknown file as text puts "
        "fragments of its container in the corpus, and the copilot will one "
        "day quote them to a customer."
    )
