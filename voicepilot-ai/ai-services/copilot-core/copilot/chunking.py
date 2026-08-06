"""Splitting documents without destroying them.

`docs/06` §2 is blunt about why naive chunking fails here: in a call-center
manual **the structure is the content**. An objection handbook looks like
this —

    5. OBJECTIONS
       5.3 "It's too expensive"
           Primary response: ...
           If they insist: ...
           Never say: ...

— and cutting through the middle of 5.3 turns one useful answer into two
useless fragments. Worse, it can separate "Never say:" from the thing it
forbids, which is how a copilot ends up suggesting the one sentence the
company's own manual prohibits.

So headings are hard boundaries, every chunk keeps its full `heading_path`,
and overlap never crosses a section.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from .types import Chunk

TARGET_TOKENS = 500
MAX_TOKENS = 900
OVERLAP_TOKENS = 80

# Markdown, and the numbered outline that every manual written in Word uses.
_MD = re.compile(r"^(#{1,6})\s+(.*\S)\s*$")
_NUMBERED = re.compile(r"^\s*(\d+(?:\.\d+)*)\.?\s+(\S.*)$")
# A short line in capitals is a heading in scanned documents, where all the
# formatting was lost to OCR. Long ones are shouted sentences, not headings.
_CAPS = re.compile(r"^\s*([A-ZÁÉÍÓÚÑ0-9][A-ZÁÉÍÓÚÑ0-9 ,.\-/&']{2,60})\s*$")


@dataclass(frozen=True)
class Heading:
    level: int
    title: str


def _classify(line: str) -> Heading | None:
    if m := _MD.match(line):
        return Heading(len(m.group(1)), m.group(2).strip())
    if m := _NUMBERED.match(line):
        # "5.3" is depth 2. The outline numbering *is* the hierarchy, already
        # written down by whoever wrote the manual; inferring it again from
        # indentation would be guessing at something we were told.
        return Heading(m.group(1).count(".") + 1, f"{m.group(1)} {m.group(2).strip()}")
    if m := _CAPS.match(line):
        title = m.group(1).strip()
        if len(title.split()) <= 8 and not title.endswith((".", ":")):
            return Heading(1, title)
    return None


def _count(text: str) -> int:
    """Words as a proxy for tokens.

    Deliberately approximate, and deliberately *under*-counting: real
    tokenisers split words, so a 500-word chunk is roughly 650-750 tokens and
    stays inside the budget. Pulling in a real tokeniser would mean a model
    dependency to decide where a paragraph ends, which is a poor trade for
    precision nobody can perceive.
    """
    return len(text.split())


def _windows(paragraphs: list[str]) -> list[str]:
    """Pack paragraphs into chunks, with overlap, never splitting mid-paragraph
    unless a single paragraph is itself over the maximum."""
    out: list[str] = []
    buf: list[str] = []
    size = 0

    def flush() -> None:
        nonlocal buf, size
        if buf:
            out.append("\n\n".join(buf))
            # Carry the tail forward so a sentence that answers the question
            # is never orphaned at a boundary.
            tail: list[str] = []
            carried = 0
            for p in reversed(buf):
                if carried >= OVERLAP_TOKENS:
                    break
                tail.insert(0, p)
                carried += _count(p)
            buf = tail if carried < size else []
            size = sum(_count(p) for p in buf)

    for para in paragraphs:
        n = _count(para)
        if n > MAX_TOKENS:
            flush()
            if buf:
                out.append("\n\n".join(buf))
                buf, size = [], 0
            words = para.split()
            step = TARGET_TOKENS - OVERLAP_TOKENS
            for i in range(0, len(words), step):
                out.append(" ".join(words[i : i + TARGET_TOKENS]))
                if i + TARGET_TOKENS >= len(words):
                    break
            continue
        if size + n > TARGET_TOKENS and buf:
            flush()
        buf.append(para)
        size += n

    if buf:
        out.append("\n\n".join(buf))
    return [c for c in out if c.strip()]


def chunk_document(
    *,
    text: str,
    tenant_id: str,
    kb_id: str,
    kb_version: int,
    doc_title: str,
    doc_id: str,
) -> list[Chunk]:
    """Split one document into retrievable chunks.

    Chunk ids are derived from the document id and an ordinal rather than
    from a hash of the content. Re-publishing an unchanged document then
    produces the same ids, and a call recorded in March still resolves its
    citations in December — which is the whole reason `kb_version` exists.
    """
    path: list[str] = []
    sections: list[tuple[tuple[str, ...], list[str]]] = []
    current: list[str] = []
    para: list[str] = []

    def end_para() -> None:
        if para:
            current.append(" ".join(para).strip())
            para.clear()

    def end_section() -> None:
        end_para()
        if current:
            sections.append((tuple(path), list(current)))
            current.clear()

    for raw in text.splitlines():
        line = raw.rstrip()
        heading = _classify(line) if line.strip() else None
        if heading:
            end_section()
            del path[heading.level - 1 :]
            path.append(heading.title)
            continue
        if not line.strip():
            end_para()
            continue
        para.append(line.strip())
    end_section()

    chunks: list[Chunk] = []
    n = 0
    for heading_path, paragraphs in sections:
        for body in _windows(paragraphs):
            chunks.append(
                Chunk(
                    id=f"{doc_id}#{n:04d}",
                    tenant_id=tenant_id,
                    kb_id=kb_id,
                    kb_version=kb_version,
                    doc_title=doc_title,
                    heading_path=heading_path,
                    text=body,
                )
            )
            n += 1
    return chunks
