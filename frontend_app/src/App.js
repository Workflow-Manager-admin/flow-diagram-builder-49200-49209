import React, { useState, useEffect, useCallback, useRef } from "react";
import "./App.css";

// === THEME INFO ===
// Accent: #FFC107 | Primary: #1976D2 | Secondary: #424242 | Mode: light

// --------- UTILS ---------
function uuidv4() {
  // RFC4122 version 4 compliant UUID
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function shallowClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// --------- CONTEXTS & HOOKS ---------
const NotificationContext = React.createContext();
// PUBLIC_INTERFACE
function useNotifications() {
  return React.useContext(NotificationContext);
}

// -------- THEME HOOK -------
const THEME_COLORS = {
  accent: "#FFC107",
  primary: "#1976D2",
  secondary: "#424242",
  mode: "light",
};
function useLightTheme() {
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--color-accent", THEME_COLORS.accent);
    root.style.setProperty("--color-primary", THEME_COLORS.primary);
    root.style.setProperty("--color-secondary", THEME_COLORS.secondary);
    root.style.setProperty("--bg-main", "#fff");
    root.style.setProperty("--bg-sidebar", "#f7f8fa");
    root.style.setProperty("--bg-bottom", "#f7f8fa");
    root.style.setProperty("--border", "#e6e8ef");
    root.style.setProperty("--text-main", "#1f2933");
    root.style.setProperty("--text-secondary", "#424242");
    root.style.setProperty("--shadow", "rgba(33,42,62,0.08)");
  }, []);
}

// -------- NOTIFICATION SYSTEM --------
/**
 * PUBLIC_INTERFACE
 * NotificationProvider wraps app children and provides the pushNotification context.
 */
function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([]);
  // PUBLIC_INTERFACE
  const pushNotification = useCallback((msg, type = "info", timeout = 4000) => {
    const n = { id: uuidv4(), msg, type };
    setNotifications((prev) => [...prev, n]);
    setTimeout(() => {
      setNotifications((prev) => prev.filter((item) => item.id !== n.id));
    }, timeout);
  }, []);
  return (
    <NotificationContext.Provider value={pushNotification}>
      {children}
      {notifications.length > 0 && (
        <div className="notification-stack">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`notification notification-${n.type}`}
              role="alert"
            >
              {n.msg}
            </div>
          ))}
        </div>
      )}
    </NotificationContext.Provider>
  );
}

// Export NotificationProvider for use at the root (index.js)
export { NotificationProvider };

// --------- LAYOUT COMPONENTS ---------
function TopBar({ onExecute, onSave, onLoad }) {
  return (
    <div className="topbar">
      <span className="topbar-title">Flow Diagram Builder</span>
      <div className="topbar-group">
        <button className="btn" onClick={onExecute} title="Execute flow">
          ▶️ Run
        </button>
        <button className="btn" onClick={onSave} title="Save to Local Storage">
          💾 Save
        </button>
        <button className="btn" onClick={onLoad} title="Load from Local Storage">
          📂 Load
        </button>
      </div>
    </div>
  );
}

function Palette({ onAddNode }) {
  // Example node types - Expandable
  const nodes = [
    {
      type: "js",
      label: "Code Node",
      desc: "JavaScript snippet node",
    },
    {
      type: "input",
      label: "Input Node",
      desc: "Start/Input",
    },
    {
      type: "output",
      label: "Output Node",
      desc: "End/Output",
    },
  ];
  // PUBLIC_INTERFACE
  function handleDragStart(e, nodeType) {
    e.dataTransfer.setData("application/flow-node", JSON.stringify({ type: nodeType }));
  }
  return (
    <div className="palette">
      <div className="palette-header">Palette</div>
      <div className="palette-items">
        {nodes.map((node) => (
          <div
            key={node.type}
            className="palette-item"
            draggable
            onDragStart={(e) => handleDragStart(e, node.type)}
            tabIndex={0}
            title={node.desc}
          >
            <span>{node.label}</span>
          </div>
        ))}
      </div>
      <div className="palette-footer">
        <small>Drag items onto the canvas.</small>
      </div>
    </div>
  );
}

