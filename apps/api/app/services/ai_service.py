"""
AI service layer.

Architecture
------------
- ``LLMProvider`` is an abstract base class.  Swapping providers requires
  changes in exactly one place: ``get_provider()``.
- ``MockProvider`` is always available and requires no API key.  It streams
  a realistic-looking paraphrase / summary word-by-word so the streaming UX
  can be demonstrated without external dependencies.
- ``PROMPTS`` is the single source of truth for all prompt templates.
  Routes never hard-code prompt text.

To add a real provider (e.g. OpenAI) set PROVIDER=openai in .env and add
an ``OpenAIProvider`` class that implements ``LLMProvider.stream()``.
"""

from __future__ import annotations

import asyncio
import logging
import os
from abc import ABC, abstractmethod
from collections.abc import AsyncIterator

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Prompt templates — configured here, not scattered across routes
# ---------------------------------------------------------------------------

PROMPTS: dict[str, str] = {
    "paraphrase": (
        "You are an academic writing assistant. Rewrite the following text to improve "
        "clarity and flow while preserving the original meaning. Keep a formal, academic tone. "
        "Return only the rewritten text with no preamble.\n\nText:\n{text}"
    ),
    "summarize": (
        "You are an academic writing assistant. Summarise the following text concisely in "
        "2-3 sentences. Return only the summary with no preamble.\n\nText:\n{text}"
    ),
}


# ---------------------------------------------------------------------------
# Provider abstraction
# ---------------------------------------------------------------------------


class LLMProvider(ABC):
    @abstractmethod
    async def stream(self, feature: str, text: str) -> AsyncIterator[str]:
        """Yield text chunks progressively."""


# ---------------------------------------------------------------------------
# Mock provider — no API key required
# ---------------------------------------------------------------------------


class MockProvider(LLMProvider):
    """
    Generates a plausible-looking streaming response without calling any
    external API.  Each word is yielded with a short delay so the streaming
    UX (progressive rendering, cancel button) is fully demonstrable.
    """

    _PARAPHRASE_TEMPLATE = (
        "The passage under examination elaborates upon {snippet}, "
        "presenting a nuanced perspective that underscores the significance "
        "of this concept within the broader academic discourse. "
        "A careful reading reveals that the argument rests on well-established "
        "theoretical foundations, thereby lending it considerable scholarly weight. "
        "Furthermore, the rhetorical structure employed here reinforces the central "
        "thesis by systematically addressing potential counterarguments."
    )

    _SUMMARIZE_TEMPLATE = (
        "In summary, the selected passage discusses {snippet} and its implications. "
        "The author advances a coherent argument supported by evidence, "
        "concluding that this phenomenon warrants further academic investigation."
    )

    async def stream(self, feature: str, text: str) -> AsyncIterator[str]:
        snippet = " ".join(text.split()[:6]) if text.strip() else "the topic"

        if feature == "summarize":
            response = self._SUMMARIZE_TEMPLATE.format(snippet=snippet)
        else:
            response = self._PARAPHRASE_TEMPLATE.format(snippet=snippet)

        for word in response.split():
            yield word + " "
            await asyncio.sleep(0.055)


# ---------------------------------------------------------------------------
# Provider registry
# ---------------------------------------------------------------------------


def get_provider() -> LLMProvider:
    """
    Return the active LLM provider based on the PROVIDER environment variable.

    Supported values
    ----------------
    mock (default)  — no API key required, useful for demos and CI
    openai          — requires OPENAI_API_KEY (not yet implemented)
    """
    provider_name = os.getenv("PROVIDER", "mock").lower()

    if provider_name == "mock":
        return MockProvider()

    logger.warning("Unknown PROVIDER '%s', falling back to MockProvider.", provider_name)
    return MockProvider()
