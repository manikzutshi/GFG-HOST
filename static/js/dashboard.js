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

const mindmapArea = document.getElementById("mindmapArea");
const mindmapNetwork = document.getElementById("mindmapNetwork");
const mindmapBtn = document.getElementById("mindmapBtn");

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

// ==========================================
// SESSION MANAGEMENT (True Multi-Chat)
// ==========================================
let appSessions = [];
let currentSessionId = null;

window.addEventListener("DOMContentLoaded", async () => {
    try {
        const res = await fetch("/api/sessions");
        const data = await res.json();
        if (data && !data.error) {
            appSessions = data;
            renderSidebarHistory();
        }
    } catch (e) {
        console.error("Error loading sessions from Supabase", e);
    }
});

async function saveToSession(type, content, domId) {
    if (!currentSessionId) {
        currentSessionId = "sess_" + Date.now();
        const title = type === "user" ? (content.substring(0, 30) + "...") : "New Analytics Chat";
        appSessions.push({ id: currentSessionId, title, messages: [] });
    }
    
    const session = appSessions.find(s => s.id === currentSessionId);
    if (session) {
        session.messages.push({ type, content, domId });
        fetch("/api/sessions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(session)
        }).catch(err => console.error(err));
    }
    
    renderSidebarHistory();
}

function startNewSession() {
    currentSessionId = null;
    chatArea.innerHTML = "";
    chatArea.appendChild(welcomeScreen);
    welcomeScreen.style.display = "flex";
    destroyAllCharts();
    renderSidebarHistory();
}

function loadSession(sessionId) {
    const session = appSessions.find(s => s.id === sessionId);
    if (!session) return;
    
    currentSessionId = sessionId;
    
    // Fix UI bug: Ensure chat area is visible when a user clicks a historical session from anywhere
    const mindmapArea = document.getElementById("mindmapArea");
    document.body.classList.remove("vault-active");
    if (mindmapArea) mindmapArea.style.display = "none";
    vaultArea.style.display = "none";
    chatArea.style.display = "block";
    inputBar.style.display = "block";

    chatArea.innerHTML = "";
    welcomeScreen.style.display = "none";
    
    // Replay session messages
    session.messages.forEach(entry => {
        if (entry.type === "user") {
            appendUserMessage(entry.content, entry.domId);
        } else if (entry.type === "dashboard") {
            appendDashboard(entry.content, entry.domId);
        }
    });
    
    scrollToBottom();
    renderSidebarHistory();
}

