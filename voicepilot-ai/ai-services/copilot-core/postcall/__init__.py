"""Post-call analysis: the record the supervisor reads and the CRM receives.

`docs/06` §6. Every extracted element is anchored to a verbatim span of the
transcript — which gives the supervisor a timestamp to click *and* makes
invention structurally impossible, since a fabricated event has no quote and
a quote that is not in the transcript resolves to no moment.
"""

from .analysis import CallAnalysis, Disposition, Item, Kind, TalkMetrics
from .extract import (
    MIN_QUOTE_WORDS,
    CrmWrite,
    Draft,
    Extraction,
    Summariser,
    analyse,
    crm_writes,
    talk_metrics,
)

__all__ = [
    "CallAnalysis", "CrmWrite", "Disposition", "Draft", "Extraction", "Item",
    "Kind", "MIN_QUOTE_WORDS", "Summariser", "TalkMetrics", "analyse",
    "crm_writes", "talk_metrics",
]
