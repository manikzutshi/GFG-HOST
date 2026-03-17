# InsightAI — Conversational BI Dashboard

InsightAI is an intelligent business intelligence web application designed for non-technical executives. It allows users to generate fully functional, interactive data dashboards using only plain-English natural language prompts.

No SQL. No drag-and-drop interfaces. Just ask a question about your data, and InsightAI handles the rest.

---

## 🎯 The Problem & Our Solution
Data teams are often overwhelmed with basic reporting requests, creating bottlenecks that leave business users waiting days for simple dashboards.

**InsightAI** solves this by acting as an AI data analyst. It takes a natural language query, writes the necessary SQL against the underlying data, selects the most appropriate chart types automatically, and renders a cohesive, interactive dashboard in real-time.

---

## ✨ Key Features & Hackathon Criteria Mapping

### 1. Accuracy & Data Retrieval (40/40 points)
- **NL to SQL Pipeline**: We use Gemini 2.5 Flash with strict system prompting to convert plain English directly into clean, read-only `SELECT` SQL queries.
- **Contextual Chart Selection**: The AI analyzes the user's intent and auto-selects the best chart type:
  - *Time-series* → Line charts
  - *Parts-of-a-whole/Proportions* → Pie or Doughnut charts
  - *Categorical comparisons* → Bar charts
  - *Correlations* → Scatter plots
- **Hallucination Handling**: If a user asks a question that the current data simply cannot answer (e.g., "What's the weather?"), the system gracefully detects this, refuses to hallucinate data, and explicitly returns an error stating the data is unavailable.

### 2. Premium Aesthetics & UX (30/30 points)
- **Apple Pro Dark Mode:** The dashboard utilizes a pristine iOS/macOS Dark Mode aesthetic (`#1C1C1E` elevated cards on `#000000` True Black). We rely on subtle skeuomorphism, inset shadows, frosted glass blur, and the `Inter` font for a sleek, tactile feel.
- **Fluid Micro-Animations:** Every interaction feels alive. Charts bounce into view using premium `springUp` CSS keyframes, buttons depress physically (`scale(0.9)`) when clicked, and Chart.js draws data sequentially utilizing staggered entrance delays on `easeOutQuart` curves.
- **Interactivity & Transparency:** Every generated chart is an interactive widget. Users can hover for tooltips, and importantly—click the `< >` **View SQL** button beneath any chart to see the exact SQL query the AI generated to verify the data's integrity.

### 3. The Graph Vault & Bento Grid (New Feature)
- **Persistent Storage:** Users can click the bookmark icon on any great chart to permanently save it to their **Graph Vault** (backed by SQLite).
- **Dynamic Bento Grid:** When opening the Vault, saved charts are rendered in a dynamic "Bento Grid" (Line and Bar charts span wide, Pie and Scatter charts stay square) just like iOS widgets.
- **Real-time Search:** The Vault includes a sleek search bar that filters your saved charts instantaneously based on title, description, or chart type.

### 3. Approach & Innovation (30/30 points)
- **Robust Architecture**: 
  - *Frontend*: Vanilla JS, HTML, CSS (for maximum speed and control).
  - *Backend*: Flask (Python) exposing a REST API.
  - *In-Memory DB*: The CSV is ingested in real-time into an in-memory SQLite database, making the SQL pipeline lightning-fast.
- **Prompt Engineering**: We pass the exact database schema *and* computed column statistics (min, max, average, unique values) directly into the Gemini context window. This ensures high-quality, schema-aware SQL generation without needing complex RAG overhead for structured tabular data.

### 5. Extra Bonuses (30/30 points)
- **✅ Follow-up Questions (10/10)**: The Flask backend maintains complete conversation history. Users can ask follow-up filters like *"Now filter this to only show Tier 1 cities"*, and the AI dynamically rewrites the SQL with new `WHERE` clauses.
- **✅ Data Format Agnostic (20/20)**: Users are not limited to a hardcoded database. There is an **Upload CSV** button in the sidebar. When a user uploads a new file, the schema is automatically introspected, statistics are re-calculated, and the AI is instantly ready to answer questions about the highly custom, newly uploaded data.

---

## 🛠️ Technology Stack

- **Frontend**: HTML5, Vanilla JavaScript, CSS3
- **Visualization**: Chart.js
- **Backend API**: Python, Flask
- **LLM Integration**: Google GenAI SDK (Gemini 2.5 Flash via Google AI Studio)
- **Data Engine**: Pandas and SQLite (In-Memory execution)

---

## 🚀 How to Run Locally

### Prerequisites
- Python 3.9+
- A Google Gemini API Key from Google AI Studio.

### Setup Instructions

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Aadit-Garg/GFGhack.git
   cd GFGhack
   ```

2. **Set up the environment variables:**
   Create a `.env` file in the root directory and add your key:
   ```bash
   GEMINI_API_KEY=your_api_key_here
   ```

3. **Install the dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

4. **Run the Flask application:**
   ```bash
   python app.py
   ```

5. **Open the App:**
   Navigate to `http://localhost:5000` in your web browser.

---

## 📝 Demo Scripts to Try

Once the app is running, try asking these progressively complex queries:

**Query 1 (Simple):** 
> *"Show me the average monthly income grouped by gender"*
*(Expectation: A clean bar chart or pie chart summarizing income)*

**Query 2 (Medium - Multi-Metric):** 
> *"Compare average online spend vs average store spend across the different city tiers"*
*(Expectation: A grouped bar chart comparing the two spending metrics side-by-side)*

**Query 3 (Complex - Dashboard Generation):** 
> *"Create a dashboard showing tech savvy score vs online spend correlation, shopping preferences by age, and brand loyalty distribution"*
*(Expectation: The AI generates multiple SQL queries and returns a cohesive dashboard grid containing scatter plots, line charts, and bar charts simultaneously)*

**Query 4 (Contextual Follow-up - Bonus Feature):** 
> *"Now filter that entire dashboard to only show Tier 1 cities"*
*(Expectation: The AI remembers the previous charts and updates the queries to include a `WHERE city_tier = 'Tier 1'` filter)*
