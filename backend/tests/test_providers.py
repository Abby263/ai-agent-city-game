import json
from types import SimpleNamespace

import pytest

from app.config import Settings
from app.cognition.client import CitizenCognitionClient
from app.cognition.deep_agents import DeepAgentRuntime
from app.cognition.errors import CognitionUnavailableError, CognitionValidationError


def settings(**values):
    return Settings(_env_file=None, **{"llm_provider": "openai", "gemini_api_key": None, "openai_api_key": None, **values})


def test_selected_provider_does_not_fall_back_to_another_key():
    gemini = settings(llm_provider="gemini", openai_api_key="openai-test-secret")
    assert not gemini.real_llm_enabled
    assert gemini.llm_api_key is None
    assert CitizenCognitionClient(gemini).client is None
    assert not settings(llm_provider="openai", gemini_api_key="gemini-test-secret").real_llm_enabled


def test_credentials_are_not_in_settings_repr():
    value = settings(gemini_api_key="gemini-test-secret", openai_api_key="openai-test-secret")
    assert "gemini-test-secret" not in repr(value)
    assert "openai-test-secret" not in repr(value)


def test_gemini_routes_structured_calls_and_disables_openai_embeddings(monkeypatch):
    from google import genai

    observed = {}
    def generate_content(**kwargs):
        observed.update(kwargs)
        return SimpleNamespace(text=json.dumps({"thought": "A new idea"}))

    def build_client(**kwargs):
        observed["client"] = kwargs
        return SimpleNamespace(models=SimpleNamespace(generate_content=generate_content))

    monkeypatch.setattr(genai, "Client", build_client)
    client = CitizenCognitionClient(settings(llm_provider="gemini", gemini_api_key="test-secret", openai_api_key="must-not-use"))
    schema = {"type": "object", "properties": {"thought": {"type": "string"}}, "required": ["thought"]}
    result = client._generate_json("System", {"task": "Think"}, schema, "test")
    assert result == {"thought": "A new idea"}
    assert observed["model"] == "gemini-3.5-flash-lite"
    assert observed["config"]["response_json_schema"] == schema
    assert observed["client"]["api_key"] == "test-secret"
    assert observed["client"]["vertexai"] is False
    assert client.embed("A memory") is None


def test_openai_responses_path_still_uses_configured_model():
    observed = {}
    def create(**kwargs):
        observed.update(kwargs)
        return SimpleNamespace(output_text='{"answer":"ok"}')

    client = CitizenCognitionClient(settings())
    client.client = SimpleNamespace(responses=SimpleNamespace(create=create))
    assert client._generate_json("System", {}, {"type": "object"}, "test") == {"answer": "ok"}
    assert observed["model"] == "gpt-4.1-nano"
    assert observed["text"]["format"]["type"] == "json_schema"


def test_quota_errors_are_actionable_and_do_not_expose_provider_request():
    class QuotaError(Exception):
        code = 429

    def fail(**kwargs):
        raise QuotaError("request contained test-secret")

    client = CitizenCognitionClient(settings(llm_provider="gemini"))
    client.client = SimpleNamespace(models=SimpleNamespace(generate_content=fail))
    with pytest.raises(CognitionUnavailableError, match="quota") as error:
        client._generate_json("System", {}, {}, "test")
    assert "test-secret" not in str(error.value)


def test_invalid_json_is_not_treated_as_a_completed_result():
    client = CitizenCognitionClient(settings(llm_provider="gemini"))
    client.client = SimpleNamespace(models=SimpleNamespace(generate_content=lambda **kw: SimpleNamespace(text="[]")))
    with pytest.raises(CognitionValidationError):
        client._generate_json("System", {}, {}, "test")


def test_deep_agent_uses_gemini_model_and_keeps_private_tools(monkeypatch):
    import deepagents
    import langchain_google_genai
    from langchain.agents.structured_output import ToolStrategy

    observed = {}
    def build_model(**kwargs):
        observed["model"] = kwargs
        return "gemini-model"

    def build_agent(**kwargs):
        observed["agent"] = kwargs
        return object()

    monkeypatch.setattr(langchain_google_genai, "ChatGoogleGenerativeAI", build_model)
    monkeypatch.setattr(deepagents, "create_deep_agent", build_agent)
    DeepAgentRuntime._agent_for.cache_clear()
    runtime = DeepAgentRuntime(settings(llm_provider="gemini", gemini_api_key="test-secret"))
    runtime.prepare_citizen_agent({"citizen_id":"test-ava", "name":"Ava", "profession":"Student"})
    assert observed["model"]["model"] == "gemini-3.5-flash-lite"
    assert observed["model"]["max_retries"] == 0
    assert observed["agent"]["model"] == "gemini-model"
    assert isinstance(observed["agent"]["response_format"], ToolStrategy)
    assert {tool.name for tool in observed["agent"]["tools"]} == {"inspect_private_memory", "inspect_current_task", "list_city_actions"}
    DeepAgentRuntime._agent_for.cache_clear()