function Sidebar({ selected, onChange, onDelete }) {
  // Node configuration panel for selected node (JS editing)
  if (!selected) {
    return (
      <div className="sidebar">
        <div className="sidebar-header">Settings</div>
        <div className="sidebar-empty">Select a node to configure</div>
      </div>
    );
  }
  return (
    <div className="sidebar">
      <div className="sidebar-header">Node Settings</div>
      <div className="sidebar-content">
        <div>
          <label className="sidebar-label">Node Label</label>
          <input
            value={selected.label || ""}
            onChange={(e) => onChange({ ...selected, label: e.target.value })}
            className="sidebar-input"
            placeholder="Node label"
          />
        </div>
        <div>
          <label className="sidebar-label">Type</label>
          <input
            value={selected.type}
            disabled
            className="sidebar-input sidebar-type"
            title="Type"
          />
        </div>
        {selected.type === "js" && (
          <div>
            <label className="sidebar-label">JavaScript</label>
            <CodeEditor
              value={selected.code || ""}
              onChange={(code) =>
                onChange({ ...selected, code })
              }
            />
          </div>
        )}
      </div>
      <button className="btn btn-danger" onClick={() => onDelete(selected.id)}>
        🗑️ Delete Node
      </button>
    </div>
  );
}

/**
 * PUBLIC_INTERFACE
 * BottomPanelLog displays a real-time, scrollable code execution log area at the bottom of the app.
 * Props:
 * - logs: array of {type: "stdout" | "stderr" | "notification", text: string, timestamp: Date|string}
 *   Logs are visually separated – error logs colored.
 * - onClear: function to clear the log (optional).
 * - resizable: bool for allowing vertical resizing (default true)
 */
function BottomPanelLog({ logs, onClear, resizable = true }) {
  const panelRef = useRef();
  // Auto-scroll to bottom on new logs
  useEffect(() => {
    if (panelRef.current) {
      panelRef.current.scrollTop = panelRef.current.scrollHeight;
    }
  }, [logs]);
  // Panel min/max height logic
  const [height, setHeight] = useState(150);
  const dragging = useRef(false);
  function startDrag(e) {
    dragging.current = true;
    document.body.style.userSelect = "none";
  }
  function stopDrag() {
    dragging.current = false;
    document.body.style.userSelect = "";
  }
  function doDrag(e) {
    if (!dragging.current) return;
    let newH = window.innerHeight - e.clientY - 18;
    if (newH < 70) newH = 70;
    if (newH > 420) newH = 420;
    setHeight(newH);
  }
  useEffect(() => {
    if (!resizable) return;
    window.addEventListener("mousemove", doDrag);
    window.addEventListener("mouseup", stopDrag);
    return () => {
      window.removeEventListener("mousemove", doDrag);
      window.removeEventListener("mouseup", stopDrag);
    };
  }, []);
  // Log render helper
  function renderLog(log, idx) {
    let cls = "bottom-panel-log-line";
    if (log.type === "stderr") cls += " error";
    if (log.type === "notification") cls += " notification";
    return (
      <div key={idx} className={cls}>
        <span className="bottom-panel-log-ts">
          {log.timestamp
            ? "[" +
              new Date(log.timestamp).toLocaleTimeString("en-US", {
                hour12: false,
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              }) +
              "] "
            : ""}
        </span>
        <span
          style={
            log.type === "stderr"
              ? { color: "#ffbdbd" }
              : log.type === "notification"
              ? { color: "#fbc02d" }
              : {}
          }
        >
          {log.text}
        </span>
      </div>
    );
  }
  return (
    <div
      className="bottom-panel"
      style={{
        position: "relative",
        padding: ".7em 2.1em",
        background: "var(--bg-bottom)",
        borderTop: "1.4px solid var(--border)",
        minHeight: 50,
        maxHeight: 420,
        height: resizable ? height : undefined,
        transition: "height 0.06s",
        boxShadow: "0 -2px 9px var(--shadow)",
        zIndex: 100,
        overflow: "visible",
      }}
    >
      <div className="bottom-panel-header" style={{ display: "flex", justifyContent: "space-between" }}>
        <span>
          Code Execution Logs
          <span style={{ fontWeight: 400, fontSize: "0.94em", marginLeft: 8, color: "#988" }}>
            (stdout, stderr, notifications)
          </span>
        </span>
        {onClear && (
          <button
            className="btn"
            style={{ fontSize: 13, padding: "3px 16px", marginRight: 8 }}
            onClick={onClear}
            title="Clear log"
          >
            🧹 Clear
          </button>
        )}
      </div>
      <div
        className="bottom-panel-log"
        ref={panelRef}
        style={{
          overflowY: "auto",
          background: "#252a31",
          color: "#eaffd0",
          borderRadius: 7,
          minHeight: 56,
          fontFamily: "Fira Mono, Consolas, monospace",
          marginTop: 8,
          padding: "6px 11px",
          fontSize: "1.05em",
          border: "1.1px solid #2c2c2c",
          maxHeight: resizable ? height - 46 : undefined,
        }}
        tabIndex={0}
        aria-label="Code execution log"
      >
        {logs.length === 0 ? (
          <span className="bottom-panel-empty">Log output will appear here as you execute flows.</span>
        ) : (
          logs.map(renderLog)
        )}
      </div>
      {/* Resize handle */}
      {resizable && (
        <div
          className="resize-handle"
          style={{
            position: "absolute",
            left: 0,
            bottom: 0,
            height: 10,
            width: "100%",
            cursor: "ns-resize",
            background: "transparent",
            userSelect: "none",
            zIndex: 2,
          }}
          onMouseDown={startDrag}
          title="Resize log panel"
        ></div>
      )}
    </div>
  );
}

