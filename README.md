# DeepSearch

Agentic AI-driven multi-agent framework for domain-specific research (Legal + Finance MVP).

> **Status: under active development.** This README is a placeholder and will
> be filled in with full setup/run/demo instructions once the backend and
> frontend are further along (see the project's build plan for the current
> phase).

## Quickstart (backend, once available)

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # optional — the app runs fully in Demo Mode with no keys set
uvicorn app.main:app --reload
```

## Architecture at a glance

Gateway Router → Legal Manager + Finance Manager (parallel when both apply) →
shared Worker agents → Source Verification → Content Architect → Report.

Full details live in the project's master build plan.
