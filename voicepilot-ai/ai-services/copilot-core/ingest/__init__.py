"""Knowledge ingestion. `docs/06` §2.

Two rules carry the module. **Extraction must not flatten** — in a
call-centre document the structure *is* the content, so every extractor emits
headings and `chunking.py` rebuilds the tree. And **a knowledge base that
cannot answer anything is refused at upload**, because a scanned manual
ingested silently leaves the copilot mute on every question it covers, and
that reads as a broken product rather than a bad file.
"""

from .extract import (
    PDF_UNSUPPORTED,
    Extracted,
    Unsupported,
    extract,
    from_csv,
    from_docx,
    from_html,
    from_pdf,
    from_text,
)
from .publish import (
    MAX_REPEATED_LINE_SHARE,
    MIN_LINES_FOR_REPETITION,
    MIN_WORDS_PER_DOC,
    MIN_WORDS_PER_KB,
    Publication,
    PublicationRefused,
    Rejected,
    inspect,
    publish,
    safe_extract,
)

__all__ = [
    "Extracted", "MAX_REPEATED_LINE_SHARE", "MIN_LINES_FOR_REPETITION", "MIN_WORDS_PER_DOC",
    "MIN_WORDS_PER_KB", "PDF_UNSUPPORTED", "Publication",
    "PublicationRefused", "Rejected", "Unsupported", "extract", "from_csv",
    "from_docx", "from_html", "from_pdf", "from_text", "inspect", "publish",
    "safe_extract",
]
