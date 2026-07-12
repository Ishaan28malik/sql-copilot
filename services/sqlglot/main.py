"""Optional deep-validation microservice backed by SQLGlot.

SQLGlot is Python-only, so it cannot run inside the Cloudflare Worker. The
Worker's AST validator is authoritative; when SQLGLOT_URL is configured this
service adds a second, independent opinion (syntax + read-only check).

Run:  uvicorn main:app --host 0.0.0.0 --port 8000
"""

from fastapi import FastAPI
from pydantic import BaseModel

import sqlglot
from sqlglot import expressions as exp

app = FastAPI(title="sqlcopilot-sqlglot", version="0.1.0")

READ_ONLY_ROOTS = (exp.Select, exp.Union, exp.Intersect, exp.Except)


class ValidateRequest(BaseModel):
    sql: str
    dialect: str = "postgres"


class ValidateResponse(BaseModel):
    valid: bool
    read_only: bool
    error: str | None = None


@app.post("/validate", response_model=ValidateResponse)
def validate(request: ValidateRequest) -> ValidateResponse:
    try:
        statements = sqlglot.parse(request.sql, read=request.dialect)
    except sqlglot.errors.ParseError as error:
        return ValidateResponse(valid=False, read_only=False, error=str(error))

    statements = [s for s in statements if s is not None]
    if len(statements) != 1:
        return ValidateResponse(valid=False, read_only=False, error="exactly one statement is allowed")

    statement = statements[0]
    if not isinstance(statement, READ_ONLY_ROOTS):
        return ValidateResponse(valid=True, read_only=False, error=f"{statement.key} is not read-only")

    # Reject data-modifying expressions anywhere in the tree (e.g. CTEs).
    for node in statement.walk():
        if isinstance(node, (exp.Insert, exp.Update, exp.Delete, exp.Drop, exp.Alter, exp.Create, exp.Merge)):
            return ValidateResponse(valid=True, read_only=False, error=f"contains {node.key}")

    return ValidateResponse(valid=True, read_only=True)


@app.get("/health")
def health() -> dict[str, bool]:
    return {"ok": True}
