const chatArea = document.getElementById("chatArea");
const welcomeScreen = document.getElementById("welcomeScreen");
const queryInput = document.getElementById("queryInput");
const sendBtn = document.getElementById("sendBtn");
const newChatBtn = document.getElementById("newChatBtn");
const csvUpload = document.getElementById("csvUpload");
const datasetBadge = document.getElementById("datasetBadge");
const vaultBtn = document.getElementById("vaultBtn");
const vaultArea = document.getElementById("vaultArea");
const vaultGrid = document.getElementById("vaultGrid");
const vaultSearch = document.getElementById("vaultSearch");
const inputBar = document.getElementById("inputBar");

const CHART_COLORS = [
    "#0A84FF", // Blue
    "#30D158", // Green
    "#FF9F0A", // Orange
    "#FF375F", // Pink
    "#BF5AF2", // Purple
    "#5E5CE6", // Indigo
    "#64D2FF", // Cyan/Teal
    "#FFD60A"  // Yellow
];

let chartInstances = [];
let msgBlockIdCounter = 0;

// Chat History Management
let chatHistory = JSON.parse(localStorage.getItem("insightAiHistory") || "[]");

function saveToHistory(type, content, domId) {
    chatHistory.push({ type, content, domId });
    localStorage.setItem("insightAiHistory", JSON.stringify(chatHistory));
    if (type === "user") renderSidebarHistory();
}

function clearHistory() {
    chatHistory = [];
    localStorage.removeItem("insightAiHistory");
    renderSidebarHistory();
}

function renderSidebarHistory() {
    const list = document.getElementById("sidebarHistoryList");
    if (!list) return;
    list.innerHTML = "";
    const userPrompts = chatHistory.filter(h => h.type === "user");
    userPrompts.slice(-10).forEach(prompt => {
        const btn = document.createElement("button");
        btn.className = "suggestion";
        btn.textContent = prompt.content;
        btn.style.textAlign = "left";
        btn.style.whiteSpace = "nowrap";
        btn.style.overflow = "hidden";
        btn.style.textOverflow = "ellipsis";
        btn.addEventListener("click", () => {
            const el = document.getElementById(prompt.domId);
            if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        });
        list.appendChild(btn);
    });
}


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
    document.body.classList.remove("vault-active");
    vaultArea.style.display = "none";
    chatArea.style.display = "block";
    inputBar.style.display = "block";
    await fetch("/api/reset", { method: "POST" });
    chatArea.innerHTML = "";
    chatArea.appendChild(welcomeScreen);
    welcomeScreen.style.display = "flex";
    destroyAllCharts();
    clearHistory();
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

