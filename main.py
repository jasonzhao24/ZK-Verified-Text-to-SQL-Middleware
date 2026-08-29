import os
import hashlib
import json
import subprocess
import asyncio
import sys
import asyncpg
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

load_dotenv()
print("DEBUG DATABASE_URL:", repr(os.getenv("DATABASE_URL")))
app = FastAPI()

from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class UserPrompt(BaseModel):
    natural_language: str


class AIQueryOutput(BaseModel):
    sql: str = Field(description="The exact PostgreSQL query to execute.")
    is_safe_select: bool = Field(description="True ONLY if the query is strictly a read-only SELECT statement. False if it contains INSERT, UPDATE, DELETE, DROP, etc.")

def generate_sql_with_llm(user_input: str) -> dict:
    llm = ChatGroq(
        model="openai/gpt-oss-120b",
        api_key=os.getenv("GROQ_API_KEY"),
        temperature=0
    )

    structured_llm = llm.with_structured_output(AIQueryOutput)

    prompt = ChatPromptTemplate.from_messages([
        ("system", "You are a database AI. Convert the user's natural language into PostgreSQL. Analyze if the query is a safe, read-only SELECT statement."),
        ("user", "{input}")
    ])

    chain = prompt | structured_llm
    ai_response = chain.invoke({"input": user_input})

    sql_string = ai_response.sql
    query_hash = "0x" + hashlib.sha256(sql_string.encode('utf-8')).hexdigest()

    return {
        "sql": sql_string,
        "is_safe_select": ai_response.is_safe_select,
        "query_hash": query_hash
    }


def verify_with_midnight(ai_output: dict):
    try:
        subprocess.run(
            ["node", "run_midnight_circuit.js", json.dumps(ai_output)],
            capture_output=True, text=True, check=True
        )
        return True
    except subprocess.CalledProcessError:
        return False


@app.post("/ask-database")
async def ask_database(prompt: UserPrompt):
    ai_output = generate_sql_with_llm(prompt.natural_language)

    is_verified = verify_with_midnight(ai_output)

    if not is_verified:
        raise HTTPException(status_code=403, detail="ZK Circuit rejected AI query.")

    try:
        conn = await asyncpg.connect(os.getenv("DATABASE_URL"))

        records = await conn.fetch(ai_output["sql"])
        results = [dict(record) for record in records]

        await conn.close()

        return {
            "status": "success",
            "sql_executed": ai_output["sql"],
            "query_hash": ai_output["query_hash"],
            "data": results
        }

    except Exception as e:
        # Even without a live DB, this at least proves the pipeline generated
        # and ZK-verified a real query before attempting execution
        return {
            "status": "verified_but_db_error",
            "sql_executed": ai_output["sql"],
            "query_hash": ai_output["query_hash"],
            "error": str(e)
        }