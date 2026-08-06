"""Hybrid retrieval, and the tenant boundary.

`docs/06` §3 specifies the pipeline: BM25 → vector → reciprocal-rank fusion →
rerank → threshold gate. It also specifies the thing that matters more than
any of them:

> **No fragment belonging to another tenant may ever be retrieved. The filter
> goes in the SQL query, not in post-processing.**

Post-filtering is how multi-tenant systems leak. It works until someone adds
a code path that forgets it, and then one customer's pricing sheet is quoted
to another customer's prospect. So this index has **no unscoped search at
all** — `search()` requires a `Scope`, and there is no other entry point.
Forgetting the filter is not a mistake you can make here; there is nothing to
forget.
"""

from __future__ import annotations

import math
from collections import Counter
from dataclasses import dataclass
from typing import Iterable, Sequence

from .text import content_terms, tokenize
from .types import Chunk, Embedder, Scored

# From docs/06 §3. Below this, the pipeline does not call the model at all.
DEFAULT_THRESHOLD = 0.62

# Below this share of the question's meaning-bearing words appearing anywhere
# in the tenant's material, the corpus is not about this topic and no amount
# of matching on the remainder should say otherwise.
MIN_ANSWERABLE_SHARE = 0.5

BM25_K1 = 1.2
BM25_B = 0.75
RRF_K = 60  # standard reciprocal-rank-fusion constant


@dataclass(frozen=True)
class Scope:
    """The three hard filters, always applied together.

    `kb_version` is in here for compliance rather than relevance: a call made
    in March is audited against the material that was live in March. Knowledge
    is never overwritten, so the version must be pinned at query time or the
    audit is meaningless.
    """

    tenant_id: str
    kb_id: str
    kb_version: int

    def admits(self, c: Chunk) -> bool:
        return (
            c.tenant_id == self.tenant_id
            and c.kb_id == self.kb_id
            and c.kb_version == self.kb_version
        )


def _cosine(a: Sequence[float], b: Sequence[float]) -> float:
    if len(a) != len(b):
        raise ValueError("embedding dimensions differ")
    num = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return num / (na * nb)