/* ─── Vault Feature ─── */
vaultBtn.addEventListener("click", async () => {
    document.body.classList.add("vault-active");
    chatArea.style.display = "none";
    inputBar.style.display = "none";
    vaultArea.style.display = "block";
    
    vaultGrid.innerHTML = `<div class="loading-indicator" style="grid-column: 1/-1;"><span class="loading-text">Loading vault...</span></div>`;
    
    try {
        const res = await fetch("/api/vault");
        const data = await res.json();
        if (data.error) {
            vaultGrid.innerHTML = `<div class="chart-error">⚠ ${escapeHtml(data.error)}</div>`;
            return;
        }
        
        if (data.charts.length === 0) {
            vaultGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 40px;">Your vault is empty. Generate some charts and save them!</div>`;
            return;
        }
        
        let allVaultCharts = data.charts;

        const renderVaultCharts = (chartsToRender) => {
            if (chartsToRender.length === 0) {
                vaultGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 40px;">No charts match your search.</div>`;
                return;
            }

            vaultGrid.innerHTML = chartsToRender.map((c, i) => {
                const canvasId = `vault-chart-${Date.now()}-${i}`;
                // Apply Bento Box varied sizing rules based on chart type
                // Wide charts: bar, line. Square charts: pie, doughnut, radar, polarArea, scatter
                const isWide = ["bar", "horizontal_bar", "line"].includes(c.type);
                const bentoClass = isWide ? "bento-wide" : "";

                return `
                    <div class="chart-card ${bentoClass}" style="animation-delay: ${i * 0.05}s">
                        <div class="chart-card-header">
                            <h3>${escapeHtml(c.title)}</h3>
                            <div class="card-actions-wrapper">
                                <span class="chart-type-badge">${escapeHtml(c.type)}</span>
                                <button class="btn-icon btn-view-sql-vault" title="View SQL" data-chart-index="${i}">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
                                </button>
                                <button class="btn-icon btn-remove-vault" title="Remove from Vault" data-chart-id="${c.id}">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                </button>
                            </div>
                        </div>
                        <div class="chart-container" style="height: 220px;">
                            <canvas id="${canvasId}"></canvas>
                        </div>
                        ${c.description ? `<p class="chart-description">${escapeHtml(c.description)}</p>` : ""}
                        <div class="sql-code-block" id="vault-sql-block-${i}" style="display: none;">
                            <div class="sql-header">Saved SQL Query</div>
                            <pre><code>${escapeHtml(c.data.sql || c.sql || "No SQL saved")}</code></pre>
                        </div>
                    </div>
                `;
            }).join("");
            
            destroyAllCharts();
            
            chartsToRender.forEach((c, i) => {
                const canvas = vaultGrid.querySelectorAll('canvas')[i];
                if (canvas) renderChart(canvas, c);
            });

            const vaultSqlBtns = vaultGrid.querySelectorAll('.btn-view-sql-vault');
            vaultSqlBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    const cIdx = btn.getAttribute('data-chart-index');
                    const sqlBlock = vaultGrid.querySelector(`#vault-sql-block-${cIdx}`);
                    if (sqlBlock.style.display === 'none') {
                        sqlBlock.style.display = 'block';
                        btn.classList.add('active');
                    } else {
                        sqlBlock.style.display = 'none';
                        btn.classList.remove('active');
                    }
                });
            });

            const vaultRemoveBtns = vaultGrid.querySelectorAll('.btn-remove-vault');
            vaultRemoveBtns.forEach(btn => {
                btn.addEventListener('click', async () => {
                    if(!confirm("Remove chart from vault?")) return;
                    const chartId = btn.getAttribute('data-chart-id');
                    try {
                        const res = await fetch(`/api/vault/${chartId}`, { method: 'DELETE' });
                        if(res.ok) {
                            vaultBtn.click(); // Re-render vault
                        } else {
                            alert("Failed to delete chart.");
                        }
                    } catch(e) {
                        alert("Error contacting server.");
                    }
                });
            });
        };

        // Initial render
        renderVaultCharts(allVaultCharts);

        // Search filtering logic
        vaultSearch.addEventListener("input", (e) => {
            const query = e.target.value.toLowerCase();
            const filtered = allVaultCharts.filter(c => {
                const searchableText = `${c.title} ${c.description || ""} ${c.type}`.toLowerCase();
                return searchableText.includes(query);
            });
            renderVaultCharts(filtered);
        });
        
    } catch (err) {
        vaultGrid.innerHTML = `<div class="chart-error">⚠ Failed to load vault.</div>`;
    }
});


async function handleSend() {
    document.body.classList.remove("vault-active");
    vaultArea.style.display = "none";
    chatArea.style.display = "block";
    inputBar.style.display = "block";
    
    const text = queryInput.value.trim();
    if (!text) return;

    if (welcomeScreen.style.display !== "none") {
        welcomeScreen.style.display = "none";
    }

    const domId = `msg-${msgBlockIdCounter++}`;
    appendUserMessage(text, domId);
    saveToHistory("user", text, domId);
    
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
            const domId = `msg-${msgBlockIdCounter++}`;
            appendDashboard(data, domId);
            saveToHistory("dashboard", data, domId);
        }
    } catch (err) {
        loadingEl.remove();
        appendError("Something went wrong. Please try again.");
    }

    sendBtn.disabled = false;
    scrollToBottom();
}


