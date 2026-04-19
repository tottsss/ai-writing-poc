"""
Prompt templates for the AI writing assistant.

This module is the single source of truth for every prompt the system sends
to an LLM. Routes and providers must read templates from here — they must
never hard-code prompt text inline.

Swapping wording, changing tone, or adding new features (§3.1) is a one-file
change: update ``PROMPTS`` and expose a new route + UI button.
"""

from __future__ import annotations

from typing import Any


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


SUPPORTED_FEATURES: tuple[str, ...] = tuple(PROMPTS.keys())


def get_prompt(feature: str, **format_kwargs: Any) -> str:
    """
    Resolve the prompt template for *feature* with the provided format kwargs.

    Raises ``KeyError`` if the feature isn't registered — callers should treat
    that as a 400 Bad Request.
    """
    template = PROMPTS[feature]
    return template.format(**format_kwargs)
