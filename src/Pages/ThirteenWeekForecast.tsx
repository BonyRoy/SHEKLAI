import { useEffect, useState, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ReferenceLine, Cell, LineChart, Line,
  ComposedChart,
} from "recharts";
import { FiArrowLeft, FiTrendingUp, FiTrendingDown, FiBarChart2, FiRefreshCw, FiTrash2, FiPlay, FiAward, FiActivity, FiGrid, FiLayers, FiTarget, FiZap, FiDollarSign, FiArrowUpRight, FiArrowDownRight } from "react-icons/fi";
import { useTheme } from "../contexts/ThemeContext";
import { getUserId, getAuthHeaders } from "../services/userContext";
import { API_BASE_URL } from "../services/apiConfig";

function fmt(n: number): string {
  const abs = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `(${abs})` : abs;
}

function fmtShort(n: number): string {
  const abs = Math.abs(n);
  let s: string;
  if (abs >= 1e9) s = (abs / 1e9).toFixed(1) + "B";
  else if (abs >= 1e6) s = (abs / 1e6).toFixed(1) + "M";
  else if (abs >= 1e3) s = (abs / 1e3).toFixed(0) + "K";
  else s = abs.toFixed(0);
  return n < 0 ? `(${s})` : s;
}

interface RowData {
  label: string;
  values: number[];
  editable: boolean;
  type: string;
  section: string;
  customId?: string;
  forecastMethod?: string;
}

