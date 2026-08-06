"""A stand-in for the embedding model, used by the evaluation harness.

It exists to answer one question with a number instead of an opinion: how
much of the copilot's usefulness depends on the vector half of retrieval?
`docs/06` §3 asserts that BM25 alone cannot connect "no me alcanza el
presupuesto" to a manual that says "objeción de precio". The two-column
report in `run.py` is that assertion, measured.

This must never be imported by `copilot/`. A hand-written concept list works
for the phrasings somebody thought of and fails silently on everything else,
which is worse than having nothing, because the gap is invisible. Production
runs a real embedding model.
"""

from __future__ import annotations

from copilot.text import tokenize


class ConceptEmbedder:
    """Maps surface forms onto a handful of shared concept axes."""

    CONCEPTS: dict[str, tuple[str, ...]] = {
        "price": (
            "price", "cost", "expensive", "spend", "spending", "afford",
            "budget", "money", "pay", "paying", "payment", "dollars",
            "caro", "precio", "costo", "presupuesto", "pagar", "plata",
        ),
        "financing": (
            "financing", "finance", "installments", "monthly", "months",
            "interest", "plan", "split", "cuotas", "mensual", "meses",
        ),
        "warranty": (
            "warranty", "warranties", "guarantee", "guaranteed", "refund",
            "cancel", "garantia", "reembolso", "cancelar",
        ),
        "timing": (
            "think", "later", "wait", "deadline", "expires", "december",
            "pensarlo", "esperar", "vence",
        ),
        "product": (
            "panels", "system", "installation", "install", "home", "roof",
            "paneles", "sistema", "instalacion",
        ),
    }

    def __init__(self) -> None:
        self._axes = sorted(self.CONCEPTS)
        self._lookup = {
            term: axis
            for axis, terms in self.CONCEPTS.items()
            for term in terms
        }

    def embed(self, text: str):
        vec = [0.0] * len(self._axes)
        for tok in tokenize(text, drop_stopwords=False):
            axis = self._lookup.get(tok)
            if axis is not None:
                vec[self._axes.index(axis)] += 1.0
        return vec