function renderSidebarHistory() {
    const list = document.getElementById("sidebarHistoryList");
    if (!list) return;
    list.innerHTML = "";
    
    const recent = [...appSessions].reverse().slice(0, 15);
    recent.forEach(sess => {
        const wrapper = document.createElement("div");
        wrapper.style.display = "flex";
        wrapper.style.gap = "6px";
        wrapper.style.alignItems = "center";
        
        const btn = document.createElement("button");
        btn.className = "suggestion";
        btn.textContent = sess.title;
        btn.style.flex = "1";
        btn.style.textAlign = "left";
        btn.style.whiteSpace = "nowrap";
        btn.style.overflow = "hidden";
        btn.style.textOverflow = "ellipsis";
        
        btn.addEventListener("click", () => loadSession(sess.id));
        wrapper.appendChild(btn);

        if (sess.id === currentSessionId) {
            btn.style.background = "#2C2C2E"; // solid hover highlight
            btn.style.border = "1px solid #30D158"; // green active border
            btn.style.color = "#FFFFFF";
            
            // Delete button
            const delBtn = document.createElement("button");
            delBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FF3B30" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
            delBtn.style.background = "transparent";
            delBtn.style.border = "none";
            delBtn.style.cursor = "pointer";
            delBtn.style.padding = "6px";
            delBtn.title = "Delete Chat";
            
            delBtn.addEventListener("click", async (e) => {
                e.stopPropagation();
                if(confirm("Delete this chat session and its branch history from the database?")) {
                    appSessions = appSessions.filter(s => s.id !== sess.id);
                    startNewSession();
                    try {
                        await fetch(`/api/sessions/${sess.id}`, { method: 'DELETE' });
                    } catch(err) { console.error("Failed to delete from DB", err); }
                }
            });
            wrapper.appendChild(delBtn);
        }
        list.appendChild(wrapper);
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
    mindmapArea.style.display = "none";
    chatArea.style.display = "block";
    inputBar.style.display = "block";
    await fetch("/api/reset", { method: "POST" });
    startNewSession();
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

/* ─── Mindmap Logic ─── */
mindmapBtn.addEventListener("click", () => {
    document.body.classList.remove("vault-active");
    chatArea.style.display = "none";
    inputBar.style.display = "none";
    vaultArea.style.display = "none";
    mindmapArea.style.display = "block";
    renderMindmap();
});

let networkInstance = null;

function renderMindmap() {
    if (!window.vis) {
        console.error("vis-network library not loaded.");
        return;
    }

    const nodes = new vis.DataSet();
    const edges = new vis.DataSet();

    nodes.add({ 
        id: "root", 
        label: "Dataset Uploaded", 
        shape: "database", 
        color: { background: "rgba(10, 132, 255, 0.15)", border: "#0A84FF" }, 
        font: { color: "#FFFFFF", face: "Inter", size: 14 },
        margin: 14,
        borderWidth: 2
    });

    appSessions.forEach(sess => {
        let lastNodeId = "root";

        // Resolve branching parent if this session was branched from a historical node
        if (sess.parentSessionId && sess.parentMsgIndex !== undefined) {
             const parentSess = appSessions.find(s => s.id === sess.parentSessionId);
             if (parentSess && parentSess.messages[sess.parentMsgIndex]) {
                 lastNodeId = parentSess.messages[sess.parentMsgIndex].domId;
             }
        }

        sess.messages.forEach((msg, idx) => {
            if (msg.type === "user") {
                const nodeId = msg.domId;
                
                // Format text beautifully
                let labelText = msg.content;
                if (labelText.length > 30) labelText = labelText.substring(0, 30) + "...";

                // Determine styling based on active session
                const isActive = (sess.id === currentSessionId);
                const bg = isActive ? "rgba(48, 209, 88, 0.15)" : "#1C1C1E";
                const border = isActive ? "#30D158" : "rgba(255,255,255,0.1)";

                // Add Node
                nodes.add({
                    id: nodeId,
                    label: labelText,
                    shape: "box",
                    color: { background: bg, border: border },
                    font: { color: "#FFFFFF", face: "Inter", size: 14 },
                    margin: 14,
                    borderWidth: isActive ? 2 : 1,
                    shadow: true,
                    // Stash interaction payload
                    sessId: sess.id,
                    msgIndex: idx
                });

                // Add Edge connecting parent to child
                edges.add({
                    from: lastNodeId,
                    to: nodeId,
                    color: { color: "#48484A" },
                    arrows: "to"
                });

                lastNodeId = nodeId;
            }
        });
    });

    const data = { nodes, edges };
    const options = {
        layout: {
            hierarchical: {
                direction: "UD",
                sortMethod: "directed",
                nodeSpacing: 250,
                levelSeparation: 120
            }
        },
        physics: { enabled: false },
        interaction: { hover: true, tooltipDelay: 200 }
    };

    if (networkInstance) {
        networkInstance.destroy();
    }
    networkInstance = new vis.Network(mindmapNetwork, data, options);

    networkInstance.on("doubleClick", function (params) {
        if (params.nodes.length > 0) {
            const nodeId = params.nodes[0];
            if (nodeId === "root") return;
            
            const nodeData = nodes.get(nodeId);
            if (nodeData && nodeData.sessId) {
                branchSessionFromNode(nodeData.sessId, nodeData.msgIndex);
            }
        }
    });
}

function branchSessionFromNode(sourceSessionId, msgIndex) {
    const sourceSess = appSessions.find(s => s.id === sourceSessionId);
    if (!sourceSess) return;

    const newSess = {
        id: "sess_" + Date.now(),
        title: sourceSess.title + " (Branch)",
        messages: JSON.parse(JSON.stringify(sourceSess.messages.slice(0, msgIndex + 2))),
        parentSessionId: sourceSess.id,
        parentMsgIndex: msgIndex 
    };
    appSessions.push(newSess);
    localStorage.setItem("insightAiSessions", JSON.stringify(appSessions));
    
    // Animate navigation back to Chat View seamlessly
    document.body.classList.remove("vault-active");
    mindmapArea.style.display = "none";
    vaultArea.style.display = "none";
    chatArea.style.display = "block";
    inputBar.style.display = "block";
    
    renderSidebarHistory();
    loadSession(newSess.id);
}

/* ─── Vault Feature ─── */
vaultBtn.addEventListener("click", async () => {
    document.body.classList.add("vault-active");
    chatArea.style.display = "none";
    inputBar.style.display = "none";
    mindmapArea.style.display = "none";
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
                                <button class="btn-icon btn-dl-png" title="Download PNG" data-canvas-id="${canvasId}" data-idx="${i}">
                                    <span style="font-size:10px; font-weight:bold;">PNG</span>
                                </button>
                                <button class="btn-icon btn-dl-pdf" title="Download PDF" data-canvas-id="${canvasId}" data-idx="${i}">
                                    <span style="font-size:10px; font-weight:bold;">PDF</span>
                                </button>
                                <button class="btn-icon btn-dl-csv" title="Download CSV" data-idx="${i}">
                                    <span style="font-size:10px; font-weight:bold;">CSV</span>
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

            // Bind download buttons for vault
            bindDownloadButtons(vaultGrid, chartsToRender);
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
    saveToSession("user", text, domId);
    
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
            saveToSession("dashboard", data, domId);
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


function createChartCardHtml(chart, idx, canvasId) {
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

    data.charts = data.charts || [];
    let charts = data.charts;
    const gridClass = `charts-${Math.min(charts.length, 4)}`;

    let cardsHtml = charts.map((chart, idx) => {
        const canvasId = `chart-${Date.now()}-${idx}`;
        chart.canvasId = canvasId; // Store it for later lookup if needed
        return createChartCardHtml(chart, idx, canvasId);
    }).join("");

    let suggestedHtml = "";
    if (data.suggested_queries && data.suggested_queries.length > 0) {
        suggestedHtml = `<div class="suggested-queries-section" style="margin-top: 32px; margin-bottom: 24px;">
            <h4 style="margin-bottom: 12px; font-size: 0.95rem; color: var(--text-secondary);">Suggested Explorations</h4>
            <div class="suggested-grid" style="display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));">
            ${data.suggested_queries.map((q, idx) => `
                <div class="suggested-card" id="suggested-card-${domId}-${idx}" style="background: var(--bg-card); border: 1px solid var(--border); padding: 16px; border-radius: 12px;">
                    <h5 style="margin-bottom: 8px; font-size: 1rem; color: var(--text-primary);">${escapeHtml(q.title || "Query Option")}</h5>
                    <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 16px; line-height: 1.4;">${escapeHtml(q.description || "")}</p>
                    <button class="btn-action generate-suggested-btn" data-query-idx="${idx}" style="width: 100%; justify-content: center; font-size: 0.85rem; padding: 8px;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                        Generate Chart
                    </button>
                </div>
            `).join('')}
            </div>
        </div>`;
    }

    block.innerHTML = `
        <div class="ai-response">
            ${interpretationHtml}
            <div class="dashboard-grid ${gridClass}" id="grid-${domId}">${cardsHtml}</div>
            ${suggestedHtml}
            ${insightsHtml}
            <div style="margin-top: 16px; text-align: right;">
                <button class="btn-executive-export">
                    <svg width="16" height="16" style="margin-right: 6px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                    Export Executive PDF Report
                </button>
            </div>
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

    bindDownloadButtons(block, charts);

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

    const exportBtn = block.querySelector('.btn-executive-export');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            generateExecutiveReport(block, data);
        });
    }

    const generateBtns = block.querySelectorAll('.generate-suggested-btn');
    generateBtns.forEach(btn => {
        btn.addEventListener('click', async () => {
            const idx = btn.getAttribute('data-query-idx');
            const qConfig = data.suggested_queries[idx];
            
            const originalHtml = btn.innerHTML;
            btn.innerHTML = `<span style="opacity:0.7">Generating...</span>`;
            btn.disabled = true;
            
            try {
                const res = await fetch("/api/execute_custom_chart", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(qConfig)
                });
                const newChartConfig = await res.json();
                
                if (newChartConfig.error) {
                    alert("Failed to generate: " + newChartConfig.error);
                    btn.innerHTML = originalHtml;
                    btn.disabled = false;
                    return;
                }
                
                const newIdx = charts.length;
                charts.push(newChartConfig);
                const canvasId = `chart-${Date.now()}-${newIdx}`;
                newChartConfig.canvasId = canvasId;
                
                const newCardHtml = createChartCardHtml(newChartConfig, newIdx, canvasId);
                
                const mainGrid = block.querySelector('.dashboard-grid');
                mainGrid.insertAdjacentHTML('beforeend', newCardHtml);
                
                // Update grid columns class
                mainGrid.className = `dashboard-grid charts-${Math.min(charts.length, 4)}`;
                
                const suggestedCard = block.querySelector(`#suggested-card-${domId}-${idx}`);
                if (suggestedCard) suggestedCard.remove();
                
                const newCard = block.querySelector(`.option-card[data-idx="${newIdx}"]`);
                const newlyAddedCanvas = newCard.querySelector(`#${canvasId}`);
                if (newlyAddedCanvas) renderChart(newlyAddedCanvas, newChartConfig);
                
                // Rebind View SQL
                const sqlBtn = newCard.querySelector('.btn-view-sql');
                if (sqlBtn) {
                    sqlBtn.addEventListener('click', () => {
                        const sqlBlock = newCard.querySelector(`.sql-code-block`);
                        if (sqlBlock.style.display === 'none') {
                            sqlBlock.style.display = 'block';
                            sqlBtn.classList.add('active');
                        } else {
                            sqlBlock.style.display = 'none';
                            sqlBtn.classList.remove('active');
                        }
                    });
                }
                
                // Rebind PNG/PDF
                const pngBtn = newCard.querySelector('.btn-dl-png');
                if (pngBtn) pngBtn.addEventListener('click', () => downloadImageOrPdf(pngBtn, false, charts));
                const pdfBtn = newCard.querySelector('.btn-dl-pdf');
                if (pdfBtn) pdfBtn.addEventListener('click', () => downloadImageOrPdf(pdfBtn, true, charts));
                
                // Rebind CSV
                const csvBtn = newCard.querySelector('.btn-dl-csv');
                if (csvBtn) {
                    csvBtn.addEventListener('click', () => {
                        const chartData = charts[newIdx].data;
                        if (!chartData || !chartData.length) return;
                        const keys = Object.keys(chartData[0]);
                        let csvContent = "data:text/csv;charset=utf-8," + keys.join(",") + "\\n" +
                            chartData.map(row => keys.map(k => '"' + (row[k]||'') + '"').join(",")).join("\\n");
                        const encodedUri = encodeURI(csvContent);
                        const link = document.createElement("a");
                        link.setAttribute("href", encodedUri);
                        link.setAttribute("download", (charts[newIdx].title || "data") + ".csv");
                        document.body.appendChild(link);
                        link.click();
                        link.remove();
                    });
                }
                
                // Rebind Save Vault
                const saveBtn = newCard.querySelector('.save-vault-btn');
                if (saveBtn) {
                    saveBtn.addEventListener('click', async () => {
                        newChartConfig.sql = newChartConfig.sql || "";
                        saveBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
                        saveBtn.disabled = true;
                        saveBtn.style.pointerEvents = 'none';
                        saveBtn.style.borderColor = "var(--success)";
                        try {
                            await fetch('/api/vault', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(newChartConfig)
                            });
                        } catch (err) {
                            console.error("Failed to save to vault", err);
                            saveBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--error)" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
                        }
                    });
                }
                
                // Rebind Keep Option
                const keepBtn = newCard.querySelector('.btn-keep-option');
                if (keepBtn) {
                    keepBtn.addEventListener('click', () => {
                        const allCards = block.querySelectorAll('.option-card');
                        allCards.forEach(card => {
                            if (card.getAttribute('data-idx') !== String(newIdx)) {
                                card.style.display = 'none';
                            } else {
                                card.style.gridColumn = '1 / -1';
                                keepBtn.style.display = 'none';
                            }
                        });
                        const grid = block.querySelector('.dashboard-grid');
                        if (grid) grid.className = "dashboard-grid charts-1";
                    });
                }
                
            } catch(err) {
                console.error(err);
                alert("Error generating chart.");
                btn.innerHTML = originalHtml;
                btn.disabled = false;
            }
        });
    });

    scrollToBottom();
}