interface Algorithm {
  id: string;
  name: string;
  description: string;
  params: { name: string; type: string; default: number | null; min?: number; max?: number; description: string }[];
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

const DEFAULT_ALGORITHMS: Algorithm[] = [
  { id: "naive", name: "Naive (Last Value)", description: "Repeats the last observed value. Simplest baseline.", params: [] },
  { id: "sma", name: "Simple Moving Average", description: "Average of the last N periods. Smooths noise, ignores trend.", params: [{ name: "window", type: "int", default: 4, min: 1, max: 52, description: "Number of historical periods to average" }] },
  { id: "wma", name: "Weighted Moving Average", description: "Like SMA but recent periods count more. Better for trending data.", params: [{ name: "window", type: "int", default: 4, min: 1, max: 52, description: "Number of historical periods to weight" }] },
  { id: "ses", name: "Exponential Smoothing", description: "Single exponential smoothing. Good for stable series without trend.", params: [{ name: "alpha", type: "float", default: 0.3, min: 0.01, max: 0.99, description: "Smoothing factor (higher = more reactive)" }] },
  { id: "holt", name: "Holt's Linear Trend", description: "Double exponential smoothing capturing level + trend.", params: [{ name: "alpha", type: "float", default: 0.8, min: 0.01, max: 0.99, description: "Level smoothing" }, { name: "beta", type: "float", default: 0.2, min: 0.01, max: 0.99, description: "Trend smoothing" }] },
  { id: "holt_winters", name: "Holt-Winters (Seasonal)", description: "Triple exponential smoothing with seasonality. Best for data with trend and repeating patterns.", params: [{ name: "alpha", type: "float", default: 0.5, min: 0.01, max: 0.99, description: "Level" }, { name: "beta", type: "float", default: 0.1, min: 0.01, max: 0.99, description: "Trend" }, { name: "gamma", type: "float", default: 0.3, min: 0.01, max: 0.99, description: "Seasonal" }, { name: "season_length", type: "int", default: 4, min: 2, max: 52, description: "Season cycle length" }] },
  { id: "linear", name: "Linear Regression", description: "Fits a straight line through all historical data and extrapolates.", params: [] },
  { id: "growth_rate", name: "Growth Rate Projection", description: "Applies compound average growth rate from the historical data.", params: [{ name: "growth_rate", type: "float", default: null, min: -0.5, max: 5.0, description: "Override growth rate (blank = auto)" }] },
  { id: "seasonal_naive", name: "Seasonal Naive", description: "Repeats the last complete seasonal cycle. Good when strong seasonality dominates.", params: [{ name: "season_length", type: "int", default: 4, min: 1, max: 52, description: "Season cycle length" }] },
  { id: "arima", name: "ARIMA (Auto-Regressive)", description: "Full ARIMA with auto (p,d,q) order selection. Returns confidence intervals.", params: [], advanced: true },
  { id: "ensemble", name: "Ensemble Decomposition", description: "Trend + Fourier seasonality + residual decomposition.", params: [], advanced: true },
  { id: "monte_carlo", name: "Monte Carlo Simulation", description: "N stochastic simulations with probabilistic fan chart.", params: [], advanced: true },
];

interface BacktestResult {
  algo_id: string;
  actual: number[];
  predicted: number[];
  mae: number;
  rmse: number;
  mape: number | null;
}

interface CompareResult {
  forecast: number[];
  backtest: BacktestResult;
}

const themeColors = {
  light: {
    text: "#1e293b", textSecondary: "#64748b", secondaryBg: "#f8fafc",
    cardBg: "#fff", border: "rgba(0,0,0,0.08)", inputBg: "#fff",
    inflowColor: "#059669", outflowColor: "#dc2626",
    netPositive: "#059669", netNegative: "#dc2626",
    heatGreen: "rgba(16,185,129,", heatRed: "rgba(239,68,68,",
  },
  dark: {
    text: "#e2e8f0", textSecondary: "#94a3b8", secondaryBg: "#111827",
    cardBg: "#1e293b", border: "rgba(255,255,255,0.1)", inputBg: "#0f172a",
    inflowColor: "#34d399", outflowColor: "#f87171",
    netPositive: "#34d399", netNegative: "#f87171",
    heatGreen: "rgba(52,211,153,", heatRed: "rgba(248,113,113,",
  },
};

const CHART_COLORS = ["#3b82f6", "#059669", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#6366f1"];

const ThirteenWeekForecast = () => {
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const userId = getUserId();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<RowData[]>([]);
  const [actualPeriods, setActualPeriods] = useState(0);
  const [forecastPeriods, setForecastPeriods] = useState(0);
  const [timeFrame, setTimeFrame] = useState<string>("weekly");
  const [algorithms, setAlgorithms] = useState<Algorithm[]>(DEFAULT_ALGORITHMS);
  const [customAlgos, setCustomAlgos] = useState<Algorithm[]>([]);
  const [defaultMethod, setDefaultMethod] = useState<string>("holt");

  const [selectedRow, setSelectedRow] = useState<string>("");
  const [compareResults, setCompareResults] = useState<Record<string, CompareResult> | null>(null);
  const [comparing, setComparing] = useState(false);

  const [scenarioRow, setScenarioRow] = useState<string>("");
  const [scenarioBest, setScenarioBest] = useState(0.2);
  const [scenarioWorst, setScenarioWorst] = useState(-0.2);

  const [aiInsights, setAiInsights] = useState<AIForecastInsight | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [explorerRow, setExplorerRow] = useState<string>("");
  const [explorerAlgo, setExplorerAlgo] = useState<string>("holt");
  const [explorerResult, setExplorerResult] = useState<number[] | null>(null);
  const [explorerLoading, setExplorerLoading] = useState(false);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    Promise.all([
      fetch(`${API_BASE_URL}/api/cash-flow/load?user_id=${encodeURIComponent(userId)}&_=${Date.now()}`, { headers: { ...getAuthHeaders() } })
        .then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${API_BASE_URL}/api/forecast/algorithms?user_id=${encodeURIComponent(userId)}`, { headers: { ...getAuthHeaders() } })
        .then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`${API_BASE_URL}/api/forecast/custom-algos?user_id=${encodeURIComponent(userId)}`, { headers: { ...getAuthHeaders() } })
        .then(r => r.ok ? r.json() : []).catch(() => []),
    ]).then(([model, algos, custom]) => {
      if (model?.rows) {
        setRows(model.rows);
        if (typeof model.actualPeriodCount === "number") setActualPeriods(model.actualPeriodCount);
        if (typeof model.forecastPeriodCount === "number") setForecastPeriods(model.forecastPeriodCount);
        if (model.timeFrame) setTimeFrame(model.timeFrame);
        if (model.defaultForecastMethod) setDefaultMethod(model.defaultForecastMethod);
      }
      if (Array.isArray(algos) && algos.length > 0) {
        const builtInIds = new Set(DEFAULT_ALGORITHMS.map(a => a.id));
        const customFromApi = algos.filter((a: Algorithm) => !builtInIds.has(a.id));
        setAlgorithms([...DEFAULT_ALGORITHMS, ...customFromApi]);
      }
      if (Array.isArray(custom)) setCustomAlgos(custom);
    }).finally(() => setLoading(false));
  }, [userId]);

  const categoryRows = rows.filter(r => r.type === "category" && r.editable);
  const endingRow = rows.find(r => r.label === "Ending Cash Balance");
  const netRow = rows.find(r => r.label === "Net Cash Flow");
  const totalInRow = rows.find(r => r.label === "Total Cash Receipts");
  const totalOutRow = rows.find(r => r.label === "Total Cash Disbursements");
  const beginRow = rows.find(r => r.label === "Beginning Cash Balance");

  const endVals = endingRow?.values ?? [];
  const netVals = netRow?.values ?? [];
  const inVals = totalInRow?.values ?? [];
  const outVals = totalOutRow?.values ?? [];

  const totalCols = endVals.length;
  const hasForecast = forecastPeriods > 0 && actualPeriods > 0;

  // ── KPI metrics (6 cards) ──
  const forecastEnd = hasForecast ? endVals.slice(actualPeriods) : [];
  const projectedMin = forecastEnd.length > 0 ? Math.min(...forecastEnd) : 0;
  const projectedMax = forecastEnd.length > 0 ? Math.max(...forecastEnd) : 0;
  const avgForecastNet = hasForecast && netVals.length > actualPeriods
    ? netVals.slice(actualPeriods).reduce((a, b) => a + b, 0) / forecastPeriods
    : 0;

  let cashRunway = forecastPeriods;
  if (hasForecast && endingRow) {
    for (let i = actualPeriods; i < totalCols; i++) {
      if ((endVals[i] ?? 0) < 0) { cashRunway = i - actualPeriods; break; }
    }
  }

  const totalForecastInflows = hasForecast ? inVals.slice(actualPeriods).reduce((s, v) => s + v, 0) : 0;
  const totalForecastOutflows = hasForecast ? outVals.slice(actualPeriods).reduce((s, v) => s + v, 0) : 0;

  const lastActualEnd = actualPeriods > 0 ? (endVals[actualPeriods - 1] ?? 0) : 0;
  const lastForecastEnd = totalCols > 0 ? (endVals[totalCols - 1] ?? 0) : 0;
  const balanceTrend = lastForecastEnd - lastActualEnd;

  const prevAvgNet = actualPeriods >= 4
    ? netVals.slice(actualPeriods - 4, actualPeriods).reduce((a, b) => a + b, 0) / 4
    : (actualPeriods > 0 ? netVals.slice(0, actualPeriods).reduce((a, b) => a + b, 0) / actualPeriods : 0);
  const netFlowTrend = avgForecastNet - prevAvgNet;

  const handleCompare = useCallback(() => {
    if (!selectedRow || !userId) return;
    const row = rows.find(r => (r.customId || r.label) === selectedRow);
    if (!row) return;
    const historical = row.values.slice(0, actualPeriods || row.values.length);
    setComparing(true);
    fetch(`${API_BASE_URL}/api/forecast/compare?user_id=${encodeURIComponent(userId)}`, {
      method: "POST",
      headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        historical,
        forecast_periods: forecastPeriods || 12,
        algo_ids: algorithms.map(a => a.id),
      }),
    })
      .then(r => r.json())
      .then(data => {
        if (!data.error) setCompareResults(data);
      })
      .catch(() => {})
      .finally(() => setComparing(false));
  }, [selectedRow, userId, rows, actualPeriods, forecastPeriods, algorithms]);

  const handleDeleteCustom = (algoId: string) => {
    fetch(`${API_BASE_URL}/api/forecast/custom-algo?user_id=${encodeURIComponent(userId)}&algo_id=${encodeURIComponent(algoId)}`, {
      method: "DELETE",
      headers: { ...getAuthHeaders() },
    }).then(r => {
      if (r.ok) setCustomAlgos(prev => prev.filter(a => a.id !== algoId));
    });
  };

  const periodWord = timeFrame === "weekly" ? "Wk" : timeFrame === "monthly" ? "Mo" : "P";

  // ── Balance chart data (actual vs forecast with confidence band) ──
  const balanceChartData = useMemo(() => endVals.map((v, i) => {
    const isFc = hasForecast && i >= actualPeriods;
    return {
      name: i < actualPeriods ? `${periodWord}${i + 1}` : `F${i - actualPeriods + 1}`,
      balance: Math.round(v),
      actual: hasForecast && i < actualPeriods ? Math.round(v) : (i === actualPeriods - 1 ? Math.round(v) : undefined),
      forecast: hasForecast && i >= actualPeriods - 1 ? Math.round(v) : undefined,
      confHigh: isFc ? Math.round(v * 1.1) : undefined,
      confLow: isFc ? Math.round(v * 0.9) : undefined,
    };
  }), [endVals, hasForecast, actualPeriods, periodWord]);

  // ── Net flow bar chart data (actual + forecast) ──
  const netFlowChartData = useMemo(() => {
    const data: { name: string; actual?: number; forecast?: number }[] = [];
    for (let i = 0; i < totalCols; i++) {
      data.push({
        name: i < actualPeriods ? `${periodWord}${i + 1}` : `F${i - actualPeriods + 1}`,
        actual: i < actualPeriods ? Math.round(netVals[i] ?? 0) : undefined,
        forecast: i >= actualPeriods ? Math.round(netVals[i] ?? 0) : undefined,
      });
    }
    return data;
  }, [netVals, totalCols, actualPeriods, periodWord]);

  // ── Cumulative cash flow data ──
  const cumulativeData = useMemo(() => {
    let cumIn = 0, cumOut = 0;
    return Array.from({ length: totalCols }, (_, i) => {
      cumIn += inVals[i] ?? 0;
      cumOut += outVals[i] ?? 0;
      return {
        name: i < actualPeriods ? `${periodWord}${i + 1}` : `F${i - actualPeriods + 1}`,
        inflows: Math.round(cumIn),
        outflows: Math.round(cumOut),
        net: Math.round(cumIn - cumOut),
        isForecast: hasForecast && i >= actualPeriods,
      };
    });
  }, [inVals, outVals, totalCols, actualPeriods, hasForecast, periodWord]);

  // ── Category breakdown (top 5 inflow + top 5 outflow) ──
  const categoryBreakdown = useMemo(() => {
    if (!hasForecast) return [];
    const inflowRows = categoryRows.filter(r => r.section === "inflow");
    const outflowRows = categoryRows.filter(r => r.section === "outflow");
    const sumForecast = (r: RowData) => r.values.slice(actualPeriods, totalCols).reduce((s, v) => s + Math.abs(v ?? 0), 0);
    const topIn = [...inflowRows].sort((a, b) => sumForecast(b) - sumForecast(a)).slice(0, 5);
    const topOut = [...outflowRows].sort((a, b) => sumForecast(b) - sumForecast(a)).slice(0, 5);

    return Array.from({ length: forecastPeriods }, (_, i) => {
      const idx = actualPeriods + i;
      const entry: Record<string, string | number> = { name: `F${i + 1}` };
      topIn.forEach(r => { entry[`in_${r.label}`] = Math.round(r.values[idx] ?? 0); });
      topOut.forEach(r => { entry[`out_${r.label}`] = -Math.round(Math.abs(r.values[idx] ?? 0)); });
      return entry;
    });
  }, [categoryRows, hasForecast, actualPeriods, forecastPeriods, totalCols]);

  const topInflowLabels = useMemo(() => {
    if (!hasForecast) return [];
    return [...categoryRows.filter(r => r.section === "inflow")]
      .sort((a, b) => {
        const s = (r: RowData) => r.values.slice(actualPeriods, totalCols).reduce((s, v) => s + Math.abs(v ?? 0), 0);
        return s(b) - s(a);
      }).slice(0, 5).map(r => r.label);
  }, [categoryRows, hasForecast, actualPeriods, totalCols]);

  const topOutflowLabels = useMemo(() => {
    if (!hasForecast) return [];
    return [...categoryRows.filter(r => r.section === "outflow")]
      .sort((a, b) => {
        const s = (r: RowData) => r.values.slice(actualPeriods, totalCols).reduce((s, v) => s + Math.abs(v ?? 0), 0);
        return s(b) - s(a);
      }).slice(0, 5).map(r => r.label);
  }, [categoryRows, hasForecast, actualPeriods, totalCols]);

  // ── Period-over-period growth ──
  const growthData = useMemo(() => {
    const data: { name: string; inflowGrowth: number | null; outflowGrowth: number | null; netGrowth: number | null }[] = [];
    for (let i = 1; i < totalCols; i++) {
      const prevIn = inVals[i - 1] ?? 0;
      const prevOut = outVals[i - 1] ?? 0;
      const prevNet = netVals[i - 1] ?? 0;
      data.push({
        name: i < actualPeriods ? `${periodWord}${i + 1}` : `F${i - actualPeriods + 1}`,
        inflowGrowth: prevIn !== 0 ? Math.round(((inVals[i] ?? 0) - prevIn) / Math.abs(prevIn) * 100) : null,
        outflowGrowth: prevOut !== 0 ? Math.round(((outVals[i] ?? 0) - prevOut) / Math.abs(prevOut) * 100) : null,
        netGrowth: prevNet !== 0 ? Math.round(((netVals[i] ?? 0) - prevNet) / Math.abs(prevNet) * 100) : null,
      });
    }
    return data;
  }, [inVals, outVals, netVals, totalCols, actualPeriods, periodWord]);

  // ── Volatility heatmap (top 10 rows by absolute forecast value) ──
  const heatmapData = useMemo(() => {
    if (!hasForecast) return [];
    const sorted = [...categoryRows].sort((a, b) => {
      const sumA = a.values.slice(actualPeriods, totalCols).reduce((s, v) => s + Math.abs(v ?? 0), 0);
      const sumB = b.values.slice(actualPeriods, totalCols).reduce((s, v) => s + Math.abs(v ?? 0), 0);
      return sumB - sumA;
    }).slice(0, 10);
    return sorted.map(r => ({
      label: r.label,
      section: r.section,
      values: r.values.slice(actualPeriods, totalCols).map(v => v ?? 0),
    }));
  }, [categoryRows, hasForecast, actualPeriods, totalCols]);

  const heatmapMax = useMemo(() => {
    let mx = 1;
    heatmapData.forEach(r => r.values.forEach(v => { if (Math.abs(v) > mx) mx = Math.abs(v); }));
    return mx;
  }, [heatmapData]);

  // ── Scenario analysis (with ending balance impact) ──
  const scenarioData = useMemo(() => {
    if (!scenarioRow || !hasForecast) return null;
    const row = rows.find(r => (r.customId || r.label) === scenarioRow);
    if (!row) return null;
    const base = row.values.slice(actualPeriods, totalCols);
    const best = base.map(v => Math.round((v ?? 0) * (1 + scenarioBest)));
    const worst = base.map(v => Math.round((v ?? 0) * (1 + scenarioWorst)));

    const baseEndBalance = endVals[totalCols - 1] ?? 0;
    const rowForecastTotal = base.reduce((s, v) => s + (v ?? 0), 0);
    const bestTotal = best.reduce((s, v) => s + v, 0);
    const worstTotal = worst.reduce((s, v) => s + v, 0);

    const isInflow = row.section === "inflow";
    const bestDelta = isInflow ? bestTotal - rowForecastTotal : rowForecastTotal - bestTotal;
    const worstDelta = isInflow ? worstTotal - rowForecastTotal : rowForecastTotal - worstTotal;

    return {
      chartData: base.map((v, i) => ({
        name: `F${i + 1}`,
        base: Math.round(v ?? 0),
        best: best[i],
        worst: worst[i],
      })),
      bestEndBalance: baseEndBalance + bestDelta,
      worstEndBalance: baseEndBalance + worstDelta,
      baseEndBalance,
    };
  }, [scenarioRow, scenarioBest, scenarioWorst, rows, hasForecast, actualPeriods, totalCols, endVals]);

  // ── Sorted comparison results (for recommended badge) ──
  const sortedComparison = useMemo(() => {
    if (!compareResults) return [];
    return Object.entries(compareResults)
      .filter(([, v]) => !("error" in v))
      .sort((a, b) => ((a[1] as CompareResult).backtest?.mae ?? Infinity) - ((b[1] as CompareResult).backtest?.mae ?? Infinity));
  }, [compareResults]);

  const recommendedAlgoId = sortedComparison.length > 0 ? sortedComparison[0][0] : null;

  // ── Residual analysis data (backtest errors) ──
  const residualData = useMemo(() => {
    if (!compareResults || !defaultMethod) return [];
    const cr = compareResults[defaultMethod] as CompareResult | undefined;
    if (!cr?.backtest?.actual || !cr?.backtest?.predicted) return [];
    return cr.backtest.actual.map((a: number, i: number) => ({
      period: `T${i + 1}`,
      actual: a,
      predicted: cr.backtest.predicted[i],
      residual: Math.round(a - cr.backtest.predicted[i]),
    }));
  }, [compareResults, defaultMethod]);

  // ── Correlation heatmap (forecast category correlation matrix) ──
  const correlationData = useMemo(() => {
    if (!hasForecast || categoryRows.length < 2) return { labels: [] as string[], matrix: [] as number[][] };
    const top = categoryRows.slice(0, 8);
    const labels = top.map(r => r.label.slice(0, 15));
    const series = top.map(r => r.values.slice(actualPeriods, totalCols));
    const n = series.length;
    const matrix: number[][] = [];
    for (let i = 0; i < n; i++) {
      const row: number[] = [];
      for (let j = 0; j < n; j++) {
        if (i === j) { row.push(1); continue; }
        const xi = series[i], xj = series[j];
        const meanI = xi.reduce((s, v) => s + v, 0) / xi.length;
        const meanJ = xj.reduce((s, v) => s + v, 0) / xj.length;
        let num = 0, denI = 0, denJ = 0;
        for (let k = 0; k < xi.length; k++) {
          const di = (xi[k] ?? 0) - meanI, dj = (xj[k] ?? 0) - meanJ;
          num += di * dj; denI += di * di; denJ += dj * dj;
        }
        const den = Math.sqrt(denI * denJ);
        row.push(den === 0 ? 0 : Math.round(num / den * 100) / 100);
      }
      matrix.push(row);
    }
    return { labels, matrix };
  }, [categoryRows, hasForecast, actualPeriods, totalCols]);

  // ── Parameter explorer handler ──
  const handleExplorerRun = useCallback(() => {
    if (!explorerRow || !userId) return;
    const row = rows.find(r => (r.customId || r.label) === explorerRow);
    if (!row) return;
    const historical = row.values.slice(0, actualPeriods);
    setExplorerLoading(true);
    fetch(`${API_BASE_URL}/api/forecast/generate?user_id=${encodeURIComponent(userId)}`, {
      method: "POST",
      headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        rows: [{ ...row, values: historical }],
        actual_periods: historical.length,
        forecast_periods: forecastPeriods || 12,
        default_method: explorerAlgo,
      }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.ok && data.rows?.[0]) {
          setExplorerResult(data.rows[0].values.slice(historical.length));
        }
      })
      .catch(() => {})
      .finally(() => setExplorerLoading(false));
  }, [explorerRow, explorerAlgo, userId, rows, actualPeriods, forecastPeriods]);

  // ── AI Interpretation ──
  const handleGetAiInsights = useCallback(() => {
    if (!userId) return;
    setAiLoading(true);
    fetch(`${API_BASE_URL}/api/forecast/interpret?user_id=${encodeURIComponent(userId)}`, {
      method: "POST",
      headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        rows,
        actual_periods: actualPeriods,
        forecast_periods: forecastPeriods,
        method: defaultMethod,
        comparison_results: compareResults,
        kpi_metrics: { projectedMin, projectedMax, avgForecastNet, cashRunway, totalForecastInflows, totalForecastOutflows },
      }),
    })
      .then(r => r.json())
      .then(data => { if (data.ok !== false) setAiInsights(data); })
      .catch(e => setAiInsights({ summary: `Failed: ${e.message}`, risks: [], recommendation: null, suggestions: [], patterns: {}, category_insights: [] }))
      .finally(() => setAiLoading(false));
  }, [userId, rows, actualPeriods, forecastPeriods, defaultMethod, compareResults, projectedMin, projectedMax, avgForecastNet, cashRunway, totalForecastInflows, totalForecastOutflows]);

  // ── Styles ──
  const cardStyle: React.CSSProperties = {
    background: colors.cardBg,
    border: `1px solid ${colors.border}`,
    borderRadius: 14,
    padding: "1.25rem 1.5rem",
    marginBottom: "1.25rem",
    boxShadow: theme === "dark" ? "0 2px 8px rgba(0,0,0,0.3)" : "0 1px 4px rgba(0,0,0,0.05)",
  };

  const kpiCard: React.CSSProperties = {
    flex: "1 1 0",
    minWidth: 160,
    padding: "1rem 1.25rem",
    background: theme === "dark" ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.015)",
    border: `1px solid ${colors.border}`,
    borderRadius: 12,
    position: "relative",
  };
  const kpiLabel: React.CSSProperties = {
    fontSize: "0.65rem", fontWeight: 600, color: colors.textSecondary,
    textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "0.375rem",
  };
  const kpiValue: React.CSSProperties = {
    fontSize: "1.3rem", fontWeight: 700, fontFamily: "'Inter', sans-serif",
  };

  const sectionTitle = (icon: React.ReactNode, text: string) => (
    <h3 style={{
      color: colors.text, fontSize: "1rem", fontWeight: 700,
      marginBottom: "0.75rem", fontFamily: "'Inter', sans-serif",
      display: "flex", alignItems: "center", gap: "0.5rem",
    }}>
      {icon} {text}
    </h3>
  );

  const gridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))",
    gap: "1.25rem",
    marginBottom: "1.25rem",
  };

  const tooltipStyle = {
    background: colors.cardBg,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    fontSize: "0.8rem",
  };
  const gridLine = theme === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
  const algoName = algorithms.find(a => a.id === defaultMethod)?.name ?? defaultMethod;

  if (loading) {
    return (
      <div style={{ padding: "48px 24px 60px", maxWidth: 1500, margin: "0 auto", color: colors.text }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ ...cardStyle, height: 80, background: theme === "dark" ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)", animation: "pulse 1.5s ease-in-out infinite" }} />
          ))}
        </div>
        <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ padding: "48px 24px 60px", maxWidth: 1500, margin: "0 auto" }}>

      {/* ════════════════════════════ HEADER ════════════════════════════ */}
      <header style={{ marginBottom: "1.5rem" }}>
        <Link
          to="/cash-flow"
          style={{
            display: "inline-flex", alignItems: "center", gap: "0.5rem",
            color: colors.textSecondary, fontSize: "0.875rem", fontWeight: 500,
            textDecoration: "none", marginBottom: "1rem",
          }}
        >
          <FiArrowLeft /> Back to Cash Flow
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
          <h1 style={{
            color: colors.text, fontSize: "1.75rem", fontWeight: 700, margin: 0,
            fontFamily: "'Inter', sans-serif", letterSpacing: "-0.5px",
          }}>
            Forecast Dashboard
          </h1>
          {hasForecast && (
            <span style={{
              background: "linear-gradient(135deg, #3b82f6, #6366f1)",
              color: "#fff", borderRadius: "999px", padding: "0.25rem 0.875rem",
              fontSize: "0.75rem", fontWeight: 700,
            }}>
              {algoName}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
          <p style={{ color: colors.textSecondary, fontSize: "0.875rem", margin: 0 }}>
            {hasForecast
              ? `${actualPeriods} actual + ${forecastPeriods} forecast ${timeFrame === "monthly" ? "months" : timeFrame === "biweekly" ? "bi-weekly periods" : "weeks"}`
              : "No forecast generated yet. Go to Cash Flow and generate a forecast first."}
          </p>
          {hasForecast && (
            <Link
              to="/cash-flow"
              style={{
                display: "inline-flex", alignItems: "center", gap: "0.375rem",
                padding: "0.375rem 0.75rem", fontSize: "0.75rem", fontWeight: 600,
                color: "#3b82f6", background: "transparent",
                border: "1px solid #3b82f6", borderRadius: 8,
                textDecoration: "none",
              }}
            >
              <FiRefreshCw size={12} /> Regenerate
            </Link>
          )}
        </div>
      </header>

      {/* ════════════════════════════ KPI ROW (6 CARDS) ════════════════════════════ */}
      {hasForecast && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginBottom: "1.5rem" }}>
          <div style={kpiCard}>
            <div style={kpiLabel}>Projected Min Balance</div>
            <div style={{ ...kpiValue, color: projectedMin < 0 ? colors.netNegative : colors.netPositive }}>
              ${fmtShort(projectedMin)}
            </div>
            {balanceTrend !== 0 && (
              <div style={{ position: "absolute", top: 12, right: 14, display: "flex", alignItems: "center", gap: "0.15rem" }}>
                {projectedMin < lastActualEnd ? <FiArrowDownRight size={14} color={colors.netNegative} /> : <FiArrowUpRight size={14} color={colors.netPositive} />}
              </div>
            )}
          </div>
          <div style={kpiCard}>
            <div style={kpiLabel}>Projected Max Balance</div>
            <div style={{ ...kpiValue, color: colors.netPositive }}>
              ${fmtShort(projectedMax)}
            </div>
            <div style={{ position: "absolute", top: 12, right: 14 }}>
              {projectedMax > lastActualEnd ? <FiArrowUpRight size={14} color={colors.netPositive} /> : <FiArrowDownRight size={14} color={colors.netNegative} />}
            </div>
          </div>
          <div style={kpiCard}>
            <div style={kpiLabel}>Avg Net Flow / {periodWord}</div>
            <div style={{ ...kpiValue, color: avgForecastNet >= 0 ? colors.netPositive : colors.netNegative }}>
              ${fmtShort(avgForecastNet)}
            </div>
            <div style={{ position: "absolute", top: 12, right: 14 }}>
              {netFlowTrend >= 0 ? <FiArrowUpRight size={14} color={colors.netPositive} /> : <FiArrowDownRight size={14} color={colors.netNegative} />}
            </div>
          </div>
          <div style={kpiCard}>
            <div style={kpiLabel}>Cash Runway</div>
            <div style={{ ...kpiValue, color: cashRunway >= forecastPeriods ? colors.netPositive : cashRunway > 2 ? "#f59e0b" : colors.netNegative }}>
              {cashRunway >= forecastPeriods ? `${forecastPeriods}+` : cashRunway} {periodWord.toLowerCase()}
            </div>
          </div>
          <div style={kpiCard}>
            <div style={kpiLabel}>Total Forecast Inflows</div>
            <div style={{ ...kpiValue, color: colors.inflowColor }}>
              ${fmtShort(totalForecastInflows)}
            </div>
          </div>
          <div style={kpiCard}>
            <div style={kpiLabel}>Total Forecast Outflows</div>
            <div style={{ ...kpiValue, color: colors.outflowColor }}>
              ${fmtShort(totalForecastOutflows)}
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════ DUAL CHART ROW ════════════════════════════ */}
      {balanceChartData.length > 0 && (
        <div style={gridStyle}>
          {/* Balance Area Chart with Confidence Band */}
          <div style={cardStyle}>
            {sectionTitle(<FiTrendingUp size={16} color="#3b82f6" />, "Ending Cash Balance")}
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={balanceChartData} margin={{ top: 10, right: 20, bottom: 5, left: 10 }}>
                <defs>
                  <linearGradient id="fDashActual" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={colors.netPositive} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={colors.netPositive} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="fDashForecast" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={gridLine} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: colors.textSecondary }} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: colors.textSecondary }} tickFormatter={fmtShort} tickLine={false} axisLine={false} />
                <Tooltip formatter={(value) => [`$${fmt(Number(value ?? 0))}`, ""]} contentStyle={tooltipStyle} />
                <ReferenceLine y={0} stroke={colors.textSecondary} strokeWidth={0.5} />
                {hasForecast && (
                  <>
                    <Area type="monotone" dataKey="confHigh" stroke="none" fill="#3b82f6" fillOpacity={0.06} connectNulls name="Upper Band" />
                    <Area type="monotone" dataKey="confLow" stroke="none" fill="#3b82f6" fillOpacity={0.06} connectNulls name="Lower Band" />
                  </>
                )}
                {hasForecast ? (
                  <>
                    <Area type="monotone" dataKey="actual" stroke={colors.netPositive} fill="url(#fDashActual)" strokeWidth={2.5} dot={{ r: 2, fill: colors.cardBg, stroke: colors.netPositive, strokeWidth: 2 }} name="Actual" connectNulls />
                    <Area type="monotone" dataKey="forecast" stroke="#3b82f6" fill="url(#fDashForecast)" strokeWidth={2.5} strokeDasharray="6 3" dot={{ r: 2, fill: colors.cardBg, stroke: "#3b82f6", strokeWidth: 2 }} name="Forecast" connectNulls />
                  </>
                ) : (
                  <Area type="monotone" dataKey="balance" stroke={colors.netPositive} fill="url(#fDashActual)" strokeWidth={2.5} name="Balance" />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Net Cash Flow Bar Chart */}
          <div style={cardStyle}>
            {sectionTitle(<FiBarChart2 size={16} color="#f59e0b" />, "Net Cash Flow per Period")}
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={netFlowChartData} margin={{ top: 10, right: 20, bottom: 5, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridLine} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: colors.textSecondary }} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: colors.textSecondary }} tickFormatter={fmtShort} tickLine={false} axisLine={false} />
                <Tooltip formatter={(value) => [`$${fmt(Number(value ?? 0))}`, ""]} contentStyle={tooltipStyle} />
                <ReferenceLine y={0} stroke={colors.textSecondary} strokeWidth={1} />
                <Bar dataKey="actual" name="Actual" radius={[3, 3, 0, 0]}>
                  {netFlowChartData.map((d, i) => (
                    <Cell key={i} fill={(d.actual ?? 0) >= 0 ? colors.inflowColor : colors.outflowColor} />
                  ))}
                </Bar>
                <Bar dataKey="forecast" name="Forecast" radius={[3, 3, 0, 0]} fillOpacity={0.7}>
                  {netFlowChartData.map((d, i) => (
                    <Cell key={i} fill={(d.forecast ?? 0) >= 0 ? "#60a5fa" : "#f87171"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ════════════════════════════ CUMULATIVE CASH FLOW ════════════════════════════ */}
      {cumulativeData.length > 0 && (
        <div style={cardStyle}>
          {sectionTitle(<FiLayers size={16} color="#8b5cf6" />, "Cumulative Cash Flow")}
          <p style={{ fontSize: "0.78rem", color: colors.textSecondary, marginBottom: "0.75rem", marginTop: "-0.25rem" }}>
            Running total of inflows vs outflows. The gap between curves represents net cash position.
          </p>
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={cumulativeData} margin={{ top: 10, right: 30, bottom: 5, left: 10 }}>
              <defs>
                <linearGradient id="cumIn" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={colors.inflowColor} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={colors.inflowColor} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="cumOut" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={colors.outflowColor} stopOpacity={0.15} />
                  <stop offset="95%" stopColor={colors.outflowColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={gridLine} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: colors.textSecondary }} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fill: colors.textSecondary }} tickFormatter={fmtShort} tickLine={false} axisLine={false} />
              <Tooltip formatter={(value) => [`$${fmt(Number(value ?? 0))}`, ""]} contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: "0.75rem" }} />
              {hasForecast && (
                <ReferenceLine x={`${periodWord}${actualPeriods}`} stroke="#f59e0b" strokeDasharray="4 4" strokeWidth={1.5} />
              )}
              <Area type="monotone" dataKey="inflows" name="Cumulative Inflows" stroke={colors.inflowColor} fill="url(#cumIn)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="outflows" name="Cumulative Outflows" stroke={colors.outflowColor} fill="url(#cumOut)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="net" name="Net Position" stroke="#3b82f6" strokeWidth={2} strokeDasharray="4 4" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ════════════════════════════ CATEGORY BREAKDOWN + GROWTH ════════════════════════════ */}
      {hasForecast && (
        <div style={gridStyle}>
          {/* Inflow/Outflow Category Breakdown */}
          {categoryBreakdown.length > 0 && (
            <div style={cardStyle}>
              {sectionTitle(<FiDollarSign size={16} color="#059669" />, "Category Breakdown (Forecast)")}
              <ResponsiveContainer width="100%" height={320}>
                <ComposedChart data={categoryBreakdown} margin={{ top: 10, right: 20, bottom: 5, left: 10 }} stackOffset="sign">
                  <CartesianGrid strokeDasharray="3 3" stroke={gridLine} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: colors.textSecondary }} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: colors.textSecondary }} tickFormatter={fmtShort} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(value) => [`$${fmt(Math.abs(Number(value ?? 0)))}`, ""]} contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: "0.7rem" }} />
                  <ReferenceLine y={0} stroke={colors.textSecondary} strokeWidth={1} />
                  {topInflowLabels.map((label, i) => (
                    <Bar key={`in_${label}`} dataKey={`in_${label}`} name={label} fill={CHART_COLORS[i % CHART_COLORS.length]} stackId="stack" radius={i === topInflowLabels.length - 1 ? [3, 3, 0, 0] : undefined} />
                  ))}
                  {topOutflowLabels.map((label, i) => (
                    <Bar key={`out_${label}`} dataKey={`out_${label}`} name={label} fill={CHART_COLORS[(i + 5) % CHART_COLORS.length]} stackId="stack" radius={i === topOutflowLabels.length - 1 ? [0, 0, 3, 3] : undefined} />
                  ))}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Period-over-Period Growth */}
          {growthData.length > 0 && (
            <div style={cardStyle}>
              {sectionTitle(<FiActivity size={16} color="#f59e0b" />, "Period-over-Period Growth (%)")}
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={growthData} margin={{ top: 10, right: 20, bottom: 5, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridLine} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: colors.textSecondary }} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10, fill: colors.textSecondary }} tickFormatter={(v: number) => `${v}%`} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(value) => [`${value}%`, ""]} contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: "0.75rem" }} />
                  <ReferenceLine y={0} stroke={colors.textSecondary} strokeWidth={1} />
                  {hasForecast && (
                    <ReferenceLine x={`${periodWord}${actualPeriods}`} stroke="#f59e0b" strokeDasharray="4 4" strokeWidth={1.5} />
                  )}
                  <Line type="monotone" dataKey="inflowGrowth" name="Inflow Growth" stroke={colors.inflowColor} strokeWidth={2} dot={false} connectNulls />
                  <Line type="monotone" dataKey="outflowGrowth" name="Outflow Growth" stroke={colors.outflowColor} strokeWidth={2} dot={false} connectNulls />
                  <Line type="monotone" dataKey="netGrowth" name="Net Flow Growth" stroke="#3b82f6" strokeWidth={2} strokeDasharray="4 4" dot={false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════ FORECAST VOLATILITY HEATMAP ════════════════════════════ */}
      {heatmapData.length > 0 && (
        <div style={cardStyle}>
          {sectionTitle(<FiGrid size={16} color="#ef4444" />, "Forecast Volatility Heatmap")}
          <p style={{ fontSize: "0.78rem", color: colors.textSecondary, marginBottom: "0.75rem", marginTop: "-0.25rem" }}>
            Top 10 categories by forecast magnitude. Color intensity represents value size.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem", fontFamily: "'Inter', sans-serif" }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${colors.border}` }}>
                  <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", color: colors.textSecondary, fontWeight: 600, position: "sticky", left: 0, background: colors.cardBg, zIndex: 1, minWidth: 160 }}>Category</th>
                  {Array.from({ length: forecastPeriods }, (_, i) => (
                    <th key={i} style={{ padding: "0.5rem 0.5rem", textAlign: "center", color: colors.textSecondary, fontWeight: 600, minWidth: 80 }}>
                      F{i + 1}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heatmapData.map((row, ri) => (
                  <tr key={ri} style={{ borderBottom: `1px solid ${colors.border}` }}>
                    <td style={{
                      padding: "0.5rem 0.75rem", fontWeight: 500, color: colors.text,
                      position: "sticky", left: 0, background: colors.cardBg, zIndex: 1,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 200,
                    }}>
                      <span style={{
                        display: "inline-block", width: 8, height: 8, borderRadius: "50%",
                        background: row.section === "inflow" ? colors.inflowColor : colors.outflowColor,
                        marginRight: 6, verticalAlign: "middle",
                      }} />
                      {row.label}
                    </td>
                    {row.values.map((v, ci) => {
                      const intensity = Math.min(Math.abs(v) / heatmapMax, 1);
                      const bg = v >= 0
                        ? `${colors.heatGreen}${(intensity * 0.4 + 0.05).toFixed(2)})`
                        : `${colors.heatRed}${(intensity * 0.4 + 0.05).toFixed(2)})`;
                      return (
                        <td key={ci} style={{
                          padding: "0.5rem 0.5rem", textAlign: "right",
                          background: bg, color: colors.text, fontWeight: 500,
                          fontVariantNumeric: "tabular-nums",
                        }}>
                          {fmtShort(v)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ════════════════════════════ ALGORITHM COMPARISON (ENHANCED) ════════════════════════════ */}
      <div style={cardStyle}>
        {sectionTitle(<FiTarget size={16} color="#6366f1" />, "Algorithm Comparison")}
        <p style={{ fontSize: "0.78rem", color: colors.textSecondary, marginBottom: "0.75rem", marginTop: "-0.25rem" }}>
          Select a line item to backtest all algorithms. Includes accuracy metrics and the recommended choice.
        </p>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end", marginBottom: "1rem", flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            <label style={{ fontSize: "0.7rem", fontWeight: 600, color: colors.textSecondary }}>Line Item</label>
            <select
              value={selectedRow}
              onChange={e => { setSelectedRow(e.target.value); setCompareResults(null); }}
              style={{ padding: "0.375rem 0.5rem", fontSize: "0.8125rem", border: `1px solid ${colors.border}`, borderRadius: 8, background: colors.cardBg, color: colors.text, minWidth: 250, fontFamily: "'Inter', sans-serif" }}
            >
              <option value="">-- Select row --</option>
              {categoryRows.map(r => (
                <option key={r.customId || r.label} value={r.customId || r.label}>{r.label} ({r.section})</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleCompare}
            disabled={!selectedRow || comparing}
            style={{
              display: "inline-flex", alignItems: "center", gap: "0.375rem",
              padding: "0.5rem 1rem", fontSize: "0.8125rem", fontWeight: 600,
              color: "#fff", background: !selectedRow ? colors.textSecondary : "linear-gradient(135deg, #3b82f6, #6366f1)",
              border: "none", borderRadius: 8,
              cursor: !selectedRow || comparing ? "not-allowed" : "pointer",
              fontFamily: "'Inter', sans-serif", opacity: comparing ? 0.6 : 1,
            }}
          >
            <FiPlay size={14} />
            {comparing ? "Comparing..." : "Compare All Algorithms"}
          </button>
        </div>

        {compareResults && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: "1rem" }}>
            {/* Accuracy Table */}
            <div>
              <div style={{ overflowX: "auto", marginBottom: "0.75rem" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem", fontFamily: "'Inter', sans-serif" }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${colors.border}`, background: colors.secondaryBg }}>
                      <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", color: colors.textSecondary, fontWeight: 600 }}>Algorithm</th>
                      <th style={{ padding: "0.5rem 0.75rem", textAlign: "right", color: colors.textSecondary, fontWeight: 600 }}>MAE</th>
                      <th style={{ padding: "0.5rem 0.75rem", textAlign: "right", color: colors.textSecondary, fontWeight: 600 }}>RMSE</th>
                      <th style={{ padding: "0.5rem 0.75rem", textAlign: "right", color: colors.textSecondary, fontWeight: 600 }}>MAPE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedComparison.map(([algoId, result], idx) => {
                      const r = result as CompareResult;
                      const algo = algorithms.find(a => a.id === algoId);
                      const isRec = algoId === recommendedAlgoId;
                      return (
                        <tr key={algoId} style={{
                          borderBottom: `1px solid ${colors.border}`,
                          background: isRec ? (theme === "dark" ? "rgba(59,130,246,0.1)" : "rgba(59,130,246,0.05)") : undefined,
                        }}>
                          <td style={{ padding: "0.5rem 0.75rem", color: colors.text, fontWeight: isRec ? 700 : 500 }}>
                            {isRec && (
                              <FiAward size={13} color="#f59e0b" style={{ marginRight: 4, verticalAlign: "middle" }} />
                            )}
                            {algo?.name ?? algoId}
                            {isRec && (
                              <span style={{ marginLeft: 6, fontSize: "0.6rem", background: "#f59e0b", color: "#fff", padding: "1px 6px", borderRadius: 99, fontWeight: 700, verticalAlign: "middle" }}>
                                BEST
                              </span>
                            )}
                          </td>
                          <td style={{ padding: "0.5rem 0.75rem", textAlign: "right", color: colors.text, fontVariantNumeric: "tabular-nums" }}>
                            {r.backtest?.mae != null ? fmt(r.backtest.mae) : "-"}
                          </td>
                          <td style={{ padding: "0.5rem 0.75rem", textAlign: "right", color: colors.text, fontVariantNumeric: "tabular-nums" }}>
                            {r.backtest?.rmse != null ? fmt(r.backtest.rmse) : "-"}
                          </td>
                          <td style={{ padding: "0.5rem 0.75rem", textAlign: "right", color: colors.text, fontVariantNumeric: "tabular-nums" }}>
                            {r.backtest?.mape != null ? `${r.backtest.mape.toFixed(1)}%` : "-"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Accuracy Bar Chart */}
              {sortedComparison.length > 0 && (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart
                    data={sortedComparison.map(([algoId, result]) => {
                      const r = result as CompareResult;
                      const algo = algorithms.find(a => a.id === algoId);
                      return { name: algo?.name?.split(" ")[0] ?? algoId, mae: Math.round(r.backtest?.mae ?? 0), rmse: Math.round(r.backtest?.rmse ?? 0) };
                    })}
                    layout="vertical"
                    margin={{ top: 5, right: 20, bottom: 5, left: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={gridLine} />
                    <XAxis type="number" tick={{ fontSize: 9, fill: colors.textSecondary }} tickFormatter={fmtShort} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: colors.textSecondary }} width={70} />
                    <Tooltip formatter={(value) => [`$${fmt(Number(value ?? 0))}`, ""]} contentStyle={tooltipStyle} />
                    <Bar dataKey="mae" name="MAE" fill="#3b82f6" radius={[0, 3, 3, 0]} barSize={12} />
                    <Bar dataKey="rmse" name="RMSE" fill="#8b5cf6" radius={[0, 3, 3, 0]} barSize={12} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Forecast Comparison + Backtest Error Chart */}
            <div>
              <div style={{ fontSize: "0.75rem", fontWeight: 600, color: colors.textSecondary, marginBottom: "0.5rem" }}>
                FORECAST PROJECTIONS BY ALGORITHM
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridLine} />
                  <XAxis dataKey="name" type="category" allowDuplicatedCategory={false} tick={{ fontSize: 10, fill: colors.textSecondary }} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: colors.textSecondary }} tickFormatter={fmtShort} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(value) => [`$${fmt(Number(value ?? 0))}`, ""]} contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: "0.7rem" }} />
                  {sortedComparison
                    .filter(([, v]) => (v as CompareResult).forecast)
                    .map(([algoId, result], idx) => {
                      const r = result as CompareResult;
                      const algo = algorithms.find(a => a.id === algoId);
                      const data = r.forecast.map((v, i) => ({ name: `F${i + 1}`, [algoId]: Math.round(v) }));
                      return (
                        <Line
                          key={algoId}
                          data={data}
                          dataKey={algoId}
                          name={algo?.name ?? algoId}
                          stroke={CHART_COLORS[idx % CHART_COLORS.length]}
                          strokeWidth={algoId === recommendedAlgoId ? 3 : 1.5}
                          dot={{ r: algoId === recommendedAlgoId ? 4 : 2 }}
                          type="monotone"
                        />
                      );
                    })}
                </LineChart>
              </ResponsiveContainer>

              {/* Backtest: Actual vs Predicted for top algo */}
              {recommendedAlgoId && (compareResults[recommendedAlgoId] as CompareResult)?.backtest?.actual && (
                <>
                  <div style={{ fontSize: "0.75rem", fontWeight: 600, color: colors.textSecondary, marginBottom: "0.5rem", marginTop: "0.75rem" }}>
                    BACKTEST: ACTUAL vs PREDICTED ({algorithms.find(a => a.id === recommendedAlgoId)?.name})
                  </div>
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart
                      data={((compareResults[recommendedAlgoId] as CompareResult).backtest.actual ?? []).map((v, i) => ({
                        name: `T${i + 1}`,
                        actual: Math.round(v),
                        predicted: Math.round(((compareResults[recommendedAlgoId] as CompareResult).backtest.predicted ?? [])[i] ?? 0),
                      }))}
                      margin={{ top: 5, right: 20, bottom: 5, left: 10 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke={gridLine} />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: colors.textSecondary }} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: colors.textSecondary }} tickFormatter={fmtShort} tickLine={false} axisLine={false} />
                      <Tooltip formatter={(value) => [`$${fmt(Number(value ?? 0))}`, ""]} contentStyle={tooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: "0.7rem" }} />
                      <Line type="monotone" dataKey="actual" name="Actual" stroke={colors.netPositive} strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="predicted" name="Predicted" stroke="#f59e0b" strokeWidth={2} strokeDasharray="4 4" dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ════════════════════════════ SCENARIO ANALYSIS (ENHANCED) ════════════════════════════ */}
      <div style={cardStyle}>
        {sectionTitle(<FiZap size={16} color="#f59e0b" />, "Scenario Analysis")}
        <p style={{ fontSize: "0.78rem", color: colors.textSecondary, marginBottom: "0.75rem", marginTop: "-0.25rem" }}>
          Apply best/worst case multipliers to visualize the range of outcomes and their impact on ending balance.
        </p>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end", marginBottom: "1rem", flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            <label style={{ fontSize: "0.7rem", fontWeight: 600, color: colors.textSecondary }}>Line Item</label>
            <select
              value={scenarioRow}
              onChange={e => setScenarioRow(e.target.value)}
              style={{ padding: "0.375rem 0.5rem", fontSize: "0.8125rem", border: `1px solid ${colors.border}`, borderRadius: 8, background: colors.cardBg, color: colors.text, minWidth: 250, fontFamily: "'Inter', sans-serif" }}
            >
              <option value="">-- Select row --</option>
              {categoryRows.map(r => (
                <option key={r.customId || r.label} value={r.customId || r.label}>{r.label} ({r.section})</option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            <label style={{ fontSize: "0.7rem", fontWeight: 600, color: colors.textSecondary }}>Best Case (+%)</label>
            <input
              type="number"
              value={Math.round(scenarioBest * 100)}
              onChange={e => setScenarioBest(parseInt(e.target.value) / 100)}
              style={{ width: 70, padding: "0.375rem 0.4rem", fontSize: "0.8125rem", border: `1px solid ${colors.border}`, borderRadius: 8, background: colors.inputBg, color: colors.text, textAlign: "center", fontFamily: "'Inter', sans-serif" }}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            <label style={{ fontSize: "0.7rem", fontWeight: 600, color: colors.textSecondary }}>Worst Case (%)</label>
            <input
              type="number"
              value={Math.round(scenarioWorst * 100)}
              onChange={e => setScenarioWorst(parseInt(e.target.value) / 100)}
              style={{ width: 70, padding: "0.375rem 0.4rem", fontSize: "0.8125rem", border: `1px solid ${colors.border}`, borderRadius: 8, background: colors.inputBg, color: colors.text, textAlign: "center", fontFamily: "'Inter', sans-serif" }}
            />
          </div>
        </div>

        {scenarioData && (
          <>
            {/* Scenario summary KPIs */}
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
              <div style={{
                flex: "1 1 0", minWidth: 180, padding: "0.75rem 1rem", borderRadius: 10,
                background: theme === "dark" ? "rgba(5,150,105,0.1)" : "rgba(5,150,105,0.06)",
                border: `1px solid rgba(5,150,105,0.2)`,
              }}>
                <div style={{ fontSize: "0.65rem", fontWeight: 600, color: colors.inflowColor, textTransform: "uppercase", marginBottom: "0.25rem" }}>
                  Best Case End Balance
                </div>
                <div style={{ fontSize: "1.1rem", fontWeight: 700, color: colors.inflowColor }}>
                  ${fmt(scenarioData.bestEndBalance)}
                </div>
              </div>
              <div style={{
                flex: "1 1 0", minWidth: 180, padding: "0.75rem 1rem", borderRadius: 10,
                background: theme === "dark" ? "rgba(59,130,246,0.1)" : "rgba(59,130,246,0.06)",
                border: `1px solid rgba(59,130,246,0.2)`,
              }}>
                <div style={{ fontSize: "0.65rem", fontWeight: 600, color: "#3b82f6", textTransform: "uppercase", marginBottom: "0.25rem" }}>
                  Base Case End Balance
                </div>
                <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#3b82f6" }}>
                  ${fmt(scenarioData.baseEndBalance)}
                </div>
              </div>
              <div style={{
                flex: "1 1 0", minWidth: 180, padding: "0.75rem 1rem", borderRadius: 10,
                background: theme === "dark" ? "rgba(239,68,68,0.1)" : "rgba(239,68,68,0.06)",
                border: `1px solid rgba(239,68,68,0.2)`,
              }}>
                <div style={{ fontSize: "0.65rem", fontWeight: 600, color: colors.outflowColor, textTransform: "uppercase", marginBottom: "0.25rem" }}>
                  Worst Case End Balance
                </div>
                <div style={{ fontSize: "1.1rem", fontWeight: 700, color: colors.outflowColor }}>
                  ${fmt(scenarioData.worstEndBalance)}
                </div>
              </div>
            </div>

            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={scenarioData.chartData} margin={{ top: 10, right: 30, bottom: 10, left: 20 }}>
                <defs>
                  <linearGradient id="scenBest" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#059669" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="scenWorst" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={gridLine} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: colors.textSecondary }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: colors.textSecondary }} tickFormatter={fmtShort} tickLine={false} axisLine={false} />
                <Tooltip formatter={(value) => [`$${fmt(Number(value ?? 0))}`, ""]} contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: "0.75rem" }} />
                <Area type="monotone" dataKey="best" name="Best Case" stroke="#059669" fill="url(#scenBest)" strokeWidth={2} dot={{ r: 3 }} />
                <Area type="monotone" dataKey="base" name="Base Case" stroke="#3b82f6" fill="none" strokeWidth={2.5} dot={{ r: 3 }} />
                <Area type="monotone" dataKey="worst" name="Worst Case" stroke="#ef4444" fill="url(#scenWorst)" strokeWidth={2} dot={{ r: 3 }} />
              </AreaChart>
            </ResponsiveContainer>
          </>
        )}
        {!scenarioData && scenarioRow && !hasForecast && (
          <p style={{ fontSize: "0.8rem", color: colors.textSecondary }}>
            Generate a forecast first on the Cash Flow page to see scenario analysis.
          </p>
        )}
      </div>

      {/* ════════════════════════════ WATERFALL ════════════════════════════ */}
      {hasForecast && (
        <div style={cardStyle}>
          {sectionTitle(<FiBarChart2 size={16} color="#3b82f6" />, "Forecast Inflows vs Outflows")}
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={Array.from({ length: forecastPeriods }, (_, i) => ({
                name: `F${i + 1}`,
                inflow: Math.round(inVals[actualPeriods + i] ?? 0),
                outflow: -Math.round(outVals[actualPeriods + i] ?? 0),
              }))}
              margin={{ top: 10, right: 30, bottom: 10, left: 20 }}
              stackOffset="sign"
            >
              <CartesianGrid strokeDasharray="3 3" stroke={gridLine} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: colors.textSecondary }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: colors.textSecondary }} tickFormatter={fmtShort} tickLine={false} axisLine={false} />
              <Tooltip formatter={(value) => [`$${fmt(Math.abs(Number(value ?? 0)))}`, ""]} contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: "0.75rem" }} />
              <ReferenceLine y={0} stroke={colors.textSecondary} strokeWidth={1} />
              <Bar dataKey="inflow" name="Inflows" fill={colors.inflowColor} stackId="stack" radius={[3, 3, 0, 0]} />
              <Bar dataKey="outflow" name="Outflows" fill={colors.outflowColor} stackId="stack" radius={[0, 0, 3, 3]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ════════════════════════════ AI FORECAST ANALYSIS ════════════════════════════ */}
      {hasForecast && (
        <div style={cardStyle}>
          {sectionTitle(<FiZap size={16} color="#7c3aed" />, "AI Forecast Analysis")}
          {!aiInsights && (
            <div style={{ textAlign: "center", padding: "1.5rem" }}>
              <p style={{ fontSize: "0.85rem", color: colors.textSecondary, marginBottom: "0.75rem" }}>
                Get AI-powered interpretation of your forecast: risk alerts, algorithm recommendations, pattern analysis, and actionable suggestions.
              </p>
              <button
                onClick={handleGetAiInsights}
                disabled={aiLoading}
                style={{
                  display: "inline-flex", alignItems: "center", gap: "0.5rem",
                  padding: "0.625rem 1.25rem", fontSize: "0.875rem", fontWeight: 600,
                  color: "#fff", background: "linear-gradient(135deg, #7c3aed, #3b82f6)",
                  border: "none", borderRadius: 10, cursor: aiLoading ? "not-allowed" : "pointer",
                  opacity: aiLoading ? 0.6 : 1,
                }}
              >
                <FiZap size={14} /> {aiLoading ? "Analyzing with Sonnet 4.5…" : "Run AI Analysis"}
              </button>
            </div>
          )}
          {aiInsights && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {/* Executive Summary */}
              <div style={{ padding: "1rem", background: theme === "dark" ? "rgba(124,58,237,0.06)" : "rgba(124,58,237,0.03)", borderRadius: 10, border: "1px solid rgba(124,58,237,0.15)" }}>
                <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "#7c3aed", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "0.375rem" }}>Executive Summary</div>
                <div style={{ fontSize: "0.875rem", color: colors.text, lineHeight: 1.6 }}>{aiInsights.summary}</div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                {/* Risk Alerts */}
                {aiInsights.risks.length > 0 && (
                  <div style={{ padding: "0.875rem", background: colors.secondaryBg, borderRadius: 10, border: `1px solid ${colors.border}` }}>
                    <div style={{ fontSize: "0.7rem", fontWeight: 700, color: colors.textSecondary, textTransform: "uppercase", marginBottom: "0.5rem" }}>Risk Alerts</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                      {aiInsights.risks.map((risk, i) => (
                        <div key={i} style={{
                          padding: "0.375rem 0.625rem", borderRadius: 6, fontSize: "0.78rem",
                          background: risk.level === "critical" ? "rgba(239,68,68,0.1)" : risk.level === "warning" ? "rgba(245,158,11,0.1)" : "rgba(59,130,246,0.1)",
                          color: risk.level === "critical" ? "#ef4444" : risk.level === "warning" ? "#f59e0b" : "#3b82f6",
                          borderLeft: `3px solid ${risk.level === "critical" ? "#ef4444" : risk.level === "warning" ? "#f59e0b" : "#3b82f6"}`,
                        }}>
                          {risk.message}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Algorithm Recommendation */}
                {aiInsights.recommendation && (
                  <div style={{ padding: "0.875rem", background: theme === "dark" ? "rgba(16,185,129,0.06)" : "rgba(16,185,129,0.03)", borderRadius: 10, border: "1px solid rgba(16,185,129,0.15)" }}>
                    <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "#10b981", textTransform: "uppercase", marginBottom: "0.5rem" }}>Recommended Algorithm</div>
                    <div style={{ fontSize: "1rem", fontWeight: 700, color: colors.text, marginBottom: "0.25rem" }}>{aiInsights.recommendation.algorithm}</div>
                    <div style={{ fontSize: "0.78rem", color: colors.textSecondary, marginBottom: "0.5rem" }}>{aiInsights.recommendation.reason}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <div style={{ flex: 1, height: 6, background: colors.border, borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ width: `${Math.round(aiInsights.recommendation.confidence * 100)}%`, height: "100%", background: "#10b981", borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: "0.7rem", color: colors.textSecondary }}>{Math.round(aiInsights.recommendation.confidence * 100)}% confidence</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Suggestions */}
              {aiInsights.suggestions.length > 0 && (
                <div style={{ padding: "0.875rem", background: colors.secondaryBg, borderRadius: 10, border: `1px solid ${colors.border}` }}>
                  <div style={{ fontSize: "0.7rem", fontWeight: 700, color: colors.textSecondary, textTransform: "uppercase", marginBottom: "0.5rem" }}>Suggestions</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                    {aiInsights.suggestions.map((s, i) => (
                      <div key={i} style={{ fontSize: "0.78rem", color: colors.text, display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
                        <span style={{
                          display: "inline-block", width: 20, height: 20, lineHeight: "20px", textAlign: "center",
                          borderRadius: 4, fontSize: "0.65rem", fontWeight: 700, flexShrink: 0,
                          background: s.type === "parameter" ? "rgba(59,130,246,0.1)" : s.type === "data" ? "rgba(245,158,11,0.1)" : "rgba(124,58,237,0.1)",
                          color: s.type === "parameter" ? "#3b82f6" : s.type === "data" ? "#f59e0b" : "#7c3aed",
                        }}>
                          {s.type === "parameter" ? "P" : s.type === "data" ? "D" : "M"}
                        </span>
                        {s.message}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Patterns + Category Insights */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                {aiInsights.patterns && Object.values(aiInsights.patterns).some(v => v) && (
                  <div style={{ padding: "0.875rem", background: colors.secondaryBg, borderRadius: 10, border: `1px solid ${colors.border}` }}>
                    <div style={{ fontSize: "0.7rem", fontWeight: 700, color: colors.textSecondary, textTransform: "uppercase", marginBottom: "0.5rem" }}>Detected Patterns</div>
                    {aiInsights.patterns.trend && <div style={{ fontSize: "0.78rem", color: colors.text, marginBottom: "0.25rem" }}><strong>Trend:</strong> {aiInsights.patterns.trend}</div>}
                    {aiInsights.patterns.seasonality && <div style={{ fontSize: "0.78rem", color: colors.text, marginBottom: "0.25rem" }}><strong>Seasonality:</strong> {aiInsights.patterns.seasonality}</div>}
                    {aiInsights.patterns.volatility && <div style={{ fontSize: "0.78rem", color: colors.text }}><strong>Volatility:</strong> {aiInsights.patterns.volatility}</div>}
                  </div>
                )}
                {aiInsights.category_insights.length > 0 && (
                  <div style={{ padding: "0.875rem", background: colors.secondaryBg, borderRadius: 10, border: `1px solid ${colors.border}` }}>
                    <div style={{ fontSize: "0.7rem", fontWeight: 700, color: colors.textSecondary, textTransform: "uppercase", marginBottom: "0.5rem" }}>Category Insights</div>
                    {aiInsights.category_insights.slice(0, 5).map((ci, i) => (
                      <div key={i} style={{ fontSize: "0.78rem", color: colors.text, marginBottom: "0.375rem" }}>
                        <strong>{ci.category}:</strong> {ci.insight}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button onClick={handleGetAiInsights} disabled={aiLoading} style={{
                alignSelf: "flex-start", padding: "0.375rem 0.75rem", fontSize: "0.75rem", fontWeight: 500,
                color: "#7c3aed", background: "transparent", border: "1px solid rgba(124,58,237,0.3)", borderRadius: 8, cursor: "pointer",
              }}>
                <FiRefreshCw size={12} style={{ marginRight: 4 }} /> {aiLoading ? "Refreshing…" : "Refresh Analysis"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════ RESIDUAL ANALYSIS ════════════════════════════ */}
      {residualData.length > 0 && (
        <div style={cardStyle}>
          {sectionTitle(<FiActivity size={16} color="#f59e0b" />, "Residual Analysis (Backtest Errors)")}
          <div style={gridStyle}>
            {/* Residual scatter */}
            <div>
              <div style={{ fontSize: "0.75rem", fontWeight: 600, color: colors.textSecondary, marginBottom: "0.5rem" }}>Forecast Error by Period</div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={residualData} margin={{ top: 5, right: 20, bottom: 5, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridLine} />
                  <XAxis dataKey="period" tick={{ fontSize: 10, fill: colors.textSecondary }} />
                  <YAxis tick={{ fontSize: 10, fill: colors.textSecondary }} tickFormatter={fmtShort} />
                  <Tooltip formatter={(value) => [`$${fmt(Number(value ?? 0))}`, "Residual"]} contentStyle={tooltipStyle} />
                  <ReferenceLine y={0} stroke={colors.textSecondary} />
                  <Bar dataKey="residual" name="Residual" radius={[3, 3, 0, 0]}>
                    {residualData.map((entry, i) => (
                      <Cell key={i} fill={entry.residual >= 0 ? colors.inflowColor : colors.outflowColor} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Actual vs Predicted scatter */}
            <div>
              <div style={{ fontSize: "0.75rem", fontWeight: 600, color: colors.textSecondary, marginBottom: "0.5rem" }}>Actual vs Predicted</div>
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={residualData} margin={{ top: 5, right: 20, bottom: 5, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridLine} />
                  <XAxis dataKey="period" tick={{ fontSize: 10, fill: colors.textSecondary }} />
                  <YAxis tick={{ fontSize: 10, fill: colors.textSecondary }} tickFormatter={fmtShort} />
                  <Tooltip formatter={(value) => [`$${fmt(Number(value ?? 0))}`, ""]} contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: "0.7rem" }} />
                  <Bar dataKey="actual" name="Actual" fill={colors.inflowColor} radius={[3, 3, 0, 0]} barSize={16} />
                  <Line type="monotone" dataKey="predicted" name="Predicted" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 4, fill: "#3b82f6" }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════ CORRELATION HEATMAP ════════════════════════════ */}
      {hasForecast && correlationData.labels.length >= 2 && (
        <div style={cardStyle}>
          {sectionTitle(<FiGrid size={16} color="#ec4899" />, "Category Forecast Correlation")}
          <p style={{ fontSize: "0.75rem", color: colors.textSecondary, marginTop: "-0.5rem", marginBottom: "0.75rem" }}>
            Pearson correlation between category forecast series. Dark green = move together, dark red = move opposite.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", fontSize: "0.7rem", fontFamily: "'Inter', monospace" }}>
              <thead>
                <tr>
                  <th style={{ padding: "6px 10px", textAlign: "left", color: colors.textSecondary, borderBottom: `1px solid ${colors.border}` }}></th>
                  {correlationData.labels.map((l, i) => (
                    <th key={i} style={{ padding: "6px 8px", textAlign: "center", color: colors.textSecondary, borderBottom: `1px solid ${colors.border}`, writingMode: "vertical-rl", height: 80, maxWidth: 30 }}>{l}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {correlationData.matrix.map((row, ri) => (
                  <tr key={ri}>
                    <td style={{ padding: "6px 10px", fontWeight: 600, color: colors.text, whiteSpace: "nowrap", borderRight: `1px solid ${colors.border}` }}>
                      {correlationData.labels[ri]}
                    </td>
                    {row.map((val, ci) => {
                      const absVal = Math.abs(val);
                      const bg = val > 0
                        ? `${colors.heatGreen}${(absVal * 0.5).toFixed(2)})`
                        : `${colors.heatRed}${(absVal * 0.5).toFixed(2)})`;
                      return (
                        <td key={ci} style={{ padding: "6px 8px", textAlign: "center", background: ri === ci ? "transparent" : bg, color: colors.text, fontWeight: absVal > 0.5 ? 700 : 400 }}>
                          {ri === ci ? "—" : val.toFixed(2)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ════════════════════════════ INTERACTIVE PARAMETER EXPLORER ════════════════════════════ */}
      {hasForecast && (
        <div style={cardStyle}>
          {sectionTitle(<FiTarget size={16} color="#14b8a6" />, "Interactive Parameter Explorer")}
          <p style={{ fontSize: "0.75rem", color: colors.textSecondary, marginTop: "-0.5rem", marginBottom: "0.75rem" }}>
            Pick a row and algorithm, then preview the forecast in real time.
          </p>
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end", flexWrap: "wrap", marginBottom: "0.75rem" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
              <label style={{ fontSize: "0.7rem", fontWeight: 600, color: colors.textSecondary }}>Category Row</label>
              <select
                value={explorerRow}
                onChange={e => { setExplorerRow(e.target.value); setExplorerResult(null); }}
                style={{ padding: "0.375rem 0.5rem", fontSize: "0.8rem", border: `1px solid ${colors.border}`, borderRadius: 6, background: colors.inputBg, color: colors.text, minWidth: 200 }}
              >
                <option value="">Select row…</option>
                {categoryRows.map(r => <option key={r.customId || r.label} value={r.customId || r.label}>{r.label}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
              <label style={{ fontSize: "0.7rem", fontWeight: 600, color: colors.textSecondary }}>Algorithm</label>
              <select
                value={explorerAlgo}
                onChange={e => { setExplorerAlgo(e.target.value); setExplorerResult(null); }}
                style={{ padding: "0.375rem 0.5rem", fontSize: "0.8rem", border: `1px solid ${colors.border}`, borderRadius: 6, background: colors.inputBg, color: colors.text, minWidth: 180 }}
              >
                {algorithms.map(a => <option key={a.id} value={a.id}>{a.advanced ? `★ ${a.name}` : a.name}</option>)}
              </select>
            </div>
            <button
              onClick={handleExplorerRun}
              disabled={!explorerRow || explorerLoading}
              style={{
                display: "inline-flex", alignItems: "center", gap: "0.375rem",
                padding: "0.5rem 1rem", fontSize: "0.8rem", fontWeight: 600,
                color: "#fff", background: !explorerRow ? colors.textSecondary : "#14b8a6",
                border: "none", borderRadius: 8, cursor: !explorerRow || explorerLoading ? "not-allowed" : "pointer",
                opacity: explorerLoading ? 0.6 : 1,
              }}
            >
              <FiPlay size={12} /> {explorerLoading ? "Running…" : "Preview"}
            </button>
          </div>
          {explorerResult && explorerRow && (() => {
            const row = rows.find(r => (r.customId || r.label) === explorerRow);
            if (!row) return null;
            const historical = row.values.slice(0, actualPeriods);
            const chartData = [
              ...historical.map((v, i) => ({ name: `${periodWord}${i + 1}`, actual: Math.round(v), forecast: undefined as number | undefined })),
              { name: `${periodWord}${actualPeriods}`, actual: Math.round(historical[historical.length - 1] ?? 0), forecast: Math.round(historical[historical.length - 1] ?? 0) },
              ...explorerResult.map((v, i) => ({ name: `F${i + 1}`, actual: undefined as number | undefined, forecast: Math.round(v) })),
            ];
            return (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridLine} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: colors.textSecondary }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10, fill: colors.textSecondary }} tickFormatter={fmtShort} />
                  <Tooltip formatter={(value) => [`$${fmt(Number(value ?? 0))}`, ""]} contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: "0.7rem" }} />
                  <Line type="monotone" dataKey="actual" name="Actual" stroke={colors.inflowColor} strokeWidth={2} dot={{ r: 2 }} connectNulls />
                  <Line type="monotone" dataKey="forecast" name={`${algorithms.find(a => a.id === explorerAlgo)?.name ?? explorerAlgo}`} stroke="#3b82f6" strokeWidth={2.5} strokeDasharray="6 3" dot={{ r: 3, fill: "#3b82f6" }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            );
          })()}
        </div>
      )}

      {/* ════════════════════════════ CUSTOM ALGORITHM LIBRARY ════════════════════════════ */}
      <div style={cardStyle}>
        {sectionTitle(<FiLayers size={16} color="#8b5cf6" />, "Custom Algorithm Library")}
        <p style={{ fontSize: "0.78rem", color: colors.textSecondary, marginBottom: "0.75rem", marginTop: "-0.25rem" }}>
          AI agent-generated algorithms. Ask the agent on the Cash Flow page to create a custom forecast algorithm.
        </p>
        {customAlgos.length === 0 ? (
          <div style={{
            padding: "1.5rem", textAlign: "center",
            background: theme === "dark" ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.015)",
            borderRadius: 10, border: `1px dashed ${colors.border}`,
          }}>
            <FiZap size={24} color={colors.textSecondary} style={{ marginBottom: "0.5rem" }} />
            <p style={{ fontSize: "0.85rem", color: colors.textSecondary, margin: 0 }}>
              No custom algorithms yet. Use the AI agent to create one.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {customAlgos.map(algo => (
              <div
                key={algo.id}
                style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "0.875rem 1.25rem", background: colors.secondaryBg, borderRadius: 10,
                  border: `1px solid ${colors.border}`,
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, color: colors.text, fontSize: "0.875rem" }}>{algo.name}</div>
                  <div style={{ fontSize: "0.75rem", color: colors.textSecondary }}>{algo.description}</div>
                  <div style={{ fontSize: "0.65rem", color: colors.textSecondary, marginTop: "0.25rem" }}>ID: {algo.id}</div>
                </div>
                <button
                  onClick={() => handleDeleteCustom(algo.id)}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: "0.25rem",
                    padding: "0.375rem 0.75rem", fontSize: "0.75rem", fontWeight: 500,
                    color: colors.netNegative, background: "transparent",
                    border: `1px solid ${colors.netNegative}`, borderRadius: 8, cursor: "pointer",
                  }}
                >
                  <FiTrash2 size={12} /> Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ThirteenWeekForecast;
