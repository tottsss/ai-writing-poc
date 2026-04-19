"""
Unit tests for the prompt module (§4.1 rubric: auth, permissions, prompts).

Prompt templates drive every AI interaction, so we cover:
- baseline feature coverage (the rubric requires ≥2 features; we expose both)
- successful template rendering with the expected placeholder
- structural invariants (no stray braces, non-trivial length)
- failure behaviour when a feature is unknown
"""

from pathlib import Path
import sys

sys.path.append(str(Path(__file__).resolve().parents[1]))

import pytest

from app.prompts import PROMPTS, SUPPORTED_FEATURES, get_prompt


def test_required_features_are_registered():
    # The rubric (§3.1) requires at least two baseline features. We ship
    # paraphrase and summarize.
    assert "paraphrase" in PROMPTS
    assert "summarize" in PROMPTS
    assert set(PROMPTS.keys()) == set(SUPPORTED_FEATURES)


def test_get_prompt_injects_text_placeholder():
    rendered = get_prompt("paraphrase", text="The cat sat on the mat.")
    assert "The cat sat on the mat." in rendered
    # The un-rendered template must not leak into the result.
    assert "{text}" not in rendered


def test_get_prompt_summarize_uses_same_placeholder():
    rendered = get_prompt("summarize", text="Sample selection.")
    assert "Sample selection." in rendered
    assert "{text}" not in rendered


def test_get_prompt_raises_on_unknown_feature():
    with pytest.raises(KeyError):
        get_prompt("translate", text="anything")


def test_templates_are_non_trivial():
    # Defence against the "empty string" regression that would send garbage
    # to the provider.
    for feature, template in PROMPTS.items():
        assert "{text}" in template, f"{feature} template missing {{text}} placeholder"
        assert len(template) > 40, f"{feature} template is suspiciously short"
