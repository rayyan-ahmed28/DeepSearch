"""Parallel Legal and Finance branches must merge into ResearchState, not overwrite.

Runs a tiny real LangGraph graph with the actual ResearchState model. Skipped
when langgraph is not installed (e.g. a minimal test-only environment).
"""

import pytest

langgraph_graph = pytest.importorskip("langgraph.graph")

from app.models.schemas import ResearchState, Source, SourceType  # noqa: E402


def _source(title: str, worker: str) -> Source:
    return Source(title=title, url=f"https://example.com/{title}", source_type=SourceType.SECONDARY, retrieved_by=worker)


def test_parallel_branches_merge_sources_and_errors():
    shared = _source("shared", "web_research")

    def legal(state: ResearchState) -> dict:
        return {"sources": [_source("docket", "legal_records"), shared], "errors": ["legal: rate limited once"]}

    def finance(state: ResearchState) -> dict:
        return {"sources": [_source("prices", "financial_data"), shared], "errors": ["finance: no EDGAR filing"]}

    graph = langgraph_graph.StateGraph(ResearchState)
    graph.add_node("legal", legal)
    graph.add_node("finance", finance)
    graph.add_edge(langgraph_graph.START, "legal")
    graph.add_edge(langgraph_graph.START, "finance")
    graph.add_edge("legal", langgraph_graph.END)
    graph.add_edge("finance", langgraph_graph.END)

    result = graph.compile().invoke(ResearchState(user_query="test"))

    titles = sorted(s.title for s in result["sources"])
    assert titles == ["docket", "prices", "shared"]  # both branches kept, shared source once
    assert sorted(result["errors"]) == ["finance: no EDGAR filing", "legal: rate limited once"]
