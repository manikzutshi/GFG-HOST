# InsightAI Architecture & Flow

InsightAI is a sophisticated data analytics dashboard built to autonomously parse, query, and visualize tabular CSV data through a conversational interface powered by Gemini 2.0 Flash.

## 🏗️ High-Level Architecture

The application is structured into a modern single-page-application (SPA) vanilla JS frontend, backed by a lightweight Flask server that orchestrates operations between local database structures, the Gemini LLM engine, and Supabase's cloud PostgreSQL instance.

### Tech Stack
- **Frontend**: HTML5, Vanilla JavaScript, CSS3, Chart.js, jsPDF
- **Backend**: Python 3, Flask, Pandas, SQLite (in-memory caching), Supabase REST APIs
- **AI Core**: Google Gemini 2.0 Flash Engine
- **Deployment**: Vercel Serverless

---

## 🔄 Step-by-Step Data Flow

### Step 1: Data Initialization (Uploading CSV)
1. The user uploads a `.csv` file via the web application's generic upload button (`<input type="file">`).
2. The frontend POSTs this file to the backend's `/api/upload` endpoint using a `FormData` envelope.
3. **Backend Parsing**: The Flask app utilizes `pandas` to read the CSV into a DataFrame. 
    - Empty rows are dropped.
    - Column headers are aggressively cleaned (lowercased, stripped of spaces and invalid characters).
4. **Local Database Migration**: 
    - The cleaned DataFrame is synchronously pushed into a local SQLite `/tmp/data.db` database using Pandas' `to_sql()` module.
    - This allows high-speed SQL queries to be executed dynamically without modifying the original user file.
    - An immediate metadata statistics summary (dtypes, column types, row counts) is collected by the backend and cached inside `gemini_service.py` to give the AI context about the dataset structure.

### Step 2: User Prompting & Gemini Routing
1. The user types a data-related question into the chat ("What is our revenue by region?").
2. The frontend POSTs the `query` text to `/api/query`.
3. The prompt is injected alongside the heavily structured System Prompt inside `gemini_service.py`. The LLM is forced to output *Strict JSON*.
4. **AI Generation**: Gemini is explicitly instructed to generate:
    - 1-2 Direct Queries (`charts`)
    - 2-3 Alternative explorations without immediate execution (`suggested_queries`)
    - Natural language `interpretation` and executive `insights`.
5. The LLM constructs highly tailored SQL strings targeting the specific SQLite table schema previously recorded in memory.

### Step 3: Local Query Execution (Chart Hydration)
1. For every `chart` object provided by Gemini, the backend intercepts the generated SQL (`"SELECT region, SUM(revenue) FROM consumer_data..."`).
2. The backend routes this string to `data_loader.run_query()`.
3. The SQLite engine executes the query and serializes the cursor outcome back into a Python list of dictionaries.
4. The backend merges this `data` array into the master JSON payload, dropping any charts whose SQL failed execution.
5. The completed, hydrated JSON object is returned to the frontend.

### Step 4: Frontend Rendering
1. The frontend parses the `app.py` JSON response.
2. It dynamically generates a CSS Grid of `.chart-card` elements based on how many charts returned.
3. It maps the returned dictionary keys directly to Chart.js properties (`x_column` maps to `labels`, `y_columns` maps to `datasets`).
4. **Suggested Queries**: Rather than executing all SQL heavily on the backend, alternative queries are rendered as actionable text blocks.
    - Clicking *Generate Chart* initiates a POST request specifically querying `/api/execute_custom_chart` with the dormant SQL.
    - The server dynamically executes the custom fetch, hydrates it with SQLite data, and returns the response dynamically appending the newly minted graph natively into the DOM.

### Step 5: Advanced Exports
1. **Multi-Session Chat**: Chat contexts are natively saved within the browser's `localStorage` dictionary as isolated unique IDs. The sidebar rebuilds the DOM instantly.
2. **Professional PDF Rendering**: Through a bespoke `generateExecutiveReport` function, visually rendering native `canvas` data URIs directly onto a clean white programmatic HTML print Document instead of aggressively taking UI screenshots.
3. **Supabase Vault Integration**: 
    - The user can click an "Unbookmark" or "Save to Vault" SVG.
    - The frontend POSTs the *entire* chart schema (SQL, title, metadata, row arrays) to a dedicated remote Supabase PostgreSQL Table (`graphs_vault`) using serverless REST HTTP triggers over Supabase's Anon Bearer keys.
    - This achieves state persistence entirely insulated from Vercel's ephemeral `/tmp` execution limits.