function bindDownloadButtons(container, chartsArray) {
    const csvBtns = container.querySelectorAll('.btn-dl-csv');
    csvBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const cIdx = btn.getAttribute('data-idx');
            const chartData = chartsArray[cIdx].data;
            if (!chartData || !chartData.length) return;
            const keys = Object.keys(chartData[0]);
            let csvContent = "data:text/csv;charset=utf-8," + keys.join(",") + "\n" +
                chartData.map(row => keys.map(k => '"' + (row[k]||'') + '"').join(",")).join("\n");
            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", (chartsArray[cIdx].title || "data") + ".csv");
            document.body.appendChild(link);
            link.click();
            link.remove();
        });
    });

    const pngBtns = container.querySelectorAll('.btn-dl-png');
    pngBtns.forEach(btn => {
        btn.addEventListener('click', () => downloadImageOrPdf(btn, false, chartsArray));
    });

    const pdfBtns = container.querySelectorAll('.btn-dl-pdf');
    pdfBtns.forEach(btn => {
        btn.addEventListener('click', () => downloadImageOrPdf(btn, true, chartsArray));
    });
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

// ==========================================
// EXECUTIVE REPORT GENERATION
// ==========================================
function generateExecutiveReport(block, data) {
    const win = window.open('', '_blank');
    if (!win) {
        alert("Please allow popups to generate the PDF report.");
        return;
    }

    // Find all visible charts in this block to respect the user's "Keep Option" choices
    const visibleCards = Array.from(block.querySelectorAll('.chart-card')).filter(card => card.style.display !== 'none');
    
    let chartBlocksHtml = "";
    
    visibleCards.forEach((card, idx) => {
        const title = card.querySelector('h3').innerText.replace(/^Option \d+: /, ''); // Strip option prefix if present
        const descEl = card.querySelector('.chart-description');
        const desc = descEl ? descEl.innerText : "No inference available.";
        const canvas = card.querySelector('canvas');
        const imgData = canvas.toDataURL("image/png", 1.0);

        chartBlocksHtml += `
            <div class="chart-section" style="${idx > 0 ? 'page-break-before: always; margin-top: 60px;' : ''}">
                <h2>${title}</h2>
                <div class="img-wrapper">
                    <img src="${imgData}" />
                </div>
                <div class="inference">
                    <strong>Inference & Analysis:</strong><br/>
                    ${desc}
                </div>
            </div>
        `;
    });

    let insightsHtml = "";
    if (data.insights && data.insights.length > 0) {
        insightsHtml = `
            <div class="summary" style="page-break-before: always;">
                <h2>Executive Takeaways / Insights</h2>
                <ul>
                    ${data.insights.map(i => "<li>" + escapeHtml(i) + "</li>").join('')}
                </ul>
            </div>
        `;
    }

    const docHtml = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>InsightAI Data Report</title>
            <style>
                @page { size: A4 portrait; margin: 20mm; }
                body { 
                    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; 
                    color: #1a1a1a; 
                    background: #ffffff; 
                    padding: 0; 
                    margin: 0; 
                    line-height: 1.6;
                }
                .header { 
                    text-align: center; 
                    border-bottom: 2px solid #eaebf0; 
                    padding-bottom: 15px; 
                    margin-bottom: 40px; 
                }
                .header h1 { margin: 0; color: #111; font-size: 28px; }
                .header p { margin: 5px 0 0 0; color: #666; font-size: 14px; }
                
                .chart-section { margin-bottom: 40px; }
                .chart-section h2 { 
                    font-size: 18px; 
                    color: #222; 
                    margin-bottom: 20px;
                    border-left: 4px solid #6c63ff;
                    padding-left: 10px;
                }
                .img-wrapper {
                    border: 1px solid #e2e4e8;
                    border-radius: 8px;
                    padding: 15px;
                    background: #fdfdfd;
                    margin-bottom: 20px;
                }
                .img-wrapper img { 
                    max-width: 100%; 
                    height: auto; 
                }
                .inference { 
                    background: #f4f6fa; 
                    border-radius: 6px; 
                    padding: 20px; 
                    font-size: 15px;
                    color: #333;
                }
                
                .summary { 
                    padding: 30px; 
                    background: #eceffd; 
                    border-radius: 8px;
                    border: 1px solid #dce1f9;
                }
                .summary h2 { 
                    margin-top: 0; 
                    color: #111; 
                    font-size: 22px; 
                    border-bottom: 1px solid #c8cff5; 
                    padding-bottom: 10px; 
                }
                .summary ul { margin: 0; padding-left: 20px; }
                .summary li { margin-bottom: 12px; font-size: 15px; }
                
                @media print {
                    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>InsightAI Executive Report</h1>
                <p>Generated automatically from your data query</p>
                <p style="margin-top:20px; font-weight:bold; color:#000;">Original Query: <br><span style="font-weight:normal; font-style:italic;">"${escapeHtml(data.interpretation)}"</span></p>
            </div>
            
            ${chartBlocksHtml}
            ${insightsHtml}
            
            <script>
                // Auto-print when images map loads
                window.onload = () => {
                    setTimeout(() => {
                        window.print();
                    }, 500);
                }
            </script>
        </body>
        </html>
    `;

    win.document.write(docHtml);
    win.document.close();
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

// Restore sessions on load
document.addEventListener("DOMContentLoaded", () => {
    // Render the sidebar history list immediately
    renderSidebarHistory();
    
    // Load the most recent session if it exists
    if (appSessions.length > 0) {
        const lastSession = appSessions[appSessions.length - 1];
        loadSession(lastSession.id);
    }
});
