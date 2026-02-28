import { useEffect, useLayoutEffect, useState, useCallback, useRef, useMemo, Fragment } from "react";
import { Link } from "react-router-dom";
import { FiArrowLeft, FiDownload, FiRefreshCw, FiChevronRight, FiChevronDown, FiPlus, FiX, FiSave, FiAlertTriangle, FiBarChart2, FiTrendingUp, FiTrendingDown, FiMaximize2, FiMinimize2, FiZap, FiTrash2, FiDatabase } from "react-icons/fi";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ReferenceLine, Cell, LabelList,
} from "recharts";
import { useTheme } from "../contexts/ThemeContext";
import { useAgentChatContext } from "../contexts/AgentChatContext";
import { getUserId, getAuthHeaders } from "../services/userContext";
import "../Components/Navbar.css";

import { API_BASE_URL } from "../services/apiConfig";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Accounting format: 1,234.56 or (1,234.56) for negatives */
function fmt(n: number): string {
  const abs = Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return n < 0 ? `(${abs})` : abs;
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface RowData {
  label: string;
  values: number[];
  editable: boolean;
  type: "category" | "total" | "balance" | "net";
  section: "inflow" | "outflow" | "calc";
  customId?: string;
  isCustomParent?: boolean;
  parentId?: string;
  forecastMethod?: string;
  forecastParams?: Record<string, number>;
  formula?: string;
}

interface ForecastAlgorithm {
  id: string;
  name: string;
  description: string;
  params: { name: string; type: string; default: number | boolean | null; min?: number; max?: number; options?: string[]; description: string }[];
  custom?: boolean;
  advanced?: boolean;
}

interface AIForecastInsight {
  summary: string;
  risks: { level: string; message: string }[];
  recommendation: { algorithm: string; reason: string; confidence: number } | null;
  suggestions: { type: string; message: string }[];
  patterns: { trend?: string; seasonality?: string; anomalies?: string[]; volatility?: string };
  category_insights: { category: string; insight: string }[];
  error?: string;
}

const DEFAULT_FORECAST_ALGORITHMS: ForecastAlgorithm[] = [
  { id: "agent", name: "AI Agent (Sonnet 4.5)", description: "LLM-powered forecasting: sends batches of line items to Claude Sonnet 4.5 with statistical context and company summary. The agent reasons about patterns and produces forecasts with explanations. Takes ~2 min.", params: [] },
  { id: "auto", name: "Auto-Select (Statistical)", description: "Regime-aware statistical auto-selection with composite scoring (MASE+sMAPE+stability).", params: [] },
  { id: "naive", name: "Naive (Last Value)", description: "Repeats the last observed value. Simplest baseline.", params: [] },
  { id: "sma", name: "Simple Moving Average", description: "Average of the last N periods. Smooths noise, ignores trend.", params: [{ name: "window", type: "int", default: 4, min: 1, max: 52, description: "Number of historical periods to average" }] },
  { id: "wma", name: "Weighted Moving Average", description: "Like SMA but recent periods count more. Better for trending data.", params: [{ name: "window", type: "int", default: 4, min: 1, max: 52, description: "Number of historical periods to weight" }] },
  { id: "ses", name: "Exponential Smoothing", description: "Single exponential smoothing. Good for stable series without trend.", params: [{ name: "alpha", type: "float", default: 0.3, min: 0.01, max: 0.99, description: "Smoothing factor (higher = more reactive)" }] },
  { id: "holt", name: "Holt's Linear Trend", description: "Double exponential smoothing capturing level + trend.", params: [{ name: "alpha", type: "float", default: 0.8, min: 0.01, max: 0.99, description: "Level smoothing" }, { name: "beta", type: "float", default: 0.2, min: 0.01, max: 0.99, description: "Trend smoothing" }] },
  { id: "holt_winters", name: "Holt-Winters (Seasonal)", description: "Triple exponential smoothing with seasonality. Best for data with trend and repeating patterns.", params: [{ name: "alpha", type: "float", default: 0.5, min: 0.01, max: 0.99, description: "Level" }, { name: "beta", type: "float", default: 0.1, min: 0.01, max: 0.99, description: "Trend" }, { name: "gamma", type: "float", default: 0.3, min: 0.01, max: 0.99, description: "Seasonal" }, { name: "season_length", type: "int", default: 4, min: 2, max: 52, description: "Season cycle length" }] },
  { id: "linear", name: "Linear Regression", description: "Fits a straight line through all historical data and extrapolates.", params: [] },
  { id: "seasonal_naive", name: "Seasonal Naive", description: "Repeats the last complete seasonal cycle. Good when strong seasonality dominates.", params: [{ name: "season_length", type: "int", default: 4, min: 1, max: 52, description: "Season cycle length" }] },
  { id: "croston", name: "Croston's Method", description: "Separate SES on demand sizes and inter-arrival intervals. Best for intermittent demand with many zero periods.", params: [{ name: "alpha", type: "float", default: 0.15, min: 0.01, max: 0.99, description: "Smoothing factor" }] },
  { id: "sba", name: "Syntetos-Boylan (SBA)", description: "Bias-corrected Croston's method. Recommended for intermittent and lumpy demand.", params: [{ name: "alpha", type: "float", default: 0.15, min: 0.01, max: 0.99, description: "Smoothing factor" }] },
  { id: "tsb", name: "TSB (Teunter-Syntetos-Babai)", description: "Forecasts demand probability (decays for obsolescence). Best for very sporadic demand.", params: [{ name: "alpha_demand", type: "float", default: 0.15, min: 0.01, max: 0.99, description: "Demand smoothing" }, { name: "alpha_prob", type: "float", default: 0.15, min: 0.01, max: 0.99, description: "Probability smoothing" }] },
  { id: "arima", name: "ARIMA (Auto-Regressive)", description: "Full ARIMA with automatic (p,d,q) order selection via AIC. Returns confidence intervals.", params: [{ name: "auto_order", type: "bool", default: true, description: "Auto-select best (p,d,q) via AIC" }, { name: "p", type: "int", default: 1, min: 0, max: 5, description: "AR order" }, { name: "d", type: "int", default: 1, min: 0, max: 2, description: "Differencing order" }, { name: "q", type: "int", default: 1, min: 0, max: 5, description: "MA order" }, { name: "confidence_level", type: "float", default: 0.95, min: 0.5, max: 0.99, description: "Confidence level for intervals" }], advanced: true },
  { id: "prophet", name: "Prophet (Additive Trend/Seasonality)", description: "Prophet model with uncertainty intervals. Used when available for complex trend/seasonality.", params: [{ name: "confidence_level", type: "float", default: 0.9, min: 0.5, max: 0.99, description: "Confidence level for intervals" }, { name: "freq", type: "select", default: null, options: ["W", "D", "M"], description: "Time frequency" }], advanced: true },
  { id: "xgboost_quantile", name: "XGBoost Quantile (GPU-capable)", description: "Gradient-boosted lag model with quantile intervals. Selectively used for high-value noisy series.", params: [{ name: "lags", type: "int", default: 8, min: 4, max: 24, description: "Lag features" }, { name: "alpha", type: "float", default: 0.1, min: 0.01, max: 0.45, description: "Lower quantile alpha" }], advanced: true },
  { id: "ensemble", name: "Ensemble Decomposition", description: "Trend + Fourier seasonality + residual decomposition. Captures complex seasonal patterns.", params: [{ name: "n_harmonics", type: "int", default: 2, min: 1, max: 5, description: "Fourier harmonics for seasonality" }, { name: "trend_type", type: "select", default: null, options: ["linear", "damped"], description: "Trend extrapolation type" }, { name: "confidence_level", type: "float", default: 0.95, min: 0.5, max: 0.99, description: "Confidence level" }], advanced: true },
  { id: "monte_carlo", name: "Monte Carlo Simulation", description: "N stochastic simulations producing probabilistic forecasts with fan chart bands.", params: [{ name: "n_simulations", type: "int", default: 1000, min: 100, max: 10000, description: "Number of simulation paths" }, { name: "confidence_level", type: "float", default: 0.9, min: 0.5, max: 0.99, description: "Confidence level" }, { name: "seed", type: "int", default: null, min: 0, max: 999999, description: "Random seed (optional)" }], advanced: true },
];

interface InsightCard {
  id: string;
  title: string;
  html: string;
  created_at: string;
}

/**
 * Build a full HTML document for rendering inside a sandboxed iframe.
 * This allows <style> tags, CSS hover effects, animations, and even
 * inline <script> for Chart.js (all sandboxed from the parent page).
 */
function buildInsightSrcDoc(html: string, theme: string): string {
  const bg = theme === "dark" ? "#1e293b" : "#ffffff";
  const text = theme === "dark" ? "#e2e8f0" : "#1e293b";
  const textSecondary = theme === "dark" ? "#94a3b8" : "#64748b";
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  *, *::before, *::after { box-sizing: border-box; }
  html { overflow-x: auto; overflow-y: hidden; }
  body {
    margin: 0; padding: 0;
    font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
    font-size: 14px; line-height: 1.6;
    background: ${bg}; color: ${text};
    overflow-x: auto; overflow-y: hidden;
  }
  /* Wrap all body content in a measuring div */
  #__wrap { overflow: visible; }
  table { border-collapse: collapse; width: 100%; }
  th, td { padding: 6px 10px; border: 1px solid ${theme === "dark" ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)"}; text-align: left; }
  th { font-weight: 600; background: ${theme === "dark" ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)"}; }
  a { color: #6366f1; }
  h1, h2, h3, h4, h5, h6 { margin: 0.5em 0 0.3em; }
  .text-secondary { color: ${textSecondary}; }
  /* CRITICAL: prevent Chart.js canvases from growing beyond their
     declared height attribute. Without this, responsive:true causes
     an infinite resize loop (chart fills container → body grows →
     iframe resizes → chart fills new space → repeat forever). */
  canvas {
    max-height: 300px !important;
    width: 100% !important;
    height: auto !important;
  }
</style>
</head>
<body>
<div id="__wrap">${html}</div>
<script>
  window.onerror = function(msg, src, line, col, err) {
    window.parent.postMessage({
      type: 'insight-render-error',
      error: String(msg) + (line ? ' (line ' + line + ')' : '')
    }, '*');
  };
  window.addEventListener('unhandledrejection', function(e) {
    window.parent.postMessage({
      type: 'insight-render-error',
      error: 'Unhandled promise rejection: ' + String(e.reason)
    }, '*');
  });
  (function() {
    function send() {
      var el = document.getElementById('__wrap');
      if (!el) return;
      var h = el.scrollHeight || el.offsetHeight;
      if (h > 10) {
        window.parent.postMessage({ type: 'insight-resize', height: h }, '*');
      }
    }
    send();
    setTimeout(send, 300);
    setTimeout(send, 800);
    setTimeout(send, 1500);
    setTimeout(send, 3000);
    setTimeout(send, 5000);

    // Chart.js health check: after charts should have rendered, validate them
    setTimeout(function() {
      if (typeof Chart === 'undefined') return;
      var canvases = document.querySelectorAll('canvas');
      var errors = [];
      canvases.forEach(function(c, i) {
        var ctx = c.getContext('2d');
        // Check if chart instance exists on this canvas
        var chartInstance = Chart.getChart ? Chart.getChart(c) : null;
        if (!chartInstance) {
          errors.push('Canvas #' + (i+1) + ' has no Chart.js instance (chart failed to initialize)');
          return;
        }
        var ds = chartInstance.data && chartInstance.data.datasets;
        if (!ds || ds.length === 0) {
          errors.push('Chart #' + (i+1) + ' (' + (chartInstance.config.type||'unknown') + ') has no datasets');
        } else {
          var allEmpty = ds.every(function(d) { return !d.data || d.data.length === 0; });
          if (allEmpty) {
            errors.push('Chart #' + (i+1) + ' (' + (chartInstance.config.type||'unknown') + ') has empty data in all datasets');
          }
        }
      });
      if (errors.length > 0) {
        window.parent.postMessage({
          type: 'insight-render-error',
          error: errors.join('; ')
        }, '*');
      }
    }, 4000);
  })();
</script>
</body>
</html>`;
}

/** Sandboxed iframe that auto-resizes to its content height */
function InsightFrame({ html, theme, onRenderError }: { html: string; theme: string; onRenderError?: (error: string) => void }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(300);
  const lockedRef = useRef(false);
  const mountTimeRef = useRef(Date.now());

  useEffect(() => {
    mountTimeRef.current = Date.now();
    lockedRef.current = false;

    const lockTimer = setTimeout(() => { lockedRef.current = true; }, 7000);

    const handler = (e: MessageEvent) => {
      if (e.data?.type === "insight-render-error" && typeof e.data.error === "string") {
        if (iframeRef.current && e.source === iframeRef.current.contentWindow) {
          onRenderError?.(e.data.error);
        }
      }
      if (lockedRef.current) return;
      if (e.data?.type === "insight-resize" && typeof e.data.height === "number") {
        if (iframeRef.current && e.source === iframeRef.current.contentWindow) {
          const newH = Math.min(Math.max(e.data.height + 8, 80), 4000);
          setHeight(newH);
        }
      }
    };
    window.addEventListener("message", handler);
    return () => {
      window.removeEventListener("message", handler);
      clearTimeout(lockTimer);
    };
  }, [html, onRenderError]);

  const srcDoc = useMemo(() => buildInsightSrcDoc(html, theme), [html, theme]);

  return (
    <iframe
      ref={iframeRef}
      srcDoc={srcDoc}
      sandbox="allow-scripts allow-same-origin"
      style={{
        width: "100%",
        height,
        border: "none",
        display: "block",
      }}
      title="Insight content"
    />
  );
}

interface CategorySummaryEntry {
  count: number;
  total_amount?: number;
  credits?: number;
  debits?: number;
  avg_amount?: number;
  pct_of_count?: number;
  pct_of_volume?: number;
  /** Per-period amounts when classification used a date column */
  weekly_credits?: number[];
  weekly_debits?: number[];
}

interface ClusterInfo {
  category: string;
  representative: string;
  size: number;
  sample_descriptions?: string[];
  total_amount?: number;
  credits?: number;
  debits?: number;
  weekly_credits?: number[];
  weekly_debits?: number[];
}

interface RowCategoryEntry {
  description: string;
  category: string;
  cluster_id: number;
}

interface DimensionGroupCategory {
  weekly_credits: number[];
  weekly_debits: number[];
}
interface DimensionGroupEntry {
  credits: number[];
  debits: number[];
  categories: Record<string, DimensionGroupCategory>;
}

interface ClassificationResult {
  metadata?: {
    total_descriptions?: number;
    has_amounts?: boolean;
    has_weekly_breakdown?: boolean;
    generated_at?: string;
    source_file?: string;
    num_periods?: number;
    period_labels?: string[];
    first_date?: string;
    last_date?: string;
    period?: string;
    group_by_dimension?: string;
  };
  category_summary?: Record<string, number | CategorySummaryEntry>;
  clusters?: Record<string, ClusterInfo>;
  row_categories?: Record<string, RowCategoryEntry>;
  dimension_groups?: Record<string, DimensionGroupEntry>;
}

/* ------------------------------------------------------------------ */
/*  Theme colours                                                      */
/* ------------------------------------------------------------------ */

const themeColors = {
  light: {
    text: "#1e293b",
    textSecondary: "#64748b",
    secondaryBg: "#f8fafc",
    cardBg: "#fff",
    border: "rgba(0,0,0,0.08)",
    inputBg: "#fff",
    totalBg: "#f1f5f9",
    headerBg: "#e2e8f0",
    inflowColor: "#059669",
    outflowColor: "#dc2626",
    netPositive: "#059669",
    netNegative: "#dc2626",
    stripeBg: "#fafafa",
  },
  dark: {
    text: "#e2e8f0",
    textSecondary: "#94a3b8",
    secondaryBg: "#111827",
    cardBg: "#1e293b",
    border: "rgba(255,255,255,0.1)",
    inputBg: "#0f172a",
    totalBg: "#1f2b3e",
    headerBg: "#253347",
    inflowColor: "#34d399",
    outflowColor: "#f87171",
    netPositive: "#34d399",
    netNegative: "#f87171",
    stripeBg: "#1f2a3d",
  },
};

const DEFAULT_PERIODS = 13;

/** Pass-through: backend returns data pre-bucketed by the requested period. */
function getDisplayValues(
  values: number[],
  _timeFrame: "weekly" | "biweekly" | "monthly",
  _aggregation: "sum" | "first" | "last" = "sum",
): number[] {
  return values;
}

function setDisplayValue(values: number[], _timeFrame: "weekly" | "biweekly" | "monthly", displayColIdx: number, value: number): number[] {
  const next = [...values];
  next[displayColIdx] = Math.round(value * 100) / 100;
  return next;
}

/* ------------------------------------------------------------------ */
/*  Formula cell renderer                                              */
/* ------------------------------------------------------------------ */

const FormulaCell = ({ formula, theme }: { formula: string; theme: string }) => {
  const isDark = theme === "dark";
  const isAgent = !formula.match(/^\w+\s*\[\w+\]\s*MASE=/);
  const isFallback = formula.toLowerCase().startsWith("fallback");
  const isSummary = formula.match(/^AI Agent \|/);

  if (isSummary) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 4, lineHeight: 1.3 }}>
        <span style={{
          display: "inline-block", padding: "1px 5px", borderRadius: 3, fontSize: "0.55rem",
          fontWeight: 700, background: isDark ? "rgba(139,92,246,0.2)" : "rgba(139,92,246,0.1)",
          color: isDark ? "#c4b5fd" : "#7c3aed",
        }}>AI</span>
        <span style={{ fontSize: "0.63rem", color: isDark ? "#94a3b8" : "#64748b" }}>
          {formula.replace("AI Agent | ", "")}
        </span>
      </div>
    );
  }

  if (isAgent) {
    return (
      <div style={{ lineHeight: 1.35, display: "flex", flexDirection: "column", gap: 2 }}>
        {!isFallback && (
          <span style={{
            display: "inline-block", padding: "1px 5px", borderRadius: 3, fontSize: "0.5rem",
            fontWeight: 700, background: isDark ? "rgba(139,92,246,0.2)" : "rgba(139,92,246,0.1)",
            color: isDark ? "#c4b5fd" : "#7c3aed", width: "fit-content", marginBottom: 1,
          }}>AI AGENT</span>
        )}
        <span style={{
          fontSize: "0.6rem",
          color: isFallback
            ? (isDark ? "#fbbf24" : "#d97706")
            : (isDark ? "#cbd5e1" : "#475569"),
          lineHeight: 1.4,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}>
          {formula}
        </span>
      </div>
    );
  }

  return <span style={{ fontSize: "0.6rem", opacity: 0.85, fontFamily: "'Cascadia Code', monospace" }}>{formula}</span>;
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const CashFlow = () => {
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const userId = getUserId();
  const { sendRenderError } = useAgentChatContext();

  const handleInsightError = useCallback((insightTitle: string, insightId: string, errorMsg: string) => {
    sendRenderError(`Insight '${insightTitle}' (${insightId}): ${errorMsg}`);
  }, [sendRenderError]);

  const [rows, setRows] = useState<RowData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [classificationData, setClassificationData] = useState<ClassificationResult | null>(null);

  // Account filter for multi-account ledger
  const [ledgerAccounts, setLedgerAccounts] = useState<{ id: string; display_name: string; source_type: string; txn_count: number }[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set());
  const [appliedAccountIds, setAppliedAccountIds] = useState<Set<string>>(new Set());
  const [dimensionDefs, setDimensionDefs] = useState<{ id: string; name: string; level: number }[]>([]);
  const [groupBy, setGroupBy] = useState<string>("");
  const [groupByOpen, setGroupByOpen] = useState(false);
  const groupByRef = useRef<HTMLDivElement>(null);
  const [timeFrame, setTimeFrame] = useState<"weekly" | "biweekly" | "monthly">("weekly");
  const [startDate, setStartDate] = useState<string>("");
  const [apiPeriodLabels, setApiPeriodLabels] = useState<string[]>([]);
  const [apiFirstDate, setApiFirstDate] = useState<string>("");
  const [apiLastDate, setApiLastDate] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);
  const labelInputRef = useRef<HTMLInputElement>(null);
  const versionsDropdownRef = useRef<HTMLDivElement>(null);
  const frozenBodyRef = useRef<HTMLTableSectionElement>(null);
  const scrollBodyRef = useRef<HTMLTableSectionElement>(null);
  const [editingLabelIdx, setEditingLabelIdx] = useState<number | null>(null);

  // Save state
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  // Undo / Redo
  const undoStack = useRef<RowData[][]>([]);
  const redoStack = useRef<RowData[][]>([]);
  const pushUndo = (snapshot: RowData[]) => {
    undoStack.current.push(snapshot.map((r) => ({ ...r, values: [...r.values] })));
    if (undoStack.current.length > 50) undoStack.current.shift(); // cap history
    redoStack.current = [];
  };
  const undo = () => {
    if (undoStack.current.length === 0) return;
    redoStack.current.push(rows.map((r) => ({ ...r, values: [...r.values] })));
    const prev = undoStack.current.pop()!;
    setRows(recalc(prev));
  };
  const redo = () => {
    if (redoStack.current.length === 0) return;
    undoStack.current.push(rows.map((r) => ({ ...r, values: [...r.values] })));
    const next = redoStack.current.pop()!;
    setRows(recalc(next));
  };

  // Minimum cash threshold
  const [minCashThreshold, setMinCashThreshold] = useState<number | null>(null);

  // Charts toggle, expand, data labels
  const [showCharts, setShowCharts] = useState(true);
  const [showDataLabels, setShowDataLabels] = useState(false);
  const [expandedChart, setExpandedChart] = useState<string | null>(null); // null | "balance" | "inout" | "net"

  // Insights panel
  const [insights, setInsights] = useState<InsightCard[]>([]);
  const [showInsights, setShowInsights] = useState(true);
  const [expandedInsight, setExpandedInsight] = useState<string | null>(null); // insight id or null

  // Version rollback
  const [versions, setVersions] = useState<Array<{ version_id: string; created_at: string; label: string; rows_count: number }>>([]);
  const [showVersions, setShowVersions] = useState(false);

  // Forecasting
  const [actualPeriodCount, setActualPeriodCount] = useState<number>(0);
  const [forecastPeriodCount, setForecastPeriodCount] = useState<number>(0);
  const [forecastHorizon, setForecastHorizon] = useState<number>(0);  // user's desired horizon (draft)
  const [forecastAlgorithms, setForecastAlgorithms] = useState<ForecastAlgorithm[]>(DEFAULT_FORECAST_ALGORITHMS);
  const [defaultForecastMethod, setDefaultForecastMethod] = useState<string>("agent");
  const [showForecastPanel, setShowForecastPanel] = useState(false);
  const [forecastGenerating, setForecastGenerating] = useState(false);
  const [forecastRowOverride, setForecastRowOverride] = useState<string | null>(null);
  const [explicitRowOverrides, setExplicitRowOverrides] = useState<Record<string, { method: string; params?: Record<string, number> }>>({}); // only from right-click
  const [forecastMessage, setForecastMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [confidenceBands, setConfidenceBands] = useState<Record<string, { lower: number[]; upper: number[]; metadata?: Record<string, unknown>; percentiles?: Record<string, number[]> }> | null>(null);
  const [showConfidenceBands, setShowConfidenceBands] = useState(true);
  const [forecastMetadata, setForecastMetadata] = useState<Record<string, unknown> | null>(null);
  const [algoParams, setAlgoParams] = useState<Record<string, number | boolean | string>>({});
  const [aiInsights, setAiInsights] = useState<AIForecastInsight | null>(null);
  const [aiInsightsLoading, setAiInsightsLoading] = useState(false);
  const [showAiInsights, setShowAiInsights] = useState(false);
  const commitGuardRef = useRef(false);

  // AI CFO Insights
  interface CFOInsight {
    id: string;
    title: string;
    description: string;
    severity: "alert" | "watch" | "opportunity" | "info";
    category: string;
    action: string;
    metric: string;
  }
  const [cfoInsights, setCfoInsights] = useState<CFOInsight[]>([]);
  const [cfoLoading, setCfoLoading] = useState(false);
  const [showCfoPanel, setShowCfoPanel] = useState(true);

  // Company profile badge
  const [companyProfileExists, setCompanyProfileExists] = useState<boolean | null>(null);
  const [companyProfileName, setCompanyProfileName] = useState("");

  // Fetch ledger accounts for filter dropdown
  useEffect(() => {
    if (!userId) return;
    fetch(`${API_BASE_URL}/api/ledger/accounts?user_id=${encodeURIComponent(userId)}`, { headers: { ...getAuthHeaders() } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.accounts) setLedgerAccounts(d.accounts); })
      .catch(() => {});
  }, [userId]);

  // Fetch dimension definitions
  useEffect(() => {
    if (!userId) return;
    fetch(`${API_BASE_URL}/api/ledger/dimensions?user_id=${encodeURIComponent(userId)}`, { headers: { ...getAuthHeaders() } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.definitions) setDimensionDefs(d.definitions); })
      .catch(() => {});
  }, [userId]);

  // Close group-by dropdown on click-outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (groupByRef.current && !groupByRef.current.contains(e.target as Node)) {
        setGroupByOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Check if company profile exists
  useEffect(() => {
    if (!userId) return;
    fetch(`${API_BASE_URL}/api/cfo/company-profile?user_id=${encodeURIComponent(userId)}`, { headers: { ...getAuthHeaders() } })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) {
          setCompanyProfileExists(d.exists);
          if (d.company_name) setCompanyProfileName(d.company_name);
        }
      })
      .catch(() => setCompanyProfileExists(false));
  }, [userId]);

  // Fetch forecast algorithms (merge API results with built-in defaults)
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/forecast/algorithms?user_id=${encodeURIComponent(userId)}`, { headers: { ...getAuthHeaders() } })
      .then(r => r.ok ? r.json() : [])
      .then(d => {
        if (Array.isArray(d) && d.length > 0) {
          const builtInIds = new Set(DEFAULT_FORECAST_ALGORITHMS.map(a => a.id));
          const custom = d.filter((a: ForecastAlgorithm) => !builtInIds.has(a.id));
          setForecastAlgorithms([...DEFAULT_FORECAST_ALGORITHMS, ...custom]);
        }
      })
      .catch(() => {});
  }, [userId]);

  const totalPeriods = (apiPeriodLabels.length || DEFAULT_PERIODS) + forecastPeriodCount;
  const numPeriods = totalPeriods;
  const periodLabels = (() => {
    const actuals = apiPeriodLabels.length > 0
      ? apiPeriodLabels
      : Array.from({ length: DEFAULT_PERIODS }, (_, i) => `Wk ${i + 1}`);
    if (forecastPeriodCount <= 0) return actuals;
    const fLabels = Array.from({ length: forecastPeriodCount }, (_, i) => `F${i + 1}`);
    return [...actuals, ...fLabels];
  })();

  const expandKey = (section: string, label: string) => `${section}-${label}`;
  const baseCategoryName = (label: string) => label.replace(/\s*\([^)]*\)\s*$/, "").trim();
  const getClustersForRow = (label: string) =>
    clustersByCategory[label] ?? clustersByCategory[baseCategoryName(label)] ?? [];

  /* All clusters per category (representative, size, credits, debits) for expand.
   * Sub-row amounts: from cluster credits/debits/total_amount (coerced to number).
   * If a cluster has no amount but the parent category has a value, we distribute the
   * remainder by cluster size so sub-rows never show 0 when the parent has a total
   * and the breakdown sums correctly. Data source: GET /api/standardized/cash-flow;
   * ensure classification was run with an amount column so clusters have credits/debits. */
  const clustersByCategory = (() => {
    const clusters = classificationData?.clusters;
    if (!clusters) return {} as Record<string, { representative: string; size: number; total_amount?: number; credits?: number; debits?: number }[]>;
    const byCat: Record<string, { representative: string; size: number; total_amount?: number; credits?: number; debits?: number }[]> = {};
    for (const c of Object.values(clusters)) {
      const cat = c.category;
      if (!byCat[cat]) byCat[cat] = [];
      // Coerce to number so API string values (e.g. "40851312.61") still work
      byCat[cat].push({
        representative: c.representative,
        size: Number(c.size) || 0,
        total_amount: Number(c.total_amount),
        credits: Number(c.credits),
        debits: Number(c.debits),
      });
    }
    for (const cat of Object.keys(byCat)) {
      byCat[cat].sort((a, b) => b.size - a.size);
    }
    return byCat;
  })();

  /* ---------- Build model from classification data ---------- */

  const buildModel = useCallback((data: ClassificationResult | null): RowData[] => {
    const hasAmounts = data?.metadata?.has_amounts === true;
    const numCols = (data?.metadata as Record<string, unknown>)?.num_periods as number || DEFAULT_PERIODS;
    const summary = data?.category_summary ?? {};
    const clusters = data?.clusters ?? {};
    const _base = (name: string) => name.replace(/\s*\([^)]*\)\s*$/, "").trim();

    // ── 1. Cluster totals per category (single source of truth for totals) ──
    const clusterTotals: Record<string, { credits: number; debits: number }> = {};
    for (const c of Object.values(clusters)) {
      const cat = (c as { category?: string }).category;
      if (!cat) continue;
      if (!clusterTotals[cat]) clusterTotals[cat] = { credits: 0, debits: 0 };
      clusterTotals[cat].credits += Number((c as { credits?: number }).credits) || 0;
      clusterTotals[cat].debits += Number((c as { debits?: number }).debits) || 0;
    }
    const lookup = (name: string) => clusterTotals[name] ?? clusterTotals[_base(name)];

    // ── 2. Build per-period values for each (category, section) ──
    const makePeriodArr = (total: number, periodArr?: number[]): number[] => {
      if (periodArr && periodArr.length === numCols) {
        const s = periodArr.reduce((a, b) => a + b, 0);
        if (s > 0) {
          const scale = total / s;
          return periodArr.map((v) => Math.round(v * scale * 100) / 100);
        }
      }
      const perPeriod = Math.round((total / numCols) * 100) / 100;
      return new Array(numCols).fill(perPeriod);
    };

    // ── 3. Group clusters by category (with id for stable keys) ──
    const clustersByCat: Record<string, { id: string; representative: string; size: number; credits: number; debits: number; weekly_credits?: number[]; weekly_debits?: number[] }[]> = {};
    for (const [id, c] of Object.entries(clusters)) {
      const cat = (c as { category?: string }).category;
      if (!cat) continue;
      if (!clustersByCat[cat]) clustersByCat[cat] = [];
      const ci = c as ClusterInfo;
      clustersByCat[cat].push({
        id,
        representative: String(ci.representative ?? ""),
        size: Number(ci.size) || 0,
        credits: Number(ci.credits) || 0,
        debits: Number(ci.debits) || 0,
        weekly_credits: ci.weekly_credits,
        weekly_debits: ci.weekly_debits,
      });
    }
    for (const cat of Object.keys(clustersByCat)) {
      clustersByCat[cat].sort((a, b) => b.size - a.size);
    }
    const getClusters = (name: string) => clustersByCat[name] ?? clustersByCat[_base(name)] ?? [];

    // ── 4. Classify each category into inflow and/or outflow ──
    interface CatEntry {
      label: string;
      values: number[];
      clusters: typeof clustersByCat[""];
      sectionKey: string; // deterministic key: "api-inflow-Name" or "api-outflow-Name"
    }
    const inflowCats: CatEntry[] = [];
    const outflowCats: CatEntry[] = [];

    for (const [name, v] of Object.entries(summary)) {
      const entry: CategorySummaryEntry =
        typeof v === "object" && v !== null && "count" in v
          ? (v as CategorySummaryEntry)
          : { count: typeof v === "number" ? v : 0 };

      const ct = lookup(name);
      const credits = ct?.credits ?? entry.credits ?? 0;
      const debits = ct?.debits ?? entry.debits ?? 0;
      const catClusters = getClusters(name);

      if (hasAmounts && credits > 0) {
        inflowCats.push({
          label: name,
          values: makePeriodArr(credits, entry.weekly_credits),
          clusters: catClusters.filter((c) => c.credits > 0),
          sectionKey: `api-inflow-${name}`,
        });
      }
      if (hasAmounts && debits > 0) {
        outflowCats.push({
          label: name,
          values: makePeriodArr(debits, entry.weekly_debits),
          clusters: catClusters.filter((c) => c.debits > 0),
          sectionKey: `api-outflow-${name}`,
        });
      }
    }

    // Sort by total descending
    const totalOf = (vals: number[]) => vals.reduce((a, b) => a + b, 0);
    inflowCats.sort((a, b) => totalOf(b.values) - totalOf(a.values));
    outflowCats.sort((a, b) => totalOf(b.values) - totalOf(a.values));

    if (inflowCats.length === 0) {
      inflowCats.push({ label: "Revenue / Customer Receipts", values: new Array(numCols).fill(0), clusters: [], sectionKey: "default-inflow-0" });
      inflowCats.push({ label: "Other Income", values: new Array(numCols).fill(0), clusters: [], sectionKey: "default-inflow-1" });
    }
    if (outflowCats.length === 0) {
      outflowCats.push({ label: "Payroll & Benefits", values: new Array(numCols).fill(0), clusters: [], sectionKey: "default-outflow-0" });
      outflowCats.push({ label: "Rent & Lease Payments", values: new Array(numCols).fill(0), clusters: [], sectionKey: "default-outflow-1" });
      outflowCats.push({ label: "Vendor / Supplier Payments", values: new Array(numCols).fill(0), clusters: [], sectionKey: "default-outflow-2" });
      outflowCats.push({ label: "Other Operating Expense", values: new Array(numCols).fill(0), clusters: [], sectionKey: "default-outflow-3" });
    }

    // ── 5. Build row array ──
    // Helper: push a category and its cluster children as editable sub-rows
    const pushCategory = (
      result: RowData[],
      cat: CatEntry,
      section: "inflow" | "outflow",
      amountKey: "credits" | "debits",
    ) => {
      const hasChildren = cat.clusters.length > 0;
      // Parent row: auto-sums from children when children exist, otherwise directly editable
      result.push({
        label: cat.label,
        values: [...cat.values],
        editable: !hasChildren,
        type: "category",
        section,
        customId: cat.sectionKey,
        isCustomParent: hasChildren || undefined,
      });
      if (hasChildren) {
        const parentTotal = totalOf(cat.values);
        const weeklyKey = amountKey === "credits" ? "weekly_credits" : "weekly_debits";
        for (const cl of cat.clusters) {
          const clWeekly = cl[weeklyKey];
          let childValues: number[];
          if (clWeekly && clWeekly.length === numCols && clWeekly.some(v => v > 0)) {
            childValues = clWeekly.map(v => Math.round(v * 100) / 100);
          } else {
            const amount = cl[amountKey];
            const fraction = parentTotal > 0 ? amount / parentTotal : 0;
            childValues = cat.values.map((pw) => Math.round(pw * fraction * 100) / 100);
          }
          result.push({
            label: cl.representative,
            values: childValues,
            editable: true,
            type: "category",
            section,
            customId: `${cat.sectionKey}-cl-${cl.id}`,
            parentId: cat.sectionKey,
          });
        }
      }
    };

    const result: RowData[] = [];

    result.push({ label: "Beginning Cash Balance", values: new Array(numCols).fill(0), editable: true, type: "balance", section: "calc" });

    // ── Dimension-grouped mode ──
    const dimGroups = data?.dimension_groups;
    if (dimGroups && Object.keys(dimGroups).length > 0) {
      // Group dimension values into inflow / outflow
      interface DimEntry {
        dimValue: string;
        creditValues: number[];
        debitValues: number[];
        inflowCats: { name: string; values: number[] }[];
        outflowCats: { name: string; values: number[] }[];
      }
      const dimEntries: DimEntry[] = [];

      for (const [dimValue, dg] of Object.entries(dimGroups)) {
        const entry: DimEntry = {
          dimValue,
          creditValues: dg.credits,
          debitValues: dg.debits,
          inflowCats: [],
          outflowCats: [],
        };
        for (const [catName, catData] of Object.entries(dg.categories)) {
          const catCredits = catData.weekly_credits.reduce((a: number, b: number) => a + b, 0);
          const catDebits = catData.weekly_debits.reduce((a: number, b: number) => a + b, 0);
          if (catCredits > 0) entry.inflowCats.push({ name: catName, values: catData.weekly_credits });
          if (catDebits > 0) entry.outflowCats.push({ name: catName, values: catData.weekly_debits });
        }
        entry.inflowCats.sort((a, b) => totalOf(b.values) - totalOf(a.values));
        entry.outflowCats.sort((a, b) => totalOf(b.values) - totalOf(a.values));
        dimEntries.push(entry);
      }

      // Inflow: dimension values as parents, categories as children
      const inflowDims = dimEntries.filter(e => totalOf(e.creditValues) > 0);
      inflowDims.sort((a, b) => totalOf(b.creditValues) - totalOf(a.creditValues));
      result.push({ label: "CASH RECEIPTS", values: new Array(numCols).fill(0), editable: false, type: "total", section: "inflow" });
      for (const dim of inflowDims) {
        const parentKey = `dim-inflow-${dim.dimValue}`;
        const hasCats = dim.inflowCats.length > 0;
        result.push({
          label: dim.dimValue,
          values: [...dim.creditValues],
          editable: !hasCats,
          type: "category",
          section: "inflow",
          customId: parentKey,
          isCustomParent: hasCats || undefined,
        });
        for (const cat of dim.inflowCats) {
          result.push({
            label: cat.name,
            values: [...cat.values],
            editable: true,
            type: "category",
            section: "inflow",
            customId: `${parentKey}-cat-${cat.name}`,
            parentId: parentKey,
          });
        }
      }
      result.push({ label: "Total Cash Receipts", values: new Array(numCols).fill(0), editable: false, type: "total", section: "inflow" });

      // Outflow: dimension values as parents, categories as children
      const outflowDims = dimEntries.filter(e => totalOf(e.debitValues) > 0);
      outflowDims.sort((a, b) => totalOf(b.debitValues) - totalOf(a.debitValues));
      result.push({ label: "CASH DISBURSEMENTS", values: new Array(numCols).fill(0), editable: false, type: "total", section: "outflow" });
      for (const dim of outflowDims) {
        const parentKey = `dim-outflow-${dim.dimValue}`;
        const hasCats = dim.outflowCats.length > 0;
        result.push({
          label: dim.dimValue,
          values: [...dim.debitValues],
          editable: !hasCats,
          type: "category",
          section: "outflow",
          customId: parentKey,
          isCustomParent: hasCats || undefined,
        });
        for (const cat of dim.outflowCats) {
          result.push({
            label: cat.name,
            values: [...cat.values],
            editable: true,
            type: "category",
            section: "outflow",
            customId: `${parentKey}-cat-${cat.name}`,
            parentId: parentKey,
          });
        }
      }
      result.push({ label: "Total Cash Disbursements", values: new Array(numCols).fill(0), editable: false, type: "total", section: "outflow" });

    } else {
      // ── Flat category mode (original) ──
      result.push({ label: "CASH RECEIPTS", values: new Array(numCols).fill(0), editable: false, type: "total", section: "inflow" });
      for (const cat of inflowCats) pushCategory(result, cat, "inflow", "credits");
      result.push({ label: "Total Cash Receipts", values: new Array(numCols).fill(0), editable: false, type: "total", section: "inflow" });

      result.push({ label: "CASH DISBURSEMENTS", values: new Array(numCols).fill(0), editable: false, type: "total", section: "outflow" });
      for (const cat of outflowCats) pushCategory(result, cat, "outflow", "debits");
      result.push({ label: "Total Cash Disbursements", values: new Array(numCols).fill(0), editable: false, type: "total", section: "outflow" });
    }

    result.push({ label: "Net Cash Flow", values: new Array(numCols).fill(0), editable: false, type: "net", section: "calc" });
    result.push({ label: "Ending Cash Balance", values: new Array(numCols).fill(0), editable: false, type: "balance", section: "calc" });

    return result;
  }, []);

  /* ---------- Recalculate totals ---------- */

  const recalc = useCallback((draft: RowData[]): RowData[] => {
    const cols = draft[0]?.values.length || DEFAULT_PERIODS;
    const beginIdx = draft.findIndex((r) => r.label === "Beginning Cash Balance");
    const totalReceiptsIdx = draft.findIndex((r) => r.label === "Total Cash Receipts");
    const totalDisbIdx = draft.findIndex((r) => r.label === "Total Cash Disbursements");
    const netIdx = draft.findIndex((r) => r.label === "Net Cash Flow");
    const endIdx = draft.findIndex((r) => r.label === "Ending Cash Balance");
    const receiptsHeaderIdx = draft.findIndex((r) => r.label === "CASH RECEIPTS");
    const disbHeaderIdx = draft.findIndex((r) => r.label === "CASH DISBURSEMENTS");

    for (let w = 0; w < cols; w++) {
      // 1. Sum custom children → their parent rows (parent auto-totals)
      for (let i = 0; i < draft.length; i++) {
        if (draft[i].isCustomParent && draft[i].customId) {
          let childSum = 0;
          for (let j = 0; j < draft.length; j++) {
            if (draft[j].parentId === draft[i].customId) {
              childSum += draft[j].values[w];
            }
          }
          draft[i].values[w] = childSum;
        }
      }

      // 2. Sum inflow categories (skip child rows — already included via parents)
      let totalIn = 0;
      for (let i = receiptsHeaderIdx + 1; i < totalReceiptsIdx; i++) {
        if (draft[i].type === "category" && !draft[i].parentId) totalIn += draft[i].values[w];
      }
      if (totalReceiptsIdx >= 0) draft[totalReceiptsIdx].values[w] = totalIn;

      // 3. Sum outflow categories (skip child rows)
      let totalOut = 0;
      for (let i = disbHeaderIdx + 1; i < totalDisbIdx; i++) {
        if (draft[i].type === "category" && !draft[i].parentId) totalOut += draft[i].values[w];
      }
      if (totalDisbIdx >= 0) draft[totalDisbIdx].values[w] = totalOut;

      // 4. Net = Receipts - Disbursements
      const net = totalIn - totalOut;
      if (netIdx >= 0) draft[netIdx].values[w] = net;

      // 5. Beginning balance: Week 0 = user-entered; Week 1+ = previous ending
      if (w > 0 && beginIdx >= 0 && endIdx >= 0) {
        draft[beginIdx].values[w] = draft[endIdx].values[w - 1];
      }

      // 6. Ending = Beginning + Net
      if (endIdx >= 0 && beginIdx >= 0) {
        draft[endIdx].values[w] = draft[beginIdx].values[w] + net;
      }
    }

    return draft;
  }, []);

  /* ---------- Fetch: try saved model first, then build from classification ---------- */

  useEffect(() => {
    if (!userId) {
      setError("Please log in to view cash flow.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    const acctParams = selectedAccountIds.size > 0 ? Array.from(selectedAccountIds).map(id => `&account_ids=${encodeURIComponent(id)}`).join("") : "";
    const loadClassification = (period: string = "weekly", dimId: string = "") =>
      fetch(
        `${API_BASE_URL}/api/ledger/cash-flow?user_id=${encodeURIComponent(userId)}&period=${period}${acctParams}${startDate ? `&start_date=${encodeURIComponent(startDate)}` : ""}${dimId ? `&group_by_dimension=${encodeURIComponent(dimId)}` : ""}`,
        { headers: { ...getAuthHeaders() } }
      ).then((res) => {
        if (res.ok) return res.json().then((body: Record<string, unknown>) => {
          if (body?.data) {
            const d = body.data as Record<string, unknown>;
            const meta = d.metadata as Record<string, unknown> | undefined;
            if (meta) {
              if (Array.isArray(meta.period_labels)) {
                setApiPeriodLabels(meta.period_labels as string[]);
                setActualPeriodCount((meta.period_labels as string[]).length);
              }
              if (meta.first_date) { setApiFirstDate(meta.first_date as string); if (!startDate) setStartDate(meta.first_date as string); }
              if (meta.last_date) setApiLastDate(meta.last_date as string);
            }
            return new Response(JSON.stringify(d), { status: 200, headers: { "Content-Type": "application/json" } });
          }
          return new Response(null, { status: 404 });
        });
        return fetch(
          `${API_BASE_URL}/api/standardized/cash-flow?user_id=${encodeURIComponent(userId)}&_=${Date.now()}`,
          { headers: { ...getAuthHeaders() } }
        );
      });

    // 1. Try to load a previously saved model
    fetch(
      `${API_BASE_URL}/api/cash-flow/load?user_id=${encodeURIComponent(userId)}&_=${Date.now()}`,
      { headers: { ...getAuthHeaders() } }
    )
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null) // network error on load — fall through to classification
      .then((saved) => {
        if (saved?.rows?.length) {
          // Restore saved state
          setRows(recalc(saved.rows.map((r: RowData) => ({ ...r, values: [...r.values] }))));
          if (saved.startDate) setStartDate(saved.startDate);
          if (saved.timeFrame) setTimeFrame(saved.timeFrame);
          if (saved.minCashThreshold != null) setMinCashThreshold(saved.minCashThreshold);
          if (saved.saved_at) setLastSaved(saved.saved_at);
          if (typeof saved.actualPeriodCount === "number") setActualPeriodCount(saved.actualPeriodCount);
          if (typeof saved.forecastPeriodCount === "number") {
            setForecastPeriodCount(saved.forecastPeriodCount);
            setForecastHorizon(saved.forecastPeriodCount);
          }
          if (saved.defaultForecastMethod) setDefaultForecastMethod(saved.defaultForecastMethod);
          setDirty(false);
          return loadClassification(timeFrame, groupBy).then((r) => (r.ok ? r.json() : null)).then((d) => setClassificationData(d ?? null)).catch(() => {});
        }
        return loadClassification(timeFrame, groupBy)
          .then((res) => {
            if (res.status === 404) {
              setError("No standardized data yet. Run classification on Connect Data first.");
              return null;
            }
            if (!res.ok) return res.json().then((body) => { throw new Error(body?.error ?? "Failed to load."); });
            return res.json();
          })
          .then((data) => {
            setClassificationData(data ?? null);
            setRows(recalc([...buildModel(data)]));
          });
      })
      .catch((e) => {
        setClassificationData(null);
        setRows(recalc(buildModel(null)));
        setError(e.message ?? "Failed to load cash flow data.");
      })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, buildModel, recalc, timeFrame, groupBy, startDate]);

  /* ---------- Load saved forecast on mount ---------- */
  const savedForecastLoaded = useRef(false);
  useEffect(() => {
    if (!userId || rows.length === 0 || savedForecastLoaded.current) return;
    if (forecastPeriodCount > 0) { savedForecastLoaded.current = true; return; }
    savedForecastLoaded.current = true;

    fetch(`${API_BASE_URL}/api/forecast/saved?user_id=${encodeURIComponent(userId)}`, {
      headers: { ...getAuthHeaders() },
    })
      .then(res => res.ok ? res.json() : null)
      .catch(() => null)
      .then(data => {
        if (!data?.ok || !Array.isArray(data.rows) || data.rows.length === 0) return;
        setRows(recalc(data.rows.map((r: RowData) => ({ ...r, values: [...r.values] }))));
        if (typeof data.actual_periods === "number") setActualPeriodCount(data.actual_periods);
        if (typeof data.forecast_periods === "number") {
          setForecastPeriodCount(data.forecast_periods);
          setForecastHorizon(data.forecast_periods);
        }
        if (data.default_method) setDefaultForecastMethod(data.default_method);
        if (data.confidence_bands) setConfidenceBands(data.confidence_bands);
        if (data.forecast_metadata) setForecastMetadata(data.forecast_metadata);
        console.log("[Forecast] Loaded saved forecast:", { periods: data.forecast_periods, method: data.default_method, saved_at: data.saved_at });
      });
  }, [userId, rows.length, forecastPeriodCount]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- Cell edit handlers ---------- */

  const handleCellClick = (rowIdx: number, colIdx: number) => {
    if (!rows[rowIdx].editable) return;
    // Beginning balance: only col 0 is directly editable
    if (rows[rowIdx].label === "Beginning Cash Balance" && colIdx > 0) return;
    // Lock actual period cells (except beginning cash balance col 0)
    if (actualPeriodCount > 0 && forecastPeriodCount > 0 && colIdx < actualPeriodCount) {
      if (!(rows[rowIdx].label === "Beginning Cash Balance" && colIdx === 0)) return;
    }
    setEditingCell({ row: rowIdx, col: colIdx });
  };

  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingCell]);

  useEffect(() => {
    if (editingLabelIdx !== null && labelInputRef.current) {
      labelInputRef.current.focus();
      labelInputRef.current.select();
    }
  }, [editingLabelIdx]);

  // Keyboard shortcuts: Ctrl+Z (undo), Ctrl+Y / Ctrl+Shift+Z (redo), Ctrl+S (save)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); redo(); }
      else if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); handleSave(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  // Listen for agent-triggered model updates (via WebSocket -> DOM event)
  // Agent changes go to a DRAFT — load draft and mark dirty (unsaved)
  useEffect(() => {
    const handleAgentUpdate = () => {
      fetch(
        `${API_BASE_URL}/api/cash-flow/load-draft?user_id=${encodeURIComponent(userId)}&_=${Date.now()}`,
        { headers: { ...getAuthHeaders() } }
      )
        .then((res) => (res.ok ? res.json() : null))
        .then((draft) => {
          if (draft?.rows?.length) {
            setRows(recalc(draft.rows.map((r: RowData) => ({ ...r, values: [...r.values] }))));
            if (draft.startDate) setStartDate(draft.startDate);
            if (draft.timeFrame) setTimeFrame(draft.timeFrame);
            if (draft.minCashThreshold != null) setMinCashThreshold(draft.minCashThreshold);
            // Agent changes are UNSAVED — user must click Save to persist
            setDirty(true);
          }
        })
        .catch(() => {/* silent */});
    };
    window.addEventListener("cf_model_updated", handleAgentUpdate);
    return () => window.removeEventListener("cf_model_updated", handleAgentUpdate);
  }, [userId, recalc]);

  // ── Insights: load on mount + live updates from agent ──
  const fetchInsights = useCallback(() => {
    fetch(
      `${API_BASE_URL}/api/cash-flow/insights?user_id=${encodeURIComponent(userId)}&_=${Date.now()}`,
      { headers: { ...getAuthHeaders() } }
    )
      .then((res) => (res.ok ? res.json() : []))
      .then((data: InsightCard[]) => {
        if (Array.isArray(data)) setInsights(data);
      })
      .catch(() => {/* silent */});
  }, [userId]);

  useEffect(() => { fetchInsights(); }, [fetchInsights]);

  useEffect(() => {
    const handleInsightUpdate = () => {
      fetchInsights();
      setShowInsights(true);
    };
    window.addEventListener("cf_insight_published", handleInsightUpdate);
    return () => window.removeEventListener("cf_insight_published", handleInsightUpdate);
  }, [fetchInsights]);

  // Refresh forecast algorithms when agent publishes a new one
  useEffect(() => {
    const handleAlgoUpdate = () => {
      fetch(`${API_BASE_URL}/api/forecast/algorithms?user_id=${encodeURIComponent(userId)}`, { headers: { ...getAuthHeaders() } })
        .then(r => r.ok ? r.json() : [])
        .then(d => {
          if (Array.isArray(d) && d.length > 0) {
            const builtInIds = new Set(DEFAULT_FORECAST_ALGORITHMS.map(a => a.id));
            const custom = d.filter((a: ForecastAlgorithm) => !builtInIds.has(a.id));
            setForecastAlgorithms([...DEFAULT_FORECAST_ALGORITHMS, ...custom]);
          }
        })
        .catch(() => {});
    };
    window.addEventListener("cf_forecast_algo_published", handleAlgoUpdate);
    return () => window.removeEventListener("cf_forecast_algo_published", handleAlgoUpdate);
  }, [userId]);

  const dismissInsight = useCallback((insightId: string) => {
    fetch(
      `${API_BASE_URL}/api/cash-flow/insights?user_id=${encodeURIComponent(userId)}&id=${encodeURIComponent(insightId)}`,
      { method: "DELETE", headers: { ...getAuthHeaders() } }
    )
      .then((res) => {
        if (res.ok) {
          setInsights((prev) => prev.filter((i) => i.id !== insightId));
          if (expandedInsight === insightId) setExpandedInsight(null);
        }
      })
      .catch(() => {/* silent */});
  }, [userId, expandedInsight]);

  const commitEdit = (value: string) => {
    if (!editingCell || commitGuardRef.current) return;
    commitGuardRef.current = true;
    const { row: editRow, col: editCol } = editingCell;
    const num = parseFloat(value.replace(/,/g, "")) || 0;
    pushUndo(rows);
    setRows((prev) => {
      const next = prev.map((r) => ({ ...r, values: [...r.values] }));
      if (next[editRow].label === "Beginning Cash Balance") {
        next[editRow].values[0] = Math.round(num * 100) / 100;
      } else {
        next[editRow].values = setDisplayValue(
          next[editRow].values,
          timeFrame,
          editCol,
          num
        );
      }
      return recalc(next);
    });
    setEditingCell(null);
    setDirty(true);
    requestAnimationFrame(() => { commitGuardRef.current = false; });
  };

  const commitLabelEdit = (rowIdx: number, newLabel: string) => {
    const trimmed = newLabel.trim();
    if (trimmed && trimmed !== rows[rowIdx]?.label) {
      pushUndo(rows);
      setRows((prev) => {
        const next = [...prev];
        next[rowIdx] = { ...next[rowIdx], label: trimmed };
        return next;
      });
      setDirty(true);
    }
    setEditingLabelIdx(null);
  };

  const addLineItem = (section: "inflow" | "outflow") => {
    setEditingCell(null);
    setEditingLabelIdx(null);
    const targetLabel = section === "inflow" ? "Total Cash Receipts" : "Total Cash Disbursements";
    const idx = rows.findIndex((r) => r.label === targetLabel);
    if (idx < 0) return;
    const customId = `custom-${section}-${Date.now()}`;
    const colCount = rows[0]?.values.length || DEFAULT_PERIODS;
    const newRow: RowData = {
      label: "New line item",
      values: new Array(colCount).fill(0),
      editable: false,          // Parent is NOT editable — auto-sums from children
      type: "category",
      section,
      customId,
      isCustomParent: true,
    };
    setRows((prev) => {
      const next = prev.map((r) => ({ ...r, values: [...r.values] }));
      next.splice(idx, 0, newRow);
      return recalc(next);
    });
    setDirty(true);
    // Auto-expand the new parent and open label editor
    setTimeout(() => {
      setEditingLabelIdx(idx);
      setExpandedCategories(prev => { const next = new Set(prev); next.add(`custom-${customId}`); return next; });
    }, 0);
  };

  const addSubItem = (parentCustomId: string, section: "inflow" | "outflow") => {
    setEditingCell(null);
    setEditingLabelIdx(null);
    // Find insertion point: after parent's last child, or right after the parent
    const parentIdx = rows.findIndex((r) => r.customId === parentCustomId);
    if (parentIdx < 0) return;
    let insertIdx = parentIdx + 1;
    while (insertIdx < rows.length && rows[insertIdx].parentId === parentCustomId) {
      insertIdx++;
    }
    const customId = `child-${parentCustomId}-${Date.now()}`;
    const colCount = rows[0]?.values.length || DEFAULT_PERIODS;
    const newChild: RowData = {
      label: "New sub-item",
      values: new Array(colCount).fill(0),
      editable: true,
      type: "category",
      section,
      customId,
      parentId: parentCustomId,
    };
    setRows((prev) => {
      const next = prev.map((r) => ({ ...r, values: [...r.values] }));
      next.splice(insertIdx, 0, newChild);
      return recalc(next);
    });
    setDirty(true);
    setTimeout(() => setEditingLabelIdx(insertIdx), 0);
  };

  const deleteLineItem = (rowIdx: number) => {
    setEditingCell(null);
    setEditingLabelIdx(null);
    setRows((prev) => {
      const row = prev[rowIdx];
      if (!row?.customId) return prev; // only delete user-added rows
      // If deleting a parent, also remove all its children
      const parentId = row.isCustomParent ? row.customId : null;
      const next = prev
        .filter((r, i) => {
          if (i === rowIdx) return false;
          if (parentId && r.parentId === parentId) return false;
          return true;
        })
        .map((r) => ({ ...r, values: [...r.values] }));
      return recalc(next);
    });
    setDirty(true);
  };

  /* ---------- Save / Load ---------- */

  const fetchVersions = useCallback(() => {
    fetch(
      `${API_BASE_URL}/api/cash-flow/versions?user_id=${encodeURIComponent(userId)}&_=${Date.now()}`,
      { headers: { ...getAuthHeaders() } }
    )
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => { if (Array.isArray(data)) setVersions(data); })
      .catch(() => {/* silent */});
  }, [userId]);

  const handleSave = useCallback(() => {
    if (saving || !userId) return;
    setSaving(true);
    fetch(
      `${API_BASE_URL}/api/cash-flow/save?user_id=${encodeURIComponent(userId)}`,
      {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ rows, startDate, timeFrame, minCashThreshold, numPeriods, actualPeriodCount, forecastPeriodCount, defaultForecastMethod }),
      }
    )
      .then((res) => res.json())
      .then((data) => {
        if (data.saved_at) {
          setLastSaved(data.saved_at);
          setDirty(false);
          fetchVersions(); // refresh versions list after save
        }
      })
      .catch(() => {/* silent */})
      .finally(() => setSaving(false));
  }, [saving, userId, rows, startDate, timeFrame, minCashThreshold, fetchVersions, numPeriods, actualPeriodCount, forecastPeriodCount, defaultForecastMethod]);

  const handleRollback = useCallback((versionId: string) => {
    if (!userId) return;
    fetch(
      `${API_BASE_URL}/api/cash-flow/rollback?user_id=${encodeURIComponent(userId)}&version_id=${encodeURIComponent(versionId)}`,
      { method: "POST", headers: { ...getAuthHeaders() } }
    )
      .then((res) => {
        if (res.ok) {
          // Reload the restored model
          return fetch(
            `${API_BASE_URL}/api/cash-flow/load?user_id=${encodeURIComponent(userId)}&_=${Date.now()}`,
            { headers: { ...getAuthHeaders() } }
          );
        }
        return null;
      })
      .then((res) => res?.json())
      .then((saved) => {
        if (saved?.rows?.length) {
          setRows(recalc(saved.rows.map((r: RowData) => ({ ...r, values: [...r.values] }))));
          if (saved.startDate) setStartDate(saved.startDate);
          if (saved.timeFrame) setTimeFrame(saved.timeFrame);
          if (saved.minCashThreshold != null) setMinCashThreshold(saved.minCashThreshold);
          if (saved.saved_at) setLastSaved(saved.saved_at);
          if (typeof saved.actualPeriodCount === "number") setActualPeriodCount(saved.actualPeriodCount);
          if (typeof saved.forecastPeriodCount === "number") {
            setForecastPeriodCount(saved.forecastPeriodCount);
            setForecastHorizon(saved.forecastPeriodCount);
          }
          if (saved.defaultForecastMethod) setDefaultForecastMethod(saved.defaultForecastMethod);
          setDirty(false);
          setShowVersions(false);
          fetchVersions();
        }
      })
      .catch(() => {/* silent */});
  }, [userId, recalc, fetchVersions]);

  // Fetch versions on mount
  useEffect(() => { fetchVersions(); }, [fetchVersions]);

  // Close versions dropdown on click-outside
  useEffect(() => {
    if (!showVersions) return;
    const handleClick = (e: MouseEvent) => {
      if (versionsDropdownRef.current && !versionsDropdownRef.current.contains(e.target as Node)) {
        setShowVersions(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showVersions]);

  /* ---------- AI CFO Insights ---------- */

  const fetchCfoInsights = useCallback((forceRefresh = false) => {
    if (!userId) return;
    setCfoLoading(true);
    const qs = `user_id=${encodeURIComponent(userId)}${forceRefresh ? "&refresh=true" : ""}`;
    fetch(`${API_BASE_URL}/api/cfo/insights?${qs}`, {
      headers: { ...getAuthHeaders() },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.insights) {
          setCfoInsights(data.insights);
        }
      })
      .catch(() => {})
      .finally(() => setCfoLoading(false));
  }, [userId]);

  useEffect(() => {
    if (rows.length > 0) {
      fetchCfoInsights(false);
    }
  }, [rows.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- Forecast generation ---------- */

  const handleGenerateForecast = useCallback((fPeriods?: number, fMethod?: string) => {
    const fp = fPeriods ?? forecastHorizon;
    const fm = fMethod ?? defaultForecastMethod;
    if (!userId || fp < 1) return;
    setForecastGenerating(true);
    setForecastMessage(null);

    const ap = actualPeriodCount > 0 ? actualPeriodCount : (apiPeriodLabels.length || DEFAULT_PERIODS);
    const cleanRows = rows.map(r => ({
      ...r,
      values: r.values.slice(0, ap),
    }));

    // Build overrides with algo params if any non-default params set
    const overridesWithParams = { ...explicitRowOverrides };
    const activeParams = Object.keys(algoParams).length > 0 ? algoParams : undefined;

    console.log("[Forecast] Generating:", { actual_periods: ap, forecast_periods: fp, method: fm, rowCount: cleanRows.length, params: activeParams });

    fetch(`${API_BASE_URL}/api/forecast/generate?user_id=${encodeURIComponent(userId)}`, {
      method: "POST",
      headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        rows: cleanRows,
        actual_periods: ap,
        forecast_periods: fp,
        default_method: fm,
        overrides: overridesWithParams,
        params: activeParams,
      }),
    })
      .then(res => {
        if (!res.ok) {
          return res.text().then(t => {
            let msg = `Server error (${res.status})`;
            try { msg = JSON.parse(t).error || msg; } catch { msg = t || msg; }
            throw new Error(msg);
          });
        }
        return res.json();
      })
      .then(data => {
        if (data.ok && Array.isArray(data.rows) && data.rows.length > 0) {
          console.log("[Forecast] Success:", { rows: data.rows.length, actual: data.actual_periods, forecast: data.forecast_periods, confidence: !!data.confidence_bands });
          pushUndo(rows);
          setRows(recalc(data.rows.map((r: RowData) => ({ ...r, values: [...r.values] }))));
          setActualPeriodCount(data.actual_periods);
          setForecastPeriodCount(data.forecast_periods);
          setForecastHorizon(data.forecast_periods);
          setDefaultForecastMethod(fm);
          setConfidenceBands(data.confidence_bands || null);
          setForecastMetadata(data.forecast_metadata || null);
          setDirty(true);
          const algoName = forecastAlgorithms.find(a => a.id === fm)?.name ?? fm;
          setForecastMessage({ type: "success", text: `Forecast generated: ${data.forecast_periods} ${timeFrame === "monthly" ? "months" : "periods"} using ${algoName}` });
        } else {
          const errMsg = data.error || data.detail || "Unknown error — no rows returned";
          console.error("[Forecast] Failed:", errMsg, data);
          setForecastMessage({ type: "error", text: errMsg });
        }
      })
      .catch(e => {
        console.error("[Forecast] Error:", e);
        setForecastMessage({ type: "error", text: `Forecast failed: ${e.message}` });
      })
      .finally(() => setForecastGenerating(false));
  }, [userId, forecastHorizon, defaultForecastMethod, actualPeriodCount, apiPeriodLabels.length, rows, recalc, pushUndo, timeFrame, forecastAlgorithms, explicitRowOverrides, algoParams]);

  const handleClearForecast = useCallback(() => {
    if (actualPeriodCount <= 0) return;
    pushUndo(rows);
    setRows(prev => {
      const next = prev.map(r => ({
        ...r,
        values: r.values.slice(0, actualPeriodCount),
        forecastMethod: undefined,
        forecastParams: undefined,
        formula: undefined,
      }));
      return recalc(next);
    });
    setForecastPeriodCount(0);
    setForecastHorizon(0);
    setActualPeriodCount(0);
    setForecastMessage(null);
    setExplicitRowOverrides({});
    setConfidenceBands(null);
    setForecastMetadata(null);
    setAiInsights(null);
    setAlgoParams({});
    setDirty(true);
    // Delete saved forecast from backend
    if (userId) {
      fetch(`${API_BASE_URL}/api/forecast/saved?user_id=${encodeURIComponent(userId)}`, {
        method: "DELETE", headers: { ...getAuthHeaders() },
      }).catch(() => {});
    }
  }, [actualPeriodCount, rows, recalc, pushUndo, userId]);

  /* ---------- Export to CSV ---------- */

  const exportCSV = () => {
    const headers = ["Category", ...periodLabels];
    const csvRows = [headers.join(",")];
    for (const r of rows) {
      const agg: "sum" | "first" | "last" =
        r.label === "Beginning Cash Balance" ? "first" :
        r.label === "Ending Cash Balance" ? "last" : "sum";
      const displayVals = getDisplayValues(r.values, timeFrame, agg);
      // Indent child rows in CSV for readability
      const label = r.parentId ? `  ${r.label}` : r.label;
      csvRows.push([`"${label}"`, ...displayVals.map((v) => v.toFixed(2))].join(","));
    }
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cash_flow_${timeFrame}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ---------- Load from classification data ---------- */

  const handleLoadClassificationData = () => {
    const confirmed = window.confirm(
      "This will replace your current cash flow sheet with the latest classification data.\n\n" +
      "Your current sheet will be marked as unsaved — click Save to keep it, or Rollback to restore a previous version.\n\n" +
      "Continue?"
    );
    if (!confirmed) return;
    setLoading(true);

    const accountParam = selectedAccountIds.size > 0 ? Array.from(selectedAccountIds).map(id => `&account_ids=${encodeURIComponent(id)}`).join("") : "";
    const dimParam = groupBy ? `&group_by_dimension=${encodeURIComponent(groupBy)}` : "";

    fetch(
      `${API_BASE_URL}/api/ledger/cash-flow?user_id=${encodeURIComponent(userId)}${accountParam}&period=${timeFrame}${startDate ? `&start_date=${encodeURIComponent(startDate)}` : ""}${dimParam}`,
      { headers: { ...getAuthHeaders() } }
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((result) => {
        if (result?.data) {
          const meta = result.data.metadata;
          if (meta) {
            if (Array.isArray(meta.period_labels)) setApiPeriodLabels(meta.period_labels);
            if (meta.first_date) { setApiFirstDate(meta.first_date); if (!startDate) setStartDate(meta.first_date); }
            if (meta.last_date) setApiLastDate(meta.last_date);
          }
          setClassificationData(result.data);
          setRows(recalc([...buildModel(result.data)]));
          setDirty(true);
          return;
        }
        return fetch(
          `${API_BASE_URL}/api/standardized/cash-flow?user_id=${encodeURIComponent(userId)}&_=${Date.now()}`,
          { headers: { ...getAuthHeaders() } }
        )
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (data) {
              setClassificationData(data);
              setRows(recalc([...buildModel(data)]));
              setDirty(true);
            } else {
              setError("No classification data found. Run classification on Connect Data first.");
            }
          });
      })
      .catch(() => {
        setError("Failed to load classification data.");
      })
      .finally(() => setLoading(false));
  };

  /* ---------- Sync frozen ↔ scroll row heights ---------- */
  useLayoutEffect(() => {
    const frozen = frozenBodyRef.current;
    const scroll = scrollBodyRef.current;
    if (!frozen || !scroll) return;

    const syncHeights = () => {
      const frozenRows = frozen.querySelectorAll<HTMLTableRowElement>(":scope > tr");
      const scrollRows = scroll.querySelectorAll<HTMLTableRowElement>(":scope > tr");
      const len = Math.min(frozenRows.length, scrollRows.length);
      for (let i = 0; i < len; i++) {
        scrollRows[i].style.height = "";
        frozenRows[i].style.height = "";
      }
      for (let i = 0; i < len; i++) {
        const h = Math.max(frozenRows[i].offsetHeight, scrollRows[i].offsetHeight);
        frozenRows[i].style.height = `${h}px`;
        scrollRows[i].style.height = `${h}px`;
      }
    };

    syncHeights();

    const observer = new ResizeObserver(syncHeights);
    observer.observe(frozen);
    return () => observer.disconnect();
  });

  /* ---------- Render ---------- */

  if (loading) {
    return (
      <div style={{ padding: "48px 24px", maxWidth: 1000, margin: "0 auto", textAlign: "center", color: colors.textSecondary }}>
        <div
          style={{
            width: 40,
            height: 40,
            border: `3px solid ${colors.border}`,
            borderTopColor: "var(--primary)",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
            margin: "0 auto 1rem",
          }}
        />
        Loading cash flow model…
      </div>
    );
  }

  const sectionHeaderStyle: React.CSSProperties = {
    padding: "0.625rem 0.75rem",
    fontWeight: 800,
    fontSize: "0.7rem",
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: colors.textSecondary,
    background: colors.headerBg,
    borderBottom: `1px solid ${colors.border}`,
    borderTop: `1px solid ${colors.border}`,
  };

  // totalRowStyle inlined into both panels' row rendering

  return (
    <div style={{ padding: "48px 24px 60px", maxWidth: 1400, margin: "0 auto" }}>
      <style>{`
        @keyframes pulse-apply {
          0%, 100% { box-shadow: 0 2px 8px rgba(99,102,241,0.35); }
          50% { box-shadow: 0 2px 16px rgba(99,102,241,0.6); }
        }
      `}</style>
      <header style={{ marginBottom: "1.5rem" }}>
        <Link
          to="/classification-results"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            color: colors.textSecondary,
            fontSize: "0.875rem",
            fontWeight: 500,
            textDecoration: "none",
            marginBottom: "1rem",
          }}
        >
          <FiArrowLeft /> Back to Classification Results
        </Link>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <h1
              style={{
                color: colors.text,
                fontSize: "1.75rem",
                fontWeight: 700,
                marginBottom: "0.25rem",
                fontFamily: "'Inter', sans-serif",
                letterSpacing: "-0.5px",
              }}
            >
              Cash Flow
            </h1>
            <p style={{ color: colors.textSecondary, fontSize: "0.9rem", margin: 0 }}>
              {apiFirstDate && apiLastDate
                ? `${new Date(apiFirstDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} – ${new Date(apiLastDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · ${numPeriods} ${timeFrame === "monthly" ? "months" : timeFrame === "biweekly" ? "bi-weekly periods" : "weeks"}`
                : "Editable cash flow model. Click any category cell to edit. Totals update automatically."}
            </p>
            {classificationData && classificationData.metadata?.has_amounts === false && (
              <p style={{ color: colors.textSecondary, fontSize: "0.8125rem", margin: "0.5rem 0 0", fontStyle: "italic" }}>
                Amounts not available; run classification with an amount column to see values.
              </p>
            )}
            {classificationData?.metadata?.has_amounts === true && !apiFirstDate && (
              <div
                style={{
                  marginTop: "0.75rem",
                  padding: "0.75rem 1rem",
                  background: theme === "dark" ? "rgba(251, 191, 36, 0.12)" : "rgba(251, 191, 36, 0.15)",
                  border: `1px solid ${theme === "dark" ? "rgba(251, 191, 36, 0.4)" : "rgba(251, 191, 36, 0.5)"}`,
                  borderRadius: 8,
                  fontSize: "0.8125rem",
                  color: theme === "dark" ? "#fcd34d" : "#b45309",
                }}
              >
                <strong>No date-aware breakdown yet?</strong> Run Normalize & Classify on the Connect Data page, then click "Load Data" here to refresh.
              </div>
            )}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "1rem" }}>
            {ledgerAccounts.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: colors.textSecondary }}>Accounts</span>
                  {(() => {
                    const sameAsApplied = selectedAccountIds.size === appliedAccountIds.size &&
                      [...selectedAccountIds].every(id => appliedAccountIds.has(id));
                    const hasChanges = !sameAsApplied;
                    return (
                      <button
                        type="button"
                        onClick={() => {
                          setLoading(true);
                          setError(null);
                          const acctP = selectedAccountIds.size > 0 ? Array.from(selectedAccountIds).map(id => `&account_ids=${encodeURIComponent(id)}`).join("") : "";
                          const dimP = groupBy ? `&group_by_dimension=${encodeURIComponent(groupBy)}` : "";
                          fetch(`${API_BASE_URL}/api/ledger/cash-flow?user_id=${encodeURIComponent(userId)}${acctP}&period=${timeFrame}${startDate ? `&start_date=${encodeURIComponent(startDate)}` : ""}${dimP}`, { headers: { ...getAuthHeaders() } })
                            .then(res => res.ok ? res.json() : null)
                            .then(result => {
                              if (result?.data) {
                                const meta = result.data.metadata;
                                if (meta) {
                                  if (Array.isArray(meta.period_labels)) setApiPeriodLabels(meta.period_labels);
                                  if (meta.first_date) { setApiFirstDate(meta.first_date); if (!startDate) setStartDate(meta.first_date); }
                                  if (meta.last_date) setApiLastDate(meta.last_date);
                                }
                                setClassificationData(result.data);
                                setRows(recalc([...buildModel(result.data)]));
                                setDirty(true);
                                setAppliedAccountIds(new Set(selectedAccountIds));
                              }
                            })
                            .catch(() => setError("Failed to apply account filter."))
                            .finally(() => setLoading(false));
                        }}
                        style={{
                          padding: hasChanges ? "0.3rem 0.75rem" : "0.25rem 0.625rem",
                          fontSize: "0.7rem", fontWeight: 600,
                          border: hasChanges ? "none" : `1px solid ${colors.inflowColor}`,
                          borderRadius: 5,
                          background: hasChanges ? "linear-gradient(135deg, #6366f1 0%, #3b82f6 100%)" : "transparent",
                          color: hasChanges ? "#fff" : colors.inflowColor,
                          cursor: "pointer",
                          boxShadow: hasChanges ? "0 2px 8px rgba(99,102,241,0.35)" : "none",
                          transition: "all 0.2s ease",
                          animation: hasChanges ? "pulse-apply 1.5s ease-in-out infinite" : "none",
                        }}
                      >
                        {hasChanges ? "Apply Changes" : "Apply"}
                      </button>
                    );
                  })()}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem 0.75rem" }}>
                  {ledgerAccounts.map(a => {
                    const checked = selectedAccountIds.size === 0 || selectedAccountIds.has(a.id);
                    return (
                      <div
                        key={a.id}
                        style={{
                          display: "flex", alignItems: "center", gap: "0.3rem",
                          fontSize: "0.75rem", color: checked ? colors.text : colors.textSecondary,
                          opacity: checked ? 1 : 0.5,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setSelectedAccountIds(prev => {
                              const next = new Set(prev);
                              if (prev.size === 0) {
                                ledgerAccounts.forEach(acc => next.add(acc.id));
                                next.delete(a.id);
                              } else if (next.has(a.id)) {
                                next.delete(a.id);
                                if (next.size === 0) return new Set();
                              } else {
                                next.add(a.id);
                                if (next.size === ledgerAccounts.length) return new Set();
                              }
                              return next;
                            });
                          }}
                          style={{ accentColor: colors.inflowColor, width: 13, height: 13, cursor: "pointer" }}
                        />
                        <span style={{ cursor: "pointer" }} onClick={() => {
                          setSelectedAccountIds(prev => {
                            const next = new Set(prev);
                            if (prev.size === 0) { ledgerAccounts.forEach(acc => next.add(acc.id)); next.delete(a.id); }
                            else if (next.has(a.id)) { next.delete(a.id); if (next.size === 0) return new Set(); }
                            else { next.add(a.id); if (next.size === ledgerAccounts.length) return new Set(); }
                            return next;
                          });
                        }}>{a.display_name}</span>
                        <span style={{ color: colors.textSecondary, fontSize: "0.6rem" }}>({a.txn_count})</span>
                        <button
                          type="button"
                          title={`Delete ${a.display_name} and its ${a.txn_count} transactions`}
                          onClick={() => {
                            if (!window.confirm(`Delete account "${a.display_name}" and all ${a.txn_count} transactions?\n\nThis cannot be undone.`)) return;
                            fetch(`${API_BASE_URL}/api/ledger/accounts/${encodeURIComponent(a.id)}?user_id=${encodeURIComponent(userId)}`, {
                              method: "DELETE", headers: { ...getAuthHeaders() },
                            })
                              .then(r => r.ok ? r.json() : Promise.reject())
                              .then(() => {
                                setLedgerAccounts(prev => prev.filter(x => x.id !== a.id));
                                setSelectedAccountIds(prev => { const next = new Set(prev); next.delete(a.id); return next; });
                              })
                              .catch(() => setError(`Failed to delete account ${a.display_name}`));
                          }}
                          style={{
                            padding: "0.1rem", border: "none", background: "none",
                            cursor: "pointer", color: colors.textSecondary, display: "flex",
                            alignItems: "center", opacity: 0.4, transition: "opacity 0.15s",
                          }}
                          onMouseEnter={e => { (e.currentTarget).style.opacity = "1"; (e.currentTarget).style.color = colors.outflowColor; }}
                          onMouseLeave={e => { (e.currentTarget).style.opacity = "0.4"; (e.currentTarget).style.color = colors.textSecondary; }}
                        >
                          <FiTrash2 size={11} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {dimensionDefs.length > 0 && (
              <div ref={groupByRef} style={{ display: "flex", alignItems: "center", gap: "0.5rem", position: "relative" }}>
                <label style={{ fontSize: "0.8125rem", fontWeight: 600, color: colors.textSecondary }}>Group by</label>
                <button
                  type="button"
                  onClick={() => setGroupByOpen(p => !p)}
                  style={{
                    display: "flex", alignItems: "center", gap: "0.375rem",
                    padding: "0.375rem 0.625rem", fontSize: "0.8125rem",
                    border: `1px solid ${colors.border}`, borderRadius: 6,
                    background: colors.cardBg, color: colors.text,
                    cursor: "pointer", minWidth: 140, justifyContent: "space-between",
                  }}
                >
                  <span>{groupBy ? dimensionDefs.find(d => d.id === groupBy)?.name ? `By ${dimensionDefs.find(d => d.id === groupBy)!.name}` : "Flat Categories" : "Flat Categories"}</span>
                  <FiChevronDown size={14} style={{ opacity: 0.6, transform: groupByOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
                </button>
                {groupByOpen && (
                  <div style={{
                    position: "absolute", top: "100%", left: 0, marginTop: 4,
                    minWidth: 220, maxHeight: 320, overflowY: "auto",
                    background: colors.cardBg, border: `1px solid ${colors.border}`,
                    borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
                    zIndex: 100, padding: "0.375rem 0",
                  }}>
                    <div
                      onClick={() => { setGroupBy(""); setGroupByOpen(false); }}
                      style={{
                        padding: "0.5rem 0.75rem", fontSize: "0.8125rem", cursor: "pointer",
                        fontWeight: groupBy === "" ? 700 : 400,
                        color: groupBy === "" ? colors.inflowColor : colors.text,
                        background: groupBy === "" ? (theme === "dark" ? "rgba(99,102,241,0.1)" : "rgba(99,102,241,0.06)") : "transparent",
                        transition: "background 0.1s",
                      }}
                      onMouseEnter={e => { if (groupBy !== "") (e.currentTarget).style.background = theme === "dark" ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)"; }}
                      onMouseLeave={e => { if (groupBy !== "") (e.currentTarget).style.background = "transparent"; }}
                    >
                      Flat Categories
                    </div>
                    {(() => {
                      const levels = Array.from(new Set(dimensionDefs.map(d => d.level))).sort();
                      return levels.map(level => {
                        const dimsAtLevel = dimensionDefs.filter(d => d.level === level);
                        return (
                          <div key={level}>
                            {levels.length > 1 && (
                              <div style={{
                                padding: "0.375rem 0.75rem", fontSize: "0.675rem",
                                fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em",
                                color: colors.textSecondary, opacity: 0.7,
                                borderTop: `1px solid ${colors.border}`, marginTop: "0.25rem",
                              }}>
                                Level {level}
                              </div>
                            )}
                            {dimsAtLevel.map(d => (
                              <div
                                key={d.id}
                                onClick={() => { setGroupBy(d.id); setGroupByOpen(false); }}
                                style={{
                                  padding: "0.5rem 0.75rem",
                                  paddingLeft: levels.length > 1 ? `${0.75 + level * 0.75}rem` : "0.75rem",
                                  fontSize: "0.8125rem", cursor: "pointer",
                                  fontWeight: groupBy === d.id ? 700 : 400,
                                  color: groupBy === d.id ? colors.inflowColor : colors.text,
                                  background: groupBy === d.id ? (theme === "dark" ? "rgba(99,102,241,0.1)" : "rgba(99,102,241,0.06)") : "transparent",
                                  display: "flex", alignItems: "center", gap: "0.4rem",
                                  transition: "background 0.1s",
                                }}
                                onMouseEnter={e => { if (groupBy !== d.id) (e.currentTarget).style.background = theme === "dark" ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)"; }}
                                onMouseLeave={e => { if (groupBy !== d.id) (e.currentTarget).style.background = groupBy === d.id ? (theme === "dark" ? "rgba(99,102,241,0.1)" : "rgba(99,102,241,0.06)") : "transparent"; }}
                              >
                                {levels.length > 1 && <span style={{ opacity: 0.4, fontSize: "0.7rem" }}>&#x2514;</span>}
                                By {d.name}
                              </div>
                            ))}
                          </div>
                        );
                      });
                    })()}
                  </div>
                )}
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <label htmlFor="cf-timeframe" style={{ fontSize: "0.8125rem", fontWeight: 600, color: colors.textSecondary }}>Period</label>
              <select
                id="cf-timeframe"
                value={timeFrame}
                onChange={(e) => setTimeFrame(e.target.value as "weekly" | "biweekly" | "monthly")}
                style={{
                  padding: "0.375rem 0.5rem",
                  fontSize: "0.8125rem",
                  border: `1px solid ${colors.border}`,
                  borderRadius: 6,
                  background: colors.cardBg,
                  color: colors.text,
                  fontFamily: "'Inter', sans-serif",
                  minWidth: 120,
                }}
              >
                <option value="weekly">Weekly</option>
                <option value="biweekly">Bi-weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <label htmlFor="cf-start-date" style={{ fontSize: "0.8125rem", fontWeight: 600, color: colors.textSecondary }}>Week Start</label>
              <input
                type="date"
                id="cf-start-date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={{
                  padding: "0.375rem 0.5rem",
                  fontSize: "0.8125rem",
                  border: `1px solid ${colors.border}`,
                  borderRadius: 6,
                  background: colors.cardBg,
                  color: colors.text,
                  fontFamily: "'Inter', sans-serif",
                  minWidth: 130,
                }}
              />
              {startDate && apiFirstDate && startDate !== apiFirstDate && (
                <button
                  onClick={() => setStartDate(apiFirstDate)}
                  style={{
                    padding: "0.25rem 0.5rem",
                    fontSize: "0.75rem",
                    border: `1px solid ${colors.border}`,
                    borderRadius: 6,
                    background: "transparent",
                    color: colors.textSecondary,
                    cursor: "pointer",
                    fontFamily: "'Inter', sans-serif",
                  }}
                  title="Reset to first transaction date"
                >
                  Reset
                </button>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <button
              onClick={handleLoadClassificationData}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.375rem",
                padding: "0.5rem 0.875rem",
                fontSize: "0.8125rem",
                fontWeight: 600,
                color: "#fff",
                background: "#7c3aed",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
                fontFamily: "'Inter', sans-serif",
                transition: "all 0.2s",
              }}
              title="Load the latest classification results into the cash flow sheet"
            >
              <FiDatabase size={14} /> Load Data
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.375rem",
                padding: "0.5rem 0.875rem",
                fontSize: "0.8125rem",
                fontWeight: 600,
                color: dirty ? "#fff" : colors.textSecondary,
                background: dirty ? "#2563eb" : "transparent",
                border: dirty ? "none" : `1px solid ${colors.border}`,
                borderRadius: 8,
                cursor: saving ? "wait" : "pointer",
                fontFamily: "'Inter', sans-serif",
                opacity: saving ? 0.6 : 1,
                transition: "all 0.2s",
              }}
            >
              <FiSave size={14} /> {saving ? "Saving…" : dirty ? "Save" : "Saved"}
            </button>
            {/* Rollback dropdown */}
            <div ref={versionsDropdownRef} style={{ position: "relative" }}>
              <button
                onClick={() => { setShowVersions((p) => !p); if (!showVersions) fetchVersions(); }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.375rem",
                  padding: "0.5rem 0.875rem",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  color: colors.textSecondary,
                  background: "transparent",
                  border: `1px solid ${colors.border}`,
                  borderRadius: 8,
                  cursor: "pointer",
                  fontFamily: "'Inter', sans-serif",
                  transition: "all 0.2s",
                }}
                title="Rollback to a previous save"
              >
                <FiRefreshCw size={14} /> Rollback
              </button>
              {showVersions && (
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 4px)",
                    right: 0,
                    minWidth: 280,
                    maxHeight: 300,
                    overflowY: "auto",
                    background: colors.cardBg,
                    border: `1px solid ${colors.border}`,
                    borderRadius: 10,
                    boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                    zIndex: 100,
                    padding: "0.5rem 0",
                  }}
                >
                  {versions.length === 0 ? (
                    <div style={{ padding: "0.75rem 1rem", color: colors.textSecondary, fontSize: "0.8125rem" }}>
                      No previous saves yet
                    </div>
                  ) : (
                    versions.map((v) => (
                      <button
                        key={v.version_id}
                        onClick={() => handleRollback(v.version_id)}
                        style={{
                          display: "block",
                          width: "100%",
                          textAlign: "left",
                          padding: "0.5rem 1rem",
                          background: "transparent",
                          border: "none",
                          cursor: "pointer",
                          fontSize: "0.8125rem",
                          color: colors.text,
                          fontFamily: "'Inter', sans-serif",
                          transition: "background 0.15s",
                        }}
                        onMouseEnter={(e) => { (e.target as HTMLElement).style.background = theme === "dark" ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)"; }}
                        onMouseLeave={(e) => { (e.target as HTMLElement).style.background = "transparent"; }}
                      >
                        <div style={{ fontWeight: 600 }}>{new Date(v.created_at).toLocaleString()}</div>
                        <div style={{ fontSize: "0.75rem", color: colors.textSecondary }}>
                          {v.rows_count} rows
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            <button
              onClick={exportCSV}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.375rem",
                padding: "0.5rem 0.875rem",
                fontSize: "0.8125rem",
                fontWeight: 600,
                color: "#fff",
                background: "var(--primary)",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
                fontFamily: "'Inter', sans-serif",
              }}
            >
              <FiDownload size={14} /> Export CSV
            </button>
            {lastSaved && !dirty && (
              <span style={{ fontSize: "0.7rem", color: colors.textSecondary, whiteSpace: "nowrap" }}>
                Last saved {new Date(lastSaved).toLocaleString()}
              </span>
            )}
          </div>
        </div>
        {error && (
          <p style={{ color: "#f59e0b", fontSize: "0.8125rem", marginTop: "0.5rem" }}>
            {error} — showing empty model. Fill in values manually or run classification first.
          </p>
        )}
      </header>

      {/* ── Forecast Settings Panel ── */}
      <div style={{ marginBottom: "1rem" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            marginBottom: showForecastPanel ? "0.75rem" : 0,
            cursor: "pointer",
            userSelect: "none",
          }}
          onClick={() => setShowForecastPanel(p => !p)}
        >
          {showForecastPanel ? <FiChevronDown size={18} color={colors.text} /> : <FiChevronRight size={18} color={colors.text} />}
          <FiTrendingUp size={16} color="#3b82f6" />
          <span style={{ color: colors.text, fontWeight: 600, fontSize: "1rem" }}>
            Forecasting
          </span>
          {forecastPeriodCount > 0 && (
            <span style={{ background: "#3b82f6", color: "#fff", borderRadius: "999px", padding: "0 8px", fontSize: "0.7rem", fontWeight: 700, lineHeight: "1.5" }}>
              {forecastPeriodCount} {timeFrame === "monthly" ? "months" : "periods"} forecasted
            </span>
          )}
        </div>
        {showForecastPanel && (
          <div
            style={{
              padding: "1rem 1.25rem",
              background: colors.cardBg,
              border: `1px solid ${colors.border}`,
              borderRadius: 10,
            }}
          >
            <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "flex-end" }}>
              {/* Forecast Horizon */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                <label style={{ fontSize: "0.75rem", fontWeight: 600, color: colors.textSecondary }}>
                  Forecast Horizon
                </label>
                <div style={{ display: "flex", gap: "0.375rem", alignItems: "center" }}>
                  {(timeFrame === "monthly"
                    ? [3, 6, 12, 24]
                    : timeFrame === "biweekly"
                      ? [4, 8, 13, 26]
                      : [4, 8, 12, 26, 52]
                  ).map(n => (
                    <button
                      key={n}
                      onClick={() => setForecastHorizon(n)}
                      style={{
                        padding: "0.3rem 0.6rem",
                        fontSize: "0.75rem",
                        fontWeight: forecastHorizon === n ? 700 : 500,
                        color: forecastHorizon === n ? "#fff" : colors.text,
                        background: forecastHorizon === n ? "#3b82f6" : "transparent",
                        border: `1px solid ${forecastHorizon === n ? "#3b82f6" : colors.border}`,
                        borderRadius: 6,
                        cursor: "pointer",
                        fontFamily: "'Inter', sans-serif",
                      }}
                    >
                      {n} {timeFrame === "monthly" ? "mo" : timeFrame === "biweekly" ? "per" : "wk"}
                    </button>
                  ))}
                  <input
                    type="number"
                    min={1}
                    max={104}
                    value={forecastHorizon || ""}
                    placeholder="#"
                    onChange={e => setForecastHorizon(Math.max(0, Math.min(104, parseInt(e.target.value) || 0)))}
                    style={{
                      width: 50,
                      padding: "0.3rem 0.4rem",
                      fontSize: "0.75rem",
                      border: `1px solid ${colors.border}`,
                      borderRadius: 6,
                      background: colors.inputBg,
                      color: colors.text,
                      textAlign: "center",
                      fontFamily: "'Inter', sans-serif",
                    }}
                  />
                </div>
              </div>

              {/* Default Algorithm */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                <label style={{ fontSize: "0.75rem", fontWeight: 600, color: colors.textSecondary }}>
                  Algorithm
                </label>
                <select
                  value={defaultForecastMethod}
                  onChange={e => { setDefaultForecastMethod(e.target.value); setAlgoParams({}); }}
                  style={{
                    padding: "0.375rem 0.5rem",
                    fontSize: "0.8125rem",
                    border: `1px solid ${colors.border}`,
                    borderRadius: 6,
                    background: colors.cardBg,
                    color: colors.text,
                    fontFamily: "'Inter', sans-serif",
                    minWidth: 180,
                  }}
                >
                  <optgroup label="Standard">
                    {forecastAlgorithms.filter(a => !a.advanced).map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Advanced (Statistical)">
                    {forecastAlgorithms.filter(a => a.advanced).map(a => (
                      <option key={a.id} value={a.id}>★ {a.name}</option>
                    ))}
                  </optgroup>
                  {forecastAlgorithms.filter(a => a.custom).length > 0 && (
                    <optgroup label="Custom">
                      {forecastAlgorithms.filter(a => a.custom).map(a => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
                {(() => {
                  const algo = forecastAlgorithms.find(a => a.id === defaultForecastMethod);
                  return algo ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                      {algo.advanced && <span style={{ background: "#7c3aed", color: "#fff", borderRadius: 4, padding: "0 5px", fontSize: "0.6rem", fontWeight: 700 }}>ADVANCED</span>}
                      <span style={{ fontSize: "0.65rem", color: colors.textSecondary, maxWidth: 250 }}>
                        {algo.description}
                      </span>
                    </div>
                  ) : null;
                })()}
              </div>

              {/* Confidence Band Toggle (for advanced algos and auto-select) */}
              {(defaultForecastMethod === "auto" || forecastAlgorithms.find(a => a.id === defaultForecastMethod)?.advanced) && (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", justifyContent: "flex-end" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontSize: "0.75rem", fontWeight: 500, color: colors.text, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={showConfidenceBands}
                      onChange={e => setShowConfidenceBands(e.target.checked)}
                      style={{ accentColor: "#3b82f6" }}
                    />
                    Show Confidence Bands
                  </label>
                </div>
              )}

              {/* Actions */}
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <button
                  onClick={() => handleGenerateForecast()}
                  disabled={forecastGenerating || forecastHorizon < 1}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.375rem",
                    padding: "0.5rem 1rem",
                    fontSize: "0.8125rem",
                    fontWeight: 600,
                    color: "#fff",
                    background: forecastHorizon < 1 ? colors.textSecondary : "#3b82f6",
                    border: "none",
                    borderRadius: 8,
                    cursor: forecastGenerating || forecastHorizon < 1 ? "not-allowed" : "pointer",
                    fontFamily: "'Inter', sans-serif",
                    opacity: forecastGenerating ? 0.6 : 1,
                  }}
                >
                  <FiTrendingUp size={14} />
                  {forecastGenerating
                    ? (defaultForecastMethod === "agent" ? "AI Agent Forecasting (~2 min)…" : "Generating…")
                    : "Generate Forecast"}
                </button>
                {forecastPeriodCount > 0 && (
                  <button
                    onClick={handleClearForecast}
                    style={{
                      padding: "0.5rem 0.75rem",
                      fontSize: "0.8125rem",
                      fontWeight: 500,
                      color: colors.netNegative,
                      background: "transparent",
                      border: `1px solid ${colors.netNegative}`,
                      borderRadius: 8,
                      cursor: "pointer",
                      fontFamily: "'Inter', sans-serif",
                    }}
                  >
                    Remove Forecast
                  </button>
                )}
              </div>

            </div>

            {/* Forecast status message */}
            {forecastMessage && (
              <div style={{
                marginTop: "0.75rem",
                padding: "0.5rem 0.75rem",
                borderRadius: 8,
                fontSize: "0.8125rem",
                fontWeight: 500,
                background: forecastMessage.type === "success" ? (theme === "dark" ? "rgba(16,185,129,0.12)" : "rgba(16,185,129,0.08)") : (theme === "dark" ? "rgba(239,68,68,0.12)" : "rgba(239,68,68,0.08)"),
                color: forecastMessage.type === "success" ? "#10b981" : "#ef4444",
                border: `1px solid ${forecastMessage.type === "success" ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`,
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}>
                {forecastMessage.type === "success" ? "✓" : "✕"} {forecastMessage.text}
                <button onClick={() => setForecastMessage(null)} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "inherit", fontSize: "1rem", padding: "0 0.25rem" }}>×</button>
              </div>
            )}

            {/* ── Dynamic Algorithm Parameters ── */}
            {(() => {
              const algo = forecastAlgorithms.find(a => a.id === defaultForecastMethod);
              if (!algo || algo.params.length === 0) return null;
              const inputStyle: React.CSSProperties = {
                width: 80, padding: "0.25rem 0.4rem", fontSize: "0.75rem",
                border: `1px solid ${colors.border}`, borderRadius: 5,
                background: colors.inputBg, color: colors.text, fontFamily: "'Inter', sans-serif",
              };
              return (
                <div style={{ marginTop: "0.75rem", padding: "0.75rem", background: theme === "dark" ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.015)", border: `1px solid ${colors.border}`, borderRadius: 8 }}>
                  <div style={{ fontSize: "0.7rem", fontWeight: 600, color: colors.textSecondary, marginBottom: "0.5rem", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                    Parameters — {algo.name}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "flex-end" }}>
                    {algo.params.map(param => (
                      <div key={param.name} style={{ display: "flex", flexDirection: "column", gap: "0.15rem" }}>
                        <label style={{ fontSize: "0.65rem", color: colors.textSecondary, fontWeight: 500 }} title={param.description}>
                          {param.name.replace(/_/g, " ")}
                        </label>
                        {param.type === "bool" ? (
                          <label style={{ display: "flex", alignItems: "center", gap: "0.25rem", fontSize: "0.75rem", cursor: "pointer" }}>
                            <input
                              type="checkbox"
                              checked={algoParams[param.name] !== undefined ? !!algoParams[param.name] : !!param.default}
                              onChange={e => setAlgoParams(prev => ({ ...prev, [param.name]: e.target.checked }))}
                              style={{ accentColor: "#3b82f6" }}
                            />
                            {algoParams[param.name] !== undefined ? (algoParams[param.name] ? "Yes" : "No") : (param.default ? "Yes" : "No")}
                          </label>
                        ) : param.type === "select" && param.options ? (
                          <select
                            value={String(algoParams[param.name] ?? param.default ?? param.options[0])}
                            onChange={e => setAlgoParams(prev => ({ ...prev, [param.name]: e.target.value }))}
                            style={{ ...inputStyle, width: 110 }}
                          >
                            {param.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                          </select>
                        ) : param.type === "float" ? (
                          <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                            <input
                              type="range"
                              min={param.min ?? 0}
                              max={param.max ?? 1}
                              step={0.01}
                              value={Number(algoParams[param.name] ?? param.default ?? param.min ?? 0)}
                              onChange={e => setAlgoParams(prev => ({ ...prev, [param.name]: parseFloat(e.target.value) }))}
                              style={{ width: 80, accentColor: "#3b82f6" }}
                            />
                            <span style={{ fontSize: "0.7rem", color: colors.text, minWidth: 30, fontFamily: "monospace" }}>
                              {Number(algoParams[param.name] ?? param.default ?? 0).toFixed(2)}
                            </span>
                          </div>
                        ) : (
                          <input
                            type="number"
                            min={param.min}
                            max={param.max}
                            value={algoParams[param.name] !== undefined ? String(Number(algoParams[param.name])) : (param.default != null ? String(param.default) : "")}
                            placeholder={param.default != null ? String(param.default) : "auto"}
                            onChange={e => {
                              const v = e.target.value === "" ? undefined : parseInt(e.target.value);
                              setAlgoParams(prev => {
                                const next = { ...prev };
                                if (v === undefined) delete next[param.name]; else next[param.name] = v;
                                return next;
                              });
                            }}
                            style={inputStyle}
                          />
                        )}
                        <span style={{ fontSize: "0.55rem", color: colors.textSecondary, maxWidth: 120 }}>{param.description}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* ── Inline Forecast Summary (KPI + Preview Chart) ── */}
            {forecastPeriodCount > 0 && (() => {
              const endingRow = rows.find(r => r.label === "Ending Cash Balance");
              const netRow = rows.find(r => r.label === "Net Cash Flow");
              const ap = actualPeriodCount;
              const fp = forecastPeriodCount;
              const totalPeriods = ap + fp;

              const projectedEndBalance = endingRow ? (endingRow.values[totalPeriods - 1] ?? 0) : 0;
              const forecastNetValues = netRow ? netRow.values.slice(ap, totalPeriods).filter((v): v is number => v != null) : [];
              const avgNetCashFlow = forecastNetValues.length > 0 ? forecastNetValues.reduce((s, v) => s + v, 0) / forecastNetValues.length : 0;
              const forecastEndBalances = endingRow ? endingRow.values.slice(ap, totalPeriods).filter((v): v is number => v != null) : [];
              const minProjectedBalance = forecastEndBalances.length > 0 ? Math.min(...forecastEndBalances) : 0;

              let cashRunway = fp;
              if (endingRow) {
                for (let i = ap; i < totalPeriods; i++) {
                  if ((endingRow.values[i] ?? 0) < 0) { cashRunway = i - ap; break; }
                }
              }

              const algoName = forecastAlgorithms.find(a => a.id === defaultForecastMethod)?.name ?? defaultForecastMethod;

              const kpiCardStyle: React.CSSProperties = {
                flex: "1 1 0",
                minWidth: 140,
                padding: "0.75rem 1rem",
                background: theme === "dark" ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)",
                border: `1px solid ${colors.border}`,
                borderRadius: 10,
                textAlign: "center" as const,
              };
              const kpiLabel: React.CSSProperties = { fontSize: "0.65rem", fontWeight: 600, color: colors.textSecondary, textTransform: "uppercase" as const, letterSpacing: "0.03em", marginBottom: "0.25rem" };
              const kpiValue: React.CSSProperties = { fontSize: "1.1rem", fontWeight: 700, fontFamily: "'Inter', sans-serif" };

              const endingLabel = endingRow?.label ?? "";
              const endBands = confidenceBands?.[endingLabel];
              const chartData = endingRow ? endingRow.values.slice(0, totalPeriods).map((v, i) => ({
                period: apiPeriodLabels[i] ?? `P${i + 1}`,
                value: v ?? 0,
                isActual: i < ap,
                actual: i < ap ? (v ?? 0) : undefined,
                forecast: i >= ap - 1 ? (v ?? 0) : undefined,
                confUpper: (i >= ap && endBands?.upper) ? (endBands.upper[i - ap] ?? undefined) : undefined,
                confLower: (i >= ap && endBands?.lower) ? (endBands.lower[i - ap] ?? undefined) : undefined,
              })) : [];

              return (
                <div style={{ marginTop: "1rem" }}>
                  {/* Algorithm badge */}
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
                    <span style={{ background: "#3b82f6", color: "#fff", borderRadius: "999px", padding: "0.2rem 0.75rem", fontSize: "0.7rem", fontWeight: 700 }}>
                      {algoName}
                    </span>
                    <span style={{ fontSize: "0.7rem", color: colors.textSecondary }}>
                      {ap} actuals → {fp} forecasted {timeFrame === "monthly" ? "months" : "periods"}
                    </span>
                  </div>

                  {/* KPI cards */}
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
                    <div style={kpiCardStyle}>
                      <div style={kpiLabel}>Projected End Balance</div>
                      <div style={{ ...kpiValue, color: projectedEndBalance >= 0 ? "#10b981" : "#ef4444" }}>${fmt(projectedEndBalance)}</div>
                    </div>
                    <div style={kpiCardStyle}>
                      <div style={kpiLabel}>Avg Net Cash Flow</div>
                      <div style={{ ...kpiValue, color: avgNetCashFlow >= 0 ? "#10b981" : "#ef4444" }}>${fmt(avgNetCashFlow)}</div>
                    </div>
                    <div style={kpiCardStyle}>
                      <div style={kpiLabel}>Min Projected Balance</div>
                      <div style={{ ...kpiValue, color: minProjectedBalance >= 0 ? "#10b981" : "#ef4444" }}>${fmt(minProjectedBalance)}</div>
                    </div>
                    <div style={kpiCardStyle}>
                      <div style={kpiLabel}>Cash Runway</div>
                      <div style={{ ...kpiValue, color: cashRunway >= fp ? "#10b981" : cashRunway > 2 ? "#f59e0b" : "#ef4444" }}>
                        {cashRunway >= fp ? `${fp}+` : cashRunway} {timeFrame === "monthly" ? "mo" : "per"}
                      </div>
                    </div>
                  </div>

                  {/* Quality Metrics Row */}
                  {forecastMetadata && (
                    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
                      {forecastMetadata.avg_fit_score !== undefined && (
                        <div style={{ ...kpiCardStyle, minWidth: 100, flex: "0 1 auto", padding: "0.5rem 0.75rem" }}>
                          <div style={{ ...kpiLabel, marginBottom: "0.15rem" }}>Fit Score</div>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", justifyContent: "center" }}>
                            <div style={{ width: 50, height: 5, background: colors.border, borderRadius: 3, overflow: "hidden" }}>
                              <div style={{ width: `${Math.min(100, Number(forecastMetadata.avg_fit_score))}%`, height: "100%", background: Number(forecastMetadata.avg_fit_score) > 60 ? "#10b981" : Number(forecastMetadata.avg_fit_score) > 30 ? "#f59e0b" : "#ef4444", borderRadius: 3 }} />
                            </div>
                            <span style={{ fontSize: "0.8rem", fontWeight: 700, color: colors.text }}>{Math.round(Number(forecastMetadata.avg_fit_score))}</span>
                          </div>
                        </div>
                      )}
                      {typeof forecastMetadata.trend_direction === "string" && (
                        <div style={{ ...kpiCardStyle, minWidth: 100, flex: "0 1 auto", padding: "0.5rem 0.75rem" }}>
                          <div style={{ ...kpiLabel, marginBottom: "0.15rem" }}>Trend</div>
                          <div style={{ fontSize: "1rem", fontWeight: 700, color: String(forecastMetadata.trend_direction) === "up" ? "#10b981" : String(forecastMetadata.trend_direction) === "down" ? "#ef4444" : colors.textSecondary }}>
                            {String(forecastMetadata.trend_direction) === "up" ? "↗ Up" : String(forecastMetadata.trend_direction) === "down" ? "↘ Down" : "→ Flat"}
                          </div>
                        </div>
                      )}
                      {confidenceBands && Object.keys(confidenceBands).length > 0 && (
                        <div style={{ ...kpiCardStyle, minWidth: 100, flex: "0 1 auto", padding: "0.5rem 0.75rem" }}>
                          <div style={{ ...kpiLabel, marginBottom: "0.15rem" }}>Confidence Bands</div>
                          <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#7c3aed" }}>
                            {Object.keys(confidenceBands).length} rows
                          </div>
                        </div>
                      )}
                      {forecastMetadata?.regime_summary != null && typeof forecastMetadata.regime_summary === "object" && (
                        <div style={{ ...kpiCardStyle, minWidth: 130, flex: "0 1 auto", padding: "0.5rem 0.75rem" }}>
                          <div style={{ ...kpiLabel, marginBottom: "0.15rem" }}>Regimes</div>
                          <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap", justifyContent: "center" }}>
                            {Object.entries(forecastMetadata.regime_summary as Record<string, number>).map(([regime, count]) => (
                              <span key={regime} style={{ fontSize: "0.65rem", fontWeight: 600, padding: "1px 5px", borderRadius: 4, background: regime === "smooth" ? "#10b98122" : regime === "intermittent" ? "#f59e0b22" : regime === "erratic" ? "#ef444422" : "#7c3aed22", color: regime === "smooth" ? "#10b981" : regime === "intermittent" ? "#f59e0b" : regime === "erratic" ? "#ef4444" : "#7c3aed" }}>
                                {String(count)} {regime}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {forecastMetadata?.guardrail_count != null && Number(forecastMetadata.guardrail_count) > 0 && (
                        <div style={{ ...kpiCardStyle, minWidth: 100, flex: "0 1 auto", padding: "0.5rem 0.75rem" }}>
                          <div style={{ ...kpiLabel, marginBottom: "0.15rem" }}>Guardrails</div>
                          <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#f59e0b" }}>
                            {String(forecastMetadata.guardrail_count)} clamped
                          </div>
                        </div>
                      )}
                      {forecastMetadata?.flat_row_rate != null && (
                        <div style={{ ...kpiCardStyle, minWidth: 120, flex: "0 1 auto", padding: "0.5rem 0.75rem" }}>
                          <div style={{ ...kpiLabel, marginBottom: "0.15rem" }}>Flat Forecasts</div>
                          <div style={{ fontSize: "0.8rem", fontWeight: 700, color: Number(forecastMetadata.flat_row_rate) <= 0.3 ? "#10b981" : Number(forecastMetadata.flat_row_rate) <= 0.5 ? "#f59e0b" : "#ef4444" }}>
                            {(Number(forecastMetadata.flat_row_rate) * 100).toFixed(1)}%
                          </div>
                        </div>
                      )}
                      {forecastMetadata?.avg_interval_coverage != null && (
                        <div style={{ ...kpiCardStyle, minWidth: 130, flex: "0 1 auto", padding: "0.5rem 0.75rem" }}>
                          <div style={{ ...kpiLabel, marginBottom: "0.15rem" }}>Interval Coverage</div>
                          <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#7c3aed" }}>
                            {(Number(forecastMetadata.avg_interval_coverage) * 100).toFixed(1)}%
                          </div>
                        </div>
                      )}
                      {forecastMetadata?.tier2_escalations != null && Number(forecastMetadata.tier2_escalations) > 0 && (
                        <div style={{ ...kpiCardStyle, minWidth: 120, flex: "0 1 auto", padding: "0.5rem 0.75rem" }}>
                          <div style={{ ...kpiLabel, marginBottom: "0.15rem" }}>GPU Escalations</div>
                          <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#3b82f6" }}>
                            {String(forecastMetadata.tier2_escalations)} rows
                          </div>
                        </div>
                      )}
                      {forecastMetadata?.model_mix != null && typeof forecastMetadata.model_mix === "object" && (
                        <div style={{ ...kpiCardStyle, minWidth: 160, flex: "0 1 auto", padding: "0.5rem 0.75rem" }}>
                          <div style={{ ...kpiLabel, marginBottom: "0.15rem" }}>Model Mix</div>
                          <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap", justifyContent: "center" }}>
                            {Object.entries(forecastMetadata.model_mix as Record<string, number>).map(([family, count]) => (
                              <span key={family} style={{ fontSize: "0.65rem", fontWeight: 600, padding: "1px 5px", borderRadius: 4, background: family === "tier2" ? "#3b82f622" : "#64748b22", color: family === "tier2" ? "#3b82f6" : colors.textSecondary }}>
                                {String(count)} {family}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Inline preview chart with confidence bands */}
                  {chartData.length > 0 && (
                    <div style={{ background: theme === "dark" ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.015)", border: `1px solid ${colors.border}`, borderRadius: 10, padding: "0.75rem 0.5rem 0.25rem" }}>
                      <div style={{ fontSize: "0.7rem", fontWeight: 600, color: colors.textSecondary, marginBottom: "0.5rem", paddingLeft: "0.5rem" }}>
                        ENDING CASH BALANCE — ACTUAL vs FORECAST
                        {showConfidenceBands && confidenceBands && Object.keys(confidenceBands).length > 0 && (
                          <span style={{ marginLeft: "0.5rem", color: "#7c3aed", fontWeight: 500 }}>(with confidence bands)</span>
                        )}
                      </div>
                      <ResponsiveContainer width="100%" height={200}>
                        <AreaChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                          <defs>
                            <linearGradient id="cfActGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                              <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                            </linearGradient>
                            <linearGradient id="cfFcGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                              <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
                            </linearGradient>
                            <linearGradient id="cfConfGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#7c3aed" stopOpacity={0.15} />
                              <stop offset="100%" stopColor="#7c3aed" stopOpacity={0.03} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke={colors.border} />
                          <XAxis dataKey="period" tick={{ fontSize: 9, fill: colors.textSecondary }} interval="preserveStartEnd" />
                          <YAxis tick={{ fontSize: 9, fill: colors.textSecondary }} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} width={55} />
                          <Tooltip formatter={(value: string | number | undefined) => [`$${fmt(Number(value ?? 0))}`, "Balance"]} contentStyle={{ background: colors.cardBg, border: `1px solid ${colors.border}`, borderRadius: 8, fontSize: "0.75rem" }} />
                          <ReferenceLine x={apiPeriodLabels[ap - 1]} stroke="#f59e0b" strokeDasharray="4 4" strokeWidth={2} label={{ value: "Forecast →", position: "top", fill: "#f59e0b", fontSize: 9 }} />
                          {showConfidenceBands && chartData.some(d => d.confUpper != null) && (
                            <Area type="monotone" dataKey="confUpper" stroke="none" fill="url(#cfConfGrad)" connectNulls dot={false} />
                          )}
                          {showConfidenceBands && chartData.some(d => d.confLower != null) && (
                            <Area type="monotone" dataKey="confLower" stroke="none" fill="url(#cfConfGrad)" connectNulls dot={false} />
                          )}
                          <Area type="monotone" dataKey="actual" stroke="#10b981" fill="url(#cfActGrad)" strokeWidth={2} connectNulls dot={false} />
                          <Area type="monotone" dataKey="forecast" stroke="#3b82f6" fill="url(#cfFcGrad)" strokeWidth={2} strokeDasharray="6 3" connectNulls dot={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* AI Insights Section */}
                  <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                    <button
                      onClick={() => {
                        if (aiInsights) { setShowAiInsights(p => !p); return; }
                        setAiInsightsLoading(true);
                        setShowAiInsights(true);
                        fetch(`${API_BASE_URL}/api/forecast/interpret?user_id=${encodeURIComponent(userId)}`, {
                          method: "POST",
                          headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
                          body: JSON.stringify({
                            rows: rows,
                            actual_periods: ap,
                            forecast_periods: fp,
                            method: defaultForecastMethod,
                            confidence_bands: confidenceBands,
                            kpi_metrics: { projectedEndBalance, avgNetCashFlow, minProjectedBalance, cashRunway },
                          }),
                        })
                          .then(r => r.json())
                          .then(data => { if (data.ok !== false) setAiInsights(data); })
                          .catch(e => setAiInsights({ summary: `Failed: ${e.message}`, risks: [], recommendation: null, suggestions: [], patterns: {}, category_insights: [], error: e.message }))
                          .finally(() => setAiInsightsLoading(false));
                      }}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: "0.375rem",
                        padding: "0.5rem 0.875rem", fontSize: "0.8125rem", fontWeight: 600,
                        color: "#fff", background: "linear-gradient(135deg, #7c3aed, #3b82f6)",
                        border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "'Inter', sans-serif",
                        opacity: aiInsightsLoading ? 0.6 : 1,
                      }}
                      disabled={aiInsightsLoading}
                    >
                      <FiZap size={14} />
                      {aiInsightsLoading ? "Analyzing…" : aiInsights ? (showAiInsights ? "Hide AI Analysis" : "Show AI Analysis") : "Get AI Analysis"}
                    </button>
                    <span style={{ fontSize: "0.65rem", color: colors.textSecondary }}>Powered by Sonnet 4.5</span>
                  </div>

                  {showAiInsights && aiInsights && !aiInsightsLoading && (
                    <div style={{ marginTop: "0.75rem", padding: "1rem", background: theme === "dark" ? "rgba(124,58,237,0.06)" : "rgba(124,58,237,0.03)", border: "1px solid rgba(124,58,237,0.2)", borderRadius: 10 }}>
                      {/* Summary */}
                      <div style={{ fontSize: "0.875rem", color: colors.text, lineHeight: 1.6, marginBottom: "0.75rem" }}>
                        {aiInsights.summary}
                      </div>

                      {/* Risks */}
                      {aiInsights.risks.length > 0 && (
                        <div style={{ marginBottom: "0.75rem" }}>
                          <div style={{ fontSize: "0.7rem", fontWeight: 700, color: colors.textSecondary, textTransform: "uppercase" as const, marginBottom: "0.375rem" }}>Risk Alerts</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem" }}>
                            {aiInsights.risks.map((risk, i) => (
                              <span key={i} style={{
                                padding: "0.25rem 0.625rem", borderRadius: 6, fontSize: "0.75rem", fontWeight: 600,
                                background: risk.level === "critical" ? "rgba(239,68,68,0.12)" : risk.level === "warning" ? "rgba(245,158,11,0.12)" : "rgba(59,130,246,0.12)",
                                color: risk.level === "critical" ? "#ef4444" : risk.level === "warning" ? "#f59e0b" : "#3b82f6",
                                border: `1px solid ${risk.level === "critical" ? "rgba(239,68,68,0.3)" : risk.level === "warning" ? "rgba(245,158,11,0.3)" : "rgba(59,130,246,0.3)"}`,
                              }}>
                                {risk.level === "critical" ? "!!" : risk.level === "warning" ? "!" : "i"} {risk.message}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Recommendation */}
                      {aiInsights.recommendation && (
                        <div style={{ marginBottom: "0.75rem", padding: "0.625rem", background: theme === "dark" ? "rgba(16,185,129,0.08)" : "rgba(16,185,129,0.04)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 8 }}>
                          <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "#10b981", textTransform: "uppercase" as const, marginBottom: "0.25rem" }}>Recommended Algorithm</div>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <span style={{ fontSize: "0.875rem", fontWeight: 700, color: colors.text }}>{aiInsights.recommendation.algorithm}</span>
                            <span style={{ fontSize: "0.7rem", color: colors.textSecondary }}>— {aiInsights.recommendation.reason}</span>
                            {forecastAlgorithms.some(a => a.id === aiInsights.recommendation?.algorithm) && aiInsights.recommendation.algorithm !== defaultForecastMethod && (
                              <button
                                onClick={() => { setDefaultForecastMethod(aiInsights.recommendation!.algorithm); handleGenerateForecast(undefined, aiInsights.recommendation!.algorithm); }}
                                style={{ padding: "0.25rem 0.625rem", fontSize: "0.7rem", fontWeight: 600, color: "#fff", background: "#10b981", border: "none", borderRadius: 6, cursor: "pointer" }}
                              >
                                Apply
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Suggestions */}
                      {aiInsights.suggestions.length > 0 && (
                        <div style={{ marginBottom: "0.75rem" }}>
                          <div style={{ fontSize: "0.7rem", fontWeight: 700, color: colors.textSecondary, textTransform: "uppercase" as const, marginBottom: "0.375rem" }}>Suggestions</div>
                          {aiInsights.suggestions.map((s, i) => (
                            <div key={i} style={{ fontSize: "0.75rem", color: colors.text, padding: "0.25rem 0", display: "flex", gap: "0.375rem" }}>
                              <span style={{ color: "#3b82f6", fontWeight: 700 }}>{s.type === "parameter" ? "P" : s.type === "data" ? "D" : "M"}</span>
                              {s.message}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Patterns */}
                      {aiInsights.patterns && Object.keys(aiInsights.patterns).length > 0 && (
                        <div>
                          <div style={{ fontSize: "0.7rem", fontWeight: 700, color: colors.textSecondary, textTransform: "uppercase" as const, marginBottom: "0.375rem" }}>Detected Patterns</div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.375rem" }}>
                            {aiInsights.patterns.trend && (
                              <div style={{ fontSize: "0.75rem", color: colors.text }}><strong>Trend:</strong> {aiInsights.patterns.trend}</div>
                            )}
                            {aiInsights.patterns.seasonality && (
                              <div style={{ fontSize: "0.75rem", color: colors.text }}><strong>Seasonality:</strong> {aiInsights.patterns.seasonality}</div>
                            )}
                            {aiInsights.patterns.volatility && (
                              <div style={{ fontSize: "0.75rem", color: colors.text }}><strong>Volatility:</strong> {aiInsights.patterns.volatility}</div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Per-row overrides tip */}
                  <div style={{ marginTop: "0.75rem", fontSize: "0.7rem", color: colors.textSecondary }}>
                    Tip: Right-click any row label to set a per-row forecast algorithm override.
                    Actuals are locked. Forecast cells can be manually adjusted.
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* ── Insights Panel (agent-published HTML cards) ── */}
      {insights.length > 0 && (
        <div style={{ marginBottom: "1.5rem" }}>
          {/* Panel header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: showInsights ? "0.75rem" : 0,
              cursor: "pointer",
              userSelect: "none",
            }}
            onClick={() => setShowInsights((p) => !p)}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              {showInsights ? <FiChevronDown size={18} color={colors.text} /> : <FiChevronRight size={18} color={colors.text} />}
              <FiZap size={16} color="#a78bfa" />
              <span style={{ color: colors.text, fontWeight: 600, fontSize: "1rem" }}>
                Agent Insights
              </span>
              <span
                style={{
                  background: "#a78bfa",
                  color: "#fff",
                  borderRadius: "999px",
                  padding: "0 8px",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  lineHeight: "1.5",
                  minWidth: "1.25rem",
                  textAlign: "center",
                }}
              >
                {insights.length}
              </span>
            </div>
          </div>

          {/* Insight cards */}
          {showInsights && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {insights.map((insight) => (
                <div
                  key={insight.id}
                  style={{
                    border: `1px solid ${colors.border}`,
                    borderRadius: "12px",
                    background: colors.cardBg,
                    overflow: "auto",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                  }}
                >
                  {/* Card title bar */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "0.625rem 1rem",
                      background: theme === "dark" ? "rgba(167,139,250,0.08)" : "rgba(167,139,250,0.06)",
                      borderBottom: `1px solid ${colors.border}`,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <FiZap size={14} color="#a78bfa" />
                      <span style={{ fontWeight: 600, fontSize: "0.875rem", color: colors.text }}>
                        {insight.title}
                      </span>
                      <span style={{ fontSize: "0.7rem", color: colors.textSecondary }}>
                        {new Date(insight.created_at).toLocaleString()}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: "0.25rem" }}>
                      <button
                        onClick={() => setExpandedInsight(insight.id)}
                        title="Expand"
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: "4px",
                          borderRadius: "4px",
                          color: colors.textSecondary,
                          display: "flex",
                          alignItems: "center",
                        }}
                      >
                        <FiMaximize2 size={14} />
                      </button>
                      <button
                        onClick={() => dismissInsight(insight.id)}
                        title="Dismiss"
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: "4px",
                          borderRadius: "4px",
                          color: colors.textSecondary,
                          display: "flex",
                          alignItems: "center",
                        }}
                      >
                        <FiTrash2 size={14} />
                      </button>
                    </div>
                  </div>
                  {/* Card HTML body (sandboxed iframe) */}
                  <div style={{ padding: "0.5rem 1rem 1rem" }}>
                    <InsightFrame
                      html={insight.html}
                      theme={theme}
                      onRenderError={(err) => handleInsightError(insight.title, insight.id, err)}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Expanded insight overlay */}
          {expandedInsight && (() => {
            const insight = insights.find((i) => i.id === expandedInsight);
            if (!insight) return null;
            return (
              <div
                onClick={() => setExpandedInsight(null)}
                style={{
                  position: "fixed",
                  inset: 0,
                  background: "rgba(0,0,0,0.6)",
                  backdropFilter: "blur(4px)",
                  zIndex: 9999,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "2rem",
                }}
              >
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    background: colors.cardBg,
                    borderRadius: "16px",
                    width: "100%",
                    maxWidth: "1200px",
                    maxHeight: "90vh",
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                    boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
                  }}
                >
                  {/* Overlay title bar */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "1rem 1.25rem",
                      background: theme === "dark" ? "rgba(167,139,250,0.08)" : "rgba(167,139,250,0.06)",
                      borderBottom: `1px solid ${colors.border}`,
                      flexShrink: 0,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <FiZap size={16} color="#a78bfa" />
                      <span style={{ fontWeight: 600, fontSize: "1rem", color: colors.text }}>
                        {insight.title}
                      </span>
                      <span style={{ fontSize: "0.75rem", color: colors.textSecondary }}>
                        {new Date(insight.created_at).toLocaleString()}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: "0.25rem" }}>
                      <button
                        onClick={() => dismissInsight(insight.id)}
                        title="Dismiss insight"
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: "6px",
                          borderRadius: "6px",
                          color: colors.textSecondary,
                          display: "flex",
                          alignItems: "center",
                        }}
                      >
                        <FiTrash2 size={16} />
                      </button>
                      <button
                        onClick={() => setExpandedInsight(null)}
                        title="Close"
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: "6px",
                          borderRadius: "6px",
                          color: colors.textSecondary,
                          display: "flex",
                          alignItems: "center",
                        }}
                      >
                        <FiMinimize2 size={16} />
                      </button>
                    </div>
                  </div>
                  {/* Overlay HTML body (sandboxed iframe) */}
                  <div style={{ padding: "1rem 1.5rem 1.5rem", flex: 1, overflow: "auto" }}>
                    <InsightFrame
                      html={insight.html}
                      theme={theme}
                      onRenderError={(err) => handleInsightError(insight.title, insight.id, err)}
                    />
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ── Dashboard: Metrics + Charts (timeframe-aware) ── */}
      {(() => {
        const endingRow = rows.find((r) => r.label === "Ending Cash Balance");
        const netRow = rows.find((r) => r.label === "Net Cash Flow");
        const beginRow = rows.find((r) => r.label === "Beginning Cash Balance");
        const totalInRow = rows.find((r) => r.label === "Total Cash Receipts");
        const totalOutRow = rows.find((r) => r.label === "Total Cash Disbursements");
        if (!endingRow || !netRow) return null;

        // Apply timeframe aggregation — same logic the table uses
        const endVals = getDisplayValues(endingRow.values, timeFrame, "last");
        const beginDisplayVals = getDisplayValues(beginRow?.values ?? new Array(numPeriods).fill(0), timeFrame, "first");
        const netVals = getDisplayValues(netRow.values, timeFrame, "sum");
        const inVals = getDisplayValues(totalInRow?.values ?? new Array(numPeriods).fill(0), timeFrame, "sum");
        const outVals = getDisplayValues(totalOutRow?.values ?? new Array(numPeriods).fill(0), timeFrame, "sum");
        const N = numPeriods;

        // Dynamic period label: "Week" | "Period"
        const periodWord = timeFrame === "weekly" ? "Wk" : "P";

        // ── Core metrics ──
        const minBalance = Math.min(...endVals);
        const maxBalance = Math.max(...endVals);
        const minBalancePeriod = endVals.indexOf(minBalance) + 1;
        const maxBalancePeriod = endVals.indexOf(maxBalance) + 1;
        const avgNetFlow = netVals.reduce((a, b) => a + b, 0) / N;
        const totalInflows = inVals.reduce((a, b) => a + b, 0);
        const totalOutflows = outVals.reduce((a, b) => a + b, 0);
        const periodsPositive = endVals.filter((v) => v > 0).length;
        const startingCash = beginDisplayVals[0];

        // Largest period swing
        const maxInflow = Math.max(...inVals);
        const maxInflowP = inVals.indexOf(maxInflow) + 1;
        const maxOutflow = Math.max(...outVals);
        const maxOutflowP = outVals.indexOf(maxOutflow) + 1;

        // Volatility: std dev of net flow
        const variance = netVals.reduce((s, v) => s + (v - avgNetFlow) ** 2, 0) / N;
        const volatility = Math.sqrt(variance);

        // Cash runway (based on per-period avg burn)
        const avgBurn = avgNetFlow < 0 ? Math.abs(avgNetFlow) : 0;
        const runway = avgBurn > 0 ? Math.floor(startingCash / avgBurn) : null;
        const runwayUnit = timeFrame === "weekly" ? "wks" : timeFrame === "biweekly" ? "periods" : "months";

        // Trend: use linear regression slope on ending cash balance
        // This captures whether the balance is actually recovering or deteriorating
        // over the full horizon, not just comparing halves of net flow.
        const trendImproving = (() => {
          if (N < 2) return false;
          // Simple linear regression slope on ending balance values
          const xMean = (N - 1) / 2;
          const yMean = endVals.reduce((a, b) => a + b, 0) / N;
          let num = 0, den = 0;
          for (let i = 0; i < N; i++) {
            num += (i - xMean) * (endVals[i] - yMean);
            den += (i - xMean) * (i - xMean);
          }
          const slope = den !== 0 ? num / den : 0;
          // Also check: is the final balance positive or at least trending upward?
          // If balance is negative and slope is near-zero or negative → declining
          const lastBalance = endVals[N - 1];
          if (lastBalance < 0 && slope <= 0) return false;
          // Slope must be meaningfully positive relative to the scale
          const scale = Math.max(Math.abs(yMean), 1);
          return slope / scale > 0.01; // at least 1% improvement per period
        })();

        // Cash efficiency: net / total gross volume
        const grossVolume = totalInflows + totalOutflows;
        const cashEfficiency = grossVolume > 0 ? ((totalInflows - totalOutflows) / grossVolume) * 100 : 0;

        const belowThreshold = minCashThreshold !== null && minBalance < minCashThreshold;

        // ── Chart data (uses aggregated values) ──
        const shortLabels = periodLabels.map((l) => l.replace(/\s*\(.*$/, ""));
        const hasForecast = forecastPeriodCount > 0 && actualPeriodCount > 0;
        const forecastBoundaryLabel = hasForecast ? shortLabels[actualPeriodCount - 1] : null;
        const balLabel = endingRow?.label ?? "Ending Cash Balance";
        const balBands = confidenceBands?.[balLabel];
        const chartData = Array.from({ length: N }, (_, i) => {
          const fIdx = i - actualPeriodCount;
          return {
            name: shortLabels[i] ?? `${periodWord}${i + 1}`,
            inflow: Math.round(inVals[i]),
            outflow: Math.round(outVals[i]),
            netFlow: Math.round(netVals[i]),
            endingBalance: Math.round(endVals[i]),
            actualBalance: hasForecast && i < actualPeriodCount ? Math.round(endVals[i]) : undefined,
            forecastBalance: hasForecast && i >= actualPeriodCount - 1 ? Math.round(endVals[i]) : undefined,
            actualInflow: hasForecast && i < actualPeriodCount ? Math.round(inVals[i]) : undefined,
            forecastInflow: hasForecast && i >= actualPeriodCount ? Math.round(inVals[i]) : undefined,
            actualOutflow: hasForecast && i < actualPeriodCount ? Math.round(outVals[i]) : undefined,
            forecastOutflow: hasForecast && i >= actualPeriodCount ? Math.round(outVals[i]) : undefined,
            isForecast: hasForecast && i >= actualPeriodCount,
            balanceUpper: (hasForecast && i >= actualPeriodCount && balBands?.upper) ? Math.round(balBands.upper[fIdx] ?? endVals[i]) : undefined,
            balanceLower: (hasForecast && i >= actualPeriodCount && balBands?.lower) ? Math.round(balBands.lower[fIdx] ?? endVals[i]) : undefined,
          };
        });

        // ── Styles ──
        const fmtShort = (n: number) => {
          const abs = Math.abs(n);
          let s: string;
          if (abs >= 1e9) s = (abs / 1e9).toFixed(1) + "B";
          else if (abs >= 1e6) s = (abs / 1e6).toFixed(1) + "M";
          else if (abs >= 1e3) s = (abs / 1e3).toFixed(0) + "K";
          else s = abs.toFixed(0);
          return n < 0 ? `(${s})` : s;
        };
        const metricBoxStyle: React.CSSProperties = {
          flex: "1 1 0",
          minWidth: 140,
          padding: "0.75rem 1rem",
          background: colors.cardBg,
          border: `1px solid ${colors.border}`,
          borderRadius: 10,
          textAlign: "center",
        };
        const metricLabel: React.CSSProperties = { fontSize: "0.65rem", fontWeight: 600, color: colors.textSecondary, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "0.2rem" };
        const metricVal: React.CSSProperties = { fontSize: "1rem", fontWeight: 700, fontFamily: "'Inter', sans-serif", fontVariantNumeric: "tabular-nums" };
        const metricSub: React.CSSProperties = { fontSize: "0.6rem", fontWeight: 400, color: colors.textSecondary, marginLeft: 3 };
        const tooltipFormatter = (value: number | string | undefined) => fmt(Number(value ?? 0));
        const chartCardStyle: React.CSSProperties = {
          flex: "1 1 400px",
          minWidth: 380,
          background: colors.cardBg,
          border: `1px solid ${colors.border}`,
          borderRadius: 12,
          padding: "1rem 0.75rem 0.5rem",
        };
        const chartTitle: React.CSSProperties = { fontSize: "0.75rem", fontWeight: 700, color: colors.text, marginBottom: "0.5rem", paddingLeft: "0.5rem" };
        const axisColor = colors.textSecondary;
        const gridColor = theme === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";

        const periodLabel = timeFrame === "weekly" ? "Weekly" : timeFrame === "biweekly" ? "Bi-weekly" : "Monthly";
        const positiveThresh = timeFrame === "weekly" ? 10 : timeFrame === "biweekly" ? 5 : 2;

        return (
          <>
            {/* ── Row 1: Key Metrics ── */}
            <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
              <div style={metricBoxStyle}>
                <div style={metricLabel}>Total Inflows</div>
                <div style={{ ...metricVal, color: colors.inflowColor }}>{fmtShort(totalInflows)}</div>
              </div>
              <div style={metricBoxStyle}>
                <div style={metricLabel}>Total Outflows</div>
                <div style={{ ...metricVal, color: colors.outflowColor }}>{fmtShort(totalOutflows)}</div>
              </div>
              <div style={metricBoxStyle}>
                <div style={metricLabel}>Avg {periodLabel} Net</div>
                <div style={{ ...metricVal, color: avgNetFlow >= 0 ? colors.netPositive : colors.netNegative }}>
                  {fmtShort(avgNetFlow)}
                </div>
              </div>
              <div style={metricBoxStyle}>
                <div style={metricLabel}>Min Balance</div>
                <div style={{ ...metricVal, color: minBalance >= 0 ? colors.netPositive : colors.netNegative }}>
                  {fmtShort(minBalance)}
                  <span style={metricSub}>{periodWord} {minBalancePeriod}</span>
                </div>
              </div>
              <div style={metricBoxStyle}>
                <div style={metricLabel}>Max Balance</div>
                <div style={{ ...metricVal, color: maxBalance >= 0 ? colors.netPositive : colors.netNegative }}>
                  {fmtShort(maxBalance)}
                  <span style={metricSub}>{periodWord} {maxBalancePeriod}</span>
                </div>
              </div>
              <div style={metricBoxStyle}>
                <div style={metricLabel}>Periods Positive</div>
                <div style={{ ...metricVal, color: periodsPositive >= positiveThresh ? colors.netPositive : periodsPositive >= Math.ceil(positiveThresh / 2) ? "#f59e0b" : colors.netNegative }}>
                  {periodsPositive}/{N}
                </div>
              </div>
            </div>

            {/* ── Row 2: Secondary metrics ── */}
            <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
              <div style={metricBoxStyle}>
                <div style={metricLabel}>Peak Inflow</div>
                <div style={{ ...metricVal, color: colors.inflowColor }}>
                  {fmtShort(maxInflow)}
                  <span style={metricSub}>{periodWord} {maxInflowP}</span>
                </div>
              </div>
              <div style={metricBoxStyle}>
                <div style={metricLabel}>Peak Outflow</div>
                <div style={{ ...metricVal, color: colors.outflowColor }}>
                  {fmtShort(maxOutflow)}
                  <span style={metricSub}>{periodWord} {maxOutflowP}</span>
                </div>
              </div>
              <div style={metricBoxStyle}>
                <div style={metricLabel}>Cash Efficiency</div>
                <div style={{ ...metricVal, color: cashEfficiency >= 0 ? colors.netPositive : colors.netNegative }}>
                  {cashEfficiency < 0 ? `(${Math.abs(cashEfficiency).toFixed(1)}%)` : `+${cashEfficiency.toFixed(1)}%`}
                </div>
              </div>
              <div style={metricBoxStyle}>
                <div style={metricLabel}>Net Volatility</div>
                <div style={{ ...metricVal, color: colors.text }}>{fmtShort(volatility)}</div>
              </div>
              <div style={metricBoxStyle}>
                <div style={metricLabel}>Trend</div>
                <div style={{ ...metricVal, color: trendImproving ? colors.netPositive : colors.netNegative, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                  {trendImproving ? <FiTrendingUp size={16} /> : <FiTrendingDown size={16} />}
                  {trendImproving ? "Improving" : "Declining"}
                </div>
              </div>
              {runway !== null && (
                <div style={metricBoxStyle}>
                  <div style={metricLabel}>Cash Runway</div>
                  <div style={{ ...metricVal, color: runway > (timeFrame === "weekly" ? 12 : timeFrame === "biweekly" ? 6 : 3) ? colors.netPositive : runway > (timeFrame === "weekly" ? 4 : 2) ? "#f59e0b" : colors.netNegative }}>
                    {runway} {runwayUnit}
                  </div>
                </div>
              )}
              <div style={{ ...metricBoxStyle, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
                <div style={metricLabel}>Min Cash Threshold</div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                  <input
                    type="text"
                    placeholder="Set…"
                    value={minCashThreshold !== null ? fmt(minCashThreshold) : ""}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value.replace(/,/g, ""));
                      setMinCashThreshold(isNaN(v) ? null : v);
                      setDirty(true);
                    }}
                    style={{
                      width: 100,
                      padding: "0.25rem 0.4rem",
                      fontSize: "0.75rem",
                      textAlign: "right",
                      border: `1px solid ${belowThreshold ? colors.netNegative : colors.border}`,
                      borderRadius: 5,
                      background: colors.inputBg,
                      color: colors.text,
                      fontFamily: "'Inter', sans-serif",
                      fontVariantNumeric: "tabular-nums",
                      outline: "none",
                    }}
                  />
                  {belowThreshold && (
                    <FiAlertTriangle size={14} color={colors.netNegative} title={`Balance drops below ${fmt(minCashThreshold!)} in ${periodWord} ${minBalancePeriod}`} />
                  )}
                </div>
              </div>
            </div>

            {/* ── Charts Controls ── */}
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.75rem", flexWrap: "wrap" }}>
              <button
                onClick={() => setShowCharts((p) => !p)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.375rem",
                  padding: "0.4rem 0.75rem",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  color: colors.textSecondary,
                  background: "transparent",
                  border: `1px solid ${colors.border}`,
                  borderRadius: 6,
                  cursor: "pointer",
                  fontFamily: "'Inter', sans-serif",
                }}
              >
                <FiBarChart2 size={14} /> {showCharts ? "Hide Charts" : "Show Charts"}
              </button>
              {showCharts && (
                <label style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem", fontSize: "0.75rem", fontWeight: 600, color: colors.textSecondary, cursor: "pointer", userSelect: "none" }}>
                  <input
                    type="checkbox"
                    checked={showDataLabels}
                    onChange={(e) => setShowDataLabels(e.target.checked)}
                    style={{ width: 14, height: 14, accentColor: "var(--primary)", cursor: "pointer" }}
                  />
                  Data Labels
                </label>
              )}
            </div>

            {/* ── Expanded chart overlay ── */}
            {expandedChart && (
              <div
                onClick={() => setExpandedChart(null)}
                style={{
                  position: "fixed",
                  inset: 0,
                  zIndex: 9999,
                  background: "rgba(0,0,0,0.6)",
                  backdropFilter: "blur(4px)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "2rem",
                }}
              >
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    width: "95vw",
                    maxWidth: 1400,
                    background: colors.cardBg,
                    border: `1px solid ${colors.border}`,
                    borderRadius: 16,
                    padding: "1.5rem",
                    position: "relative",
                    boxShadow: "0 25px 50px rgba(0,0,0,0.3)",
                  }}
                >
                  <button
                    onClick={() => setExpandedChart(null)}
                    style={{
                      position: "absolute",
                      top: 12,
                      right: 12,
                      background: "transparent",
                      border: "none",
                      color: colors.textSecondary,
                      cursor: "pointer",
                      padding: 4,
                    }}
                    title="Close"
                  >
                    <FiMinimize2 size={18} />
                  </button>

                  {expandedChart === "balance" && (
                    <>
                      <div style={{ ...chartTitle, fontSize: "1rem", marginBottom: "1rem" }}>Ending Cash Balance</div>
                      <ResponsiveContainer width="100%" height={500}>
                        <AreaChart data={chartData} margin={{ top: 20, right: 30, bottom: 10, left: 20 }}>
                          <defs>
                            <linearGradient id="balGradExp" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={colors.netPositive} stopOpacity={0.3} />
                              <stop offset="95%" stopColor={colors.netPositive} stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="balGradForecastExp" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="confBandGradExp" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#7c3aed" stopOpacity={0.12} />
                              <stop offset="100%" stopColor="#7c3aed" stopOpacity={0.03} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                          <XAxis dataKey="name" tick={{ fontSize: 12, fill: axisColor }} tickLine={false} />
                          <YAxis tick={{ fontSize: 12, fill: axisColor }} tickFormatter={(v) => fmtShort(v)} tickLine={false} axisLine={false} />
                          <Tooltip
                            formatter={(value: number | string | undefined, name?: string) => {
                              const v = fmt(Number(value ?? 0));
                              if (name === "forecastBalance") return [v, "Forecast"];
                              if (name === "balanceUpper") return [v, "95% Upper"];
                              if (name === "balanceLower") return [v, "95% Lower"];
                              return [v, "Balance"];
                            }}
                            contentStyle={{ background: colors.cardBg, border: `1px solid ${colors.border}`, borderRadius: 8, fontSize: "0.85rem" }}
                            labelStyle={{ color: colors.text, fontWeight: 600 }}
                            itemStyle={{ color: colors.text }}
                          />
                          {minCashThreshold !== null && <ReferenceLine y={minCashThreshold} stroke={colors.netNegative} strokeDasharray="6 3" strokeWidth={1.5} label={{ value: `Min: ${fmtShort(minCashThreshold)}`, position: "insideTopRight", fill: colors.netNegative, fontSize: 12 }} />}
                          {forecastBoundaryLabel && <ReferenceLine x={forecastBoundaryLabel} stroke="#3b82f6" strokeDasharray="6 3" strokeWidth={1.5} />}
                          <ReferenceLine y={0} stroke={axisColor} strokeWidth={0.5} />
                          {hasForecast ? (
                            <>
                              {showConfidenceBands && chartData.some(d => d.balanceUpper != null) && (
                                <Area type="monotone" dataKey="balanceUpper" stroke="#7c3aed" strokeWidth={1} strokeDasharray="4 2" fill="url(#confBandGradExp)" connectNulls dot={false} activeDot={false} name="balanceUpper" />
                              )}
                              {showConfidenceBands && chartData.some(d => d.balanceLower != null) && (
                                <Area type="monotone" dataKey="balanceLower" stroke="#7c3aed" strokeWidth={1} strokeDasharray="4 2" fill={colors.cardBg} connectNulls dot={false} activeDot={false} name="balanceLower" />
                              )}
                              <Area type="monotone" dataKey="actualBalance" stroke={colors.netPositive} fill="url(#balGradExp)" strokeWidth={3} dot={{ r: 5, fill: colors.cardBg, stroke: colors.netPositive, strokeWidth: 2 }} activeDot={{ r: 7 }} name="Actual" connectNulls />
                              <Area type="monotone" dataKey="forecastBalance" stroke="#3b82f6" fill="url(#balGradForecastExp)" strokeWidth={3} strokeDasharray="6 3" dot={{ r: 5, fill: colors.cardBg, stroke: "#3b82f6", strokeWidth: 2 }} activeDot={{ r: 7 }} name="Forecast" connectNulls />
                            </>
                          ) : (
                            <Area type="monotone" dataKey="endingBalance" stroke={colors.netPositive} fill="url(#balGradExp)" strokeWidth={3} dot={{ r: 5, fill: colors.cardBg, stroke: colors.netPositive, strokeWidth: 2 }} activeDot={{ r: 7 }} name="Balance">
                              {showDataLabels && <LabelList dataKey="endingBalance" position="top" formatter={(v) => fmtShort(Number(v ?? 0))} style={{ fontSize: 11, fill: colors.text, fontWeight: 600 }} />}
                            </Area>
                          )}
                        </AreaChart>
                      </ResponsiveContainer>
                    </>
                  )}

                  {expandedChart === "inout" && (
                    <>
                      <div style={{ ...chartTitle, fontSize: "1rem", marginBottom: "1rem" }}>{periodLabel} Inflows vs Outflows</div>
                      <ResponsiveContainer width="100%" height={500}>
                        <BarChart data={chartData} margin={{ top: 20, right: 30, bottom: 10, left: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                          <XAxis dataKey="name" tick={{ fontSize: 12, fill: axisColor }} tickLine={false} />
                          <YAxis tick={{ fontSize: 12, fill: axisColor }} tickFormatter={(v) => fmtShort(v)} tickLine={false} axisLine={false} />
                          <Tooltip formatter={tooltipFormatter} contentStyle={{ background: colors.cardBg, border: `1px solid ${colors.border}`, borderRadius: 8, fontSize: "0.85rem" }} labelStyle={{ color: colors.text, fontWeight: 600 }} itemStyle={{ color: colors.text }} />
                          <Legend wrapperStyle={{ fontSize: "0.8rem", color: colors.textSecondary }} />
                          <Bar dataKey="inflow" name="Inflows" fill={colors.inflowColor} radius={[3, 3, 0, 0]} barSize={timeFrame === "monthly" ? 50 : 24}>
                            {showDataLabels && <LabelList dataKey="inflow" position="top" formatter={(v) => fmtShort(Number(v ?? 0))} style={{ fontSize: 10, fill: colors.inflowColor, fontWeight: 600 }} />}
                          </Bar>
                          <Bar dataKey="outflow" name="Outflows" fill={colors.outflowColor} radius={[3, 3, 0, 0]} barSize={timeFrame === "monthly" ? 50 : 24} opacity={0.8}>
                            {showDataLabels && <LabelList dataKey="outflow" position="top" formatter={(v) => fmtShort(Number(v ?? 0))} style={{ fontSize: 10, fill: colors.outflowColor, fontWeight: 600 }} />}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </>
                  )}

                  {expandedChart === "net" && (
                    <>
                      <div style={{ ...chartTitle, fontSize: "1rem", marginBottom: "1rem" }}>{periodLabel} Net Cash Flow</div>
                      <ResponsiveContainer width="100%" height={500}>
                        <BarChart data={chartData} margin={{ top: 20, right: 30, bottom: 10, left: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                          <XAxis dataKey="name" tick={{ fontSize: 12, fill: axisColor }} tickLine={false} />
                          <YAxis tick={{ fontSize: 12, fill: axisColor }} tickFormatter={(v) => fmtShort(v)} tickLine={false} axisLine={false} />
                          <Tooltip formatter={(value) => [fmt(Number(value ?? 0)), "Net Flow"]} contentStyle={{ background: colors.cardBg, border: `1px solid ${colors.border}`, borderRadius: 8, fontSize: "0.85rem" }} labelStyle={{ color: colors.text, fontWeight: 600 }} itemStyle={{ color: colors.text }} />
                          <ReferenceLine y={0} stroke={axisColor} strokeWidth={1} />
                          <Bar dataKey="netFlow" name="Net Flow" radius={[3, 3, 0, 0]} barSize={timeFrame === "monthly" ? 60 : 32}>
                            {chartData.map((entry, idx) => (
                              <Cell key={idx} fill={entry.netFlow >= 0 ? colors.netPositive : colors.netNegative} opacity={0.85} />
                            ))}
                            {showDataLabels && <LabelList dataKey="netFlow" position="top" formatter={(v) => fmtShort(Number(v ?? 0))} style={{ fontSize: 11, fill: colors.text, fontWeight: 600 }} />}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </>
                  )}
                </div>
              </div>
            )}

            {showCharts && (
              <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1rem" }}>
                {/* ── Chart 1: Ending Cash Balance (Area) ── */}
                <div style={{ ...chartCardStyle, position: "relative" }}>
                  <button onClick={() => setExpandedChart("balance")} style={{ position: "absolute", top: 10, right: 10, background: "transparent", border: "none", color: colors.textSecondary, cursor: "pointer", padding: 4, opacity: 0.6 }} title="Expand"><FiMaximize2 size={14} /></button>
                  <div style={chartTitle}>Ending Cash Balance</div>
                  <ResponsiveContainer width="100%" height={250}>
                    <AreaChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                      <defs>
                        <linearGradient id="balGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={colors.netPositive} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={colors.netPositive} stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="balGradForecast" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="confBandGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#7c3aed" stopOpacity={0.12} />
                          <stop offset="100%" stopColor="#7c3aed" stopOpacity={0.03} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: axisColor }} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: axisColor }} tickFormatter={(v) => fmtShort(v)} tickLine={false} axisLine={false} />
                      <Tooltip
                        formatter={(value: number | string | undefined, name?: string) => {
                          const v = fmt(Number(value ?? 0));
                          if (name === "forecastBalance") return [v, "Forecast"];
                          if (name === "balanceUpper") return [v, "95% Upper"];
                          if (name === "balanceLower") return [v, "95% Lower"];
                          return [v, "Balance"];
                        }}
                        contentStyle={{ background: colors.cardBg, border: `1px solid ${colors.border}`, borderRadius: 8, fontSize: "0.75rem" }}
                        labelStyle={{ color: colors.text, fontWeight: 600 }}
                        itemStyle={{ color: colors.text }}
                      />
                      {minCashThreshold !== null && (
                        <ReferenceLine y={minCashThreshold} stroke={colors.netNegative} strokeDasharray="6 3" strokeWidth={1.5} label={{ value: `Min: ${fmtShort(minCashThreshold)}`, position: "insideTopRight", fill: colors.netNegative, fontSize: 10 }} />
                      )}
                      {forecastBoundaryLabel && <ReferenceLine x={forecastBoundaryLabel} stroke="#3b82f6" strokeDasharray="6 3" strokeWidth={1.5} />}
                      <ReferenceLine y={0} stroke={axisColor} strokeWidth={0.5} />
                      {hasForecast ? (
                        <>
                          {showConfidenceBands && chartData.some(d => d.balanceUpper != null) && (
                            <Area type="monotone" dataKey="balanceUpper" stroke="#7c3aed" strokeWidth={1} strokeDasharray="4 2" fill="url(#confBandGrad)" connectNulls dot={false} activeDot={false} name="balanceUpper" />
                          )}
                          {showConfidenceBands && chartData.some(d => d.balanceLower != null) && (
                            <Area type="monotone" dataKey="balanceLower" stroke="#7c3aed" strokeWidth={1} strokeDasharray="4 2" fill={colors.cardBg} connectNulls dot={false} activeDot={false} name="balanceLower" />
                          )}
                          <Area type="monotone" dataKey="actualBalance" stroke={colors.netPositive} fill="url(#balGrad)" strokeWidth={2.5} dot={{ r: 3, fill: colors.cardBg, stroke: colors.netPositive, strokeWidth: 2 }} activeDot={{ r: 5 }} name="Actual" connectNulls />
                          <Area type="monotone" dataKey="forecastBalance" stroke="#3b82f6" fill="url(#balGradForecast)" strokeWidth={2.5} strokeDasharray="6 3" dot={{ r: 3, fill: colors.cardBg, stroke: "#3b82f6", strokeWidth: 2 }} activeDot={{ r: 5 }} name="Forecast" connectNulls />
                        </>
                      ) : (
                        <Area type="monotone" dataKey="endingBalance" stroke={colors.netPositive} fill="url(#balGrad)" strokeWidth={2.5} dot={{ r: 3, fill: colors.cardBg, stroke: colors.netPositive, strokeWidth: 2 }} activeDot={{ r: 5 }} name="Balance">
                          {showDataLabels && <LabelList dataKey="endingBalance" position="top" formatter={(v) => fmtShort(Number(v ?? 0))} style={{ fontSize: 9, fill: colors.text, fontWeight: 600 }} />}
                        </Area>
                      )}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* ── Chart 2: Inflows vs Outflows (Bar) ── */}
                <div style={{ ...chartCardStyle, position: "relative" }}>
                  <button onClick={() => setExpandedChart("inout")} style={{ position: "absolute", top: 10, right: 10, background: "transparent", border: "none", color: colors.textSecondary, cursor: "pointer", padding: 4, opacity: 0.6 }} title="Expand"><FiMaximize2 size={14} /></button>
                  <div style={chartTitle}>{periodLabel} Inflows vs Outflows</div>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: axisColor }} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: axisColor }} tickFormatter={(v) => fmtShort(v)} tickLine={false} axisLine={false} />
                      <Tooltip
                        formatter={tooltipFormatter}
                        contentStyle={{ background: colors.cardBg, border: `1px solid ${colors.border}`, borderRadius: 8, fontSize: "0.75rem" }}
                        labelStyle={{ color: colors.text, fontWeight: 600 }}
                        itemStyle={{ color: colors.text }}
                      />
                      <Legend wrapperStyle={{ fontSize: "0.7rem", color: colors.textSecondary }} />
                      <Bar dataKey="inflow" name="Inflows" fill={colors.inflowColor} radius={[3, 3, 0, 0]} barSize={timeFrame === "monthly" ? 28 : 14}>
                        {showDataLabels && <LabelList dataKey="inflow" position="top" formatter={(v) => fmtShort(Number(v ?? 0))} style={{ fontSize: 8, fill: colors.inflowColor, fontWeight: 600 }} />}
                      </Bar>
                      <Bar dataKey="outflow" name="Outflows" fill={colors.outflowColor} radius={[3, 3, 0, 0]} barSize={timeFrame === "monthly" ? 28 : 14} opacity={0.8}>
                        {showDataLabels && <LabelList dataKey="outflow" position="top" formatter={(v) => fmtShort(Number(v ?? 0))} style={{ fontSize: 8, fill: colors.outflowColor, fontWeight: 600 }} />}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* ── Chart 3: Net Cash Flow (Waterfall-style bars) ── */}
                <div style={{ ...chartCardStyle, flex: "1 1 100%", minWidth: "100%", position: "relative" }}>
                  <button onClick={() => setExpandedChart("net")} style={{ position: "absolute", top: 10, right: 10, background: "transparent", border: "none", color: colors.textSecondary, cursor: "pointer", padding: 4, opacity: 0.6 }} title="Expand"><FiMaximize2 size={14} /></button>
                  <div style={chartTitle}>{periodLabel} Net Cash Flow</div>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: axisColor }} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: axisColor }} tickFormatter={(v) => fmtShort(v)} tickLine={false} axisLine={false} />
                      <Tooltip
                        formatter={(value) => [fmt(Number(value ?? 0)), "Net Flow"]}
                        contentStyle={{ background: colors.cardBg, border: `1px solid ${colors.border}`, borderRadius: 8, fontSize: "0.75rem" }}
                        labelStyle={{ color: colors.text, fontWeight: 600 }}
                        itemStyle={{ color: colors.text }}
                      />
                      <ReferenceLine y={0} stroke={axisColor} strokeWidth={1} />
                      {forecastBoundaryLabel && <ReferenceLine x={forecastBoundaryLabel} stroke="#3b82f6" strokeDasharray="6 3" strokeWidth={1.5} />}
                      <Bar dataKey="netFlow" name="Net Flow" radius={[3, 3, 0, 0]} barSize={timeFrame === "monthly" ? 40 : 24}>
                        {chartData.map((entry, idx) => (
                          <Cell key={idx} fill={entry.netFlow >= 0 ? colors.netPositive : colors.netNegative} opacity={entry.isForecast ? 0.5 : 0.85} />
                        ))}
                        {showDataLabels && <LabelList dataKey="netFlow" position="top" formatter={(v) => fmtShort(Number(v ?? 0))} style={{ fontSize: 9, fill: colors.text, fontWeight: 600 }} />}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </>
        );
      })()}

      {/* Company Profile Badge */}
      {companyProfileExists === true && (
        <div style={{
          display: "inline-flex", alignItems: "center", gap: "0.4rem",
          marginBottom: "0.75rem", padding: "0.3rem 0.75rem",
          background: theme === "dark" ? "rgba(99,102,241,0.12)" : "rgba(99,102,241,0.08)",
          border: `1px solid ${theme === "dark" ? "rgba(99,102,241,0.25)" : "rgba(99,102,241,0.15)"}`,
          borderRadius: 20, fontSize: "0.75rem", fontWeight: 600, color: colors.text,
        }}>
          <span>&#x1F3E2;</span> {companyProfileName || "Company Profile Active"}
        </div>
      )}

      {/* AI CFO Insights Panel */}
      {(cfoInsights.length > 0 || cfoLoading || rows.length > 0) && (
        <div style={{ marginBottom: "1rem" }}>
          <button
            onClick={() => setShowCfoPanel((p) => !p)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.5rem 0.75rem",
              background: "linear-gradient(135deg, rgba(99,102,241,0.12), rgba(0,212,170,0.08))",
              border: `1px solid ${theme === "dark" ? "rgba(99,102,241,0.3)" : "rgba(99,102,241,0.2)"}`,
              borderRadius: 10,
              cursor: "pointer",
              color: theme === "dark" ? "#a5b4fc" : "#4f46e5",
              fontWeight: 700,
              fontSize: "0.85rem",
              width: "100%",
              textAlign: "left",
              marginBottom: showCfoPanel ? "0.5rem" : 0,
            }}
          >
            {showCfoPanel ? <FiChevronDown size={16} /> : <FiChevronRight size={16} />}
            <span style={{ letterSpacing: "0.02em" }}>AI CFO Insights</span>
            <span style={{ fontSize: "0.7rem", fontWeight: 500, opacity: 0.7, marginLeft: "auto" }}>
              {cfoLoading ? "Analyzing..." : cfoInsights.length === 0 ? "Click Refresh" : (
                <>
                  {cfoInsights.filter((i) => i.severity === "alert").length > 0 && `${cfoInsights.filter((i) => i.severity === "alert").length} alerts`}
                  {cfoInsights.filter((i) => i.severity === "alert").length > 0 && cfoInsights.filter((i) => i.severity !== "alert").length > 0 && " · "}
                  {cfoInsights.filter((i) => i.severity !== "alert").length > 0 && `${cfoInsights.filter((i) => i.severity !== "alert").length} more`}
                </>
              )}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); fetchCfoInsights(true); }}
              disabled={cfoLoading}
              style={{
                padding: "0.25rem 0.5rem",
                fontSize: "0.7rem",
                border: `1px solid ${colors.border}`,
                borderRadius: 6,
                background: colors.cardBg,
                color: colors.text,
                cursor: cfoLoading ? "wait" : "pointer",
                fontWeight: 500,
              }}
            >
              {cfoLoading ? "..." : "Refresh"}
            </button>
          </button>
          {showCfoPanel && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "0.5rem" }}>
              {cfoLoading && cfoInsights.length === 0 && (
                <div style={{
                  gridColumn: "1 / -1", padding: "1.5rem", textAlign: "center",
                  color: colors.textSecondary, fontSize: "0.85rem",
                  background: theme === "dark" ? "rgba(99,102,241,0.06)" : "rgba(99,102,241,0.03)",
                  borderRadius: 10, border: `1px solid ${colors.border}`,
                }}>
                  <span style={{ display: "inline-block", animation: "spin 1s linear infinite" }}>&#8635;</span>{" "}
                  Generating AI insights from your financial data... (this may take a moment)
                </div>
              )}
              {!cfoLoading && cfoInsights.length === 0 && rows.length > 0 && (
                <div style={{
                  gridColumn: "1 / -1", padding: "1rem", textAlign: "center",
                  color: colors.textSecondary, fontSize: "0.85rem",
                  background: theme === "dark" ? "rgba(99,102,241,0.06)" : "rgba(99,102,241,0.03)",
                  borderRadius: 10, border: `1px solid ${colors.border}`,
                }}>
                  No insights generated yet. Click <strong>Refresh</strong> to analyze your data with AI.
                </div>
              )}
              {cfoInsights.map((insight) => {
                const severityStyles: Record<string, { bg: string; border: string; icon: string; accent: string }> = {
                  alert: {
                    bg: theme === "dark" ? "rgba(239,68,68,0.08)" : "rgba(239,68,68,0.05)",
                    border: theme === "dark" ? "rgba(239,68,68,0.3)" : "rgba(239,68,68,0.2)",
                    icon: "🔴",
                    accent: "#ef4444",
                  },
                  watch: {
                    bg: theme === "dark" ? "rgba(245,158,11,0.08)" : "rgba(245,158,11,0.05)",
                    border: theme === "dark" ? "rgba(245,158,11,0.3)" : "rgba(245,158,11,0.2)",
                    icon: "🟡",
                    accent: "#f59e0b",
                  },
                  opportunity: {
                    bg: theme === "dark" ? "rgba(16,185,129,0.08)" : "rgba(16,185,129,0.05)",
                    border: theme === "dark" ? "rgba(16,185,129,0.3)" : "rgba(16,185,129,0.2)",
                    icon: "🟢",
                    accent: "#10b981",
                  },
                  info: {
                    bg: theme === "dark" ? "rgba(99,102,241,0.08)" : "rgba(99,102,241,0.05)",
                    border: theme === "dark" ? "rgba(99,102,241,0.3)" : "rgba(99,102,241,0.2)",
                    icon: "🔵",
                    accent: "#6366f1",
                  },
                };
                const s = severityStyles[insight.severity] || severityStyles.info;
                return (
                  <div
                    key={insight.id}
                    style={{
                      background: s.bg,
                      border: `1px solid ${s.border}`,
                      borderRadius: 10,
                      padding: "0.75rem",
                      borderLeft: `4px solid ${s.accent}`,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", marginBottom: "0.375rem" }}>
                      <span style={{ fontSize: "0.75rem" }}>{s.icon}</span>
                      <span style={{ fontWeight: 700, fontSize: "0.8rem", color: colors.text }}>{insight.title}</span>
                      {insight.metric && (
                        <span
                          style={{
                            marginLeft: "auto",
                            fontSize: "0.7rem",
                            fontWeight: 700,
                            color: s.accent,
                            fontFamily: "'Cascadia Code', monospace",
                          }}
                        >
                          {insight.metric}
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: "0.75rem", color: colors.textSecondary, lineHeight: 1.4, margin: "0 0 0.375rem" }}>
                      {insight.description}
                    </p>
                    {insight.action && (
                      <p style={{ fontSize: "0.7rem", color: s.accent, fontWeight: 600, margin: 0 }}>
                        → {insight.action}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div
        style={{
          background: colors.cardBg,
          border: `1px solid ${colors.border}`,
          borderRadius: 16,
          overflow: "hidden",
          boxShadow: theme === "dark"
            ? "0 4px 24px rgba(0,0,0,0.25), 0 1px 2px rgba(0,0,0,0.15)"
            : "0 4px 24px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
        }}
      >
        <div style={{ display: "flex" }}>
          {/* ── FROZEN PANEL (Category + Formula) ── */}
          <div
            style={{
              flex: "0 0 520px",
              overflow: "hidden",
              zIndex: 2,
              position: "relative",
              boxShadow: theme === "dark" ? "4px 0 12px -2px rgba(0,0,0,0.4)" : "4px 0 12px -2px rgba(0,0,0,0.08)",
            }}
          >
            <table
              style={{
                width: 520,
                tableLayout: "fixed",
                borderCollapse: "separate",
                borderSpacing: 0,
                fontSize: "0.8125rem",
                fontVariantNumeric: "tabular-nums",
                fontFamily: "'Inter', sans-serif",
              }}
            >
              <colgroup>
                <col style={{ width: 240 }} />
                <col style={{ width: 280 }} />
              </colgroup>
              <thead>
                <tr style={{
                  background: colors.headerBg,
                  borderBottom: `2px solid ${theme === "dark" ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)"}`,
                }}>
                  <th style={{ padding: "0.75rem", textAlign: "left", fontWeight: 800, fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.08em", color: colors.text, background: colors.headerBg }}>
                    Category
                  </th>
                  <th style={{ padding: "0.75rem 0.5rem", textAlign: "left", fontWeight: 700, fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.06em", color: colors.textSecondary, background: colors.headerBg, borderLeft: `1px solid ${colors.border}`, whiteSpace: "nowrap" }}>
                    Formula
                  </th>
                </tr>
              </thead>
              <tbody ref={frozenBodyRef}>
                {rows.map((row, ri) => {
                  if (row.parentId) return null;

                  if (row.label === "CASH RECEIPTS" || row.label === "CASH DISBURSEMENTS") {
                    return (
                      <tr key={`f-${row.label}`}>
                        <td style={sectionHeaderStyle} colSpan={2}>{row.label}</td>
                      </tr>
                    );
                  }

                  const isTotalOrCalc = row.type === "total" || row.type === "net" || (row.type === "balance" && row.label !== "Beginning Cash Balance");
                  const isBeginBalance = row.label === "Beginning Cash Balance";
                  const isNet = row.type === "net";
                  const isEndBalance = row.label === "Ending Cash Balance";
                  const isTotal = row.label.startsWith("Total ");
                  const isCategoryRow = row.type === "category";
                  const categoryClusters = getClustersForRow(row.label);
                  const hasNonZeroClusters = isCategoryRow && categoryClusters.some((i) => {
                    const cred = Number(i.credits) || 0; const deb = Number(i.debits) || 0; const tot = Number(i.total_amount) || 0;
                    return (row.section === "inflow" ? (cred > 0 ? cred : (tot > 0 ? tot : 0)) : (deb > 0 ? deb : (tot < 0 ? Math.abs(tot) : 0))) > 0;
                  });
                  const isCustomParent = row.isCustomParent === true;
                  const customExpandKey = isCustomParent ? `custom-${row.customId}` : null;
                  const canExpand = hasNonZeroClusters || isCustomParent;
                  const isExpanded = expandedCategories.has(expandKey(row.section ?? "", row.label)) || (customExpandKey !== null && expandedCategories.has(customExpandKey));
                  const sameLabelInOtherSection = isCategoryRow && !row.parentId && rows.some((r) => r.type === "category" && !r.parentId && r.label === row.label && r.section !== row.section);
                  const isSpecialRow = isTotal || isNet || isEndBalance;
                  const isStripeRow = !isSpecialRow && ri % 2 !== 0;
                  const stripeBg = isStripeRow ? colors.stripeBg : colors.cardBg;
                  const rowBg = isSpecialRow ? colors.totalBg : stripeBg;
                  const rowKey = row.customId ?? expandKey(row.section ?? "", row.label);
                  const accentColor = row.section === "inflow" && row.type === "category"
                    ? (theme === "dark" ? "rgba(52,211,153,0.5)" : "rgba(5,150,105,0.4)")
                    : row.section === "outflow" && row.type === "category"
                      ? (theme === "dark" ? "rgba(248,113,113,0.5)" : "rgba(220,38,38,0.4)")
                      : undefined;

                  const frozenRowStyle: React.CSSProperties = {
                    borderBottom: `1px solid ${colors.border}`,
                    background: rowBg,
                    minHeight: isCategoryRow ? 64 : 40,
                    ...(isSpecialRow ? { fontWeight: 700, borderTop: `2px solid ${colors.border}` } : {}),
                  };

                  const addLineItemBtn = (section: "inflow" | "outflow") => (
                    <tr key={`f-btn-${section}`} style={{ borderBottom: `1px solid ${colors.border}` }}>
                      <td colSpan={2} style={{ padding: "0.375rem 0.75rem", background: colors.cardBg, borderBottom: `1px solid ${colors.border}` }}>
                        <button type="button" onClick={() => addLineItem(section)} style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", padding: "0.35rem 0.5rem", fontSize: "0.8rem", color: "var(--primary)", background: "none", border: `1px dashed ${colors.border}`, borderRadius: 6, cursor: "pointer", fontWeight: 500 }}>
                          <FiPlus size={14} /> Add line item
                        </button>
                      </td>
                    </tr>
                  );

                  const subBg = theme === "dark" ? "#171f2e" : "#fafbfc";

                  return (
                    <Fragment key={`f-${rowKey}`}>
                      {row.label === "Total Cash Receipts" ? addLineItemBtn("inflow") : null}
                      {row.label === "Total Cash Disbursements" ? addLineItemBtn("outflow") : null}
                      <tr style={frozenRowStyle}>
                        <td
                          style={{
                            padding: "0.5rem 0.75rem",
                            fontWeight: isTotalOrCalc || isBeginBalance ? 700 : 500,
                            color: row.section === "inflow" && row.type === "category" ? colors.inflowColor : row.section === "outflow" && row.type === "category" ? colors.outflowColor : colors.text,
                            fontSize: isTotalOrCalc || isBeginBalance ? "0.8125rem" : "0.78rem",
                            background: rowBg,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            borderLeft: accentColor ? `3px solid ${accentColor}` : undefined,
                          }}
                          title={row.label}
                          onContextMenu={(e) => {
                            if (isCategoryRow && forecastPeriodCount > 0) { e.preventDefault(); setForecastRowOverride(forecastRowOverride === rowKey ? null : rowKey); }
                          }}
                        >
                          {forecastRowOverride === rowKey && isCategoryRow && (
                            <div style={{ position: "absolute", zIndex: 50, background: colors.cardBg, border: `1px solid ${colors.border}`, borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.15)", padding: "0.5rem 0.75rem", minWidth: 200, left: 250, top: 0 }} onClick={e => e.stopPropagation()}>
                              <div style={{ fontSize: "0.7rem", fontWeight: 600, color: colors.textSecondary, marginBottom: "0.375rem" }}>Forecast Method for: {row.label}</div>
                              <select value={row.forecastMethod || defaultForecastMethod} onChange={e => { const method = e.target.value; const rk = row.customId || row.label; pushUndo(rows); if (method === defaultForecastMethod) { setRows(prev => prev.map((r, idx) => idx === ri ? { ...r, values: [...r.values], forecastMethod: undefined } : r)); setExplicitRowOverrides(prev => { const next = { ...prev }; delete next[rk]; return next; }); } else { setRows(prev => prev.map((r, idx) => idx === ri ? { ...r, values: [...r.values], forecastMethod: method } : r)); setExplicitRowOverrides(prev => ({ ...prev, [rk]: { method } })); } setDirty(true); setForecastRowOverride(null); }} style={{ width: "100%", padding: "0.3rem 0.4rem", fontSize: "0.75rem", border: `1px solid ${colors.border}`, borderRadius: 6, background: colors.inputBg, color: colors.text, fontFamily: "'Inter', sans-serif" }}>
                                <option value={defaultForecastMethod}>Default ({forecastAlgorithms.find(a => a.id === defaultForecastMethod)?.name ?? defaultForecastMethod})</option>
                                {forecastAlgorithms.filter(a => a.id !== defaultForecastMethod).map(a => (<option key={a.id} value={a.id}>{a.name}</option>))}
                              </select>
                              <button onClick={() => setForecastRowOverride(null)} style={{ marginTop: "0.375rem", fontSize: "0.65rem", color: colors.textSecondary, background: "none", border: "none", cursor: "pointer", padding: 0 }}>Close</button>
                            </div>
                          )}
                          <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                            {canExpand ? (
                              <button type="button" onClick={(e) => { e.stopPropagation(); const key = isCustomParent ? `custom-${row.customId}` : expandKey(row.section ?? "", row.label); setExpandedCategories(prev => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; }); }} aria-label={isExpanded ? "Collapse" : "Expand breakdown"} style={{ padding: "0.125rem", border: "none", background: "none", cursor: "pointer", color: colors.textSecondary, display: "flex", alignItems: "center", flexShrink: 0 }}>
                                {isExpanded ? <FiChevronDown size={16} /> : <FiChevronRight size={16} />}
                              </button>
                            ) : null}
                            {editingLabelIdx === ri ? (
                              <input ref={labelInputRef} type="text" defaultValue={row.label} onBlur={(e) => commitLabelEdit(ri, e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") commitLabelEdit(ri, (e.target as HTMLInputElement).value); if (e.key === "Escape") setEditingLabelIdx(null); }} onClick={(e) => e.stopPropagation()} style={{ flex: 1, padding: "0.2rem 0.375rem", fontSize: "0.78rem", fontFamily: "'Inter', sans-serif", border: `2px solid var(--primary)`, borderRadius: 4, outline: "none", background: colors.inputBg, color: colors.text, fontWeight: 500, minWidth: 0 }} />
                            ) : (
                              <span onDoubleClick={() => isCategoryRow && setEditingLabelIdx(ri)} style={{ overflow: "hidden", textOverflow: "ellipsis", cursor: isCategoryRow ? "text" : "default" }}>
                                {row.label}
                                {sameLabelInOtherSection && <span style={{ marginLeft: "0.25rem", fontSize: "0.7em", color: colors.textSecondary, fontWeight: 400 }}>({row.section === "inflow" ? "Receipts" : "Disbursements"})</span>}
                              </span>
                            )}
                            {row.customId && editingLabelIdx !== ri && (
                              <button type="button" onClick={(e) => { e.stopPropagation(); deleteLineItem(ri); }} title="Remove line item" style={{ padding: "0.125rem", border: "none", background: "none", cursor: "pointer", color: colors.textSecondary, display: "flex", alignItems: "center", flexShrink: 0, opacity: 0.5, transition: "opacity 0.15s" }} onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; (e.currentTarget as HTMLButtonElement).style.color = colors.outflowColor; }} onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "0.5"; (e.currentTarget as HTMLButtonElement).style.color = colors.textSecondary; }}>
                                <FiX size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: "0.375rem 0.5rem", fontSize: "0.7rem", fontFamily: "'Cascadia Code', 'Fira Code', monospace", color: row.formula ? (theme === "dark" ? "#a5b4fc" : "#6366f1") : colors.textSecondary, fontStyle: row.formula ? "normal" : "italic", borderLeft: `1px solid ${colors.border}`, overflow: "hidden", opacity: (row.type === "total" || row.type === "net" || row.type === "balance") ? 0.5 : 1, background: rowBg, verticalAlign: "middle" }} title={row.formula || ""}>
                          {row.type === "category"
                            ? (row.formula ? <FormulaCell formula={row.formula} theme={theme} /> : "—")
                            : (row.type === "balance" ? "Cumulative" : row.type === "net" ? "Inflows − Outflows" : "Σ")}
                        </td>
                      </tr>
                      {/* Cluster sub-rows (frozen side) */}
                      {isExpanded && hasNonZeroClusters && !isCustomParent && (() => {
                        const allItems = getClustersForRow(row.label);
                        const sectionAmt = (i: { credits?: number; debits?: number; total_amount?: number }) => { const cred = Number(i.credits) || 0; const deb = Number(i.debits) || 0; const tot = Number(i.total_amount) || 0; return row.section === "inflow" ? (cred > 0 ? cred : (tot > 0 ? tot : 0)) : (deb > 0 ? deb : (tot < 0 ? Math.abs(tot) : 0)); };
                        return allItems.map((item) => ({ item, amount: sectionAmt(item) })).filter(({ amount }) => amount > 0).map(({ item }, idx) => (
                          <tr key={`f-sub-${item.representative}-${idx}`} style={{ borderBottom: `1px solid ${colors.border}`, background: subBg, minHeight: 36 }}>
                            <td style={{ padding: "0.375rem 0.75rem 0.375rem 2.25rem", fontSize: "0.75rem", color: colors.textSecondary, fontWeight: 400, background: subBg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.representative}>
                              <span style={{ color: colors.text }}>{item.representative.length > 60 ? item.representative.slice(0, 60) + "…" : item.representative}</span>
                              <span style={{ marginLeft: "0.375rem", fontSize: "0.7rem" }}>({item.size.toLocaleString()} txns)</span>
                            </td>
                            <td style={{ padding: "0.375rem 0.5rem", fontSize: "0.65rem", color: colors.textSecondary, borderLeft: `1px solid ${colors.border}`, fontStyle: "italic", background: subBg }}>—</td>
                          </tr>
                        ));
                      })()}
                      {/* Custom child rows (frozen side) */}
                      {isCustomParent && isExpanded && (() => {
                        const children = rows.map((r, idx) => ({ child: r, childRi: idx })).filter(({ child: c }) => c.parentId === row.customId);
                        return (
                          <>
                            {children.map(({ child, childRi }) => (
                              <tr key={`f-child-${child.customId}`} style={{ borderBottom: `1px solid ${colors.border}`, background: subBg, minHeight: 64 }}>
                                <td style={{ padding: "0.375rem 0.75rem 0.375rem 2.25rem", fontSize: "0.78rem", fontWeight: 500, color: row.section === "inflow" ? colors.inflowColor : colors.outflowColor, background: subBg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                                    {editingLabelIdx === childRi ? (
                                      <input ref={labelInputRef} type="text" defaultValue={child.label} onBlur={(e) => commitLabelEdit(childRi, e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") commitLabelEdit(childRi, (e.target as HTMLInputElement).value); if (e.key === "Escape") setEditingLabelIdx(null); }} onClick={(e) => e.stopPropagation()} style={{ flex: 1, padding: "0.2rem 0.375rem", fontSize: "0.78rem", fontFamily: "'Inter', sans-serif", border: `2px solid var(--primary)`, borderRadius: 4, outline: "none", background: colors.inputBg, color: colors.text, fontWeight: 500, minWidth: 0 }} />
                                    ) : (
                                      <span onDoubleClick={() => setEditingLabelIdx(childRi)} style={{ overflow: "hidden", textOverflow: "ellipsis", cursor: "text" }}>{child.label}</span>
                                    )}
                                    {editingLabelIdx !== childRi && (
                                      <button type="button" onClick={(e) => { e.stopPropagation(); deleteLineItem(childRi); }} title="Remove sub-item" style={{ padding: "0.125rem", border: "none", background: "none", cursor: "pointer", color: colors.textSecondary, display: "flex", alignItems: "center", flexShrink: 0, opacity: 0.5, transition: "opacity 0.15s" }} onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; (e.currentTarget as HTMLButtonElement).style.color = colors.outflowColor; }} onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "0.5"; (e.currentTarget as HTMLButtonElement).style.color = colors.textSecondary; }}>
                                        <FiX size={14} />
                                      </button>
                                    )}
                                  </div>
                                </td>
                                <td style={{ padding: "0.375rem 0.5rem", fontSize: "0.65rem", fontFamily: "'Cascadia Code', 'Fira Code', monospace", color: child.formula ? (theme === "dark" ? "#a5b4fc" : "#6366f1") : colors.textSecondary, borderLeft: `1px solid ${colors.border}`, fontStyle: child.formula ? "normal" : "italic", background: subBg, overflow: "hidden", verticalAlign: "middle" }} title={child.formula || ""}>{child.formula ? <FormulaCell formula={child.formula} theme={theme} /> : "—"}</td>
                              </tr>
                            ))}
                            <tr key={`f-addsub-${row.customId}`} style={{ borderBottom: `1px solid ${colors.border}` }}>
                              <td colSpan={2} style={{ padding: "0.375rem 0.75rem 0.375rem 2.25rem", background: subBg }}>
                                <button type="button" onClick={() => addSubItem(row.customId!, row.section as "inflow" | "outflow")} style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", padding: "0.3rem 0.5rem", fontSize: "0.75rem", color: "var(--primary)", background: "none", border: `1px dashed ${colors.border}`, borderRadius: 6, cursor: "pointer", fontWeight: 500 }}>
                                  <FiPlus size={12} /> Add sub-item
                                </button>
                              </td>
                            </tr>
                          </>
                        );
                      })()}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── SCROLLABLE PANEL (Period columns) ── */}
          <div style={{ flex: "1 1 0%", overflowX: "auto" }}>
            <table
              style={{
                tableLayout: "fixed",
                borderCollapse: "separate",
                borderSpacing: 0,
                fontSize: "0.8125rem",
                fontVariantNumeric: "tabular-nums",
                fontFamily: "'Inter', sans-serif",
                width: numPeriods * (timeFrame === "monthly" ? 130 : 110),
              }}
            >
              <colgroup>
                {Array.from({ length: numPeriods }, (_, i) => (
                  <col key={i} style={{ width: timeFrame === "monthly" ? 130 : 110 }} />
                ))}
              </colgroup>
              <thead>
                <tr style={{
                  background: colors.headerBg,
                  borderBottom: `2px solid ${theme === "dark" ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)"}`,
                }}>
                  {periodLabels.map((label, i) => {
                    const isForecast = forecastPeriodCount > 0 && actualPeriodCount > 0 && i >= actualPeriodCount;
                    const isBoundary = forecastPeriodCount > 0 && actualPeriodCount > 0 && i === actualPeriodCount;
                    return (
                      <th key={i} style={{ padding: "0.75rem 0.375rem", textAlign: "right", fontWeight: 600, color: isForecast ? "#3b82f6" : colors.textSecondary, fontSize: "0.6875rem", whiteSpace: "nowrap", borderLeft: isBoundary ? "3px solid #3b82f6" : `1px solid ${theme === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`, background: isForecast ? (theme === "dark" ? "#1e2d4a" : "#eef2ff") : colors.headerBg }}>
                        {label}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody ref={scrollBodyRef}>
                {rows.map((row, ri) => {
                  if (row.parentId) return null;

                  if (row.label === "CASH RECEIPTS" || row.label === "CASH DISBURSEMENTS") {
                    return (
                      <tr key={`s-${row.label}`}>
                        <td colSpan={numPeriods} style={{ ...sectionHeaderStyle, background: colors.headerBg }}>&nbsp;</td>
                      </tr>
                    );
                  }

                  const isTotalOrCalc = row.type === "total" || row.type === "net" || (row.type === "balance" && row.label !== "Beginning Cash Balance");
                  const isBeginBalance = row.label === "Beginning Cash Balance";
                  const isNet = row.type === "net";
                  const isEndBalance = row.label === "Ending Cash Balance";
                  const isTotal = row.label.startsWith("Total ");
                  const isCategoryRow = row.type === "category";
                  const categoryClusters = getClustersForRow(row.label);
                  const hasNonZeroClusters = isCategoryRow && categoryClusters.some((i) => {
                    const cred = Number(i.credits) || 0; const deb = Number(i.debits) || 0; const tot = Number(i.total_amount) || 0;
                    return (row.section === "inflow" ? (cred > 0 ? cred : (tot > 0 ? tot : 0)) : (deb > 0 ? deb : (tot < 0 ? Math.abs(tot) : 0))) > 0;
                  });
                  const isCustomParent = row.isCustomParent === true;
                  const customExpandKey = isCustomParent ? `custom-${row.customId}` : null;
                  const isExpanded = expandedCategories.has(expandKey(row.section ?? "", row.label)) || (customExpandKey !== null && expandedCategories.has(customExpandKey));
                  const isSpecialRow = isTotal || isNet || isEndBalance;
                  const isStripeRow = !isSpecialRow && ri % 2 !== 0;
                  const stripeBg = isStripeRow ? colors.stripeBg : colors.cardBg;
                  const rowBg = isSpecialRow ? colors.totalBg : stripeBg;
                  const rowKey = row.customId ?? expandKey(row.section ?? "", row.label);
                  const aggregationType: "sum" | "first" | "last" = isBeginBalance ? "first" : isEndBalance ? "last" : "sum";

                  const rowStyle: React.CSSProperties = {
                    borderBottom: `1px solid ${colors.border}`,
                    background: rowBg,
                    height: isCategoryRow ? 64 : 40,
                    ...(isSpecialRow ? { fontWeight: 700, borderTop: `2px solid ${colors.border}` } : {}),
                  };

                  const subBg = theme === "dark" ? "#171f2e" : "#fafbfc";

                  return (
                    <Fragment key={`s-${rowKey}`}>
                      {row.label === "Total Cash Receipts" ? (
                        <tr key="s-btn-inflow" style={{ borderBottom: `1px solid ${colors.border}` }}>
                          <td colSpan={numPeriods} style={{ padding: "0.375rem 0.75rem", background: colors.cardBg, borderBottom: `1px solid ${colors.border}` }}>&nbsp;</td>
                        </tr>
                      ) : null}
                      {row.label === "Total Cash Disbursements" ? (
                        <tr key="s-btn-outflow" style={{ borderBottom: `1px solid ${colors.border}` }}>
                          <td colSpan={numPeriods} style={{ padding: "0.375rem 0.75rem", background: colors.cardBg, borderBottom: `1px solid ${colors.border}` }}>&nbsp;</td>
                        </tr>
                      ) : null}
                      <tr style={rowStyle}>
                        {getDisplayValues(row.values, timeFrame, aggregationType).map((val, ci) => {
                          const isEditing = editingCell?.row === ri && editingCell?.col === ci;
                          const isForecastCol = forecastPeriodCount > 0 && actualPeriodCount > 0 && ci >= actualPeriodCount;
                          const isForecastBoundary = forecastPeriodCount > 0 && actualPeriodCount > 0 && ci === actualPeriodCount;
                          const isActualLocked = actualPeriodCount > 0 && forecastPeriodCount > 0 && ci < actualPeriodCount && !(isBeginBalance && ci === 0);
                          const canEdit = row.editable && !(isBeginBalance && ci > 0) && !isActualLocked;
                          const belowThresholdCell = isEndBalance && minCashThreshold !== null && val < minCashThreshold;
                          const cellColor = isNet || isEndBalance ? (val >= 0 ? colors.netPositive : colors.netNegative) : row.section === "inflow" && row.type === "total" ? colors.inflowColor : row.section === "outflow" && row.type === "total" ? colors.outflowColor : colors.text;
                          const forecastBg = isForecastCol ? (theme === "dark" ? "#1e2c4a" : "#f5f7ff") : undefined;
                          return (
                            <td key={ci} onClick={() => canEdit && handleCellClick(ri, ci)} style={{ padding: isEditing ? "0.125rem" : "0.5rem 0.5rem", textAlign: "right", color: cellColor, fontWeight: isTotalOrCalc ? 700 : 400, cursor: canEdit ? "pointer" : "default", borderLeft: isForecastBoundary ? "3px solid #3b82f6" : `1px solid ${theme === "dark" ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"}`, background: isEditing ? "transparent" : belowThresholdCell ? (theme === "dark" ? "#2d1f1f" : "#fef2f2") : (forecastBg ?? rowBg), whiteSpace: "nowrap" }}>
                              {isEditing ? (
                                <input ref={inputRef} type="text" defaultValue={val.toFixed(2)} onBlur={(e) => commitEdit(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") commitEdit((e.target as HTMLInputElement).value); if (e.key === "Escape") setEditingCell(null); }} style={{ width: "100%", padding: "0.375rem 0.375rem", textAlign: "right", fontSize: "0.8125rem", fontFamily: "'Inter', sans-serif", fontVariantNumeric: "tabular-nums", border: `2px solid var(--primary)`, borderRadius: 4, outline: "none", background: colors.inputBg, color: colors.text, fontWeight: 500, boxSizing: "border-box" }} />
                              ) : (
                                <span>{fmt(val)}</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                      {/* Cluster sub-rows (scroll side) */}
                      {isExpanded && hasNonZeroClusters && !isCustomParent && (() => {
                        const allItems = getClustersForRow(row.label);
                        const sectionAmt = (i: { credits?: number; debits?: number; total_amount?: number }) => { const cred = Number(i.credits) || 0; const deb = Number(i.debits) || 0; const tot = Number(i.total_amount) || 0; return row.section === "inflow" ? (cred > 0 ? cred : (tot > 0 ? tot : 0)) : (deb > 0 ? deb : (tot < 0 ? Math.abs(tot) : 0)); };
                        const items = allItems.map((item) => ({ item, amount: sectionAmt(item) })).filter(({ amount }) => amount > 0);
                        const parentValues = row.values;
                        const parentTotal = parentValues.reduce((a, b) => a + b, 0);
                        return items.map(({ item, amount }, idx) => {
                          const fraction = parentTotal > 0 ? amount / parentTotal : 0;
                          const subValues = parentValues.map((pw) => Math.round(pw * fraction * 100) / 100);
                          const subDisplayValues = getDisplayValues(subValues, timeFrame);
                          return (
                            <tr key={`s-sub-${item.representative}-${idx}`} style={{ borderBottom: `1px solid ${colors.border}`, background: subBg, height: 36 }}>
                              {subDisplayValues.map((val, ci) => (
                                <td key={ci} style={{ padding: "0.375rem 0.5rem", textAlign: "right", fontSize: "0.75rem", color: row.section === "inflow" ? colors.inflowColor : colors.outflowColor, whiteSpace: "nowrap", borderLeft: `1px solid ${theme === "dark" ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"}`, background: subBg }}>
                                  <span>{fmt(val)}</span>
                                </td>
                              ))}
                            </tr>
                          );
                        });
                      })()}
                      {/* Custom child rows (scroll side) */}
                      {isCustomParent && isExpanded && (() => {
                        const children = rows.map((r, idx) => ({ child: r, childRi: idx })).filter(({ child: c }) => c.parentId === row.customId);
                        return (
                          <>
                            {children.map(({ child, childRi }) => {
                              const childDisplayValues = getDisplayValues(child.values, timeFrame);
                              return (
                                <tr key={`s-child-${child.customId}`} style={{ borderBottom: `1px solid ${colors.border}`, background: subBg, height: 64 }}>
                                  {childDisplayValues.map((val, ci) => {
                                    const isChildEditing = editingCell?.row === childRi && editingCell?.col === ci;
                                    return (
                                      <td key={ci} onClick={() => handleCellClick(childRi, ci)} style={{ padding: isChildEditing ? "0.125rem" : "0.375rem 0.5rem", textAlign: "right", fontSize: "0.78rem", color: row.section === "inflow" ? colors.inflowColor : colors.outflowColor, cursor: "pointer", background: isChildEditing ? "transparent" : subBg, whiteSpace: "nowrap", borderLeft: `1px solid ${theme === "dark" ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"}` }}>
                                        {isChildEditing ? (
                                          <input ref={inputRef} type="text" defaultValue={val.toFixed(2)} onBlur={(e) => commitEdit(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") commitEdit((e.target as HTMLInputElement).value); if (e.key === "Escape") setEditingCell(null); }} style={{ width: "100%", padding: "0.375rem 0.375rem", textAlign: "right", fontSize: "0.8125rem", fontFamily: "'Inter', sans-serif", fontVariantNumeric: "tabular-nums", border: `2px solid var(--primary)`, borderRadius: 4, outline: "none", background: colors.inputBg, color: colors.text, fontWeight: 500, boxSizing: "border-box" }} />
                                        ) : (
                                          <span>{fmt(val)}</span>
                                        )}
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })}
                            <tr key={`s-addsub-${row.customId}`} style={{ borderBottom: `1px solid ${colors.border}` }}>
                              <td colSpan={numPeriods} style={{ padding: "0.375rem 0.75rem 0.375rem 2.25rem", background: subBg }}>&nbsp;</td>
                            </tr>
                          </>
                        );
                      })()}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div
        style={{
          display: "flex",
          gap: "1.5rem",
          marginTop: "1rem",
          fontSize: "0.75rem",
          color: colors.textSecondary,
          flexWrap: "wrap",
        }}
      >
        <span>
          <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: colors.inflowColor, marginRight: 4 }} />
          Inflows (receipts)
        </span>
        <span>
          <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: colors.outflowColor, marginRight: 4 }} />
          Outflows (disbursements)
        </span>
        <span>Set start date and time frame (per week / bi-weekly / per month). Expand a category (▶) to see all sub-groups and their cash flow by period.</span>
        <span style={{ color: colors.textSecondary }}>
          {classificationData?.metadata?.has_weekly_breakdown
            ? "Category amounts vary by week (from transaction dates). Edit any cell to adjust."
            : "When no date column was used in classification, amounts are averaged evenly across periods. Run Normalize & Classify on Connect Data to get date-aware weekly breakdowns."}
        </span>
      </div>
    </div>
  );
};

export default CashFlow;
