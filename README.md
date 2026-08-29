# sql_guard — ZK-Verified AI to SQL Guardrail

Built for the Midnight Hackathon, AI Track, August 2026.

AI can write SQL from plain English, but you can't always trust it. This project uses Midnight's zero-knowledge circuits to cryptographically verify every AI-generated query is safe before it touches the database.

## How it works

1. User asks a database question in plain English
2. An LLM (Groq) generates SQL and classifies it as safe (read-only) or not
3. The SQL is hashed with SHA-256
4. A compiled Compact smart contract, deployed to a real local Midnight devnet, verifies the safety flag via a zero-knowledge circuit
5. Only if the proof passes does the query run against PostgreSQL (Supabase)

Unsafe queries (DELETE, DROP, UPDATE, etc.) are rejected with a 403 before they ever reach the database.

## Architecture

- Backend: FastAPI (main.py)
- AI: LangChain + Groq with structured output
- ZK layer: Compact smart contract (sql_guard.compact), compiled with real proving and verifying keys
- Devnet proof: tests/sql_guard.test.ts deploys the contract to a real local Midnight devnet and verifies on-chain state
- Database: PostgreSQL via Supabase, asyncpg
- Frontend: index.html

## Project structure

main.py - FastAPI backend and LLM pipeline
sql_guard.compact - Compact smart contract source
sql-guard-index.ts - TypeScript bindings for the compiled contract
contracts-managed/ - Compiled ZK circuit and keys
tests/sql_guard.test.ts - Local devnet deployment test
run_midnight_circuit.js - Node bridge script
index.html - Frontend demo

## Status

Working: LLM to SQL to guardrail to Postgres pipeline, full end to end.
Working: Compact contract compiled with real ZK keys, deployed to a real local devnet, passing on-chain verification test.
Note: the live API currently uses a local safety check rather than calling the deployed devnet contract directly. The devnet deployment is proven working standalone in tests/sql_guard.test.ts.

## Built with

Python, FastAPI, LangChain, Groq, PostgreSQL, Supabase, asyncpg, Compact, Midnight, Docker, Node.js, TypeScript, Claude