function appendUserMessage(text, domId) {
    const block = document.createElement("div");
    block.className = "message-block";
    if (domId) block.id = domId;
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


function appendDashboard(data, domId) {
    const block = document.createElement("div");
    block.className = "message-block";
    if (domId) block.id = domId;

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
            <div class="chart-card option-card" data-idx="${idx}" style="animation-delay:${idx * 0.1}s">
                <div class="chart-card-header">
                    <h3>${escapeHtml(chart.title || "Chart")}</h3>
                    <div class="card-actions-wrapper">
                        <span class="chart-type-badge">${escapeHtml(chart.type || "bar")}</span>
                        <button class="btn-icon btn-view-sql" title="View SQL" data-chart-index="${idx}">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
                        </button>
                        <button class="btn-icon btn-dl-png" title="Download PNG" data-canvas-id="${canvasId}" data-idx="${idx}">
                            <span style="font-size:10px; font-weight:bold;">PNG</span>
                        </button>
                        <button class="btn-icon btn-dl-pdf" title="Download PDF" data-canvas-id="${canvasId}" data-idx="${idx}">
                            <span style="font-size:10px; font-weight:bold;">PDF</span>
                        </button>
                        <button class="btn-icon btn-dl-csv" title="Download CSV" data-idx="${idx}">
                            <span style="font-size:10px; font-weight:bold;">CSV</span>
                        </button>
                        <button class="btn-icon save-vault-btn" title="Save to Vault" data-chart-index="${idx}">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
                        </button>
                    </div>
                </div>
                <div class="chart-container">
                    <canvas id="${canvasId}"></canvas>
                </div>
                ${chart.description ? `<p class="chart-description">${escapeHtml(chart.description)}</p>` : ""}
                <button class="btn-keep-option" data-idx="${idx}">Keep This Option</button>
                <div class="sql-code-block" id="sql-block-${idx}" style="display: none;">
                    <div class="sql-header">Generated SQL Query</div>
                    <pre><code>${escapeHtml(chart.sql || "No SQL available")}</code></pre>
                </div>
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
        const canvas = block.querySelectorAll("canvas")[idx];
        if (canvas) renderChart(canvas, chart);
    });

    const saveBtns = block.querySelectorAll('.save-vault-btn');
    saveBtns.forEach(btn => {
        btn.addEventListener('click', async () => {
            const cIdx = btn.getAttribute('data-chart-index');
            const chartData = charts[cIdx];
            // Ensure the raw SQL string is included in the payload sent to the Vault
            chartData.sql = chartData.sql || "";
            
            btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
            btn.disabled = true;
            btn.style.pointerEvents = 'none';
            btn.style.borderColor = "var(--success)";
            
            try {
                await fetch('/api/vault', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(chartData)
                });
            } catch (err) {
                console.error("Failed to save to vault", err);
                btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--error)" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
            }
        });
    });

    const sqlBtns = block.querySelectorAll('.btn-view-sql');
    sqlBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const cIdx = btn.getAttribute('data-chart-index');
            const sqlBlock = block.querySelector(`#sql-block-${cIdx}`);
            if (sqlBlock.style.display === 'none') {
                sqlBlock.style.display = 'block';
                btn.classList.add('active');
            } else {
                sqlBlock.style.display = 'none';
                btn.classList.remove('active');
            }
            scrollToBottom();
        });
    });

    const csvBtns = block.querySelectorAll('.btn-dl-csv');
    csvBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const cIdx = btn.getAttribute('data-idx');
            const chartData = charts[cIdx].data;
            if (!chartData || !chartData.length) return;
            const keys = Object.keys(chartData[0]);
            let csvContent = "data:text/csv;charset=utf-8," + keys.join(",") + "\\n" +
                chartData.map(row => keys.map(k => '"' + (row[k]||'') + '"').join(",")).join("\\n");
            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", (charts[cIdx].title || "data") + ".csv");
            document.body.appendChild(link);
            link.click();
            link.remove();
        });
    });

    const pngBtns = block.querySelectorAll('.btn-dl-png');
    pngBtns.forEach(btn => {
        btn.addEventListener('click', () => downloadImageOrPdf(btn, false, charts));
    });

    const pdfBtns = block.querySelectorAll('.btn-dl-pdf');
    pdfBtns.forEach(btn => {
        btn.addEventListener('click', () => downloadImageOrPdf(btn, true, charts));
    });

    const keepBtns = block.querySelectorAll('.btn-keep-option');
    keepBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const idxToKeep = btn.getAttribute('data-idx');
            // Hide all other cards in this same block
            const allCards = block.querySelectorAll('.option-card');
            allCards.forEach(card => {
                if (card.getAttribute('data-idx') !== idxToKeep) {
                    card.style.display = 'none';
                } else {
                    card.style.gridColumn = '1 / -1'; // Expand to full width
                    btn.style.display = 'none'; // Hide the 'keep option' button itself
                }
            });
            // Update the grid layout to single column
            const grid = block.querySelector('.dashboard-grid');
            if (grid) grid.className = "dashboard-grid charts-1";
            scrollToBottom();
        });
    });

    scrollToBottom();
}

