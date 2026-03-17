import sqlite3
import pandas as pd
import os
import json

DB_PATH = ":memory:"
_connection = None


def get_connection():
    global _connection
    if _connection is None:
        _connection = sqlite3.connect(DB_PATH, check_same_thread=False)
        _connection.row_factory = sqlite3.Row
    return _connection


def load_csv(filepath):
    """Read a CSV into the SQLite in-memory DB as table 'consumer_data'."""
    global _connection
    _connection = sqlite3.connect(DB_PATH, check_same_thread=False)
    _connection.row_factory = sqlite3.Row

    df = pd.read_csv(filepath)
    df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]
    df.to_sql("consumer_data", _connection, if_exists="replace", index=False)
    return df.columns.tolist()


def get_schema():
    """Return a human-readable schema description of the loaded table."""
    conn = get_connection()
    cursor = conn.execute("PRAGMA table_info(consumer_data)")
    columns = cursor.fetchall()
    if not columns:
        return "No table loaded."

    sample = conn.execute("SELECT * FROM consumer_data LIMIT 3").fetchall()
    sample_rows = [dict(r) for r in sample]

    schema_lines = ["Table: consumer_data", "Columns:"]
    for col in columns:
        schema_lines.append(f"  - {col['name']} ({col['type']})")

    schema_lines.append(f"\nTotal rows: {conn.execute('SELECT COUNT(*) FROM consumer_data').fetchone()[0]}")
    schema_lines.append(f"Sample rows: {json.dumps(sample_rows[:2], indent=2)}")
    return "\n".join(schema_lines)


def run_query(sql):
    """Execute a read-only SQL query and return results as a list of dicts."""
    sql_stripped = sql.strip().rstrip(";").strip()
    if not sql_stripped.upper().startswith("SELECT"):
        raise ValueError("Only SELECT queries are allowed.")

    conn = get_connection()
    cursor = conn.execute(sql_stripped)
    rows = cursor.fetchall()
    return [dict(r) for r in rows]


def get_column_stats():
    """Return basic stats for each column to help the LLM understand the data."""
    conn = get_connection()
    columns_info = conn.execute("PRAGMA table_info(consumer_data)").fetchall()

    stats = {}
    for col in columns_info:
        name = col["name"]
        col_type = col["type"]
        if col_type in ("INTEGER", "REAL", "NUMERIC"):
            row = conn.execute(
                f"SELECT MIN({name}) as min_val, MAX({name}) as max_val, "
                f"ROUND(AVG({name}),2) as avg_val FROM consumer_data"
            ).fetchone()
            stats[name] = {"type": "numeric", "min": row["min_val"], "max": row["max_val"], "avg": row["avg_val"]}
        else:
            distinct = conn.execute(
                f"SELECT DISTINCT {name} FROM consumer_data LIMIT 20"
            ).fetchall()
            stats[name] = {"type": "categorical", "unique_values": [r[0] for r in distinct]}
    return stats
