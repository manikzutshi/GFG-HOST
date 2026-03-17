from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv
import os
import traceback
import data_loader
import gemini_service

load_dotenv()

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024  # 16MB upload limit

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
DEFAULT_CSV = os.path.join(DATA_DIR, "consumer_data.csv")

schema_text = ""
column_stats = {}


def init_data(csv_path):
    global schema_text, column_stats
    data_loader.load_csv(csv_path)
    schema_text = data_loader.get_schema()
    column_stats = data_loader.get_column_stats()
    gemini_service.reset_conversation()


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/query", methods=["POST"])
def handle_query():
    body = request.get_json()
    user_query = body.get("query", "").strip()
    if not user_query:
        return jsonify({"error": "Empty query."}), 400

    try:
        result = gemini_service.query(user_query, schema_text, column_stats)
        return jsonify(result)
    except Exception as e:
        print("Error handling query:")
        traceback.print_exc()
        return jsonify({"error": "Internal server error."}), 500


@app.route("/api/upload", methods=["POST"])
def upload_csv():
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded."}), 400

    file = request.files["file"]
    if not file.filename.endswith(".csv"):
        return jsonify({"error": "Only CSV files are supported."}), 400

    os.makedirs(DATA_DIR, exist_ok=True)
    save_path = os.path.join(DATA_DIR, "uploaded_data.csv")
    file.save(save_path)
    init_data(save_path)
    return jsonify({"message": "Dataset uploaded successfully.", "schema": schema_text})


@app.route("/api/schema")
def get_schema():
    return jsonify({"schema": schema_text})


@app.route("/api/reset", methods=["POST"])
def reset():
    gemini_service.reset_conversation()
    return jsonify({"message": "Conversation reset."})

# --- VAULT FEATURE ---

VAULT_DB_PATH = os.path.join(DATA_DIR, "vault.db")

def init_vault():
    import sqlite3
    os.makedirs(DATA_DIR, exist_ok=True)
    conn = sqlite3.connect(VAULT_DB_PATH)
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS saved_charts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            type TEXT,
            data JSON,
            x_column TEXT,
            y_columns JSON,
            description TEXT,
            sql TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Simple migration: add 'sql' column if missing from earlier versions
    try:
        c.execute('ALTER TABLE saved_charts ADD COLUMN sql TEXT')
    except sqlite3.OperationalError:
        pass  # Column likely already exists
        
    conn.commit()
    conn.close()

# Ensure the vault DB is always initialized when the module loads
init_vault()

@app.route("/api/vault", methods=["POST"])
def save_to_vault():
    import sqlite3
    import json
    chart_data = request.get_json()
    if not chart_data:
         return jsonify({"error": "No data provided."}), 400
         
    try:
        conn = sqlite3.connect(VAULT_DB_PATH)
        c = conn.cursor()
        c.execute('''
            INSERT INTO saved_charts (title, type, data, x_column, y_columns, description, sql)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (
            chart_data.get("title", "Untitled"),
            chart_data.get("type", "bar"),
            json.dumps(chart_data.get("data", [])),
            chart_data.get("x_column", ""),
            json.dumps(chart_data.get("y_columns", [])),
            chart_data.get("description", ""),
            chart_data.get("sql", "")
        ))
        conn.commit()
        conn.close()
        return jsonify({"message": "Chart saved to Vault successfully."})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": "Failed to save chart to Vault."}), 500

@app.route("/api/vault", methods=["GET"])
def get_vault_charts():
    import sqlite3
    import json
    try:
        conn = sqlite3.connect(VAULT_DB_PATH)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute('SELECT * FROM saved_charts ORDER BY created_at DESC')
        rows = c.fetchall()
        
        charts = []
        for row in rows:
            charts.append({
                "id": row["id"],
                "title": row["title"],
                "type": row["type"],
                "data": json.loads(row["data"]),
                "x_column": row["x_column"],
                "y_columns": json.loads(row["y_columns"]),
                "description": row["description"],
                "sql": row["sql"] if "sql" in row.keys() else "",
                "created_at": row["created_at"]
            })
        conn.close()
        return jsonify({"charts": charts})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": "Failed to retrieve Vault charts."}), 500


# Initialize services globally so they run in Vercel's serverless environment
api_key = os.getenv("GEMINI_API_KEY")
if api_key:
    gemini_service.init_gemini(api_key)
else:
    print("Warning: GEMINI_API_KEY environment variable is not set")

try:
    init_data(DEFAULT_CSV)
except Exception as e:
    print(f"Failed to load initial data: {e}")

if __name__ == "__main__":
    print(f"Loaded dataset. Schema:\n{schema_text}")
    app.run(debug=True, port=5000)