function downloadImageOrPdf(btn, isPdf, charts) {
    const tempCanvas = document.getElementById(btn.getAttribute('data-canvas-id'));
    if (!tempCanvas) return;
    
    const cIdx = btn.getAttribute('data-idx');
    const chartConf = charts[cIdx];
    const title = chartConf.title || "Chart";
    const desc = chartConf.description || "";

    const destinationCanvas = document.createElement("canvas");
    destinationCanvas.width = tempCanvas.width + 40;
    destinationCanvas.height = tempCanvas.height + 120; // Extra room for text
    const destCtx = destinationCanvas.getContext('2d');
    
    destCtx.fillStyle = "#1e1e1e"; // Dark theme
    destCtx.fillRect(0, 0, destinationCanvas.width, destinationCanvas.height);
    
    // Draw title
    destCtx.fillStyle = "#ffffff";
    destCtx.font = "bold 18px Helvetica, Arial, sans-serif";
    destCtx.fillText(title, 20, 30);

    // Draw description with basic word wrapping
    destCtx.fillStyle = "#86868B";
    destCtx.font = "14px Helvetica, Arial, sans-serif";
    const words = desc.split(' ');
    let line = '';
    let y = 55;
    for(let i = 0; i < words.length; i++) {
        const testLine = line + words[i] + ' ';
        const metrics = destCtx.measureText(testLine);
        if(metrics.width > tempCanvas.width && i > 0) {
            destCtx.fillText(line, 20, y);
            line = words[i] + ' ';
            y += 20;
        } else {
            line = testLine;
        }
    }
    destCtx.fillText(line, 20, y);

    // Draw chart canvas
    destCtx.drawImage(tempCanvas, 20, Math.max(90, y + 20));

    if (isPdf) {
        if (!window.jspdf) {
            alert("PDF export library is still loading. Please try again in a second.");
            return;
        }
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ 
            orientation: destinationCanvas.width > destinationCanvas.height ? 'l' : 'p', 
            unit: 'px', 
            format: [destinationCanvas.width, destinationCanvas.height] 
        });
        pdf.addImage(destinationCanvas.toDataURL("image/jpeg", 1.0), 'JPEG', 0, 0, destinationCanvas.width, destinationCanvas.height);
        pdf.save(title + '.pdf');
    } else {
        const link = document.createElement('a');
        link.download = title + '.png';
        link.href = destinationCanvas.toDataURL("image/png");
        link.click();
    }
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
                duration: 1600,
                easing: 'easeOutQuart',
                delay: (context) => context.dataIndex * 50
            },
            interaction: { mode: "index", intersect: false },
            plugins: {
                legend: {
                    display: datasets.length > 1 || isPie,
                    position: isPie ? "right" : "top",
                    labels: {
                        color: "#86868B",
                        font: { family: "Inter", size: 12, weight: 500 },
                        padding: 16,
                        usePointStyle: true,
                        pointStyle: 'circle'
                    }
                },
                tooltip: {
                    backgroundColor: "rgba(28, 28, 30, 0.85)", /* Apple UI Dark grey */
                    titleColor: "#ffffff",
                    bodyColor: "#F5F5F7",
                    borderColor: "rgba(255, 255, 255, 0.1)",
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
                    ticks: { color: "#86868B", font: { family: "Inter", size: 11 }, maxRotation: 45 }
                },
                y: {
                    grid: { color: "rgba(255,255,255,0.03)", drawBorder: false },
                    ticks: {
                        color: "#86868B",
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

// Restore chat history on load
document.addEventListener("DOMContentLoaded", () => {
    if (chatHistory.length > 0) {
        welcomeScreen.style.display = "none";
        chatHistory.forEach(entry => {
            if (entry.type === "user") {
                appendUserMessage(entry.content, entry.domId);
            } else if (entry.type === "dashboard") {
                appendDashboard(entry.content, entry.domId);
            }
        });
        scrollToBottom();
    }
    renderSidebarHistory();
});
