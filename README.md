# DeepSearch

Agentic AI-driven multi-agent framework for domain-specific research (Legal + Finance MVP).

> **Status: under active development.** Frontend runs through the Research
> Execution screen on sample data; the backend has its data model and tests.
> The project knowledge base, decisions and roadmap live in
> [`docs/KNOWLEDGE.md`](docs/KNOWLEDGE.md).

## Run the frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 (it starts on the Login screen; "Continue as guest" goes to the Dashboard).

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
