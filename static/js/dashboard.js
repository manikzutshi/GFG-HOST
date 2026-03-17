const chatArea = document.getElementById("chatArea");
const welcomeScreen = document.getElementById("welcomeScreen");
const queryInput = document.getElementById("queryInput");
const sendBtn = document.getElementById("sendBtn");
const newChatBtn = document.getElementById("newChatBtn");
const csvUpload = document.getElementById("csvUpload");
const datasetBadge = document.getElementById("datasetBadge");

const CHART_COLORS = [
    "#7b61ff", "#00e5ff", "#10b981", "#f59e0b",
    "#ef4444", "#8b5cf6", "#ec4899", "#f97316"
];

let chartInstances = [];

/* ─── Auto-resize textarea ─── */
queryInput.addEventListener("input", () => {
    queryInput.style.height = "auto";
    queryInput.style.height = Math.min(queryInput.scrollHeight, 120) + "px";
});

/* ─── Send on Enter ─── */
queryInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
    }
});

sendBtn.addEventListener("click", handleSend);

/* ─── Suggestion buttons ─── */
document.querySelectorAll(".suggestion").forEach((btn) => {
    btn.addEventListener("click", () => {
        queryInput.value = btn.dataset.query;
        handleSend();
    });
});

/* ─── New Chat ─── */
newChatBtn.addEventListener("click", async () => {
    await fetch("/api/reset", { method: "POST" });
    chatArea.innerHTML = "";
    chatArea.appendChild(welcomeScreen);
    welcomeScreen.style.display = "flex";
    destroyAllCharts();
});

/* ─── CSV Upload ─── */
csvUpload.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const form = new FormData();
    form.append("file", file);

    datasetBadge.querySelector("span:last-child") || datasetBadge.append("");
    const textNode = datasetBadge.childNodes[datasetBadge.childNodes.length - 1];
    const originalText = textNode.textContent;
    textNode.textContent = " Uploading...";

    try {
        const res = await fetch("/api/upload", { method: "POST", body: form });
        const data = await res.json();
        if (data.error) {
            alert(data.error);
            textNode.textContent = originalText;
        } else {
            textNode.textContent = " " + file.name;

            chatArea.innerHTML = "";
            chatArea.appendChild(welcomeScreen);
            welcomeScreen.style.display = "flex";
            destroyAllCharts();
        }
    } catch {
        alert("Upload failed.");
        textNode.textContent = originalText;
    }
    csvUpload.value = "";
});


async function handleSend() {
    const text = queryInput.value.trim();
    if (!text) return;

    if (welcomeScreen.style.display !== "none") {
        welcomeScreen.style.display = "none";
    }

    appendUserMessage(text);
    queryInput.value = "";
    queryInput.style.height = "auto";
    sendBtn.disabled = true;

    const loadingEl = appendLoading();

    try {
        const res = await fetch("/api/query", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: text })
        });
        const data = await res.json();
        loadingEl.remove();

        if (data.error) {
            appendError(data.error);
        } else {
            appendDashboard(data);
        }
    } catch (err) {
        loadingEl.remove();
        appendError("Something went wrong. Please try again.");
    }

    sendBtn.disabled = false;
    scrollToBottom();
}


function appendUserMessage(text) {
    const block = document.createElement("div");
    block.className = "message-block";
    block.innerHTML = `
        <div class="user-message">
            <div class="user-bubble">${escapeHtml(text)}</div>
        </div>
    `;
    chatArea.appendChild(block);
    scrollToBottom();
}


function appendLoading() {
    const el = document.createElement("div");
    el.className = "loading-block";
    el.innerHTML = `
        <div class="loading-indicator">
            <div class="loading-dots"><span></span><span></span><span></span></div>
            <span class="loading-text">Analyzing your question and generating dashboard...</span>
        </div>
    `;
    chatArea.appendChild(el);
    scrollToBottom();
    return el;
}


function appendError(message) {
    const block = document.createElement("div");
    block.className = "message-block";
    block.innerHTML = `
        <div class="error-response">
            <span>⚠</span>
            <span>${escapeHtml(message)}</span>
        </div>
    `;
    chatArea.appendChild(block);
}


