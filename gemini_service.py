from google import genai
from google.genai import types
import json
import re
import data_loader

client = None


def init_gemini(api_key):
    global client
    client = genai.Client(api_key=api_key)


SYSTEM_PROMPT = """You are an expert data analyst AI. You help non-technical business users explore a consumer behavior dataset by turning their natural language questions into SQL queries and interactive chart configurations.

RULES:
1. You MUST respond with valid JSON only — no markdown, no explanation outside the JSON.
2. Only generate SELECT queries. Never write INSERT, UPDATE, DELETE, DROP, or ALTER.
3. The table is called "consumer_data". Here is the schema:
{schema}

4. Column statistics:
{stats}

5. Your JSON response must follow this exact structure:
{{
  "interpretation": "Brief explanation of what the user is asking",
  "charts": [
    {{
      "title": "Chart Title",
      "type": "bar|line|pie|doughnut|scatter|radar|polarArea",
      "sql": "SELECT ... FROM consumer_data ...",
      "x_column": "column_name_for_x_axis",
      "y_columns": ["column_name_for_y_axis"],
      "description": "One sentence explaining this chart"
    }}
  ],
  "insights": ["Key insight 1", "Key insight 2"]
}}

6. Chart type selection rules:
   - Categorical vs Numeric → bar (horizontal bar if many categories or long names)
   - Time-series or sequential data → line
   - Parts of a whole / proportions → pie or doughnut
   - Correlations between two numeric columns (e.g., Age vs Income) → scatter
   - Multi-dimensional profiles → radar
   - Distributions → bar (with GROUP BY buckets)
   
   CRITICAL CHART RULES:
   - NEVER use a bar chart when comparing two continuous numeric columns (e.g., Age vs Income, Spend vs Score). You MUST use a scatter chart or a line chart for continuous vs continuous.
   - For scatter charts, do NOT group by or aggregate unless requested. Select the raw pairs of numeric columns.
   
7. Generate 1-4 charts per query depending on complexity. For simple questions, 1 chart is fine.
8. If the user's question CANNOT be answered from this dataset, respond with:
   {{"error": "I cannot answer this question with the available consumer behavior data. The dataset contains: age, income, internet usage, shopping preferences, spending patterns, and related scores.", "interpretation": "What you understood"}}
9. For follow-up questions, the user may reference previous charts. Adjust the SQL accordingly (e.g., adding WHERE clauses for filters).
10. Always LIMIT results to 50 rows max to keep charts readable.
11. Use ROUND() for decimal values and meaningful aliases in your SQL.
"""


def build_prompt(schema, stats):
    return SYSTEM_PROMPT.format(
        schema=schema,
        stats=json.dumps(stats, indent=2)
    )


conversation_history = []


def query(user_message, schema, stats):
    """Send user's NL query to Gemini and get back chart configs."""
    global conversation_history

    system = build_prompt(schema, stats)

    conversation_history.append(types.Content(
        role="user",
        parts=[types.Part.from_text(text=user_message)]
    ))

    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=conversation_history,
            config=types.GenerateContentConfig(
                system_instruction=system,
                temperature=0.2
            )
        )
    except Exception as e:
        conversation_history.pop()
        return {"error": f"AI service error: {str(e)}"}

    raw = response.text.strip()
    raw = re.sub(r'^```(?:json)?\s*', '', raw)
    raw = re.sub(r'\s*```$', '', raw)

    try:
        result = json.loads(raw)
    except json.JSONDecodeError:
        conversation_history.pop()
        return {
            "error": "Failed to parse AI response. Please try rephrasing your question.",
            "raw": raw
        }

    conversation_history.append(types.Content(
        role="model",
        parts=[types.Part.from_text(text=raw)]
    ))

    if "error" in result:
        return result

    for chart in result.get("charts", []):
        try:
            rows = data_loader.run_query(chart["sql"])
            chart["data"] = rows
        except Exception as e:
            chart["data"] = []
            chart["error"] = str(e)

    return result


def reset_conversation():
    global conversation_history
    conversation_history = []