// ----------- CODE EDITOR -----------

function CodeEditor({ value, onChange }) {
  // Minimal monospace editor
  const [code, setCode] = useState(value || "");
  useEffect(() => {
    setCode(value || "");
  }, [value]);
  return (
    <textarea
      className="code-editor"
      value={code}
      spellCheck={false}
      autocorrect="off"
      onChange={(e) => {
        setCode(e.target.value);
        onChange(e.target.value);
      }}
      rows={6}
      style={{
        fontFamily: "Menlo, monospace",
        background: "#252a31",
        color: "#ffeb3b",
        width: "100%",
        minHeight: "120px",
        fontSize: "13px",
        borderRadius: "6px",
        border: "1px solid #12151c",
        marginTop: 6,
      }}
      aria-label="JavaScript code editor"
    />
  );
}

// --------- FLOW DIAGRAM CANVAS ---------

// Shapes: nodes (rects), edges
const NODE_WIDTH = 156;
const NODE_HEIGHT = 66;

// PUBLIC_INTERFACE
function DiagramCanvas({
  nodes,
  edges,
  onNodeSelect,
  selectedId,
  onDragNode,
  onCreateEdge,
  onDropNode,
  onCanvasClick,
  onNodeDoubleClick,
}) {
  const [dragNodeId, setDragNodeId] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Allow drop from palette or reposition nodes
  function handleDrop(e) {
    e.preventDefault();
    const canvasRect = e.currentTarget.getBoundingClientRect();
    // Drop from palette or move existing node
    if (e.dataTransfer.types.includes("application/flow-node")) {
      const { type } = JSON.parse(e.dataTransfer.getData("application/flow-node"));
      const newNode = {
        id: uuidv4(),
        type: type,
        label: type === "js" ? "JS Node" : type.charAt(0).toUpperCase() + type.slice(1),
        x: e.clientX - canvasRect.left - NODE_WIDTH / 2,
        y: e.clientY - canvasRect.top - NODE_HEIGHT / 2,
        code: type === "js" ? "// JS code here" : "",
      };
      onDropNode(newNode);
    }
  }
  function handleDragOver(e) {
    e.preventDefault();
  }

  // Node drag (move)
  function handleNodeMouseDown(e, id) {
    setDragNodeId(id);
    const node = nodes.find((n) => n.id === id);
    setDragOffset({
      x: e.clientX - node.x,
      y: e.clientY - node.y,
    });
    e.stopPropagation();
  }

  function handleMouseMove(e) {
    if (dragNodeId) {
      onDragNode(dragNodeId, {
        x: e.clientX - dragOffset.x,
        y: e.clientY - dragOffset.y,
      });
    }
  }

  function handleMouseUp() {
    setDragNodeId(null);
  }

  // Edge creation: click node, then click another node
  const [connectingFrom, setConnectingFrom] = useState(null);
  function handleConnectorMouseDown(e, nodeId) {
    setConnectingFrom(nodeId);
    e.stopPropagation();
  }
  function handleNodeMouseUp(e, endId) {
    if (connectingFrom && connectingFrom !== endId) {
      onCreateEdge(connectingFrom, endId);
      setConnectingFrom(null);
    }
    if (dragNodeId) handleMouseUp();
  }

  // Styles for selected, etc.
  function nodeStyle(node, isSelected) {
    return {
      position: "absolute",
      top: node.y,
      left: node.x,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      background: isSelected ? "#fffbe7" : "#fafdff",
      border: isSelected
        ? `2px solid ${THEME_COLORS.accent}`
        : "2px solid #dde5ee",
      borderRadius: 8,
      boxShadow: "0 2px 6px var(--shadow)",
      cursor: dragNodeId === node.id ? "grabbing" : "grab",
      userSelect: "none",
      zIndex: isSelected ? 20 : 10,
      transition: "border 0.09s",
    };
  }

  // Double click to select & open code edit
  function handleNodeDoubleClick(e, node) {
    onNodeDoubleClick(node);
  }

  // Main SVG edges drawing
  const canvasRef = useRef();

  // MAIN RENDER
  return (
    <div
      ref={canvasRef}
      className="diagram-canvas"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onClick={onCanvasClick}
      tabIndex={0}
      title="Diagram Canvas"
    >
      {/* Edge SVG */}
      <svg className="diagram-edges" width="100%" height="100%">
        {edges.map((edge, i) => {
          const from = nodes.find((n) => n.id === edge.from);
          const to = nodes.find((n) => n.id === edge.to);
          if (!from || !to) return null;
          const x1 = from.x + NODE_WIDTH;
          const y1 = from.y + NODE_HEIGHT / 2;
          const x2 = to.x;
          const y2 = to.y + NODE_HEIGHT / 2;
          const midX = (x1 + x2) / 2;
          return (
            <g key={i}>
              <path
                d={`M${x1},${y1} C${midX},${y1} ${midX},${y2} ${x2},${y2}`}
                stroke={THEME_COLORS.primary}
                strokeWidth="3"
                fill="none"
                markerEnd="url(#arrowhead)"
              />
            </g>
          );
        })}
        <defs>
          <marker
            id="arrowhead"
            markerWidth="12"
            markerHeight="8"
            refX="12"
            refY="4"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <polygon points="0,0 12,4 0,8" fill={THEME_COLORS.primary} />
          </marker>
        </defs>
      </svg>
      {/* NODES */}
      {nodes.map((node) => (
        <div
          key={node.id}
          className={`diagram-node${selectedId === node.id ? " selected" : ""}`}
          style={nodeStyle(node, selectedId === node.id)}
          onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
          onMouseUp={(e) => handleNodeMouseUp(e, node.id)}
          onClick={(e) => {
            e.stopPropagation();
            onNodeSelect(node.id);
          }}
          onDoubleClick={(e) => handleNodeDoubleClick(e, node)}
          tabIndex={0}
        >
          <div className="node-header" style={{ background: THEME_COLORS.primary, color: "#fff", borderRadius: "6px 6px 0 0", padding: 4 }}>
            <span>{node.label || node.type}</span>
          </div>
          {node.type === "js" && (
            <div className="node-type" style={{ color: THEME_COLORS.accent }}>{`JS`}</div>
          )}
          <div
            className="connector connector-out"
            title="Start edge"
            onMouseDown={(e) => handleConnectorMouseDown(e, node.id)}
            style={{
              position: "absolute",
              right: -14,
              top: NODE_HEIGHT / 2 - 10,
              width: 16,
              height: 16,
              background: THEME_COLORS.accent,
              borderRadius: "50%",
              cursor: "crosshair",
              border: "2px solid #fff",
            }}
          ></div>
        </div>
      ))}
    </div>
  );
}