function appendDashboard(data) {
    const block = document.createElement("div");
    block.className = "message-block";

    let interpretationHtml = "";
    if (data.interpretation) {
        interpretationHtml = `
            <div class="ai-interpretation">
                <div class="ai-icon">AI</div>
                <span>${escapeHtml(data.interpretation)}</span>
            </div>
        `;
    }

    let insightsHtml = "";
    if (data.insights && data.insights.length > 0) {
        insightsHtml = `<div class="insights-list">${data.insights.map(
            (i) => `<div class="insight-chip">${escapeHtml(i)}</div>`
        ).join("")}</div>`;
    }

    const charts = data.charts || [];
    const gridClass = `charts-${Math.min(charts.length, 4)}`;

    let cardsHtml = charts.map((chart, idx) => {
        const canvasId = `chart-${Date.now()}-${idx}`;

        if (chart.error) {
            return `
                <div class="chart-card" style="animation-delay:${idx * 0.1}s">
                    <div class="chart-card-header">
                        <h3>${escapeHtml(chart.title || "Chart")}</h3>
                    </div>
                    <div class="chart-error">⚠ ${escapeHtml(chart.error)}</div>
                </div>
            `;
        }

        return `
            <div class="chart-card" style="animation-delay:${idx * 0.1}s">
                <div class="chart-card-header">
                    <h3>${escapeHtml(chart.title || "Chart")}</h3>
                    <span class="chart-type-badge">${escapeHtml(chart.type || "bar")}</span>
                </div>
                <div class="chart-container">
                    <canvas id="${canvasId}"></canvas>
                </div>
                ${chart.description ? `<p class="chart-description">${escapeHtml(chart.description)}</p>` : ""}
            </div>
        `;
    }).join("");

    block.innerHTML = `
        <div class="ai-response">
            ${interpretationHtml}
            <div class="dashboard-grid ${gridClass}">${cardsHtml}</div>
            ${insightsHtml}
        </div>
    `;

    chatArea.appendChild(block);

    charts.forEach((chart, idx) => {
        if (chart.error || !chart.data || chart.data.length === 0) return;
        const canvasId = `chart-${block.querySelector(".chart-card:nth-child(" + (idx + 1) + ") canvas")?.id}`;
        const canvas = block.querySelectorAll("canvas")[idx];
        if (canvas) renderChart(canvas, chart);
    });

    scrollToBottom();
}


function renderChart(canvas, chartConfig) {
    const { type, data, x_column, y_columns, title } = chartConfig;
    if (!data || data.length === 0) return;

    const labels = data.map((row) => row[x_column] ?? "N/A");

    const datasets = (y_columns || []).map((col, i) => {
        const color = CHART_COLORS[i % CHART_COLORS.length];
        const values = data.map((row) => {
            const v = row[col];
            return typeof v === "number" ? v : parseFloat(v) || 0;
        });

        const baseConfig = {
            label: col.replace(/_/g, " "),
            data: values,
            borderColor: color,
            backgroundColor: type === "line" || type === "scatter" || type === "radar"
                ? color + "33"
                : CHART_COLORS.slice(0, data.length).map((c, j) => (y_columns.length === 1 ? CHART_COLORS[j % CHART_COLORS.length] + "cc" : color + "cc")),
            borderWidth: type === "line" ? 2.5 : 1,
            tension: 0.35,
            pointRadius: type === "line" ? 3 : type === "scatter" ? 5 : 0,
            fill: type === "line"
        };

        if (type === "pie" || type === "doughnut" || type === "polarArea") {
            baseConfig.backgroundColor = CHART_COLORS.slice(0, data.length).map(c => c + "cc");
            baseConfig.borderColor = CHART_COLORS.slice(0, data.length);
            baseConfig.borderWidth = 2;
        }

        return baseConfig;
    });

    const isPie = ["pie", "doughnut", "polarArea"].includes(type);

    const chartType = type === "horizontal_bar" ? "bar" : type;
    const indexAxis = type === "horizontal_bar" ? "y" : "x";

    const instance = new Chart(canvas, {
        type: chartType,
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis,
            animation: {
                duration: 1200,
                easing: 'easeOutQuart'
            },
            interaction: { mode: "index", intersect: false },
            plugins: {
                legend: {
                    display: datasets.length > 1 || isPie,
                    position: isPie ? "right" : "top",
                    labels: {
                        color: "#9494a8",
                        font: { family: "Inter", size: 12, weight: 500 },
                        padding: 16,
                        usePointStyle: true,
                        pointStyle: 'circle'
                    }
                },
                tooltip: {
                    backgroundColor: "rgba(13, 13, 20, 0.9)",
                    titleColor: "#ffffff",
                    bodyColor: "#f0f0f5",
                    borderColor: "rgba(123, 97, 255, 0.3)",
                    borderWidth: 1,
                    padding: 14,
                    cornerRadius: 12,
                    displayColors: true,
                    boxPadding: 6,
                    titleFont: { family: "Inter", size: 13, weight: "700" },
                    bodyFont: { family: "Inter", size: 12 },
                    callbacks: {
                        label: (ctx) => {
                            let val = ctx.parsed.y ?? ctx.parsed;
                            if (typeof val === "number" && val > 999) {
                                val = val.toLocaleString();
                            }
                            return ` ${ctx.dataset.label}: ${val}`;
                        }
                    }
                }
            },
            scales: isPie ? {} : {
                x: {
                    grid: { color: "rgba(255,255,255,0.03)", drawBorder: false },
                    ticks: { color: "#5e5e73", font: { family: "Inter", size: 11 }, maxRotation: 45 }
                },
                y: {
                    grid: { color: "rgba(255,255,255,0.03)", drawBorder: false },
                    ticks: {
                        color: "#5e5e73",
                        font: { family: "Inter", size: 11 },
                        callback: (v) => (typeof v === "number" && v > 999 ? (v / 1000).toFixed(0) + "k" : v)
                    }
                }
            }
        }
    });

    chartInstances.push(instance);
}


function destroyAllCharts() {
    chartInstances.forEach((c) => c.destroy());
    chartInstances = [];
}


function scrollToBottom() {
    requestAnimationFrame(() => {
        chatArea.scrollTop = chatArea.scrollHeight;
    });
}


function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}