class Index:
    """An in-memory stand-in for `chunks` + pgvector.

    The production store is Postgres. What lives here is the part worth
    getting right before there is a database: the scoping rule, the fusion,
    and the bounded score the threshold is expressed in. Swapping the storage
    does not change any of them.
    """

    def __init__(self, *, embedder: Embedder | None = None) -> None:
        self._chunks: list[Chunk] = []
        self._tokens: list[list[str]] = []
        self._vectors: list[Sequence[float] | None] = []
        self._embedder = embedder
        self._df: Counter[str] = Counter()
        self._avg_len = 0.0

    @property
    def vector_search_enabled(self) -> bool:
        """Reported, never assumed.

        Without an embedder this index is lexical only. That is a legitimate
        configuration — it is also a materially worse one, because BM25 alone
        cannot connect "no me alcanza el presupuesto" to a manual that says
        "objeción de precio". Callers are told rather than left to wonder.
        """
        return self._embedder is not None

    def add(self, chunks: Iterable[Chunk]) -> None:
        for c in chunks:
            toks = tokenize(c.contextualised())
            self._chunks.append(c)
            self._tokens.append(toks)
            self._vectors.append(
                self._embedder.embed(c.contextualised()) if self._embedder else None
            )
            self._df.update(set(toks))
        n = len(self._tokens)
        self._avg_len = sum(len(t) for t in self._tokens) / n if n else 0.0

    def __len__(self) -> int:
        return len(self._chunks)

    def _idf(self, term: str, n_docs: int) -> float:
        df = self._df.get(term, 0)
        return math.log(1 + (n_docs - df + 0.5) / (df + 0.5))

    def _bm25(self, query: str, candidates: list[int]) -> list[tuple[int, float]]:
        q = tokenize(query)
        if not q or not candidates:
            return []
        n_docs = len(self._chunks)
        out: list[tuple[int, float]] = []
        for i in candidates:
            toks = self._tokens[i]
            tf = Counter(toks)
            dl = len(toks)
            s = 0.0
            for term in q:
                f = tf.get(term, 0)
                if not f:
                    continue
                denom = f + BM25_K1 * (1 - BM25_B + BM25_B * dl / (self._avg_len or 1))
                s += self._idf(term, n_docs) * (f * (BM25_K1 + 1)) / denom
            if s > 0:
                out.append((i, s))
        out.sort(key=lambda p: (-p[1], p[0]))
        return out

    def _vector(self, query: str, candidates: list[int]) -> list[tuple[int, float]]:
        if not self._embedder or not candidates:
            return []
        qv = self._embedder.embed(query)
        out = [
            (i, _cosine(qv, v))
            for i in candidates
            if (v := self._vectors[i]) is not None
        ]
        out.sort(key=lambda p: (-p[1], p[0]))
        return out

    def _coverage(self, query: str, i: int) -> float:
        """The bounded relevance the 0.62 threshold is measured against.

        BM25 scores are unbounded and corpus-dependent — "score above 0.62"
        is meaningless against them, and a threshold that means nothing is a
        gate that does not close. So the final score is IDF-weighted term
        coverage: of the meaning-bearing terms in the question, what share
        does this chunk actually contain, weighted so that matching `SKU-4471`
        counts for more than matching `price`.

        In production a cross-encoder replaces this. It is the same contract —
        a number in [0, 1] — so the threshold survives the upgrade. Until
        then this is an honest floor rather than a normalised BM25 score
        dressed up to look like a probability.
        """
        q = content_terms(query)
        if not q:
            return 0.0
        n_docs = len(self._chunks)

        # Only terms the corpus actually uses can count. A word with df == 0
        # is unmatchable by *any* chunk, and IDF gives exactly those words the
        # highest weight — so leaving them in the denominator means the score
        # measures how closely the customer's vocabulary matches the manual's,
        # not how relevant the chunk is.
        #
        # This was a real defect, found by the first test that spoke like a
        # person: "that's way too expensive" scored below threshold and got
        # silence, because the manual never says "way". Customers do not
        # phrase objections in the vocabulary of the document that answers
        # them; if they did, none of this would be necessary.
        answerable = {t for t in q if self._df.get(t, 0) > 0}
        if not answerable:
            return 0.0

        # The counterweight to ignoring unknown terms. Dropping them entirely
        # made "Can I pay in Bitcoin?" score a perfect 1.0 — `bitcoin` is not
        # in the corpus, so the whole question reduced to `pay`, and every
        # chunk mentioning payment matched completely. The agent gets a
        # financing paragraph in reply to a question about cryptocurrency:
        # grounded, cited, and about something else entirely.
        #
        # So the *topic* is checked before the terms are. If the company's
        # material does not share at least half the meaning-bearing words of
        # the question, it is not material about this question, however well
        # the remaining word matches.
        if len(answerable) / len(q) < MIN_ANSWERABLE_SHARE:
            return 0.0

        present = set(self._tokens[i])
        total = sum(self._idf(t, n_docs) for t in answerable)
        if total == 0:
            return 0.0
        hit = sum(self._idf(t, n_docs) for t in answerable if t in present)
        return max(0.0, min(1.0, hit / total))

    def _relevance(self, query: str, i: int) -> float:
        """The score the threshold is applied to. Step 4 of docs/06 §3.

        Fusion decides the order; this decides whether anything is good
        enough to answer with at all. They are different jobs, and conflating
        them was a defect: with a purely lexical final score, the vector half
        could reorder candidates but could never lift one over the gate — so
        semantic retrieval was decorative, and a paraphrased objection got
        silence no matter how good the embedding model was.

        Either channel being confident is enough. A customer who says "more
        than I wanted to spend" is asking the price question whether or not
        they used the manual's word for it, and requiring both channels to
        agree means requiring the customer to speak like the document.

        A cross-encoder replaces this function in production and keeps the
        contract — a number in [0, 1] — so `DEFAULT_THRESHOLD` survives the
        upgrade unchanged.
        """
        lexical = self._coverage(query, i)
        if not self._embedder:
            return lexical
        vec = self._vectors[i]
        if vec is None:
            return lexical
        semantic = max(0.0, _cosine(self._embedder.embed(query), vec))
        return max(lexical, semantic)

    def search(
        self,
        query: str,
        scope: Scope,
        *,
        k: int = 5,
        pool: int = 30,
        threshold: float = DEFAULT_THRESHOLD,
    ) -> list[Scored]:
        """Top-k chunks above the threshold, scoped. Never anything else.

        Returning `[]` is a normal, frequent, correct outcome: the corpus does
        not cover the question. The caller must treat it as NO_ANSWER, and
        `pipeline.py` does — it is the point at which the model is not called.
        """
        candidates = [i for i, c in enumerate(self._chunks) if scope.admits(c)]
        if not candidates:
            return []

        lex = self._bm25(query, candidates)[:pool]
        vec = self._vector(query, candidates)[:pool]

        # Reciprocal rank fusion. Rank-based rather than score-based on
        # purpose: BM25 scores and cosine similarities are not commensurable,
        # and averaging them is a bug that looks like a formula.
        fused: dict[int, float] = {}
        for ranked in (lex, vec):
            for rank, (i, _score) in enumerate(ranked):
                fused[i] = fused.get(i, 0.0) + 1.0 / (RRF_K + rank + 1)

        order = sorted(fused, key=lambda i: (-fused[i], i))[: max(k * 4, k)]
        rescored = [Scored(self._chunks[i], self._relevance(query, i)) for i in order]
        rescored.sort(key=lambda s: (-s.score, s.chunk.id))

        if not rescored or rescored[0].score < threshold:
            return []
        return [s for s in rescored if s.score >= threshold][:k]
