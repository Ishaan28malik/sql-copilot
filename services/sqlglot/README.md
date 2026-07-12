# sqlglot validation service (optional)

Second-opinion SQL validation using [SQLGlot](https://github.com/tobymao/sqlglot).
The Worker's built-in AST validator is authoritative; this service adds an
independent parser. Deploy it next to Ollama on the Oracle Cloud VM and set
`SQLGLOT_URL` on the Worker to enable it.

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```
