"""Publishing a knowledge base, and refusing to publish a bad one.

`docs/06` §2 states the versioning rule and calls it non-negotiable:

> Each publication creates `kb_version + 1`. Calls record the version they
> used. **Knowledge is never overwritten**: a call from March is audited
> against the material that was live in March. This is non-negotiable for
> compliance.

And this module adds the gate the spec implies but does not spell out.

`docs/06` §2 says old call-center manuals are *always* scans. A scanned PDF
yields no text. Ingest it silently and the customer believes their manual is
loaded, the copilot stays silent on every question it covers, and the failure
looks like a bad product rather than a bad upload. Three months later they
churn saying "the AI never knew anything."

That failure is silent, slow and fatal, so publication **refuses** rather
than warns. A knowledge base that cannot answer anything is not a knowledge
base, and the moment to find out is at upload — while somebody is still
looking at the screen.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from copilot.chunking import chunk_document
from copilot.types import Chunk

from .extract import Extracted, Unsupported

#: A document producing fewer than this many words is almost certainly a scan,
#: an empty template, or a file that failed to parse while reporting success.
MIN_WORDS_PER_DOC = 50

#: Below this, the corpus cannot cover a call-centre's question space. Chosen
#: to be embarrassingly low: this is a floor for "obviously broken", not a
#: judgement about whether the material is any good.
MIN_WORDS_PER_KB = 300

#: A document whose text is mostly one repeated line is a header/footer dump —
#: the classic output of a PDF converter that found no body text.
MAX_REPEATED_LINE_SHARE = 0.4

#: ...but only once there are enough lines for a share to mean anything. With
#: three lines, "40% identical" is one coincidence, and rejecting on it throws
#: out short, perfectly good documents. A real header dump runs to dozens.
MIN_LINES_FOR_REPETITION = 10


@dataclass(frozen=True)
class Rejected:
    source: str
    reason: str


@dataclass
class Publication:
    """The result of an ingestion, and the version it produced."""

    tenant_id: str
    kb_id: str
    kb_version: int
    chunks: list[Chunk] = field(default_factory=list)
    accepted: list[str] = field(default_factory=list)
    rejected: list[Rejected] = field(default_factory=list)
    warnings: list[tuple[str, str]] = field(default_factory=list)

    @property
    def words(self) -> int:
        return sum(len(c.text.split()) for c in self.chunks)

    def summary(self) -> str:
        parts = [
            f"kb_version {self.kb_version}",
            f"{len(self.accepted)} document(s) accepted",
            f"{len(self.chunks)} chunks",
            f"{self.words} words",
        ]
        if self.rejected:
            parts.append(f"{len(self.rejected)} REJECTED")
        if self.warnings:
            parts.append(f"{len(self.warnings)} warning(s)")
        return " · ".join(parts)


class PublicationRefused(Exception):
    """Nothing was published. The message says what to fix."""


def inspect(doc: Extracted) -> str | None:
    """Why this document should not be ingested, or None.

    Every check here answers the same question: *would a person looking at
    this file believe it had been read correctly?* If yes, and it was not,
    that is the failure worth blocking.
    """
    if doc.words < MIN_WORDS_PER_DOC:
        return (
            f"only {doc.words} words extracted. A scanned PDF, an empty "
            "template, or a parser that failed while reporting success — all "
            "three look like this, and all three leave the copilot silent"
        )

    lines = [l.strip() for l in doc.text.splitlines() if l.strip()]
    if len(lines) >= MIN_LINES_FOR_REPETITION:
        most = max(lines.count(l) for l in set(lines))
        if most / len(lines) > MAX_REPEATED_LINE_SHARE:
            return (
                f"{most}/{len(lines)} lines are identical — this is a header "
                "or footer dump, which is what a converter produces when it "
                "finds no body text"
            )
    return None


def publish(
    documents: dict[str, Extracted],
    *,
    tenant_id: str,
    kb_id: str,
    current_version: int,
) -> Publication:
    """Ingest a set of documents as a new knowledge-base version.

    `current_version` in, `current_version + 1` out. The old version keeps
    every chunk it had: a call recorded against version 3 must still resolve
    its citations after version 4 ships, or the audit trail the whole copilot
    rests on is a trail to nowhere.
    """
    if not documents:
        raise PublicationRefused("nothing to publish")

    version = current_version + 1
    pub = Publication(tenant_id, kb_id, version)

    for source, doc in documents.items():
        problem = inspect(doc)
        if problem:
            pub.rejected.append(Rejected(source, problem))
            continue

        for w in doc.warnings:
            pub.warnings.append((source, w))

        pub.chunks.extend(
            chunk_document(
                text=doc.text,
                tenant_id=tenant_id,
                kb_id=kb_id,
                kb_version=version,
                doc_title=_title(doc, source),
                doc_id=_doc_id(source),
            )
        )
        pub.accepted.append(source)

    if not pub.accepted:
        raise PublicationRefused(
            "every document was rejected:\n"
            + "\n".join(f"  {r.source}: {r.reason}" for r in pub.rejected)
        )

    if pub.words < MIN_WORDS_PER_KB:
        raise PublicationRefused(
            f"only {pub.words} words across {len(pub.accepted)} document(s). "
            f"A knowledge base under {MIN_WORDS_PER_KB} words cannot cover a "
            "call centre's questions, and shipping it means the copilot is "
            "silent on almost everything — which reads as a broken product "
            "rather than a thin corpus."
        )

    return pub


def _title(doc: Extracted, source: str) -> str:
    """The document title, from its first heading or its filename.

    It rides on every chunk and into every citation, so it is what an agent
    reads when deciding whether to trust a suggestion mid-call. `manual.docx`
    is a worse answer than `Objection Handling v4`, but it is an honest one.
    """
    for line in doc.text.splitlines():
        if line.startswith("# "):
            return line[2:].strip()
    return source.rsplit("/", 1)[-1]


def _doc_id(source: str) -> str:
    """Derived from the path, so re-publishing an unchanged file keeps its
    chunk ids — see the note in `chunk_document`."""
    name = source.rsplit("/", 1)[-1]
    return "doc-" + "".join(c if c.isalnum() else "-" for c in name.lower()).strip("-")


def safe_extract(loader, /, **kw) -> tuple[Extracted | None, str | None]:
    """Run an extractor, turning `Unsupported` into a reportable message.

    One unreadable file in a batch of thirty must not abort the upload — the
    other twenty-nine are fine, and making somebody re-upload all of them to
    fix one is how a five-minute onboarding becomes an afternoon.
    """
    try:
        return loader(**kw), None
    except Unsupported as e:
        return None, str(e)
