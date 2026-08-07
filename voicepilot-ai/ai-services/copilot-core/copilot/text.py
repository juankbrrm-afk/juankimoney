"""Tokenisation, shared by retrieval and verification.

Both halves of the system must agree on what a word is. If the retriever
thinks `SKU-4471` is one token and the verifier thinks it is two, a claim can
be "supported" by a chunk that never contained the part number — which is the
exact failure the verifier exists to catch.

So there is one tokeniser, here, and both import it.
"""

from __future__ import annotations

import re
import unicodedata

# Identifiers survive intact: SKU-4471, 24-month, wi-fi, 1099-K. Splitting
# them is how a lexical search stops finding the one term the agent needs
# most — the exact one the customer just said.
_TOKEN = re.compile(r"[a-z0-9]+(?:[-_/][a-z0-9]+)*")

# Deliberately small, and only closed-class words. A long stoplist is a
# retrieval bug waiting to happen: "no" and "not" carry the entire meaning of
# "we do not guarantee that", and dropping them makes a prohibition and a
# promise look identical.
_STOP = frozenset(
    """
    a al algo alguna algunas alguno algunos ante antes como con contra cual
    cuando de del desde donde dos el ella ellas ellos en entre era eran es esa
    esas ese eso esos esta estan estas este esto estos ha han hasta hay la las
    le les lo los mas me mi mis mucho muy nos nuestra nuestro o os otra otras
    otro otros para pero poco por porque que quien se ser si sin sobre su sus
    tambien tanto te tener ti tu tus un una unas uno unos ya yo
    about after all also am an and any are as at be been being but by can did
    do does doing for from had has have having he her here hers him his how i
    if in into is it its me my of on once only or other our ours out over own
    she should so some such than that the their theirs them then there these
    they this those through to too under until up us was we were what when
    where which while who whom why will with you your yours
    """.split()
)


def normalise(s: str) -> str:
    """Lowercase and strip accents.

    Agents type `presupuesto` and manuals say `Presupuesto`; a customer says
    `garantia` and the PDF says `garantía`. Treating those as different terms
    means the answer exists and is not found.
    """
    s = unicodedata.normalize("NFKD", s.lower())
    return "".join(c for c in s if not unicodedata.combining(c))


# What is left of a contraction or a possessive once the apostrophe splits it:
# `that's` -> `that` + `s`, `don't` -> `don` + `t`, `we're` -> `we` + `re`.
# These fragments are function-word residue, but nothing in a stoplist catches
# them, and they are not harmless. They inflate the count of meaning-bearing
# words in a question, which quietly broke the topic-coverage check in
# `index.py`: "that's way too expensive" looked like three content words with
# one match instead of two with one, and fell under the bar.
_CLITICS = frozenset({"s", "t", "re", "ve", "ll", "d", "m", "n"})


def stem(t: str) -> str:
    """Strip a plural or third-person `s`. Nothing more ambitious than that.

    Without it the retriever treats `permitting takes 4 to 6 weeks` as no
    answer to "how long does permitting take" — the manual says `takes`, the
    customer said `take`, and one letter decides whether the agent gets help.
    Measured on the evaluation set, this alone was the difference on 2 of 15
    answerable questions.

    Deliberately not a real stemmer. Porter and friends conflate words that
    matter here (`interest`/`interested`) and mangle the identifiers this
    domain runs on. A rule that handles plurals and stops is a rule whose
    failures are predictable, and predictable is what a retrieval layer needs
    more than clever.
    """
    if len(t) > 3 and t.endswith("s") and not t.endswith(("ss", "us", "is")):
        return t[:-1]
    return t


def tokenize(s: str, *, drop_stopwords: bool = True) -> list[str]:
    toks = _TOKEN.findall(normalise(s))
    if drop_stopwords:
        toks = [t for t in toks if t not in _STOP and t not in _CLITICS]
    return [stem(t) for t in toks]


def content_terms(s: str) -> set[str]:
    """Terms that carry meaning, for coverage scoring."""
    return set(tokenize(s))


# Facts that must never be invented. In this domain a hallucination is almost
# never a whole fabricated paragraph — it is one wrong number inside an
# otherwise correct sentence. "$198 a month over 24 months at 0% interest"
# becomes "$168 over 36 months", the agent repeats it, and the company is now
# committed to a price it never offered.
_MONEY = re.compile(r"[$€£]\s?\d[\d,.]*|\b\d[\d,.]*\s?(?:usd|eur|dolares|dollars)\b")
_PERCENT = re.compile(r"\b\d+(?:[.,]\d+)?\s?(?:%|por ciento|percent)\b")
_NUMBER = re.compile(r"\b\d+(?:[.,]\d+)?\b")


def numeric_facts(s: str) -> set[str]:
    """Every money amount, percentage and bare number, normalised for compare.

    `$28,000`, `28000` and `28.000` are one fact written three ways. They are
    reduced to the same key so that a claim citing a chunk is checked against
    what the chunk *means*, not how it was typeset.
    """
    n = normalise(s)
    out: set[str] = set()
    for m in _MONEY.finditer(n):
        out.add("money:" + _digits(m.group()))
    for m in _PERCENT.finditer(n):
        out.add("pct:" + _digits(m.group()))
    for m in _NUMBER.finditer(n):
        out.add("num:" + _digits(m.group()))
    return out


def _digits(s: str) -> str:
    """Reduce a written amount to its significant digits.

    Thousands separators and decimal marks differ by locale — `28,000` in
    Miami is `28.000` in Medellín — and both are the same money. Trailing
    zeros after a decimal are dropped so `0.62` and `0.620` agree.
    """
    d = re.sub(r"[^\d.,]", "", s)
    # The last separator is the decimal mark only if it leaves 1-2 digits.
    m = re.search(r"[.,](\d{1,2})$", d)
    if m:
        whole = re.sub(r"[^\d]", "", d[: m.start()])
        frac = m.group(1).rstrip("0")
        return f"{whole.lstrip('0') or '0'}.{frac}" if frac else (whole.lstrip("0") or "0")
    whole = re.sub(r"[^\d]", "", d)
    return whole.lstrip("0") or "0"


_SENTENCE = re.compile(r"[^.!?¡¿\n]+[.!?]*")


def sentences(s: str) -> list[str]:
    return [m.group().strip() for m in _SENTENCE.finditer(s) if m.group().strip()]


# Everything that is not a letter or a digit becomes a word boundary.
_PHRASE = re.compile(r"[^a-z0-9]+")


def canonical_phrase(s: str) -> str:
    """A string reduced to its word sequence, padded for whole-word matching.

    Shared by the compliance engine (does a phrase appear?) and the post-call
    extractor (is this quote really in the transcript?). Both are asking the
    same question of the same text, and if they answered it differently the
    same sentence could be "said" for one and not the other.

    Punctuation is the reason this exists. `"This call is being recorded."`
    did not match a rule looking for `this call is being recorded`, because
    the full stop sat where the matcher wanted a space — and every real
    utterance ends in punctuation. The company would have been reported as
    non-compliant on every call while saying exactly the right words.

    It also makes numbers agree across locales and transcription styles:
    `$28,000`, `28.000` and `28 000` reduce to the same word sequence.
    """
    return " " + " ".join(_PHRASE.sub(" ", normalise(s)).split()) + " "
