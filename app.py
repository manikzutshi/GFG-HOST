from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv
import os
import traceback
import data_loader
import gemini_service
from supabase import create_client, Client

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

# --- VAULT FEATURE (SUPABASE) ---

# We don't use local db anymore, but we keep this for backwards compatibility
VAULT_DB_PATH = os.path.join(WRITABLE_DIR, "vault.db")

def get_supabase() -> Client:
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_KEY")
    if not supabase_url or not supabase_key:
        raise ValueError("SUPABASE_URL and SUPABASE_KEY must be set in the environment")
    return create_client(supabase_url, supabase_key)

def init_vault():
    # In Supabase, you should have already created the `saved_charts` table.
    # We'll just verify the connection here.
    try:
        supabase = get_supabase()
        supabase.table("saved_charts").select("id").limit(1).execute()
        print("Successfully connected to Supabase vault.")
    except Exception as e:
        print(f"Warning: Could not connect to Supabase: {e}")

# Ensure the vault DB is always initialized when the module loads
init_vault()

@app.route("/api/vault", methods=["POST"])
def save_to_vault():
    chart_data = request.get_json()
    if not chart_data:
         return jsonify({"error": "No data provided."}), 400
         
    try:
        supabase = get_supabase()
        
        # Prepare data matching the Supabase table schema
        # (Assuming the table matches the old SQLite schema)
        row = {
            "title": chart_data.get("title", "Untitled"),
            "type": chart_data.get("type", "bar"),
            "data": chart_data.get("data", []),
            "x_column": chart_data.get("x_column", ""),
            "y_columns": chart_data.get("y_columns", []),
            "description": chart_data.get("description", ""),
            "sql": chart_data.get("sql", "")
        }
        
        response = supabase.table("saved_charts").insert(row).execute()
        return jsonify({"message": "Chart saved to Vault successfully.", "data": response.data})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": f"Failed to save chart to Vault: {str(e)}"}), 500

@app.route("/api/vault", methods=["GET"])
def get_vault_charts():
    try:
        supabase = get_supabase()
        response = supabase.table("saved_charts").select("*").order("created_at", desc=True).execute()
        
        # Data is already parsed as dictionaries/lists by the Supabase client
        charts = response.data
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
