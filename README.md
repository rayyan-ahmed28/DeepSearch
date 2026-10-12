# DeepSearch

Agentic AI-driven multi-agent framework for domain-specific research (Legal + Finance MVP).

> **Status: under active development.** Frontend: Dashboard, New Research,
> Execution and Workspace. Backend: a FastAPI + LangGraph pipeline that runs the
> finance path end to end (legal side, web research and verification come next).
> The project knowledge base, decisions and roadmap live in
> [`docs/KNOWLEDGE.md`](docs/KNOWLEDGE.md).

## Run the frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 (it starts on the Login screen; "Continue as guest" goes to the Dashboard).

## Run the backend (optional)

The frontend works on its own with a built-in sample replay. Start the backend to
run real research instead (no API keys needed: without a Gemini key it uses a
rule-based stand-in for the LLM and live Yahoo Finance prices).

```powershell
cd backend
& "$HOME\.venvs\deepsearch\Scripts\python.exe" -m uvicorn app.main:app --port 8000
```

Check it at http://localhost:8000/api/health (API docs: http://localhost:8000/docs).
With both running, new research from the app streams from the backend; the
screen says whether you are watching a backend run or the sample replay.

## Run the backend tests

**Windows (PowerShell).** Keep the virtual environment outside OneDrive and on a
short path: one dependency has very deep folders that break Windows' 260-character
path limit, and OneDrive would otherwise sync hundreds of MB of packages.

```powershell
py -3.12 -m venv $HOME\.venvs\deepsearch
$py = "$HOME\.venvs\deepsearch\Scripts\python.exe"
cd backend
& $py -m pip install -r requirements-lock.txt
& $py -m pytest tests -v
```

**macOS / Linux / WSL**

```bash
python3.12 -m venv ~/.venvs/deepsearch
cd backend
~/.venvs/deepsearch/bin/pip install -r requirements-lock.txt
~/.venvs/deepsearch/bin/python -m pytest tests -v
```

Optional: `cp .env.example .env` and add keys. Every key may stay blank; the app
is designed to run fully in Demo Mode without them.

## Architecture at a glance

Gateway Router → Legal Manager + Finance Manager (parallel when both apply) →
shared Worker agents → Source Verification → Report Architect → Report.

## Credits

Web research uses [GPT Researcher](https://github.com/assafelovic/gpt-researcher)
as a library (MIT / Apache-2.0, see its repository).
