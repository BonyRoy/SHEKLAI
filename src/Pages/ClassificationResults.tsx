import { useEffect, useState, Fragment, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FiArrowLeft, FiPieChart, FiEdit2, FiCheck, FiX, FiAlertTriangle, FiShield, FiCpu, FiDatabase, FiUser } from "react-icons/fi";
import { useTheme } from "../contexts/ThemeContext";
import { getUserId, getAuthHeaders } from "../services/userContext";
import "../Components/Navbar.css";

import { API_BASE_URL } from "../services/apiConfig";

interface QualityReport {
  total_transactions: number;
  classified: number;
  unclassified: number;
  by_confidence: { high: number; medium: number; low: number };
  by_source: Record<string, number>;
  category_distribution: Record<string, number>;
  flagged_items: { txn_id: string; description: string; category: string; confidence: number; source: string }[];
}

interface CategoryEntry {
  id: number;
  name: string;
  type: string;
  source: string;
}

function ConfidenceBadge({ confidence }: { confidence: number | null }) {
  if (confidence == null) return null;
  const color = confidence >= 0.7 ? "#059669" : confidence >= 0.4 ? "#d97706" : "#dc2626";
  const bg = confidence >= 0.7 ? "rgba(5,150,105,0.12)" : confidence >= 0.4 ? "rgba(217,119,6,0.12)" : "rgba(220,38,38,0.12)";
  const label = confidence >= 0.7 ? "High" : confidence >= 0.4 ? "Med" : "Low";
  return (
    <span style={{ fontSize: "0.6875rem", fontWeight: 600, color, background: bg, padding: "2px 6px", borderRadius: 4 }}>
      {label} {(confidence * 100).toFixed(0)}%
    </span>
  );
}

function SourceBadge({ source }: { source: string | null }) {
  if (!source) return null;
  const icons: Record<string, typeof FiShield> = { override: FiShield, cache: FiDatabase, llm: FiCpu, user: FiUser, correction: FiUser };
  const Icon = icons[source] || FiCpu;
  const labels: Record<string, string> = { override: "Rule", cache: "Cache", llm: "LLM", user: "User", correction: "Fixed" };
  return (
    <span style={{ fontSize: "0.6875rem", fontWeight: 500, color: "#6366f1", display: "inline-flex", alignItems: "center", gap: 3 }}>
      <Icon size={11} /> {labels[source] || source}
    </span>
  );
}

function formatCurrency(n: number): string {
  const abs = Math.abs(n);
  const s = abs >= 1e6 ? (abs / 1e6).toFixed(2) + "M" : abs >= 1e3 ? (abs / 1e3).toFixed(2) + "K" : abs.toFixed(2);
  return (n < 0 ? "−" : "") + s;
}

const themeColors = {
  light: {
    text: "#1e293b",
    textSecondary: "#64748b",
    secondaryBg: "#f8fafc",
    cardBg: "#fff",
    border: "rgba(0,0,0,0.08)",
  },
  dark: {
    text: "#e2e8f0",
    textSecondary: "#94a3b8",
    secondaryBg: "#111827",
    cardBg: "#1e293b",
    border: "rgba(255,255,255,0.1)",
  },
};

interface CategorySummaryEntry {
  count: number;
  pct_of_count?: number;
  total_amount?: number;
  credits?: number;
  debits?: number;
  avg_amount?: number;
  pct_of_volume?: number;
}

interface ClassificationResult {
  metadata?: {
    total_descriptions?: number;
    total_clusters?: number;
    distance_threshold?: number;
    has_amounts?: boolean;
    total_volume?: number;
    total_credits?: number;
    total_debits?: number;
    net_flow?: number;
    generated_at?: string;
    source_file?: string;
  };
  category_summary?: Record<string, number | CategorySummaryEntry>;
  clusters?: Record<
    string,
    {
      category: string;
      representative: string;
      size: number;
      sample_descriptions?: string[];
    }
 >;
  row_categories?: Record<string, { description: string; category: string; cluster_id: number }>;
}

