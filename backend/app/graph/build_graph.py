"""The LangGraph pipeline (the Dynamic Matrix):

    router ──> legal_manager ──┐            ┌─> legal_records ───────────────────┐
           └─> finance_manager ┴─(both)────┼─> web_research ────────────────────┼─(all)─> verification ─> report_architect
                                            └─> financial_data ─> data_analysis ─┘

Every node runs on every run and does nothing when its domain is not in scope,
so the two join points ("both" and "all") always fire exactly once. Managers
run in parallel; the three workers run in parallel; LangGraph's reducers on
ResearchState merge their results (see models/schemas.py).
"""

from __future__ import annotations

from langgraph.graph import END, START, StateGraph

from app.graph.nodes.finance import data_analysis_node, financial_data_node, finance_manager_node
from app.graph.nodes.legal import legal_manager_node, legal_records_node, web_research_node
from app.graph.nodes.report import report_architect_node
from app.graph.nodes.router import router_node
from app.graph.nodes.verification import verification_node
from app.models.schemas import ResearchState

MANAGERS = ["legal_manager", "finance_manager"]
WORKERS = ["legal_records", "web_research", "financial_data"]


def build_graph():
    graph = StateGraph(ResearchState)
    graph.add_node("router", router_node)
    graph.add_node("legal_manager", legal_manager_node)
    graph.add_node("finance_manager", finance_manager_node)
    graph.add_node("legal_records", legal_records_node)
    graph.add_node("web_research", web_research_node)
    graph.add_node("financial_data", financial_data_node)
    graph.add_node("data_analysis", data_analysis_node)
    graph.add_node("verification", verification_node)
    graph.add_node("report_architect", report_architect_node)

    graph.add_edge(START, "router")
    for manager in MANAGERS:
        graph.add_edge("router", manager)
    for worker in WORKERS:
        graph.add_edge(MANAGERS, worker)  # waits for both managers
    graph.add_edge("financial_data", "data_analysis")
    graph.add_edge(["legal_records", "web_research", "data_analysis"], "verification")  # waits for all
    graph.add_edge("verification", "report_architect")
    graph.add_edge("report_architect", END)
    return graph.compile()
