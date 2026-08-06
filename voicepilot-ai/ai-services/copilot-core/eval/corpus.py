"""The evaluation corpus and question set.

Two tenants, both plausible, because a tenant-isolation result against an
empty neighbour proves nothing. The questions are grouped by what the correct
outcome *is*, which is the only way "0 hallucinations" and "useful" can be
measured at the same time — a copilot that answers nothing scores perfectly
on safety and is worthless.
"""

from __future__ import annotations

from enum import Enum

from copilot import Chunk
from copilot.chunking import chunk_document


class QueryKind(str, Enum):
    IN_CORPUS = "answerable"          # the material covers this
    PARAPHRASE = "paraphrased"        # covered, but not in the manual's words
    OUT_OF_CORPUS = "not covered"     # must be silence
    OTHER_TENANT = "other tenant"     # covered — by somebody else's manual
    CHITCHAT = "no trigger"           # must not interrupt


SOLARIS = """
# Objection Handling v4

## 5. OBJECTIONS

### 5.3 It is too expensive

Primary response: nobody pays the full amount up front. The installation is
split over 24 months at zero interest, which for a typical home works out to
about $198 per month. That is below what most customers are already paying
the utility, and at the end of the term the customer owns the system.

If they insist: the federal tax credit expires on December 31 and is worth 30
percent of the installed cost.

Never say: that the price is negotiable, or that a discount can be approved.
Pricing is fixed and no representative may offer a reduction.

### 5.4 I need to think about it

Primary response: agree, and offer to send the written proposal the same day.
Ask which specific number they want to check. Book the follow-up call before
ending this one.

### 5.5 I want to shop around

Primary response: encourage it, and offer a written comparison sheet. Point
out that the December 31 credit deadline applies whoever they buy from.

## 6. PRODUCT

### 6.1 Warranties

The panels carry a 25 year production warranty. The installation itself is
guaranteed for 10 years. There is no whole-system refund after installation
begins; the customer may cancel without penalty at any point before the
install date.

### 6.2 Typical system cost

A system sized for an average three bedroom home is approximately $28,000
installed, before the federal credit is applied.

### 6.3 Roof condition

If the roof is more than 20 years old, a roof assessment is required before
install. The assessment costs $350 and is credited back if the customer
proceeds.

## 7. PROCESS

### 7.1 Timeline

From signed contract to switched on is typically 8 to 12 weeks: permitting
takes 4 to 6 weeks, installation is one to two days, and utility approval
takes a further 2 to 4 weeks.

### 7.2 Identity verification

The service address must be confirmed with the customer before any pricing is
discussed. This must happen within the first minute of the call.
"""

NORTHWIND = """
# Northwind Insurance — Agent Script

## 2. PRICING

### 2.1 Monthly premium

The standard policy is $89 per month with a $500 deductible. Agents may
approve a 15 percent discount for customers who bundle two or more policies.

### 2.2 Money-back guarantee

Northwind offers a full refund within the first 30 days, no questions asked.

### 2.3 Claims

Claims are settled within 14 business days of documentation being received.
"""


def _chunks(text: str, tenant: str, version: int, title: str, doc: str) -> list[Chunk]:
    return chunk_document(
        text=text,
        tenant_id=tenant,
        kb_id="kb-main",
        kb_version=version,
        doc_title=title,
        doc_id=doc,
    )


CORPUS: dict[str, list[Chunk]] = {
    "solaris": _chunks(SOLARIS, "solaris", 3, "Objection Handling v4", "doc-obj"),
    "northwind": _chunks(NORTHWIND, "northwind", 1, "Northwind Script", "doc-nw"),
}


K = QueryKind

QUERIES: list[tuple[str, QueryKind]] = [
    # Answerable, in something close to the manual's own words.
    ("That's too expensive.", K.IN_CORPUS),
    ("Honestly the price is too high for me.", K.IN_CORPUS),
    ("What's the warranty on the panels?", K.IN_CORPUS),
    ("How long is the installation guaranteed for?", K.IN_CORPUS),
    ("How much does a typical system cost?", K.IN_CORPUS),
    ("What happens if my roof is old?", K.IN_CORPUS),
    ("How long does the whole process take?", K.IN_CORPUS),
    ("Does the federal tax credit expire?", K.IN_CORPUS),
    ("Can I cancel before the install?", K.IN_CORPUS),
    ("I need to think about it.", K.IN_CORPUS),
    ("I want to shop around first.", K.IN_CORPUS),
    ("How long does permitting take?", K.IN_CORPUS),
    ("What does the roof assessment cost?", K.IN_CORPUS),
    ("Is there a refund after installation begins?", K.IN_CORPUS),
    ("Do I own the system at the end?", K.IN_CORPUS),

    # Answerable, phrased the way a person actually speaks.
    ("That's a lot more than I wanted to spend.", K.PARAPHRASE),
    ("I can't afford that right now.", K.PARAPHRASE),
    ("No me alcanza el presupuesto.", K.PARAPHRASE),
    ("Es muy caro para mi.", K.PARAPHRASE),
    ("Whoa. That's a lot.", K.PARAPHRASE),
    ("Out of my price range, sorry.", K.PARAPHRASE),
    ("I need to talk to my wife about it.", K.PARAPHRASE),
    ("Tengo que pensarlo.", K.PARAPHRASE),

    # Not in anybody's material. Silence is the only correct answer.
    ("Do you finance commercial aviation fleets?", K.OUT_OF_CORPUS),
    ("What's your policy on cryptocurrency payments?", K.OUT_OF_CORPUS),
    ("Can you match a competitor's price in writing?", K.OUT_OF_CORPUS),
    ("Will this raise my property taxes?", K.OUT_OF_CORPUS),
    ("Does it work during a hurricane?", K.OUT_OF_CORPUS),
    ("Who is your CEO?", K.OUT_OF_CORPUS),
    ("Can I pay in Bitcoin?", K.OUT_OF_CORPUS),
    ("What's the resale value in ten years?", K.OUT_OF_CORPUS),

    # Answered clearly — in the other tenant's manual. Must be silence here.
    ("Is there a money-back guarantee in the first 30 days?", K.OTHER_TENANT),
    ("What's the deductible on the standard policy?", K.OTHER_TENANT),
    ("How fast are claims settled?", K.OTHER_TENANT),
    ("Can I get a discount for bundling two policies?", K.OTHER_TENANT),

    # Nothing worth interrupting a live conversation for.
    ("Yeah, that sounds fine.", K.CHITCHAT),
    ("Okay.", K.CHITCHAT),
    ("Sure, go ahead.", K.CHITCHAT),
    ("Mm-hmm, I'm listening.", K.CHITCHAT),
    ("Right, got it.", K.CHITCHAT),
]
