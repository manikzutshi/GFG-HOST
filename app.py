from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv
import os
import traceback
import json
import data_loader
import gemini_service
import psycopg2
import psycopg2.extras

load_dotenv()

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024  # 16MB upload limit

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
DEFAULT_CSV = os.path.join(DATA_DIR, "consumer_data.csv")

# Use /tmp for writable files in Vercel's serverless environment
WRITABLE_DIR = "/tmp" if os.getenv("VERCEL") else DATA_DIR

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

    os.makedirs(WRITABLE_DIR, exist_ok=True)
    save_path = os.path.join(WRITABLE_DIR, "uploaded_data.csv")
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

# --- VAULT FEATURE (SUPABASE POSTGRES) ---

def get_db_conn():
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise ValueError("DATABASE_URL environment variable is not set")
    return psycopg2.connect(database_url)


def init_vault():
    """Create the saved_charts table in Supabase Postgres if it doesn't exist."""
    try:
        conn = get_db_conn()
        c = conn.cursor()
        c.execute('''
            CREATE TABLE IF NOT EXISTS saved_charts (
                id SERIAL PRIMARY KEY,
                title TEXT,
                type TEXT,
                data JSONB,
                x_column TEXT,
                y_columns JSONB,
                description TEXT,
                sql TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        ''')
        conn.commit()
        conn.close()
        print("Vault table ready in Supabase Postgres.")
    except Exception as e:
        print(f"Warning: Could not initialize vault table: {e}")


# Initialize the vault table on startup
try:
    init_vault()
except Exception as e:
    print(f"Vault init skipped: {e}")


@app.route("/api/vault", methods=["POST"])
def save_to_vault():
    chart_data = request.get_json()
    if not chart_data:
         return jsonify({"error": "No data provided."}), 400

    try:
        conn = get_db_conn()
        c = conn.cursor()
        c.execute('''
            INSERT INTO saved_charts (title, type, data, x_column, y_columns, description, sql)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
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
        return jsonify({"error": f"Failed to save chart to Vault: {str(e)}"}), 500


@app.route("/api/vault", methods=["GET"])
def get_vault_charts():
    try:
        conn = get_db_conn()
        c = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        c.execute('SELECT * FROM saved_charts ORDER BY created_at DESC')
        rows = c.fetchall()
        conn.close()

        charts = []
        for row in rows:
            charts.append({
                "id": row["id"],
                "title": row["title"],
                "type": row["type"],
                "data": row["data"] if isinstance(row["data"], (list, dict)) else json.loads(row["data"]),
                "x_column": row["x_column"],
                "y_columns": row["y_columns"] if isinstance(row["y_columns"], (list, dict)) else json.loads(row["y_columns"]),
                "description": row["description"],
                "sql": row.get("sql", ""),
                "created_at": str(row["created_at"])
            })
        return jsonify({"charts": charts})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": f"Failed to retrieve Vault charts: {str(e)}"}), 500


# Initialize data globally
try:
    init_data(DEFAULT_CSV)
except Exception as e:
    print(f"Failed to load initial data: {e}")

# Try to initialize gemini globally, but we'll also check at request time
# because Vercel env vars might not be available during module initialization
api_key = os.getenv("GEMINI_API_KEY")
if api_key:
    gemini_service.init_gemini(api_key)

# Add a before_request handler to ensure gemini is initialized
@app.before_request
def check_gemini_init():
    if gemini_service.client is None:
        key = os.getenv("GEMINI_API_KEY")
        if key:
            gemini_service.init_gemini(key)
        else:
            print("Warning: GEMINI_API_KEY environment variable is still not set during request")


if __name__ == "__main__":
    print(f"Loaded dataset. Schema:\n{schema_text}")
    app.run(debug=True, port=5000)
