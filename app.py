from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv
import os
import traceback
import json
import requests as http_requests
import data_loader
import gemini_service

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

# --- VAULT FEATURE (SUPABASE REST API) ---

def supabase_headers():
    key = os.getenv("SUPABASE_KEY", "")
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }

def supabase_url(table):
    base = os.getenv("SUPABASE_URL", "").rstrip("/")
    return f"{base}/rest/v1/{table}"


def init_vault():
    """Verify Supabase connection by pinging the saved_charts table."""
    try:
        url = supabase_url("saved_charts") + "?select=id&limit=1"
        resp = http_requests.get(url, headers=supabase_headers(), timeout=5)
        if resp.status_code == 200:
            print("Supabase vault connection verified.")
        else:
            print(f"Warning: Supabase vault check returned {resp.status_code}: {resp.text}")
    except Exception as e:
        print(f"Warning: Could not connect to Supabase: {e}")


# Try to verify vault on startup (non-fatal if it fails)
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
        row = {
            "title": chart_data.get("title", "Untitled"),
            "type": chart_data.get("type", "bar"),
            "data": chart_data.get("data", []),
            "x_column": chart_data.get("x_column", ""),
            "y_columns": chart_data.get("y_columns", []),
            "description": chart_data.get("description", ""),
            "sql": chart_data.get("sql", "")
        }

        resp = http_requests.post(
            supabase_url("saved_charts"),
            headers=supabase_headers(),
            json=row,
            timeout=10
        )

        if resp.status_code in (200, 201):
            return jsonify({"message": "Chart saved to Vault successfully."})
        else:
            return jsonify({"error": f"Supabase error: {resp.text}"}), 500
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": f"Failed to save chart to Vault: {str(e)}"}), 500


@app.route("/api/vault", methods=["GET"])
def get_vault_charts():
    try:
        url = supabase_url("saved_charts") + "?select=*&order=created_at.desc"
        resp = http_requests.get(url, headers=supabase_headers(), timeout=10)

        if resp.status_code == 200:
            charts = resp.json()
            return jsonify({"charts": charts})
        else:
            return jsonify({"error": f"Supabase error: {resp.text}"}), 500
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": f"Failed to retrieve Vault charts: {str(e)}"}), 500


@app.route("/api/vault/<int:chart_id>", methods=["DELETE"])
def delete_vault_chart(chart_id):
    try:
        # For Supabase REST API, delete requires eq.id
        url = supabase_url("saved_charts") + f"?id=eq.{chart_id}"
        resp = http_requests.delete(url, headers=supabase_headers(), timeout=10)

        if resp.status_code in (200, 204):
            return jsonify({"message": "Chart removed from Vault successfully."})
        else:
            return jsonify({"error": f"Supabase error: {resp.text}"}), 500
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": f"Failed to delete chart: {str(e)}"}), 500


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
