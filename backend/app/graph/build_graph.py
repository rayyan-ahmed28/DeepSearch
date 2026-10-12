"""The LangGraph pipeline.

    router ─┬─(finance)──> finance_manager -> financial_data -> data_analysis ─┐
            └─(legal only)────────────────────────────────────────────────────┴─> report_architect

The legal branch, web research and verification join in later phases; until
then the router marks them "skipped: not built yet".
"""

from __future__ import annotations

from langgraph.graph import END, START, StateGraph

from app.graph.nodes.finance import data_analysis_node, financial_data_node, finance_manager_node
from app.graph.nodes.report import report_architect_node
from app.graph.nodes.router import router_node
from app.models.schemas import Domain, ResearchState


def _after_router(state: ResearchState) -> str:
    return "finance_manager" if Domain.FINANCE in state.detected_domains else "report_architect"


def build_graph():
    graph = StateGraph(ResearchState)
    graph.add_node("router", router_node)
    graph.add_node("finance_manager", finance_manager_node)
    graph.add_node("financial_data", financial_data_node)
    graph.add_node("data_analysis", data_analysis_node)
    graph.add_node("report_architect", report_architect_node)

    graph.add_edge(START, "router")
    graph.add_conditional_edges("router", _after_router, ["finance_manager", "report_architect"])
    graph.add_edge("finance_manager", "financial_data")
    graph.add_edge("financial_data", "data_analysis")
    graph.add_edge("data_analysis", "report_architect")
    graph.add_edge("report_architect", END)
    return graph.compile()
