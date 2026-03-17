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


if __name__ == "__main__":
    gemini_service.init_gemini(os.getenv("GEMINI_API_KEY"))
    init_data(DEFAULT_CSV)
    print(f"Loaded dataset. Schema:\n{schema_text}")
    app.run(debug=True, port=5000)