const ClassificationResults = () => {
  const [searchParams] = useSearchParams();
  const filename = searchParams.get("filename") || "categories.json";
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const [data, setData] = useState<ClassificationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedCluster, setExpandedCluster] = useState<string | null>(null);

  // Account filter for multi-account ledger
  const [ledgerAccounts, setLedgerAccounts] = useState<{ id: string; display_name: string; source_type: string; txn_count: number }[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [qualityReport, setQualityReport] = useState<QualityReport | null>(null);
  const [categoryRegistry, setCategoryRegistry] = useState<CategoryEntry[]>([]);
  const [reclassifyingTxn, setReclassifyingTxn] = useState<string | null>(null);
  const [reclassifyCategory, setReclassifyCategory] = useState<string>("");

  const userId = getUserId();

  const fetchQuality = useCallback(() => {
    if (!userId) return;
    fetch(`${API_BASE_URL}/api/ledger/classification-quality?user_id=${encodeURIComponent(userId)}`, { headers: { ...getAuthHeaders() } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setQualityReport(d); })
      .catch(() => {});
  }, [userId]);

  useEffect(() => { fetchQuality(); }, [fetchQuality]);

  useEffect(() => {
    if (!userId) return;
    fetch(`${API_BASE_URL}/api/ledger/categories?user_id=${encodeURIComponent(userId)}`, { headers: { ...getAuthHeaders() } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.categories) setCategoryRegistry(d.categories); })
      .catch(() => {});
  }, [userId]);

  const handleReclassify = async (txnId: string) => {
    if (!reclassifyCategory || !userId) return;
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/ledger/transactions/${encodeURIComponent(txnId)}/reclassify?user_id=${encodeURIComponent(userId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify({ category: reclassifyCategory, create_override: true }),
        }
      );
      if (res.ok) {
        setReclassifyingTxn(null);
        setReclassifyCategory("");
        fetchQuality();
      }
    } catch { /* ignore */ }
  };

  // Fetch ledger accounts
  useEffect(() => {
    if (!userId) return;
    fetch(`${API_BASE_URL}/api/ledger/accounts?user_id=${encodeURIComponent(userId)}`, { headers: { ...getAuthHeaders() } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.accounts) setLedgerAccounts(d.accounts); })
      .catch(() => {});
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setError("Please log in to view results.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    // Try ledger endpoint first, fall back to legacy
    const accountParam = selectedAccountId ? `&account_id=${encodeURIComponent(selectedAccountId)}` : "";
    fetch(
      `${API_BASE_URL}/api/ledger/cash-flow?user_id=${encodeURIComponent(userId)}${accountParam}`,
      { headers: { ...getAuthHeaders() } }
    )
      .then(r => r.ok ? r.json() : null)
      .then(result => {
        if (result?.data) {
          setData(result.data);
          setLoading(false);
          return;
        }
        // Fallback to legacy endpoint
        return fetch(
          `${API_BASE_URL}/api/standardized/cash-flow?user_id=${encodeURIComponent(userId)}`,
          { headers: { ...getAuthHeaders() } }
        )
          .then((res) => {
            if (res.status === 404) throw new Error("No standardized data yet. Run classification on Connect Data first.");
            if (!res.ok) return res.json().then((b) => { throw new Error(b?.error ?? "Failed to load."); });
            return res.json();
          })
          .then(setData);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [userId, selectedAccountId]);

  if (loading) {
    return (
      <div
        style={{
          padding: "48px 24px",
          maxWidth: 1000,
          margin: "0 auto",
          textAlign: "center",
          color: colors.textSecondary,
        }}
      >
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
        Loading classification results…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div
        style={{
          padding: "48px 24px",
          maxWidth: 560,
          margin: "0 auto",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            margin: "0 auto 1.25rem",
            borderRadius: "50%",
            background: theme === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <FiPieChart size={32} style={{ color: colors.textSecondary }} />
        </div>
        <h2
          style={{
            color: colors.text,
            fontSize: "1.35rem",
            fontWeight: 700,
            margin: "0 0 0.5rem",
            fontFamily: "'Inter', sans-serif",
          }}
        >
          No classification results yet
        </h2>
        <p style={{ color: colors.textSecondary, marginBottom: "1.5rem", fontSize: "0.95rem" }}>
          Run classification on Connect Data to see your transaction breakdown.
        </p>
        <Link
          to="/connect-data"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.625rem 1.25rem",
            background: "var(--primary)",
            color: "#fff",
            fontWeight: 600,
            textDecoration: "none",
            borderRadius: 8,
            fontSize: "0.9375rem",
          }}
        >
          Go to Connect Data
        </Link>
      </div>
    );
  }

  const totalDescriptions = data.metadata?.total_descriptions ?? 0;
  const totalClusters = data.metadata?.total_clusters ?? 0;
  const hasAmounts = data.metadata?.has_amounts === true;
  const totalVolume = data.metadata?.total_volume ?? 0;
  const totalCredits = data.metadata?.total_credits ?? 0;
  const totalDebits = data.metadata?.total_debits ?? 0;
  const netFlow = data.metadata?.net_flow ?? 0;
  const categorySummary = data.category_summary ?? {};
  const categoryEntries: [string, CategorySummaryEntry][] = Object.entries(categorySummary).map(
    ([name, v]): [string, CategorySummaryEntry] => {
      const count = typeof v === "object" && v !== null && "count" in v
        ? (v as CategorySummaryEntry).count
        : typeof v === "number" ? v : 0;
      const existing = typeof v === "object" && v !== null && "count" in v ? (v as CategorySummaryEntry) : null;
      const pct_of_count =
        existing?.pct_of_count != null
          ? existing.pct_of_count
          : totalDescriptions > 0
            ? Math.round((100 * count) / totalDescriptions * 10) / 10
            : 0;
      const entry: CategorySummaryEntry = existing
        ? { ...existing, count, pct_of_count }
        : { count, pct_of_count };
      return [name, entry];
    }
  );
  categoryEntries.sort((a, b) => b[1].count - a[1].count);
  const maxCount = Math.max(...categoryEntries.map(([, e]) => e.count), 1);
  const clustersList = data.clusters
    ? Object.entries(data.clusters)
        .map(([id, c]) => ({ id, ...c }))
        .sort((a, b) => b.size - a.size)
    : [];

  return (
    <div style={{ padding: "48px 24px 60px", maxWidth: 1100, margin: "0 auto" }}>
      <header style={{ marginBottom: "2rem" }}>
        <Link
          to="/connect-data"
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
          <FiArrowLeft /> Back to Connect Data
        </Link>
        <h1
          style={{
            color: colors.text,
            fontSize: "1.75rem",
            fontWeight: 700,
            marginBottom: "0.5rem",
            fontFamily: "'Inter', sans-serif",
            letterSpacing: "-0.5px",
          }}
        >
          Classification results
        </h1>
        {ledgerAccounts.length > 0 && (
          <div style={{ margin: "0.75rem 0", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <label htmlFor="cr-account-filter" style={{ fontSize: "0.8125rem", fontWeight: 600, color: colors.textSecondary }}>Account</label>
            <select
              id="cr-account-filter"
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              style={{
                padding: "0.375rem 0.5rem",
                fontSize: "0.8125rem",
                border: `1px solid ${colors.border}`,
                borderRadius: 6,
                background: colors.cardBg,
                color: colors.text,
              }}
            >
              <option value="">All Accounts</option>
              {ledgerAccounts.map(a => (
                <option key={a.id} value={a.id}>{a.display_name} ({a.txn_count} txns)</option>
              ))}
            </select>
          </div>
        )}
        <p style={{ color: colors.textSecondary, fontSize: "0.95rem", margin: 0 }}>
          {totalDescriptions.toLocaleString()} transactions across {categoryEntries.length} categories
          {data.metadata?.source_file != null && data.metadata.source_file !== ""
            ? ` · From ${data.metadata.source_file}`
            : ""}
          {data.metadata?.generated_at
            ? ` · Generated ${new Date(data.metadata.generated_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`
            : ""}
        </p>
        {totalDescriptions === 0 && (
          <div
            style={{
              marginTop: "1rem",
              padding: "1rem 1.25rem",
              background: theme === "dark" ? "rgba(234, 179, 8, 0.12)" : "rgba(234, 179, 8, 0.08)",
              border: `1px solid ${theme === "dark" ? "rgba(234, 179, 8, 0.4)" : "rgba(234, 179, 8, 0.35)"}`,
              borderRadius: 10,
              color: theme === "dark" ? "#fcd34d" : "#a16207",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: "0.9375rem", marginBottom: "0.35rem" }}>
              No transactions in this result
            </div>
            <p style={{ margin: 0, fontSize: "0.875rem", lineHeight: 1.45, color: colors.textSecondary }}>
              Go to Connect Data, select your CSV, set Description and Amount to the correct columns (e.g. &quot;Description&quot;, &quot;Amount&quot;), optionally a date column (e.g. &quot;Posting Date&quot;), then click Classify. Your file has an Amount column—ensure it is selected in the dropdown.
            </p>
            <Link
              to="/connect-data"
              style={{
                display: "inline-block",
                marginTop: "0.75rem",
                padding: "0.5rem 1rem",
                background: "var(--primary)",
                color: "#fff",
                fontWeight: 600,
                fontSize: "0.875rem",
                textDecoration: "none",
                borderRadius: 8,
              }}
            >
              Go to Connect Data →
            </Link>
          </div>
        )}
        {totalDescriptions > 0 && !hasAmounts && (
          <div
            style={{
              marginTop: "1rem",
              padding: "1rem 1.25rem",
              background: theme === "dark" ? "rgba(59, 130, 246, 0.15)" : "rgba(59, 130, 246, 0.08)",
              border: `1px solid ${theme === "dark" ? "rgba(59, 130, 246, 0.4)" : "rgba(59, 130, 246, 0.3)"}`,
              borderRadius: 10,
              color: theme === "dark" ? "#93c5fd" : "#1e40af",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: "0.9375rem", marginBottom: "0.35rem" }}>
              To see money flow (credits, debits, net)
            </div>
            <p style={{ margin: 0, fontSize: "0.875rem", lineHeight: 1.45, color: colors.textSecondary }}>
              Re-run classification on Connect Data with a CSV that has an <strong style={{ color: colors.text }}>Amount</strong> column. You’ll then see Net flow, Volume, Credits, Debits, and per-category amounts here.
            </p>
            <Link
              to="/connect-data"
              style={{
                display: "inline-block",
                marginTop: "0.75rem",
                padding: "0.5rem 1rem",
                background: "var(--primary)",
                color: "#fff",
                fontWeight: 600,
                fontSize: "0.875rem",
                textDecoration: "none",
                borderRadius: 8,
              }}
            >
              Go to Connect Data →
            </Link>
          </div>
        )}
      </header>

      {/* Primary KPI row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: hasAmounts ? "repeat(4, 1fr)" : "repeat(3, 1fr)",
          gap: "1rem",
          marginBottom: hasAmounts ? "1rem" : "2rem",
        }}
      >
        <div
          style={{
            background: colors.cardBg,
            border: `1px solid ${colors.border}`,
            borderRadius: 12,
            padding: "1.25rem",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <div style={{ color: colors.textSecondary, fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.35rem" }}>
            Transactions
          </div>
          <div style={{ fontSize: "1.875rem", fontWeight: 700, color: colors.text, fontVariantNumeric: "tabular-nums" }}>
            {totalDescriptions.toLocaleString()}
          </div>
        </div>
        <div
          style={{
            background: colors.cardBg,
            border: `1px solid ${colors.border}`,
            borderRadius: 12,
            padding: "1.25rem",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <div style={{ color: colors.textSecondary, fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.35rem" }}>
            Clusters
          </div>
          <div style={{ fontSize: "1.875rem", fontWeight: 700, color: colors.text, fontVariantNumeric: "tabular-nums" }}>
            {totalClusters.toLocaleString()}
          </div>
        </div>
        <div
          style={{
            background: colors.cardBg,
            border: `1px solid ${colors.border}`,
            borderRadius: 12,
            padding: "1.25rem",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <div style={{ color: colors.textSecondary, fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.35rem" }}>
            Categories
          </div>
          <div style={{ fontSize: "1.875rem", fontWeight: 700, color: colors.text, fontVariantNumeric: "tabular-nums" }}>
            {categoryEntries.length}
          </div>
        </div>
        {hasAmounts && (
          <div
            style={{
              background: colors.cardBg,
              border: `1px solid ${colors.border}`,
              borderRadius: 12,
              padding: "1.25rem",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <div style={{ color: colors.textSecondary, fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.35rem" }}>
              Net flow
            </div>
            <div
              style={{
                fontSize: "1.875rem",
                fontWeight: 700,
                color: netFlow >= 0 ? "#059669" : "#dc2626",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {netFlow >= 0 ? "" : "−"}
              {formatCurrency(netFlow >= 0 ? netFlow : -netFlow)}
            </div>
          </div>
        )}
      </div>

      {/* Secondary row (only when has_amounts) */}
      {hasAmounts && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "1rem",
            marginBottom: "2rem",
          }}
        >
          <div
            style={{
              background: colors.cardBg,
              border: `1px solid ${colors.border}`,
              borderRadius: 12,
              padding: "1rem 1.25rem",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <div style={{ color: colors.textSecondary, fontSize: "0.7rem", fontWeight: 600, marginBottom: "0.25rem" }}>Volume</div>
            <div style={{ fontSize: "1.25rem", fontWeight: 700, color: colors.text, fontVariantNumeric: "tabular-nums" }}>
              {formatCurrency(totalVolume)}
            </div>
          </div>
          <div
            style={{
              background: colors.cardBg,
              border: `1px solid ${colors.border}`,
              borderRadius: 12,
              padding: "1rem 1.25rem",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <div style={{ color: colors.textSecondary, fontSize: "0.7rem", fontWeight: 600, marginBottom: "0.25rem" }}>Credits</div>
            <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#059669", fontVariantNumeric: "tabular-nums" }}>
              {formatCurrency(totalCredits)}
            </div>
          </div>
          <div
            style={{
              background: colors.cardBg,
              border: `1px solid ${colors.border}`,
              borderRadius: 12,
              padding: "1rem 1.25rem",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <div style={{ color: colors.textSecondary, fontSize: "0.7rem", fontWeight: 600, marginBottom: "0.25rem" }}>Debits</div>
            <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#dc2626", fontVariantNumeric: "tabular-nums" }}>
              {formatCurrency(totalDebits)}
            </div>
          </div>
        </div>
      )}

      {/* Quality summary banner */}
      {qualityReport && qualityReport.classified > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: "0.75rem",
            marginBottom: "1.5rem",
            padding: "1rem 1.25rem",
            background: colors.secondaryBg,
            border: `1px solid ${colors.border}`,
            borderRadius: 12,
          }}
        >
          <div>
            <div style={{ fontSize: "0.6875rem", fontWeight: 600, color: colors.textSecondary, marginBottom: 2 }}>High confidence</div>
            <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#059669" }}>{qualityReport.by_confidence.high.toLocaleString()}</div>
          </div>
          <div>
            <div style={{ fontSize: "0.6875rem", fontWeight: 600, color: colors.textSecondary, marginBottom: 2 }}>Medium</div>
            <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#d97706" }}>{qualityReport.by_confidence.medium.toLocaleString()}</div>
          </div>
          <div>
            <div style={{ fontSize: "0.6875rem", fontWeight: 600, color: colors.textSecondary, marginBottom: 2 }}>Low / flagged</div>
            <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#dc2626" }}>{qualityReport.by_confidence.low.toLocaleString()}</div>
          </div>
          <div>
            <div style={{ fontSize: "0.6875rem", fontWeight: 600, color: colors.textSecondary, marginBottom: 2 }}>Unclassified</div>
            <div style={{ fontSize: "1.25rem", fontWeight: 700, color: colors.text }}>{qualityReport.unclassified.toLocaleString()}</div>
          </div>
          {Object.keys(qualityReport.by_source).length > 0 && (
            <div style={{ gridColumn: "1 / -1", display: "flex", gap: "1rem", flexWrap: "wrap", paddingTop: "0.5rem", borderTop: `1px solid ${colors.border}` }}>
              {Object.entries(qualityReport.by_source).map(([src, cnt]) => (
                <div key={src} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <SourceBadge source={src} />
                  <span style={{ fontSize: "0.75rem", color: colors.textSecondary }}>{(cnt as number).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Flagged items */}
      {qualityReport && qualityReport.flagged_items.length > 0 && (
        <div
          style={{
            marginBottom: "1.5rem",
            padding: "1rem 1.25rem",
            background: theme === "dark" ? "rgba(220,38,38,0.08)" : "rgba(220,38,38,0.05)",
            border: `1px solid ${theme === "dark" ? "rgba(220,38,38,0.3)" : "rgba(220,38,38,0.2)"}`,
            borderRadius: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: "0.75rem" }}>
            <FiAlertTriangle size={16} style={{ color: "#dc2626" }} />
            <span style={{ fontWeight: 700, fontSize: "0.9rem", color: colors.text }}>
              {qualityReport.flagged_items.length} low-confidence classifications
            </span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                  <th style={{ textAlign: "left", padding: "0.4rem 0.75rem", color: colors.textSecondary, fontWeight: 600 }}>Description</th>
                  <th style={{ textAlign: "left", padding: "0.4rem 0.75rem", color: colors.textSecondary, fontWeight: 600 }}>Category</th>
                  <th style={{ textAlign: "center", padding: "0.4rem 0.75rem", color: colors.textSecondary, fontWeight: 600 }}>Confidence</th>
                  <th style={{ textAlign: "center", padding: "0.4rem 0.75rem", color: colors.textSecondary, fontWeight: 600 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {qualityReport.flagged_items.slice(0, 10).map((item) => (
                  <tr key={item.txn_id} style={{ borderBottom: `1px solid ${colors.border}` }}>
                    <td style={{ padding: "0.4rem 0.75rem", color: colors.text, maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.description}>
                      {item.description}
                    </td>
                    <td style={{ padding: "0.4rem 0.75rem", color: colors.text }}>{item.category}</td>
                    <td style={{ padding: "0.4rem 0.75rem", textAlign: "center" }}>
                      <ConfidenceBadge confidence={item.confidence} />
                    </td>
                    <td style={{ padding: "0.4rem 0.75rem", textAlign: "center" }}>
                      {reclassifyingTxn === item.txn_id ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "center" }}>
                          <select
                            value={reclassifyCategory}
                            onChange={(e) => setReclassifyCategory(e.target.value)}
                            style={{ fontSize: "0.75rem", padding: "2px 4px", borderRadius: 4, border: `1px solid ${colors.border}`, background: colors.cardBg, color: colors.text, maxWidth: 140 }}
                          >
                            <option value="">Pick category</option>
                            {categoryRegistry.map((c) => (
                              <option key={c.id} value={c.name}>{c.name}</option>
                            ))}
                          </select>
                          <button onClick={() => handleReclassify(item.txn_id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#059669", padding: 2 }} title="Confirm">
                            <FiCheck size={14} />
                          </button>
                          <button onClick={() => { setReclassifyingTxn(null); setReclassifyCategory(""); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626", padding: 2 }} title="Cancel">
                            <FiX size={14} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setReclassifyingTxn(item.txn_id); setReclassifyCategory(""); }}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--primary)", padding: 2, display: "inline-flex", alignItems: "center", gap: 3 }}
                          title="Reclassify"
                        >
                          <FiEdit2 size={13} /> Fix
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Transactions by category - table */}
      <section
        style={{
          background: colors.secondaryBg,
          border: `1px solid ${colors.border}`,
          borderRadius: 12,
          padding: "1.5rem",
          marginBottom: "2rem",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <h2
          style={{
            color: colors.text,
            fontSize: "1.1rem",
            fontWeight: 700,
            margin: "0 0 1rem",
            fontFamily: "'Inter', sans-serif",
          }}
        >
          Transactions by category
        </h2>
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "0.8125rem",
              fontVariantNumeric: "tabular-nums",
              tableLayout: "fixed",
            }}
          >
            <colgroup>
              <col style={{ width: "auto" }} />
              <col style={{ width: "140px" }} />
              <col style={{ width: "100px" }} />
              {hasAmounts && <><col style={{ width: "90px" }} /><col style={{ width: "90px" }} /><col style={{ width: "90px" }} /><col style={{ width: "80px" }} /><col style={{ width: "80px" }} /></>}
            </colgroup>
            <thead>
              <tr style={{ borderBottom: `2px solid ${colors.border}` }}>
                <th style={{ padding: "0.75rem 1rem", textAlign: "left", fontWeight: 600, color: colors.textSecondary }}>Category</th>
                <th style={{ padding: "0.75rem 1rem", textAlign: "right", fontWeight: 600, color: colors.textSecondary }}># Transactions</th>
                <th style={{ padding: "0.75rem 1rem", textAlign: "right", fontWeight: 600, color: colors.textSecondary }}>% of total</th>
                {hasAmounts && (
                  <>
                    <th style={{ padding: "0.75rem 1rem", textAlign: "right", fontWeight: 600, color: colors.textSecondary }}>Net</th>
                    <th style={{ padding: "0.75rem 1rem", textAlign: "right", fontWeight: 600, color: colors.textSecondary }}>Credits</th>
                    <th style={{ padding: "0.75rem 1rem", textAlign: "right", fontWeight: 600, color: colors.textSecondary }}>Debits</th>
                    <th style={{ padding: "0.75rem 1rem", textAlign: "right", fontWeight: 600, color: colors.textSecondary }}>Avg</th>
                    <th style={{ padding: "0.75rem 1rem", textAlign: "right", fontWeight: 600, color: colors.textSecondary }}>% Volume</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {categoryEntries.map(([name, entry], idx) => (
                <tr
                  key={name}
                  style={{
                    borderBottom: `1px solid ${colors.border}`,
                    background: idx % 2 === 1 ? (theme === "dark" ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)") : "transparent",
                  }}
                >
                  <td style={{ padding: "0.625rem 1rem", color: colors.text, fontWeight: 500 }}>{name}</td>
                  <td style={{ padding: "0.625rem 1rem", textAlign: "right" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "0.5rem" }}>
                      <div
                        style={{
                          width: 80,
                          height: 20,
                          background: theme === "dark" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
                          borderRadius: 4,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${(entry.count / maxCount) * 100}%`,
                            minWidth: entry.count > 0 ? 4 : 0,
                            height: "100%",
                            background: "var(--primary)",
                            borderRadius: 4,
                            opacity: 0.85,
                          }}
                        />
                      </div>
                      <span style={{ minWidth: 48 }}>{entry.count.toLocaleString()}</span>
                    </div>
                  </td>
                  <td style={{ padding: "0.625rem 1rem", textAlign: "right", color: colors.textSecondary, fontVariantNumeric: "tabular-nums" }}>
                    {(entry.pct_of_count ?? 0).toFixed(1)}%
                  </td>
                  {hasAmounts && (
                    <>
                      <td
                        style={{
                          padding: "0.625rem 1rem",
                          textAlign: "right",
                          color: ((entry.total_amount ?? 0) >= 0 ? "#059669" : "#dc2626") as string,
                        }}
                      >
                        {formatCurrency(entry.total_amount ?? 0)}
                      </td>
                      <td style={{ padding: "0.625rem 1rem", textAlign: "right", color: colors.textSecondary }}>
                        {formatCurrency(entry.credits ?? 0)}
                      </td>
                      <td style={{ padding: "0.625rem 1rem", textAlign: "right", color: colors.textSecondary }}>
                        {formatCurrency(entry.debits ?? 0)}
                      </td>
                      <td style={{ padding: "0.625rem 1rem", textAlign: "right", color: colors.textSecondary }}>
                        {formatCurrency(entry.avg_amount ?? 0)}
                      </td>
                      <td style={{ padding: "0.625rem 1rem", textAlign: "right", color: colors.textSecondary }}>
                        {(entry.pct_of_volume ?? 0).toFixed(1)}%
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Cluster breakdown */}
      <section
        style={{
          background: colors.secondaryBg,
          border: `1px solid ${colors.border}`,
          borderRadius: 12,
          overflow: "hidden",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <h2
          style={{
            color: colors.text,
            fontSize: "1.1rem",
            fontWeight: 700,
            margin: 0,
            padding: "1rem 1.25rem",
            borderBottom: `1px solid ${colors.border}`,
            fontFamily: "'Inter', sans-serif",
          }}
        >
          Cluster breakdown
        </h2>
        <div style={{ overflowX: "auto", maxHeight: 520, overflowY: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "0.8125rem",
            }}
            role="grid"
          >
            <thead>
              <tr
                style={{
                  position: "sticky",
                  top: 0,
                  zIndex: 1,
                  background: theme === "dark" ? "#1e293b" : "#f8fafc",
                  borderBottom: `2px solid ${colors.border}`,
                }}
              >
                <th style={{ padding: "0.75rem 1rem", textAlign: "left", fontWeight: 600, color: colors.textSecondary }}>Category</th>
                <th style={{ padding: "0.75rem 1rem", textAlign: "left", fontWeight: 600, color: colors.textSecondary }}>Representative</th>
                <th style={{ padding: "0.75rem 1rem", textAlign: "right", fontWeight: 600, color: colors.textSecondary }}>Size</th>
                <th style={{ padding: "0.75rem 1rem", width: 48, fontWeight: 600, color: colors.textSecondary }}>Samples</th>
              </tr>
            </thead>
            <tbody>
              {clustersList.map(({ id, category, representative, size, sample_descriptions }) => {
                const isExpanded = expandedCluster === id;
                return (
                  <Fragment key={id}>
                    <tr
                      style={{
                        background: expandedCluster === id ? (theme === "dark" ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)") : "transparent",
                        borderBottom: `1px solid ${colors.border}`,
                      }}
                    >
                      <td style={{ padding: "0.625rem 1rem", color: colors.text, fontWeight: 500 }}>{category}</td>
                      <td style={{ padding: "0.625rem 1rem", color: colors.text, maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis" }} title={representative}>
                        {representative}
                      </td>
                      <td style={{ padding: "0.625rem 1rem", textAlign: "right", color: colors.textSecondary }}>{size.toLocaleString()}</td>
                      <td style={{ padding: "0.5rem" }}>
                        {sample_descriptions && sample_descriptions.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setExpandedCluster(isExpanded ? null : id)}
                            style={{
                              padding: "0.25rem 0.5rem",
                              fontSize: "0.75rem",
                              color: "var(--primary)",
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              fontWeight: 600,
                            }}
                          >
                            {isExpanded ? "Hide" : "Samples"}
                          </button>
                        )}
                      </td>
                    </tr>
                    {isExpanded && sample_descriptions && sample_descriptions.length > 0 && (
                      <tr key={`${id}-exp`} style={{ borderBottom: `1px solid ${colors.border}` }}>
                        <td colSpan={4} style={{ padding: "0 1rem 0.75rem 1rem", background: theme === "dark" ? "rgba(0,0,0,0.2)" : "rgba(0,0,0,0.03)" }}>
                          <div style={{ fontSize: "0.75rem", color: colors.textSecondary }}>
                            {sample_descriptions.map((s, i) => (
                              <div key={i} style={{ marginBottom: "0.25rem" }} title={s}>
                                {s.length > 100 ? `${s.slice(0, 100)}…` : s}
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default ClassificationResults;
