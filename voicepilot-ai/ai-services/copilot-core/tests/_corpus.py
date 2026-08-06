"""A small, realistic knowledge base, plus generators that behave badly.

Two tenants on purpose. Every isolation test needs a second tenant whose
material is *plausible for the first tenant's questions* — an isolation test
against an empty second tenant proves nothing, because retrieval would have
returned nothing anyway.
"""

from __future__ import annotations

from copilot import Chunk, Draft
from eval.embedder import ConceptEmbedder

__all__ = ["ConceptEmbedder"]
from copilot.chunking import chunk_document

SOLARIS_MANUAL = """
# Objection Handling v4

## 5. OBJECTIONS

### 5.3 It is too expensive

Primary response: nobody pays the full amount up front. The installation is
split over 24 months at zero interest, which for a typical home works out to
about $198 per month. That is below what most customers are already paying
the utility, and at the end of the term the customer owns the system outright.

If they insist: point out that the federal tax credit expires on December 31
and is worth 30 percent of the installed cost.

Never say: that the price is negotiable, or that a discount can be approved.
Pricing is fixed and no representative may offer a reduction.

### 5.4 I need to think about it

Primary response: agree, and offer to send the written proposal the same day.
Ask which specific number they want to check. Book the follow-up before
ending the call.

## 6. PRODUCT

### 6.1 Warranties

The panels carry a 25 year production warranty. The installation itself is
guaranteed for 10 years. There is no whole-system refund after installation
begins; the customer may cancel without penalty at any point before the
install date.

### 6.2 Typical system cost

A system sized for an average three bedroom home is approximately $28,000
installed, before the federal credit is applied.
"""

NORTHWIND_MANUAL = """
# Northwind Insurance — Agent Script

## 2. PRICING

### 2.1 Monthly premium

The standard policy is $89 per month with a $500 deductible. Agents may
approve a 15 percent discount for customers who bundle two or more policies.

### 2.2 Money-back guarantee

Northwind offers a full refund within the first 30 days, no questions asked.
"""


def solaris_chunks() -> list[Chunk]:
    return chunk_document(
        text=SOLARIS_MANUAL,
        tenant_id="solaris",
        kb_id="kb-main",
        kb_version=3,
        doc_title="Objection Handling v4",
        doc_id="doc-obj",
    )


def northwind_chunks() -> list[Chunk]:
    return chunk_document(
        text=NORTHWIND_MANUAL,
        tenant_id="northwind",
        kb_id="kb-main",
        kb_version=1,
        doc_title="Northwind Agent Script",
        doc_id="doc-nw",
    )


# Two sections that both answer "price of the standard system" and give
# different figures. That rivalry is the whole point: it is the situation in
# which a model can say something true of the corpus while citing the one
# chunk that does not support it.
PRICING_SHEET = """
# Pricing Sheet

## Monthly

The monthly price of the standard system is $198 per month.

## Installed

The full price of the standard system is $28,000 installed.
"""


def pricing_chunks() -> list[Chunk]:
    return chunk_document(
        text=PRICING_SHEET,
        tenant_id="solaris",
        kb_id="kb-main",
        kb_version=3,
        doc_title="Pricing Sheet",
        doc_id="doc-price",
    )


class RecordingGenerator:
    """Answers faithfully by quoting the chunks, and counts its own calls.

    The call count is the assertion that matters in half the pipeline tests:
    "the model was not called" is a stronger and cheaper guarantee than "the
    model was called and we discarded its output".
    """

    def __init__(self, text: str | None = None, *, cite: int = 1) -> None:
        self.calls = 0
        self.last_language: str | None = None
        self.last_chunk_ids: tuple[str, ...] = ()
        self._text = text
        self._cite = cite

    def generate(self, *, question, chunks, language, context) -> Draft:
        self.calls += 1
        self.last_language = language
        self.last_chunk_ids = tuple(c.id for c in chunks)
        used = tuple(c.id for c in chunks[: self._cite])
        if self._text is not None:
            return Draft(self._text, used)
        # Quote the material back. Grounded by construction.
        body = " ".join(chunks[0].text.split()[:30])
        return Draft(body, used)


class LyingGenerator:
    """Returns a fixed text and cites whatever it is told to, truthfully or not."""

    def __init__(self, text: str, *, used: tuple[str, ...] | None = None) -> None:
        self.calls = 0
        self._text = text
        self._used = used

    def generate(self, *, question, chunks, language, context) -> Draft:
        self.calls += 1
        used = self._used if self._used is not None else (chunks[0].id,)
        return Draft(self._text, used)


class DecliningGenerator:
    def __init__(self) -> None:
        self.calls = 0

    def generate(self, *, question, chunks, language, context) -> Draft:
        self.calls += 1
        return Draft("", (), declined=True)