// ------- RESIZABLE WRAPPER ------
function ResizablePanel({ children, minWidth = 420, initialWidth = 260 }) {
  const [width, setWidth] = useState(initialWidth);
  const dragging = useRef(false);

  function startDrag(e) {
    dragging.current = true;
    document.body.style.userSelect = "none";
  }
  function stopDrag() {
    dragging.current = false;
    document.body.style.userSelect = "";
  }
  function doDrag(e) {
    if (!dragging.current) return;
    setWidth(Math.max(e.clientX, minWidth));
  }
  useEffect(() => {
    window.addEventListener("mousemove", doDrag);
    window.addEventListener("mouseup", stopDrag);
    return () => {
      window.removeEventListener("mousemove", doDrag);
      window.removeEventListener("mouseup", stopDrag);
    };
  });
  return (
    <div className="resizable-sidebar" style={{ width }}>
      <div style={{ width: "100%", height: "100%" }}>{children}</div>
      <div
        className="resize-handle"
        style={{
          position: "absolute",
          right: -6,
          top: 0,
          width: 12,
          height: "100%",
          cursor: "ew-resize",
          zIndex: 1111,
        }}
        onMouseDown={startDrag}
        title="Resize sidebar"
      ></div>
    </div>
  );
}

// -------- MAIN APP -----------
function App() {
  useLightTheme();
  // App State
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  // output/error still used for summary showing (optional)
  const [output, setOutput] = useState("");
  const [error, setError] = useState(false);

  // New: Execution log state (array of log objects)
  const [execLogs, setExecLogs] = useState([]);
  // Helper to append new log line, keeping log scrollback within reasonable size
  // logType: 'stdout', 'stderr', or 'notification'
  const appendLog = useCallback((text, logType = "stdout") => {
    setExecLogs((prev) => {
      let logs = [...prev, { text, type: logType, timestamp: new Date() }];
      // Limit to last 120 lines to keep UI snappy
      if (logs.length > 120) logs = logs.slice(logs.length - 120);
      return logs;
    });
  }, []);
  // Provides clear log button
  const clearLogs = useCallback(() => setExecLogs([]), []);

  const pushNotification = useNotifications();

  // Drag and drop: from palette
  function handleDropNode(newNode) {
    setNodes((prev) => [...prev, newNode]);
    pushNotification("Added new node", "info");
  }

  // Node selection
  function handleNodeSelect(id) {
    setSelectedId(id);
  }
  // Node edit/setting
  function handleNodeChange(updated) {
    setNodes((prev) =>
      prev.map((n) => (n.id === updated.id ? updated : n))
    );
    setSelectedId(updated.id); // keep selection
  }
  // Node delete
  function handleNodeDelete(id) {
    setNodes((prev) => prev.filter((n) => n.id !== id));
    setEdges((prev) => prev.filter((e) => e.from !== id && e.to !== id));
    setSelectedId(null);
    pushNotification("Node deleted", "info");
  }
  // Edge creation
  function handleCreateEdge(from, to) {
    if (edges.some((e) => e.from === from && e.to === to)) {
      pushNotification("Edge already exists", "warn");
      return;
    }
    setEdges((prev) => [...prev, { from, to }]);
    pushNotification("Edge created", "success");
  }

  // Node drag/reposition
  function handleDragNode(id, pos) {
    setNodes((prev) =>
      prev.map((n) =>
        n.id === id
          ? { ...n, x: Math.max(pos.x, 14), y: Math.max(pos.y, 14) }
          : n
      )
    );
  }

  function handleCanvasClick() {
    setSelectedId(null);
  }

  // Node double click: selects and scrolls to settings
  function handleNodeDoubleClick(node) {
    setSelectedId(node.id);
    document.getElementById("sidebar-scroll-anchor")?.scrollIntoView();
  }

  // Node settings (get selected node)
  const selected = nodes.find((n) => n.id === selectedId);

  // -------- EXECUTION ---------
  // Run the flow: simple topo sort and execute JS
  // Note: logs (including errors) are pushed to the real-time bottom log panel.
  function handleExecute() {
    if (nodes.length === 0) {
      appendLog("No nodes to execute. Add nodes to the diagram before running.", "stderr");
      pushNotification("No nodes to execute", "error");
      setError(true);
      setOutput("");
      return;
    }
    setError(false);
    setOutput("Executing...");
    appendLog("================== Flow execution started ==================", "notification");
    try {
      // Build adjacency list, topo sort
      const adj = {};
      const indeg = {};
      nodes.forEach((n) => {
        adj[n.id] = [];
        indeg[n.id] = 0;
      });
      edges.forEach((e) => {
        adj[e.from].push(e.to);
        indeg[e.to] = (indeg[e.to] || 0) + 1;
      });

      // Find input node(s): indeg==0
      let inputNodes = nodes.filter((n) => indeg[n.id] === 0);
      let order = [];
      let visited = {};

      function visit(node) {
        if (visited[node.id]) return;
        visited[node.id] = true;
        adj[node.id].forEach((toId) => {
          visit(nodes.find((n) => n.id === toId));
        });
        order.unshift(node);
      }
      inputNodes.forEach(visit);

      // Execution context
      let ctx = {};
      let logs = [];
      let outputSummary = "";
      let errorHappened = false;
      let step = 1;

      for (const node of order) {
        if (node.type === "js" && node.code) {
          try {
            // eslint-disable-next-line no-new-func
            const fn = new Function("context", node.code);
            ctx = fn(ctx) || ctx;
            const msg = `Step ${step++}: Ran JS node "${node.label || node.id}"`;
            logs.push(msg);
            appendLog(msg, "stdout");
          } catch (err) {
            const msg = `❌ Error in node "${node.label || node.id}": ${err.message}`;
            logs.push(msg);
            appendLog(msg, "stderr");
            setError(true);
            pushNotification("Execution error", "error");
            setOutput(logs.join("\n"));
            errorHappened = true;
            break;
          }
        } else if (node.type === "input") {
          const msg = `Step ${step++}: Input node "${node.label || node.id}"`;
          logs.push(msg);
          appendLog(msg, "stdout");
        } else if (node.type === "output") {
          const msg = `Step ${step++}: Output node "${node.label || node.id}"`;
          logs.push(msg);
          appendLog(msg, "stdout");
        }
      }
      if (!errorHappened) {
        const doneMsg = "✅ Flow execution complete.";
        logs.push(doneMsg);
        appendLog(doneMsg, "notification");
        setOutput(logs.join("\n"));
        setError(false);
        pushNotification("Execution complete", "success");
      } else {
        // Already handled
      }
      appendLog("============================================================", "notification");
    } catch (err) {
      const fatal = "Flow execution failed: " + err.message;
      appendLog(fatal, "stderr");
      setError(true);
      setOutput(fatal);
      pushNotification("Execution Error: " + err.message, "error");
    }
  }

  // ------ SAVE/LOAD ------
  function handleSave() {
    try {
      localStorage.setItem(
        "flowdiagram-app-state",
        JSON.stringify({ nodes, edges })
      );
      pushNotification("Diagram saved!", "success");
    } catch {
      pushNotification("Failed to save", "error");
    }
  }
  function handleLoad() {
    try {
      const s = localStorage.getItem("flowdiagram-app-state");
      if (!s) throw new Error("Not found.");
      const { nodes: n, edges: e } = JSON.parse(s);
      setNodes(n);
      setEdges(e);
      setSelectedId(null);
      pushNotification("Diagram loaded.", "success");
    } catch {
      pushNotification("Failed to load diagram", "error");
    }
  }

  // ---- INITIAL LOAD -----
  useEffect(() => {
    // Try load current diagram if present
    const s = localStorage.getItem("flowdiagram-app-state");
    if (s) {
      try {
        const { nodes: n, edges: e } = JSON.parse(s);
        setNodes(n);
        setEdges(e);
      } catch { /* ignore */ }
    }
  }, []);

  // ----------- UI -----------
  // Main vertical layout: top bar -> flex row (sidebar, workspace) -> bottom logs

  return (
    <div className="app-root">
      <TopBar onExecute={handleExecute} onSave={handleSave} onLoad={handleLoad} />
      <div className="main-row">
        <ResizablePanel initialWidth={240} minWidth={140}>
          <Palette onAddNode={handleDropNode} />
        </ResizablePanel>
        <div className="workspace-root">
          <DiagramCanvas
            nodes={nodes}
            edges={edges}
            selectedId={selectedId}
            onNodeSelect={handleNodeSelect}
            onDropNode={handleDropNode}
            onDragNode={handleDragNode}
            onCreateEdge={handleCreateEdge}
            onCanvasClick={handleCanvasClick}
            onNodeDoubleClick={handleNodeDoubleClick}
          />
        </div>
        <ResizablePanel initialWidth={300} minWidth={170}>
          <div id="sidebar-scroll-anchor" />
          <Sidebar
            selected={selected}
            onChange={handleNodeChange}
            onDelete={handleNodeDelete}
          />
        </ResizablePanel>
      </div>
      {/* Dedicated real-time log panel */}
      <BottomPanelLog
        logs={execLogs}
        onClear={execLogs.length > 0 ? clearLogs : undefined}
        resizable={true}
      />
      <div style={{ fontSize: "1em", color: "#989894", textAlign: "center", padding: "2px", fontStyle: "italic" }}>
        To see real-time code execution logs (output, errors, status), watch the <b>bottom panel</b> of the application.
      </div>
    </div>
  );
}

export default App;
