import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { FiChevronDown, FiChevronRight, FiDownload, FiFileText, FiUpload, FiBarChart2, FiRefreshCw, FiLink, FiDollarSign, FiTrash2, FiCreditCard, FiDatabase, FiEdit2, FiPlus, FiCheck, FiX, FiTag } from "react-icons/fi";
import { toast } from "react-toastify";
import { usePlaidLink, PlaidLinkOnSuccessMetadata } from "react-plaid-link";
import { useTheme } from "../contexts/ThemeContext";
import { getUserId, getAuthHeaders } from "../services/userContext";
import "../Components/Navbar.css";

import { API_BASE_URL } from "../services/apiConfig";

const MOBILE_BREAKPOINT = 768;

const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT
  );
  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const handler = () => setIsMobile(mql.matches);
    mql.addEventListener("change", handler);
    handler();
    return () => mql.removeEventListener("change", handler);
  }, []);
  return isMobile;
};

const themeColors = {
  light: {
    text: "#1e293b",
    textSecondary: "#64748b",
    secondaryBg: "#f8fafc",
    inputBg: "#fff",
    border: "rgba(0,0,0,0.12)",
  },
  dark: {
    text: "#e2e8f0",
    textSecondary: "#94a3b8",
    inputBg: "#0f172a",
    border: "rgba(255,255,255,0.12)",
    secondaryBg: "#111827",
  },
};

const MAX_TABLE_ROWS = 500;

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else if ((c === "\n" || c === "\r") && !inQuotes) {
      break;
    } else {
      current += c;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = parseCSVLine(lines[0]);
  const rows: string[][] = [];
  for (let i = 1; i < lines.length; i++) {
    rows.push(parseCSVLine(lines[i]));
  }
  return { headers, rows };
}

interface FileItem {
  name: string;
  size_kb: number;
}

interface PlaidAccount {
  account_id: string;
  name: string;
  official_name: string;
  type: string;
  subtype: string;
  mask: string;
  balance_available: number | null;
  balance_current: number | null;
  currency: string;
}

interface PlaidConnection {
  item_id: string;
  institution_name: string;
  institution_id: string;
  accounts: PlaidAccount[];
  connected_at: string;
  last_sync_cursor: boolean;
}

interface StripeStatus {
  connected: boolean;
  account: {
    id: string;
    business_name: string;
    email: string;
    country: string;
    default_currency: string;
  } | null;
  connected_at: string | null;
  last_sync: string | null;
  last_sync_count: number;
}

/* Plaid Link wrapper — must be a child component because usePlaidLink needs a static token */
const PlaidLinkButton = ({
  linkToken,
  userId,
  onSuccess,
  disabled,
  theme,
}: {
  linkToken: string;
  userId: string;
  onSuccess: () => void;
  disabled: boolean;
  theme: "light" | "dark";
}) => {
  const onPlaidSuccess = useCallback(
    async (publicToken: string, metadata: PlaidLinkOnSuccessMetadata) => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/plaid/exchange-token?user_id=${encodeURIComponent(userId)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify({
            public_token: publicToken,
            institution_name: metadata.institution?.name || "Bank",
            institution_id: metadata.institution?.institution_id || "",
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Exchange failed");
        toast.success(`Connected to ${data.institution_name} (${data.accounts?.length || 0} accounts)`);
        onSuccess();

        // Auto-sync transactions right after connecting
        try {
          await fetch(`${API_BASE_URL}/api/plaid/sync-transactions?user_id=${encodeURIComponent(userId)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...getAuthHeaders() },
            body: "{}",
          }).then(r => r.json()).then(d => {
            if (d.count > 0) toast.success(`Synced ${d.count} transactions from ${data.institution_name}`);
          });
        } catch { /* sync can fail silently on first connect */ }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to connect bank");
      }
    },
    [userId, onSuccess]
  );

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: onPlaidSuccess,
  });

  return (
    <button
      type="button"
      onClick={() => open()}
      disabled={disabled || !ready}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.5rem",
        padding: "0.625rem 1rem",
        fontSize: "0.875rem",
        fontWeight: 600,
        color: "#fff",
        background: disabled || !ready ? "#94a3b8" : "#10b981",
        border: "none",
        borderRadius: 8,
        cursor: disabled || !ready ? "not-allowed" : "pointer",
        marginTop: "auto",
        fontFamily: "'Inter', sans-serif",
        transition: "all 150ms cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      <FiLink aria-hidden style={{ width: "1rem", height: "1rem" }} />
      {ready ? "Connect Bank" : "Loading…"}
    </button>
  );
};

const ConnectData = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const isMobile = useIsMobile();
  const [selectedCompany, setSelectedCompany] = useState<string>("company1");
  const [tableData, setTableData] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [files, setFiles] = useState<FileItem[]>([]);

  const SYSTEM_FILE_NAMES = new Set([
    "plaid_connections.json","plaid_transactions.csv","plaid_transactions_flat.csv","plaid_accounts.csv",
    "stripe_connection.json","stripe_transactions.csv",
    "categories.json","cluster_cache.json",
    "normalization_rules.json","suggested_categories.json",
    "data_quality_profile.json",
  ]);

  const userVisibleFiles = useMemo(() => files.filter(f => {
    const n = f.name.toLowerCase();
    if (n.endsWith(".html") || n.endsWith(".db")) return false;
    if (SYSTEM_FILE_NAMES.has(n)) return false;
    if (n.includes("_normalized.") || n.startsWith("ledger") || n.startsWith("plaid_")) return false;
    return true;
  }), [files]);

  // Plaid state
  const [plaidLinkToken, setPlaidLinkToken] = useState<string | null>(null);
  const [plaidConnections, setPlaidConnections] = useState<PlaidConnection[]>([]);
  const [plaidSyncing, setPlaidSyncing] = useState(false);

  // Stripe state
  const [stripeStatus, setStripeStatus] = useState<StripeStatus | null>(null);
  const [stripeConnecting, setStripeConnecting] = useState(false);
  const [stripeSyncing, setStripeSyncing] = useState(false);
  const [stripeModalOpen, setStripeModalOpen] = useState(false);
  const [stripeKeyInput, setStripeKeyInput] = useState("");

  // Company profile / research state
  const [companyProfileExists, setCompanyProfileExists] = useState<boolean | null>(null);
  const [companyProfileName, setCompanyProfileName] = useState("");
  const [companyProfileContent, setCompanyProfileContent] = useState("");
  const [companySummaryContent, setCompanySummaryContent] = useState("");
  const [companyNameInput, setCompanyNameInput] = useState("");
  const [companyUrlInput, setCompanyUrlInput] = useState("");
  const [companyDescInput, setCompanyDescInput] = useState("");
  const [companyResearching, setCompanyResearching] = useState(false);
  const [companyEditing, setCompanyEditing] = useState(false);
  const [companyEditDraft, setCompanyEditDraft] = useState("");
  const [companySummaryEditDraft, setCompanySummaryEditDraft] = useState("");
  const [companySaving, setCompanySaving] = useState(false);
  const [companyViewTab, setCompanyViewTab] = useState<"summary" | "detailed">("summary");

  // Ledger accounts count (to show panel even when files are system-only)
  const [ledgerAccountCount, setLedgerAccountCount] = useState(0);

  // Upload / ingestion engine state
  const [uploadProgress, setUploadProgress] = useState<"idle" | "uploading" | "analyzing" | "ingesting" | "done" | "error">("idle");
  const [uploadSchema, setUploadSchema] = useState<Record<string, unknown> | null>(null);
  const [uploadValidation, setUploadValidation] = useState<{ ok: boolean; warnings: string[]; checks: Record<string, unknown> } | null>(null);
  const [uploadIngestResult, setUploadIngestResult] = useState<Record<string, unknown> | null>(null);
  const [uploadIngestErrors, setUploadIngestErrors] = useState<string[] | null>(null);
  const [uploadIngestMethod, setUploadIngestMethod] = useState<string | null>(null);

  // Normalizer state
  const [isNormalizing, setIsNormalizing] = useState(false);

  // Category editor state
  const [showCategories, setShowCategories] = useState(false);
  const [categoryList, setCategoryList] = useState<{ id: number; name: string; type: string; source: string }[]>([]);
  const [editingCatId, setEditingCatId] = useState<number | null>(null);
  const [editingCatName, setEditingCatName] = useState("");
  const [editingCatType, setEditingCatType] = useState("expense");
  const [newCatName, setNewCatName] = useState("");
  const [newCatType, setNewCatType] = useState("expense");

  const isSectionDisabled = !selectedCompany;

  const userId = getUserId();

  useEffect(() => {
    if (!userId || !selectedCompany) {
      setFiles([]);
      return;
    }
    fetch(`${API_BASE_URL}/api/files?user_id=${encodeURIComponent(userId)}`, {
      headers: { ...getAuthHeaders() },
    })
      .then((res) => res.json())
      .then((data) => { setFiles(data.files || []); })
      .catch(() => setFiles([]));
  }, [userId, selectedCompany]);

  // Fetch ledger account count to know if data exists
  useEffect(() => {
    if (!userId) return;
    fetch(`${API_BASE_URL}/api/ledger/accounts?user_id=${encodeURIComponent(userId)}`, {
      headers: { ...getAuthHeaders() },
    })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.accounts) setLedgerAccountCount(d.accounts.length); })
      .catch(() => {});
  }, [userId]);

  const fetchCategories = useCallback(() => {
    if (!userId) return;
    fetch(`${API_BASE_URL}/api/ledger/categories?user_id=${encodeURIComponent(userId)}`, {
      headers: { ...getAuthHeaders() },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.categories) setCategoryList(d.categories); })
      .catch(() => {});
  }, [userId]);

  useEffect(() => { if (showCategories) fetchCategories(); }, [showCategories, fetchCategories]);

  // --- Company profile: check if exists ---
  useEffect(() => {
    if (!userId) return;
    fetch(`${API_BASE_URL}/api/cfo/company-profile?user_id=${encodeURIComponent(userId)}`, {
      headers: { ...getAuthHeaders() },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          setCompanyProfileExists(d.exists);
          if (d.company_name) setCompanyProfileName(d.company_name);
          if (d.content) setCompanyProfileContent(d.content);
          if (d.summary) setCompanySummaryContent(d.summary);
        }
      })
      .catch(() => setCompanyProfileExists(false));
  }, [userId]);

  const handleCompanyResearch = async () => {
    if (!companyNameInput.trim()) return;
    setCompanyResearching(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/cfo/research-company?user_id=${encodeURIComponent(userId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify({
            company_name: companyNameInput.trim(),
            company_url: companyUrlInput.trim(),
            description: companyDescInput.trim(),
          }),
        }
      );
      const d = await res.json();
      if (d.success) {
        setCompanyProfileExists(true);
        setCompanyProfileName(d.company_name || companyNameInput.trim());
        if (d.profile) setCompanyProfileContent(d.profile);
        if (d.summary) setCompanySummaryContent(d.summary);
        if (!d.profile || !d.summary) {
          const profileRes = await fetch(
            `${API_BASE_URL}/api/cfo/company-profile?user_id=${encodeURIComponent(userId)}`,
            { headers: { ...getAuthHeaders() } }
          );
          const profileData = await profileRes.json();
          if (profileData?.content && !d.profile) setCompanyProfileContent(profileData.content);
          if (profileData?.summary && !d.summary) setCompanySummaryContent(profileData.summary);
        }
        const iterations = d.iterations || 0;
        toast.success(`Research complete! Agent ran ${iterations} iterations. Review the profile below.`);
      } else {
        toast.error(d.error || "Research failed");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Research failed");
    } finally {
      setCompanyResearching(false);
    }
  };

  const handleSaveCompanyProfile = async () => {
    setCompanySaving(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/cfo/company-profile?user_id=${encodeURIComponent(userId)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify({ content: companyEditDraft, summary: companySummaryEditDraft }),
        }
      );
      const d = await res.json();
      if (d.success) {
        setCompanyProfileContent(companyEditDraft);
        setCompanySummaryContent(companySummaryEditDraft);
        setCompanyEditing(false);
        toast.success("Company profile saved");
      } else {
        toast.error(d.error || "Save failed");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setCompanySaving(false);
    }
  };

  const handleDeleteProfile = async () => {
    if (!confirm("Delete the company profile? You can re-research anytime.")) return;
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/cfo/company-profile?user_id=${encodeURIComponent(userId)}`,
        { method: "DELETE", headers: { ...getAuthHeaders() } }
      );
      const d = await res.json();
      if (d.success) {
        setCompanyProfileExists(false);
        setCompanyProfileName("");
        setCompanyProfileContent("");
        setCompanySummaryContent("");
        setCompanyEditing(false);
        toast.success("Company profile deleted");
      } else {
        toast.error(d.error || "Delete failed");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const handleReResearch = () => {
    setCompanyProfileExists(false);
    setCompanyEditing(false);
  };

  // --- Plaid: fetch link token + connections on load ---
  const fetchPlaidConnections = useCallback(() => {
    if (!userId) return;
    fetch(`${API_BASE_URL}/api/plaid/connections?user_id=${encodeURIComponent(userId)}`, {
      headers: { ...getAuthHeaders() },
    })
      .then((r) => r.json())
      .then((d) => setPlaidConnections(d.connections || []))
      .catch(() => {});
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    fetch(`${API_BASE_URL}/api/plaid/create-link-token?user_id=${encodeURIComponent(userId)}`, {
      method: "POST",
      headers: { ...getAuthHeaders() },
    })
      .then((r) => {
        if (!r.ok) return r.json().then(d => { console.warn("Plaid link-token error:", d.detail); return null; });
        return r.json();
      })
      .then((d) => { if (d?.link_token) setPlaidLinkToken(d.link_token); })
      .catch((err) => console.warn("Plaid link-token fetch failed:", err));
    fetchPlaidConnections();
  }, [userId, fetchPlaidConnections]);

  const handlePlaidSync = async () => {
    if (!userId) return;
    setPlaidSyncing(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/plaid/sync-transactions?user_id=${encodeURIComponent(userId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: "{}",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Sync failed");
      const li = data.ledger_ingest;
      const ingestMsg = li ? ` (${li.inserted} new, ${li.skipped} duplicates skipped)` : "";
      toast.success((data.message || `Synced ${data.count} transactions`) + ingestMsg);
      refetchFiles();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Plaid sync failed");
    } finally {
      setPlaidSyncing(false);
    }
  };

  const handlePlaidDisconnect = async (itemId: string) => {
    if (!userId) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/plaid/connections/${itemId}?user_id=${encodeURIComponent(userId)}`, {
        method: "DELETE",
        headers: { ...getAuthHeaders() },
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.detail || "Failed"); }
      toast.success("Bank disconnected");
      fetchPlaidConnections();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Disconnect failed");
    }
  };

  // --- Stripe: fetch status on load ---
  const fetchStripeStatus = useCallback(() => {
    if (!userId) return;
    fetch(`${API_BASE_URL}/api/stripe/status?user_id=${encodeURIComponent(userId)}`, {
      headers: { ...getAuthHeaders() },
    })
      .then((r) => r.json())
      .then((d) => setStripeStatus(d))
      .catch(() => {});
  }, [userId]);

  useEffect(() => {
    fetchStripeStatus();
  }, [fetchStripeStatus]);

  const handleStripeConnect = async (secretKey?: string) => {
    if (!userId) return;
    setStripeConnecting(true);
    try {
      const body: Record<string, string> = {};
      if (secretKey) body.secret_key = secretKey;
      const res = await fetch(`${API_BASE_URL}/api/stripe/connect?user_id=${encodeURIComponent(userId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Connection failed");
      toast.success("Stripe connected successfully");
      setStripeModalOpen(false);
      setStripeKeyInput("");
      fetchStripeStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Stripe connection failed");
    } finally {
      setStripeConnecting(false);
    }
  };

  const handleStripeSync = async () => {
    if (!userId) return;
    setStripeSyncing(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/stripe/sync-transactions?user_id=${encodeURIComponent(userId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ limit: 500 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Sync failed");
      const li = data.ledger_ingest;
      const ingestMsg = li ? ` (${li.inserted} new, ${li.skipped} duplicates skipped)` : "";
      toast.success((data.message || `Synced ${data.count} transactions`) + ingestMsg);
      refetchFiles();
      fetchStripeStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Stripe sync failed");
    } finally {
      setStripeSyncing(false);
    }
  };

  const handleStripeDisconnect = async () => {
    if (!userId) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/stripe/disconnect?user_id=${encodeURIComponent(userId)}`, {
        method: "DELETE",
        headers: { ...getAuthHeaders() },
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.detail || "Failed"); }
      toast.success("Stripe disconnected");
      setStripeStatus(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Disconnect failed");
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      e.target.value = "";
      return;
    }

    const isCSV = file.name.toLowerCase().endsWith(".csv");
    if (isCSV) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        if (text) {
          setTableData(parseCSV(text));
        }
      };
      reader.readAsText(file, "UTF-8");
    }

    uploadFileToBackend(file);
    e.target.value = "";
  };

  const refetchFiles = () => {
    if (!userId || !selectedCompany) return;
    fetch(`${API_BASE_URL}/api/files?user_id=${encodeURIComponent(userId)}`, {
      headers: { ...getAuthHeaders() },
    })
      .then((res) => res.json())
      .then((data) => { setFiles(data.files || []); })
      .catch(() => setFiles([]));
  };

  const uploadFileToBackend = async (file: File) => {
    const raw = localStorage.getItem("userData");
    if (!raw) {
      toast.error("Please log in to upload files.");
      return;
    }
    let uid: string;
    try {
      const userData = JSON.parse(raw);
      uid = String(userData.id ?? userData.uuid ?? userData.email ?? "");
    } catch {
      toast.error("Please log in to upload files.");
      return;
    }
    if (!uid) {
      toast.error("Please log in to upload files.");
      return;
    }

    setUploadProgress("uploading");
    setUploadSchema(null);
    setUploadValidation(null);
    setUploadIngestResult(null);
    setUploadIngestErrors(null);
    setUploadIngestMethod(null);
    toast.info(`Uploading "${file.name}"…`);

    try {
      const formData = new FormData();
      formData.append("file", file);

      setUploadProgress("analyzing");

      const res = await fetch(
        `${API_BASE_URL}/api/upload?user_id=${encodeURIComponent(uid)}`,
        {
          method: "POST",
          body: formData,
          headers: { Authorization: getAuthHeaders().Authorization || "" },
        }
      );

      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setUploadProgress("ingesting");
        if (data.schema) setUploadSchema(data.schema);
        if (data.validation) setUploadValidation(data.validation);
        if (data.ingest_method) setUploadIngestMethod(data.ingest_method);
        if (data.ingest_errors) setUploadIngestErrors(data.ingest_errors);
        if (data.ledger_ingest) setUploadIngestResult(data.ledger_ingest);

        const ingest = data.ledger_ingest;
        if (ingest && ingest.inserted > 0) {
          toast.success(
            `Ingested ${ingest.inserted.toLocaleString()} transactions` +
            (ingest.accounts_created > 0 ? ` into ${ingest.accounts_created} account(s)` : "") +
            (data.ingest_method ? ` [${data.ingest_method}]` : "")
          );
        } else if (data.ingest_errors?.length) {
          toast.warning(`Upload OK but ingestion had issues: ${data.ingest_errors[0]}`);
        } else {
          toast.success(`File "${data.filename ?? file.name}" uploaded (${data.size_kb ?? "?"} KB)`);
        }

        if (data.validation?.warnings?.length) {
          for (const w of data.validation.warnings.slice(0, 3)) {
            toast.warning(w);
          }
        }

        setUploadProgress("done");
        refetchFiles();
        // Refresh ledger account count
        try {
          const acctRes = await fetch(`${API_BASE_URL}/api/ledger/accounts?user_id=${encodeURIComponent(uid)}`, { headers: { ...getAuthHeaders() } });
          if (acctRes.ok) {
            const acctData = await acctRes.json();
            setLedgerAccountCount(Array.isArray(acctData.accounts) ? acctData.accounts.length : 0);
          }
        } catch { /* ignore */ }
      } else {
        setUploadProgress("error");
        setUploadIngestErrors([data.error || "File upload failed"]);
        toast.error(data.error || "File upload failed");
      }
    } catch (err) {
      setUploadProgress("error");
      setUploadIngestErrors([String(err)]);
      console.warn("Upload error:", err);
      toast.error("Upload failed. Check that the backend is running at " + API_BASE_URL);
    }
  };

  const handleDownloadSample = () => {
    const url = "/company_bank_statement_large_corp_2025_full_year_50000rows_with_sweeps.csv";
    const link = document.createElement("a");
    link.href = url;
    link.download = "company_bank_statement_sample.csv";
    link.click();
  };

  const handleCellChange = (rowIndex: number, colIndex: number, value: string) => {
    setTableData((prev) => {
      if (!prev) return prev;
      const nextRows = prev.rows.map((row, r) =>
        r === rowIndex
          ? row.map((cell, c) => (c === colIndex ? value : cell))
          : row
      );
      return { ...prev, rows: nextRows };
    });
  };

  return (
    <div style={{ padding: "48px 24px 60px", maxWidth: 1200, margin: "0 auto" }}>
      <header
        style={{
          marginBottom: "2.5rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <h1
            style={{
              color: colors.text,
              fontSize: "1.75rem",
              fontWeight: 700,
              marginBottom: "0.5rem",
              lineHeight: 1.2,
              fontFamily: "'Inter', sans-serif",
              letterSpacing: "-0.5px",
            }}
          >
            Connect Data
          </h1>
          <p
            style={{
              color: colors.textSecondary,
              fontSize: "0.95rem",
              fontWeight: 400,
              margin: 0,
              fontFamily: "'Inter', sans-serif",
            }}
          >
            Choose how to import your financial data
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
          <Link
            to="/classification-results"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.5rem 1rem",
              fontSize: "0.875rem",
              fontWeight: 600,
              color: "var(--primary)",
              background: theme === "dark" ? "rgba(37, 99, 235, 0.15)" : "rgba(37, 99, 235, 0.1)",
              border: "1px solid var(--primary)",
              borderRadius: 8,
              textDecoration: "none",
              fontFamily: "'Inter', sans-serif",
            }}
          >
            <FiBarChart2 size={18} />
            View classification results
          </Link>
          <div
            style={{
              position: "relative",
              width: 200,
            }}
          >
          <select
            value={selectedCompany}
            onChange={(e) => setSelectedCompany(e.target.value)}
            style={{
              width: "100%",
              height: 40,
              padding: "0 2.25rem 0 0.875rem",
              fontSize: "0.875rem",
              fontWeight: 500,
              lineHeight: 1.4,
              color: colors.text,
              background: colors.secondaryBg,
              border: "1px solid var(--border-color)",
              fontFamily: "'Inter', sans-serif",
              borderRadius: 8,
              cursor: "pointer",
              appearance: "none",
              WebkitAppearance: "none",
              MozAppearance: "none",
              boxSizing: "border-box",
            }}
            aria-label="Select company"
          >
            <option value="">Select company</option>
            <option value="company1">Company 1</option>
            <option value="company2">Company 2</option>
          </select>
          <span
            style={{
              position: "absolute",
              right: 10,
              top: "50%",
              transform: "translateY(-50%)",
              pointerEvents: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: colors.text,
              fontSize: 16,
            }}
            aria-hidden
          >
            <FiChevronDown size={16} />
          </span>
          </div>
        </div>
      </header>

      {/* ── Company Profile Onboarding ── */}
      {companyProfileExists === false && (
        <section style={{
          marginBottom: "1.5rem",
          padding: "1.5rem",
          background: theme === "dark"
            ? "linear-gradient(135deg, rgba(99,102,241,0.1) 0%, rgba(59,130,246,0.06) 100%)"
            : "linear-gradient(135deg, rgba(99,102,241,0.06) 0%, rgba(59,130,246,0.03) 100%)",
          border: `1px solid ${theme === "dark" ? "rgba(99,102,241,0.25)" : "rgba(99,102,241,0.15)"}`,
          borderRadius: 12,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <FiDatabase size={18} style={{ color: "var(--primary)" }} />
            <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: colors.text }}>
              Tell us about your company
            </h3>
          </div>
          <p style={{ margin: "0 0 1rem", fontSize: "0.8125rem", color: colors.textSecondary, lineHeight: 1.5 }}>
            This helps our AI CFO provide industry-specific insights, benchmarks, and recommendations tailored to your business.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "flex-end" }}>
            <div style={{ flex: "1 1 180px", minWidth: 160 }}>
              <label style={{ display: "block", fontSize: "0.7rem", fontWeight: 600, color: colors.textSecondary, marginBottom: 4 }}>Company Name *</label>
              <input
                type="text" placeholder="Acme Corp"
                value={companyNameInput} onChange={(e) => setCompanyNameInput(e.target.value)}
                style={{
                  width: "100%", padding: "0.5rem 0.75rem", fontSize: "0.875rem",
                  border: `1px solid ${colors.border}`, borderRadius: 8,
                  background: colors.inputBg, color: colors.text, outline: "none",
                }}
              />
            </div>
            <div style={{ flex: "1 1 220px", minWidth: 180 }}>
              <label style={{ display: "block", fontSize: "0.7rem", fontWeight: 600, color: colors.textSecondary, marginBottom: 4 }}>Website URL</label>
              <input
                type="text" placeholder="https://acmecorp.com"
                value={companyUrlInput} onChange={(e) => setCompanyUrlInput(e.target.value)}
                style={{
                  width: "100%", padding: "0.5rem 0.75rem", fontSize: "0.875rem",
                  border: `1px solid ${colors.border}`, borderRadius: 8,
                  background: colors.inputBg, color: colors.text, outline: "none",
                }}
              />
            </div>
            <div style={{ flex: "1 1 220px", minWidth: 180 }}>
              <label style={{ display: "block", fontSize: "0.7rem", fontWeight: 600, color: colors.textSecondary, marginBottom: 4 }}>Industry / Description</label>
              <input
                type="text" placeholder="SaaS, fintech, e-commerce..."
                value={companyDescInput} onChange={(e) => setCompanyDescInput(e.target.value)}
                style={{
                  width: "100%", padding: "0.5rem 0.75rem", fontSize: "0.875rem",
                  border: `1px solid ${colors.border}`, borderRadius: 8,
                  background: colors.inputBg, color: colors.text, outline: "none",
                }}
              />
            </div>
            <button
              onClick={handleCompanyResearch}
              disabled={!companyNameInput.trim() || companyResearching}
              style={{
                padding: "0.5rem 1.25rem", fontSize: "0.875rem", fontWeight: 600,
                border: "none", borderRadius: 8, cursor: "pointer",
                background: companyResearching ? colors.textSecondary : "var(--primary)",
                color: "#fff", opacity: !companyNameInput.trim() ? 0.5 : 1,
                whiteSpace: "nowrap",
              }}
            >
              {companyResearching ? "Researching..." : "Research My Company"}
            </button>
          </div>
          {companyResearching && (
            <div style={{
              marginTop: "1rem", padding: "0.75rem 1rem",
              background: theme === "dark" ? "rgba(99,102,241,0.08)" : "rgba(99,102,241,0.04)",
              border: `1px solid ${theme === "dark" ? "rgba(99,102,241,0.2)" : "rgba(99,102,241,0.1)"}`,
              borderRadius: 8, display: "flex", alignItems: "center", gap: "0.75rem",
            }}>
              <div style={{
                width: 20, height: 20, borderRadius: "50%",
                border: `2px solid ${theme === "dark" ? "rgba(99,102,241,0.3)" : "rgba(99,102,241,0.2)"}`,
                borderTopColor: "var(--primary)",
                animation: "spin 0.8s linear infinite",
              }} />
              <div>
                <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: colors.text }}>
                  AI Research Agent is working...
                </div>
                <div style={{ fontSize: "0.75rem", color: colors.textSecondary, marginTop: 2 }}>
                  Scraping website, searching industry data, competitors, and financial benchmarks. This may take 30-60 seconds.
                </div>
              </div>
            </div>
          )}
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </section>
      )}

      {/* ── Company Profile View / Edit ── */}
      {companyProfileExists === true && companyProfileContent && (
        <section style={{
          marginBottom: "1.5rem",
          background: colors.secondaryBg,
          border: `1px solid ${colors.border}`,
          borderRadius: 12,
          overflow: "hidden",
        }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "0.75rem 1.25rem",
            background: theme === "dark" ? "rgba(99,102,241,0.08)" : "rgba(99,102,241,0.04)",
            borderBottom: `1px solid ${colors.border}`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <FiDatabase size={16} style={{ color: "var(--primary)" }} />
              <span style={{ fontSize: "0.875rem", fontWeight: 700, color: colors.text }}>
                Company Profile: {companyProfileName}
              </span>
              <span style={{ fontSize: "0.7rem", color: colors.textSecondary, padding: "0.15rem 0.5rem", background: theme === "dark" ? "rgba(34,197,94,0.15)" : "rgba(34,197,94,0.1)", borderRadius: 10, fontWeight: 600, color: theme === "dark" ? "#4ade80" : "#16a34a" }}>
                Active
              </span>
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              {companyEditing ? (
                <>
                  <button
                    onClick={handleSaveCompanyProfile}
                    disabled={companySaving}
                    style={{
                      display: "flex", alignItems: "center", gap: 4,
                      padding: "0.3rem 0.75rem", fontSize: "0.75rem", fontWeight: 600,
                      border: "none", borderRadius: 6, cursor: "pointer",
                      background: "var(--primary)", color: "#fff",
                    }}
                  >
                    <FiCheck size={13} /> {companySaving ? "Saving..." : "Save"}
                  </button>
                  <button
                    onClick={() => setCompanyEditing(false)}
                    style={{
                      display: "flex", alignItems: "center", gap: 4,
                      padding: "0.3rem 0.75rem", fontSize: "0.75rem", fontWeight: 600,
                      border: `1px solid ${colors.border}`, borderRadius: 6, cursor: "pointer",
                      background: "transparent", color: colors.textSecondary,
                    }}
                  >
                    <FiX size={13} /> Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => { setCompanyEditing(true); setCompanyEditDraft(companyProfileContent); setCompanySummaryEditDraft(companySummaryContent); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 4,
                      padding: "0.3rem 0.75rem", fontSize: "0.75rem", fontWeight: 600,
                      border: `1px solid ${colors.border}`, borderRadius: 6, cursor: "pointer",
                      background: "transparent", color: colors.text,
                    }}
                  >
                    <FiEdit2 size={13} /> Edit
                  </button>
                  <button
                    onClick={handleReResearch}
                    style={{
                      display: "flex", alignItems: "center", gap: 4,
                      padding: "0.3rem 0.75rem", fontSize: "0.75rem", fontWeight: 600,
                      border: `1px solid ${colors.border}`, borderRadius: 6, cursor: "pointer",
                      background: "transparent", color: colors.text,
                    }}
                  >
                    <FiRefreshCw size={13} /> Re-research
                  </button>
                  <button
                    onClick={handleDeleteProfile}
                    style={{
                      display: "flex", alignItems: "center", gap: 4,
                      padding: "0.3rem 0.75rem", fontSize: "0.75rem", fontWeight: 600,
                      border: `1px solid ${theme === "dark" ? "rgba(239,68,68,0.3)" : "rgba(239,68,68,0.2)"}`,
                      borderRadius: 6, cursor: "pointer",
                      background: "transparent",
                      color: theme === "dark" ? "#f87171" : "#dc2626",
                    }}
                  >
                    <FiTrash2 size={13} /> Delete
                  </button>
                </>
              )}
            </div>
          </div>
          {/* Tab bar */}
          <div style={{
            display: "flex", gap: 0, borderBottom: `1px solid ${colors.border}`,
            background: theme === "dark" ? "rgba(0,0,0,0.1)" : "rgba(0,0,0,0.02)",
          }}>
            {(["summary", "detailed"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setCompanyViewTab(tab)}
                style={{
                  padding: "0.5rem 1.25rem", fontSize: "0.75rem", fontWeight: 600,
                  border: "none", borderBottom: companyViewTab === tab ? `2px solid var(--primary)` : "2px solid transparent",
                  background: "transparent", cursor: "pointer",
                  color: companyViewTab === tab ? "var(--primary)" : colors.textSecondary,
                  transition: "all 0.15s",
                }}
              >
                {tab === "summary" ? "Summary (injected into agents)" : "Detailed Report"}
              </button>
            ))}
          </div>
          {companyEditing ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <div style={{ padding: "0.5rem 1.25rem 0", fontSize: "0.7rem", fontWeight: 600, color: colors.textSecondary, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {companyViewTab === "summary" ? "Agent Summary (concise — injected into all agent prompts)" : "Detailed Report (full research — agents read on demand)"}
              </div>
              <textarea
                value={companyViewTab === "summary" ? companySummaryEditDraft : companyEditDraft}
                onChange={(e) => companyViewTab === "summary" ? setCompanySummaryEditDraft(e.target.value) : setCompanyEditDraft(e.target.value)}
                style={{
                  width: "100%", minHeight: 320, padding: "1rem 1.25rem",
                  fontSize: "0.8125rem", lineHeight: 1.6, fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                  background: colors.inputBg, color: colors.text,
                  border: "none", outline: "none", resize: "vertical",
                }}
              />
            </div>
          ) : (
            <div style={{
              padding: "1rem 1.25rem", maxHeight: 350, overflowY: "auto",
              fontSize: "0.8125rem", lineHeight: 1.7, color: colors.text,
              whiteSpace: "pre-wrap", fontFamily: "'Inter', sans-serif",
            }}>
              {(companyViewTab === "summary" ? companySummaryContent : companyProfileContent).split("\n").map((line, i) => {
                if (line.startsWith("# ")) return <h3 key={i} style={{ margin: "0.75rem 0 0.25rem", fontSize: "1rem", fontWeight: 700 }}>{line.slice(2)}</h3>;
                if (line.startsWith("## ")) return <h4 key={i} style={{ margin: "0.75rem 0 0.25rem", fontSize: "0.9rem", fontWeight: 700, color: "var(--primary)" }}>{line.slice(3)}</h4>;
                if (line.startsWith("### ")) return <h5 key={i} style={{ margin: "0.5rem 0 0.25rem", fontSize: "0.85rem", fontWeight: 600 }}>{line.slice(4)}</h5>;
                if (line.startsWith("- **")) {
                  const match = line.match(/^- \*\*(.+?)\*\*:?\s*(.*)/);
                  if (match) return <div key={i} style={{ paddingLeft: "0.75rem", margin: "0.15rem 0" }}><strong>{match[1]}:</strong> {match[2]}</div>;
                }
                if (line.startsWith("- ")) return <div key={i} style={{ paddingLeft: "0.75rem", margin: "0.15rem 0" }}>{line.slice(2)}</div>;
                if (line.startsWith(">")) return <div key={i} style={{ paddingLeft: "0.75rem", borderLeft: `3px solid var(--primary)`, marginLeft: "0.5rem", color: colors.textSecondary, fontStyle: "italic", fontSize: "0.78rem" }}>{line.slice(1).trim()}</div>;
                if (!line.trim()) return <div key={i} style={{ height: "0.5rem" }} />;
                return <div key={i}>{line}</div>;
              })}
            </div>
          )}
          <div style={{
            padding: "0.5rem 1.25rem", fontSize: "0.7rem", color: colors.textSecondary,
            borderTop: `1px solid ${colors.border}`,
            background: theme === "dark" ? "rgba(0,0,0,0.15)" : "rgba(0,0,0,0.02)",
          }}>
            {companyViewTab === "summary"
              ? "This summary is automatically injected into every AI agent's prompt for context-aware classification, forecasting, and recommendations."
              : "This detailed report is stored in the knowledge base. Agents read it on demand for deep research context."}
          </div>
        </section>
      )}

      <section
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr",
          gap: "1.5rem",
          opacity: isSectionDisabled ? 0.5 : 1,
          pointerEvents: isSectionDisabled ? "none" : "auto",
          transition: "opacity 0.2s ease",
        }}
        aria-label="Data connection options"
        aria-disabled={isSectionDisabled}
      >
        <article
          style={{
            background: colors.secondaryBg,
            borderRadius: 12,
            padding: "1.5rem",
            boxShadow: "var(--shadow-sm)",
            border: "1px solid var(--border-color)",
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
            transition: "box-shadow 0.2s ease",
          }}
          aria-labelledby="card-title-csv"
        >
          <span
            style={{
              width: 48,
              height: 48,
              borderRadius: 10,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontSize: "1.25rem",
              background: "var(--primary)",
            }}
          >
            <FiFileText aria-hidden />
          </span>
          <h2
            id="card-title-csv"
            style={{
              color: colors.text,
              fontSize: "1.05rem",
              fontWeight: 700,
              margin: 0,
              lineHeight: 1.3,
              fontFamily: "'Inter', sans-serif",
              letterSpacing: "-0.3px",
            }}
          >
            Excel / CSV
          </h2>
          <p
            style={{
              color: colors.textSecondary,
              fontSize: "0.875rem",
              lineHeight: 1.45,
              margin: 0,
            }}
          >
            Upload your financial data files
          </p>
          <p
            style={{
              color: colors.textSecondary,
              fontSize: "0.875rem",
              lineHeight: 1.45,
              margin: 0,
            }}
          >
            CSV, Excel, JSON, ZIP, PDF, XML, OFX and more — AI-powered ingestion
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls,.json,.jsonl,.txt,.pdf,.parquet,.tsv,.zip,.xml,.ofx,.qfx"
            onChange={handleFileChange}
            disabled={isSectionDisabled}
            style={{
              position: "absolute",
              width: 0,
              height: 0,
              opacity: 0,
              pointerEvents: "none",
            }}
            aria-label="Upload CSV or spreadsheet file"
          />
          <button
            type="button"
            disabled={isSectionDisabled}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
              padding: "0.625rem 1rem",
              fontSize: "0.875rem",
              fontWeight: 600,
              color: "#fff",
              background: "var(--primary)",
              border: "none",
              borderRadius: 8,
              cursor: isSectionDisabled ? "not-allowed" : "pointer",
              marginTop: "auto",
              fontFamily: "'Inter', sans-serif",
              transition: "all 150ms cubic-bezier(0.4, 0, 0.2, 1)",
            }}
            onClick={handleUploadClick}
          >
            <FiUpload aria-hidden style={{ width: "1rem", height: "1rem" }} />
            Upload File
          </button>
          <button
            type="button"
            disabled={isSectionDisabled}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
              padding: "0.625rem 1rem",
              fontSize: "0.875rem",
              fontWeight: 600,
              color: "#fff",
              background: "var(--primary)",
              border: "none",
              borderRadius: 8,
              cursor: isSectionDisabled ? "not-allowed" : "pointer",
              marginTop: "auto",
              fontFamily: "'Inter', sans-serif",
              transition: "all 150ms cubic-bezier(0.4, 0, 0.2, 1)",
            }}
            onClick={handleDownloadSample}
          >
            <FiDownload aria-hidden style={{ width: "1.125rem", height: "1.125rem" }} />
            Download Sample
          </button>

          {/* Ingestion progress & results */}
          {uploadProgress !== "idle" && (
            <div style={{
              marginTop: "0.5rem", padding: "0.75rem 1rem",
              background: uploadProgress === "error" ? "rgba(239,68,68,0.08)" : "rgba(59,130,246,0.06)",
              borderRadius: 8, fontSize: "0.8125rem", lineHeight: 1.5,
              border: `1px solid ${uploadProgress === "error" ? "rgba(239,68,68,0.2)" : "rgba(59,130,246,0.15)"}`,
            }}>
              {/* Progress steps */}
              {(uploadProgress === "uploading" || uploadProgress === "analyzing" || uploadProgress === "ingesting") && (
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: colors.text, fontWeight: 600 }}>
                  <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>&#8635;</span>
                  {uploadProgress === "uploading" && "Uploading file…"}
                  {uploadProgress === "analyzing" && "AI analyzing schema…"}
                  {uploadProgress === "ingesting" && "Ingesting transactions…"}
                </div>
              )}

              {/* Done / Error */}
              {uploadProgress === "done" && uploadIngestResult && (
                <div>
                  <div style={{ fontWeight: 600, color: "#16a34a", marginBottom: 4 }}>
                    Ingestion Complete {uploadIngestMethod && <span style={{ fontWeight: 400, color: colors.textSecondary }}>({uploadIngestMethod})</span>}
                  </div>
                  <div style={{ color: colors.textSecondary }}>
                    {(uploadIngestResult.inserted as number)?.toLocaleString()} inserted,{" "}
                    {(uploadIngestResult.skipped as number)?.toLocaleString()} skipped,{" "}
                    {(uploadIngestResult.accounts_created as number) || 0} account(s)
                  </div>
                </div>
              )}
              {uploadProgress === "error" && uploadIngestErrors && (
                <div style={{ color: "#dc2626", fontWeight: 500 }}>
                  {uploadIngestErrors.map((e, i) => <div key={i}>{e}</div>)}
                </div>
              )}

              {/* Schema info */}
              {uploadSchema && uploadProgress === "done" && (
                <div style={{ marginTop: 6, color: colors.textSecondary, fontSize: "0.75rem" }}>
                  <span style={{ fontWeight: 600 }}>Schema:</span>{" "}
                  desc=<code>{uploadSchema.description_column as string}</code>,{" "}
                  amt=<code>{uploadSchema.amount_column as string}</code>,{" "}
                  date=<code>{uploadSchema.date_column as string}</code>
                  {uploadSchema.negate_amounts && " (amounts negated)"}
                  {uploadSchema.multi_account && " (multi-account)"}
                  {uploadSchema.notes && ` — ${uploadSchema.notes}`}
                </div>
              )}

              {/* Validation warnings */}
              {uploadValidation && !uploadValidation.ok && uploadProgress === "done" && (
                <div style={{ marginTop: 6 }}>
                  {uploadValidation.warnings.map((w, i) => (
                    <div key={i} style={{ color: "#d97706", fontSize: "0.75rem" }}>⚠ {w}</div>
                  ))}
                </div>
              )}

              {/* Dismiss */}
              {(uploadProgress === "done" || uploadProgress === "error") && (
                <button
                  type="button"
                  onClick={() => setUploadProgress("idle")}
                  style={{
                    marginTop: 8, padding: "0.25rem 0.75rem", fontSize: "0.75rem",
                    background: "transparent", border: `1px solid ${colors.border}`,
                    borderRadius: 6, cursor: "pointer", color: colors.textSecondary,
                  }}
                >
                  Dismiss
                </button>
              )}
            </div>
          )}
        </article>

        {/* ---- Connect Bank (Plaid) card ---- */}
        <article
          style={{
            background: colors.secondaryBg,
            borderRadius: 12,
            padding: "1.5rem",
            boxShadow: "var(--shadow-sm)",
            border: "1px solid var(--border-color)",
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
            transition: "box-shadow 0.2s ease",
          }}
          aria-labelledby="card-title-plaid"
        >
          <span
            style={{
              width: 48,
              height: 48,
              borderRadius: 10,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontSize: "1.25rem",
              background: "#10b981",
            }}
          >
            <FiCreditCard aria-hidden />
          </span>
          <h2
            id="card-title-plaid"
            style={{
              color: colors.text,
              fontSize: "1.05rem",
              fontWeight: 700,
              margin: 0,
              lineHeight: 1.3,
              fontFamily: "'Inter', sans-serif",
              letterSpacing: "-0.3px",
            }}
          >
            Connect Bank
          </h2>
          <p style={{ color: colors.textSecondary, fontSize: "0.875rem", lineHeight: 1.45, margin: 0 }}>
            Securely link your bank account via Plaid
          </p>
          <p style={{ color: colors.textSecondary, fontSize: "0.875rem", lineHeight: 1.45, margin: 0 }}>
            Transactions and balances are synced automatically
          </p>
          {plaidLinkToken ? (
            <PlaidLinkButton
              linkToken={plaidLinkToken}
              userId={userId || ""}
              onSuccess={() => { fetchPlaidConnections(); }}
              disabled={isSectionDisabled}
              theme={theme}
            />
          ) : (
            <button
              type="button"
              disabled
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
                padding: "0.625rem 1rem",
                fontSize: "0.875rem",
                fontWeight: 600,
                color: "#fff",
                background: "#94a3b8",
                border: "none",
                borderRadius: 8,
                cursor: "not-allowed",
                marginTop: "auto",
                fontFamily: "'Inter', sans-serif",
              }}
            >
              <FiLink aria-hidden style={{ width: "1rem", height: "1rem" }} />
              Loading Plaid…
            </button>
          )}
          {plaidConnections.length > 0 && (
            <button
              type="button"
              onClick={handlePlaidSync}
              disabled={plaidSyncing}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
                padding: "0.5rem 1rem",
                fontSize: "0.8125rem",
                fontWeight: 600,
                color: theme === "dark" ? "#e2e8f0" : "#475569",
                background: theme === "dark" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)",
                border: "1px solid var(--border-color)",
                borderRadius: 8,
                cursor: plaidSyncing ? "not-allowed" : "pointer",
                fontFamily: "'Inter', sans-serif",
              }}
            >
              <FiRefreshCw style={{ opacity: plaidSyncing ? 0.6 : 1 }} />
              {plaidSyncing ? "Syncing…" : "Sync Transactions"}
            </button>
          )}
        </article>

        {/* ---- Connect Stripe card ---- */}
        <article
          style={{
            background: colors.secondaryBg,
            borderRadius: 12,
            padding: "1.5rem",
            boxShadow: "var(--shadow-sm)",
            border: "1px solid var(--border-color)",
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
            transition: "box-shadow 0.2s ease",
          }}
          aria-labelledby="card-title-stripe"
        >
          <span
            style={{
              width: 48,
              height: 48,
              borderRadius: 10,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontSize: "1.25rem",
              background: "#6366f1",
            }}
          >
            <FiDollarSign aria-hidden />
          </span>
          <h2
            id="card-title-stripe"
            style={{
              color: colors.text,
              fontSize: "1.05rem",
              fontWeight: 700,
              margin: 0,
              lineHeight: 1.3,
              fontFamily: "'Inter', sans-serif",
              letterSpacing: "-0.3px",
            }}
          >
            Connect Stripe
          </h2>
          <p style={{ color: colors.textSecondary, fontSize: "0.875rem", lineHeight: 1.45, margin: 0 }}>
            Pull payment transaction data from Stripe
          </p>
          <p style={{ color: colors.textSecondary, fontSize: "0.875rem", lineHeight: 1.45, margin: 0 }}>
            Charges, payouts, refunds, and balances
          </p>
          {stripeStatus?.connected ? (
            <>
              <div style={{ fontSize: "0.8125rem", color: "#10b981", fontWeight: 600 }}>
                Connected — {stripeStatus.account?.business_name || stripeStatus.account?.email || stripeStatus.account?.id}
              </div>
              {stripeStatus.last_sync && (
                <div style={{ fontSize: "0.75rem", color: colors.textSecondary }}>
                  Last sync: {new Date(stripeStatus.last_sync).toLocaleString()} ({stripeStatus.last_sync_count} txns)
                </div>
              )}
              <button
                type="button"
                onClick={handleStripeSync}
                disabled={stripeSyncing || isSectionDisabled}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.5rem",
                  padding: "0.5rem 1rem",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  color: theme === "dark" ? "#e2e8f0" : "#475569",
                  background: theme === "dark" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)",
                  border: "1px solid var(--border-color)",
                  borderRadius: 8,
                  cursor: stripeSyncing ? "not-allowed" : "pointer",
                  fontFamily: "'Inter', sans-serif",
                }}
              >
                <FiRefreshCw style={{ opacity: stripeSyncing ? 0.6 : 1 }} />
                {stripeSyncing ? "Syncing…" : "Sync Now"}
              </button>
              <button
                type="button"
                onClick={handleStripeDisconnect}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  padding: "0.4rem 0.75rem",
                  fontSize: "0.75rem",
                  fontWeight: 500,
                  color: "#ef4444",
                  background: "transparent",
                  border: "1px solid rgba(239,68,68,0.3)",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontFamily: "'Inter', sans-serif",
                }}
              >
                <FiTrash2 size={12} /> Disconnect
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setStripeModalOpen(true)}
              disabled={isSectionDisabled}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
                padding: "0.625rem 1rem",
                fontSize: "0.875rem",
                fontWeight: 600,
                color: "#fff",
                background: isSectionDisabled ? "#94a3b8" : "#6366f1",
                border: "none",
                borderRadius: 8,
                cursor: isSectionDisabled ? "not-allowed" : "pointer",
                marginTop: "auto",
                fontFamily: "'Inter', sans-serif",
                transition: "all 150ms cubic-bezier(0.4, 0, 0.2, 1)",
              }}
            >
              <FiDollarSign aria-hidden style={{ width: "1rem", height: "1rem" }} />
              Connect Stripe
            </button>
          )}
        </article>
      </section>

      {/* Connected Data Sources panel */}
      {selectedCompany && (plaidConnections.length > 0 || stripeStatus?.connected || userVisibleFiles.length > 0 || ledgerAccountCount > 0) && (
        <section
          style={{
            marginTop: "2rem",
            padding: "1.5rem",
            background: colors.secondaryBg,
            borderRadius: 12,
            border: "1px solid var(--border-color)",
            boxShadow: "var(--shadow-sm)",
          }}
          aria-label="Connected data sources"
        >
          <h2
            style={{
              color: colors.text,
              fontSize: "1.15rem",
              fontWeight: 700,
              margin: "0 0 1rem",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <FiDatabase style={{ color: "var(--primary)" }} />
            Connected Data Sources
            <button
              onClick={async () => {
                if (isNormalizing) return;
                setIsNormalizing(true);
                const tid = toast.loading("AI agent is analyzing and classifying transactions…");
                try {
                  const res = await fetch(`${API_BASE_URL}/api/ledger/normalize?user_id=${encodeURIComponent(userId)}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
                  });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.detail || "Normalization failed");
                  const classified = data.classified ?? 0;
                  toast.update(tid, {
                    render: `Classified ${classified} transactions — redirecting…`,
                    type: "success",
                    isLoading: false,
                    autoClose: 3000,
                  });
                  setTimeout(() => navigate("/classification-results"), 1200);
                } catch (err) {
                  toast.update(tid, {
                    render: err instanceof Error ? err.message : "Normalization failed",
                    type: "error",
                    isLoading: false,
                    autoClose: 5000,
                  });
                } finally {
                  setIsNormalizing(false);
                }
              }}
              disabled={isNormalizing}
              style={{
                marginLeft: "auto",
                padding: "0.375rem 0.75rem",
                fontSize: "0.75rem",
                fontWeight: 600,
                background: isNormalizing ? "#94a3b8" : "var(--primary)",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                cursor: isNormalizing ? "not-allowed" : "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.375rem",
              }}
            >
              {isNormalizing && (
                <span
                  style={{
                    width: 12,
                    height: 12,
                    border: "2px solid rgba(255,255,255,0.3)",
                    borderTopColor: "#fff",
                    borderRadius: "50%",
                    animation: "spin 0.8s linear infinite",
                  }}
                />
              )}
              {isNormalizing ? "Classifying…" : "Normalize & Classify"}
            </button>
            <label
              style={{
                padding: "0.375rem 0.75rem",
                fontSize: "0.75rem",
                fontWeight: 600,
                background: theme === "dark" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
                color: colors.text,
                border: `1px solid ${theme === "dark" ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)"}`,
                borderRadius: 6,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.375rem",
              }}
              title="Upload override rules (JSON or CSV)"
            >
              <FiUpload size={13} /> Override Rules
              <input
                type="file"
                accept=".json,.csv"
                style={{ display: "none" }}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const formData = new FormData();
                  formData.append("file", file);
                  const tid = toast.loading("Uploading override rules…");
                  try {
                    const res = await fetch(
                      `${API_BASE_URL}/api/ledger/overrides/upload?user_id=${encodeURIComponent(userId)}`,
                      { method: "POST", headers: { ...getAuthHeaders() }, body: formData }
                    );
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.detail || "Upload failed");
                    toast.update(tid, {
                      render: `Uploaded ${data.rules_created} override rules`,
                      type: "success", isLoading: false, autoClose: 4000,
                    });
                  } catch (err) {
                    toast.update(tid, {
                      render: err instanceof Error ? err.message : "Upload failed",
                      type: "error", isLoading: false, autoClose: 4000,
                    });
                  }
                  e.target.value = "";
                }}
              />
            </label>
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {/* Uploaded files with delete buttons */}
            {userVisibleFiles.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: colors.textSecondary }}>Uploaded Files</div>
                {userVisibleFiles.map((f) => (
                  <div
                    key={f.name}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      padding: "0.5rem 0.75rem",
                      background: theme === "dark" ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)",
                      borderRadius: 6,
                      border: "1px solid var(--border-color)",
                      fontSize: "0.8125rem",
                    }}
                  >
                    <FiFileText style={{ color: "var(--primary)", flexShrink: 0 }} size={16} />
                    <span style={{ flex: 1, color: colors.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={f.name}>
                      {f.name}
                    </span>
                    <span style={{ color: colors.textSecondary, fontSize: "0.7rem", flexShrink: 0 }}>
                      {f.size_kb > 1024 ? `${(f.size_kb / 1024).toFixed(1)} MB` : `${f.size_kb} KB`}
                    </span>
                    <button
                      onClick={async () => {
                        if (!confirm(`Delete "${f.name}"?`)) return;
                        try {
                          const res = await fetch(
                            `${API_BASE_URL}/api/files/${encodeURIComponent(f.name)}?user_id=${encodeURIComponent(userId)}`,
                            { method: "DELETE", headers: { ...getAuthHeaders() } }
                          );
                          if (res.ok) {
                            toast.success(`Deleted ${f.name}`);
                            setFiles((prev) => prev.filter((x) => x.name !== f.name));
                          } else {
                            const d = await res.json();
                            toast.error(d.error || "Delete failed");
                          }
                        } catch { toast.error("Delete failed"); }
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "#dc2626",
                        padding: "2px",
                        flexShrink: 0,
                        display: "inline-flex",
                        alignItems: "center",
                      }}
                      title="Delete file"
                    >
                      <FiTrash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Plaid connections */}
            {plaidConnections.map((conn) => (
              <div
                key={conn.item_id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                  padding: "0.75rem 1rem",
                  background: theme === "dark" ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)",
                  borderRadius: 8,
                  border: "1px solid var(--border-color)",
                }}
              >
                <FiCreditCard style={{ color: "#10b981", flexShrink: 0 }} size={20} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "0.875rem", fontWeight: 600, color: colors.text }}>
                    {conn.institution_name}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: colors.textSecondary }}>
                    {conn.accounts.length} account{conn.accounts.length !== 1 ? "s" : ""} •
                    Connected {conn.connected_at ? new Date(conn.connected_at).toLocaleDateString() : ""}
                    {conn.accounts.filter(a => a.balance_current != null).length > 0 && (
                      <> • Balance: ${conn.accounts.reduce((s, a) => s + (a.balance_current || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</>
                    )}
                  </div>
                </div>
                <span
                  style={{
                    padding: "0.2rem 0.6rem",
                    fontSize: "0.7rem",
                    fontWeight: 600,
                    borderRadius: 12,
                    background: "rgba(16, 185, 129, 0.15)",
                    color: "#10b981",
                  }}
                >
                  Plaid
                </span>
                <button
                  type="button"
                  onClick={() => handlePlaidDisconnect(conn.item_id)}
                  title="Disconnect this bank"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "0.3rem",
                    fontSize: "0.75rem",
                    color: "#ef4444",
                    background: "transparent",
                    border: "none",
                    borderRadius: 4,
                    cursor: "pointer",
                  }}
                >
                  <FiTrash2 size={14} />
                </button>
              </div>
            ))}

            {/* Stripe connection */}
            {stripeStatus?.connected && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                  padding: "0.75rem 1rem",
                  background: theme === "dark" ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)",
                  borderRadius: 8,
                  border: "1px solid var(--border-color)",
                }}
              >
                <FiDollarSign style={{ color: "#6366f1", flexShrink: 0 }} size={20} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "0.875rem", fontWeight: 600, color: colors.text }}>
                    Stripe — {stripeStatus.account?.business_name || stripeStatus.account?.email || stripeStatus.account?.id}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: colors.textSecondary }}>
                    Connected {stripeStatus.connected_at ? new Date(stripeStatus.connected_at).toLocaleDateString() : ""}
                    {stripeStatus.last_sync && <> • Last sync: {new Date(stripeStatus.last_sync).toLocaleDateString()} ({stripeStatus.last_sync_count} txns)</>}
                  </div>
                </div>
                <span
                  style={{
                    padding: "0.2rem 0.6rem",
                    fontSize: "0.7rem",
                    fontWeight: 600,
                    borderRadius: 12,
                    background: "rgba(99, 102, 241, 0.15)",
                    color: "#6366f1",
                  }}
                >
                  Stripe
                </span>
              </div>
            )}

            {/* Ledger data summary */}
            {ledgerAccountCount > 0 && plaidConnections.length === 0 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                  padding: "0.75rem 1rem",
                  background: theme === "dark" ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)",
                  borderRadius: 8,
                  border: "1px solid var(--border-color)",
                }}
              >
                <FiDatabase style={{ color: "var(--primary)", flexShrink: 0 }} size={20} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "0.875rem", fontWeight: 600, color: colors.text }}>
                    Ledger Data
                  </div>
                  <div style={{ fontSize: "0.75rem", color: colors.textSecondary }}>
                    {ledgerAccountCount} account{ledgerAccountCount !== 1 ? "s" : ""} ingested from uploaded files
                  </div>
                </div>
                <span
                  style={{
                    padding: "0.2rem 0.6rem",
                    fontSize: "0.7rem",
                    fontWeight: 600,
                    borderRadius: 12,
                    background: "rgba(99, 102, 241, 0.15)",
                    color: "var(--primary)",
                  }}
                >
                  Active
                </span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Category Editor */}
      {selectedCompany && (
        <section
          style={{
            marginTop: "1.5rem",
            padding: "1.25rem",
            background: colors.secondaryBg,
            borderRadius: 12,
            border: "1px solid var(--border-color)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              cursor: "pointer",
              userSelect: "none",
            }}
            onClick={() => setShowCategories((p) => !p)}
          >
            {showCategories ? <FiChevronDown size={16} color={colors.text} /> : <FiChevronRight size={16} color={colors.text} />}
            <FiTag style={{ color: "var(--primary)" }} size={16} />
            <span style={{ fontSize: "1rem", fontWeight: 700, color: colors.text }}>
              Categories
            </span>
            <span style={{ fontSize: "0.75rem", color: colors.textSecondary, marginLeft: 4 }}>
              ({categoryList.length})
            </span>
          </div>

          {showCategories && (
            <div style={{ marginTop: "1rem" }}>
              {/* Add new category */}
              <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
                <input
                  type="text"
                  placeholder="New category name…"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newCatName.trim()) {
                      fetch(`${API_BASE_URL}/api/ledger/categories?user_id=${encodeURIComponent(userId)}`, {
                        method: "POST",
                        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
                        body: JSON.stringify({ name: newCatName.trim(), type: newCatType }),
                      })
                        .then((r) => r.json())
                        .then((d) => { if (d.success) { toast.success(`Added "${d.name}"`); setNewCatName(""); fetchCategories(); } else { toast.error(d.detail || "Failed"); } })
                        .catch(() => toast.error("Failed to add"));
                    }
                  }}
                  style={{
                    flex: 1,
                    minWidth: 160,
                    padding: "0.375rem 0.625rem",
                    fontSize: "0.8125rem",
                    border: `1px solid ${colors.border}`,
                    borderRadius: 6,
                    background: colors.inputBg,
                    color: colors.text,
                    fontFamily: "'Inter', sans-serif",
                  }}
                />
                <select
                  value={newCatType}
                  onChange={(e) => setNewCatType(e.target.value)}
                  style={{
                    padding: "0.375rem 0.5rem",
                    fontSize: "0.8125rem",
                    border: `1px solid ${colors.border}`,
                    borderRadius: 6,
                    background: colors.inputBg,
                    color: colors.text,
                  }}
                >
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                  <option value="transfer">Transfer</option>
                </select>
                <button
                  onClick={() => {
                    if (!newCatName.trim()) return;
                    fetch(`${API_BASE_URL}/api/ledger/categories?user_id=${encodeURIComponent(userId)}`, {
                      method: "POST",
                      headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
                      body: JSON.stringify({ name: newCatName.trim(), type: newCatType }),
                    })
                      .then((r) => r.json())
                      .then((d) => { if (d.success) { toast.success(`Added "${d.name}"`); setNewCatName(""); fetchCategories(); } else { toast.error(d.detail || "Failed"); } })
                      .catch(() => toast.error("Failed to add"));
                  }}
                  style={{
                    padding: "0.375rem 0.625rem",
                    fontSize: "0.8125rem",
                    fontWeight: 600,
                    background: "var(--primary)",
                    color: "#fff",
                    border: "none",
                    borderRadius: 6,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.25rem",
                  }}
                >
                  <FiPlus size={13} /> Add
                </button>
              </div>

              {/* Category list */}
              <div
                style={{
                  maxHeight: 400,
                  overflowY: "auto",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.25rem",
                }}
              >
                {categoryList.map((cat) => (
                  <div
                    key={cat.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      padding: "0.375rem 0.625rem",
                      background: theme === "dark" ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.015)",
                      borderRadius: 6,
                      fontSize: "0.8125rem",
                    }}
                  >
                    {editingCatId === cat.id ? (
                      <>
                        <input
                          type="text"
                          value={editingCatName}
                          onChange={(e) => setEditingCatName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              fetch(`${API_BASE_URL}/api/ledger/categories/${cat.id}?user_id=${encodeURIComponent(userId)}`, {
                                method: "PUT",
                                headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
                                body: JSON.stringify({ name: editingCatName.trim(), type: editingCatType }),
                              })
                                .then((r) => r.json())
                                .then((d) => { if (d.success) { fetchCategories(); setEditingCatId(null); } else { toast.error(d.detail || "Failed"); } })
                                .catch(() => toast.error("Update failed"));
                            } else if (e.key === "Escape") {
                              setEditingCatId(null);
                            }
                          }}
                          autoFocus
                          style={{
                            flex: 1,
                            padding: "0.25rem 0.5rem",
                            fontSize: "0.8125rem",
                            border: `1px solid var(--primary)`,
                            borderRadius: 4,
                            background: colors.inputBg,
                            color: colors.text,
                            fontFamily: "'Inter', sans-serif",
                          }}
                        />
                        <select
                          value={editingCatType}
                          onChange={(e) => setEditingCatType(e.target.value)}
                          style={{
                            padding: "0.25rem 0.375rem",
                            fontSize: "0.75rem",
                            border: `1px solid ${colors.border}`,
                            borderRadius: 4,
                            background: colors.inputBg,
                            color: colors.text,
                          }}
                        >
                          <option value="expense">Expense</option>
                          <option value="income">Income</option>
                          <option value="transfer">Transfer</option>
                        </select>
                        <button
                          onClick={() => {
                            fetch(`${API_BASE_URL}/api/ledger/categories/${cat.id}?user_id=${encodeURIComponent(userId)}`, {
                              method: "PUT",
                              headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
                              body: JSON.stringify({ name: editingCatName.trim(), type: editingCatType }),
                            })
                              .then((r) => r.json())
                              .then((d) => { if (d.success) { fetchCategories(); setEditingCatId(null); } else { toast.error(d.detail || "Failed"); } })
                              .catch(() => toast.error("Update failed"));
                          }}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "#22c55e", padding: 2, display: "inline-flex" }}
                          title="Save"
                        >
                          <FiCheck size={15} />
                        </button>
                        <button
                          onClick={() => setEditingCatId(null)}
                          style={{ background: "none", border: "none", cursor: "pointer", color: colors.textSecondary, padding: 2, display: "inline-flex" }}
                          title="Cancel"
                        >
                          <FiX size={15} />
                        </button>
                      </>
                    ) : (
                      <>
                        <span style={{ flex: 1, color: colors.text }}>{cat.name}</span>
                        <span
                          style={{
                            padding: "0.1rem 0.4rem",
                            fontSize: "0.65rem",
                            fontWeight: 600,
                            borderRadius: 8,
                            background:
                              cat.type === "income" ? "rgba(34,197,94,0.15)"
                              : cat.type === "transfer" ? "rgba(99,102,241,0.15)"
                              : "rgba(239,68,68,0.15)",
                            color:
                              cat.type === "income" ? "#22c55e"
                              : cat.type === "transfer" ? "#6366f1"
                              : "#ef4444",
                          }}
                        >
                          {cat.type}
                        </span>
                        <span
                          style={{
                            padding: "0.1rem 0.4rem",
                            fontSize: "0.6rem",
                            borderRadius: 8,
                            color: colors.textSecondary,
                            background: theme === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
                          }}
                        >
                          {cat.source}
                        </span>
                        <button
                          onClick={() => {
                            setEditingCatId(cat.id);
                            setEditingCatName(cat.name);
                            setEditingCatType(cat.type);
                          }}
                          style={{ background: "none", border: "none", cursor: "pointer", color: colors.textSecondary, padding: 2, display: "inline-flex" }}
                          title="Edit"
                        >
                          <FiEdit2 size={13} />
                        </button>
                        <button
                          onClick={async () => {
                            if (!confirm(`Deactivate "${cat.name}"? This won't delete it, just hide it from future classification.`)) return;
                            try {
                              const res = await fetch(
                                `${API_BASE_URL}/api/ledger/categories/${cat.id}?user_id=${encodeURIComponent(userId)}`,
                                { method: "DELETE", headers: { ...getAuthHeaders() } }
                              );
                              if (res.ok) {
                                toast.success(`Deactivated "${cat.name}"`);
                                fetchCategories();
                              } else {
                                toast.error("Failed to deactivate");
                              }
                            } catch { toast.error("Failed"); }
                          }}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626", padding: 2, display: "inline-flex" }}
                          title="Deactivate"
                        >
                          <FiTrash2 size={13} />
                        </button>
                      </>
                    )}
                  </div>
                ))}
                {categoryList.length === 0 && (
                  <div style={{ color: colors.textSecondary, fontSize: "0.8125rem", padding: "0.5rem 0" }}>
                    No categories yet. Run Normalize & Classify first, or add manually.
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Define Hierarchy (dimensions) */}
      {selectedCompany && (plaidConnections.length > 0 || stripeStatus?.connected || userVisibleFiles.length > 0 || ledgerAccountCount > 0) && (
        <section
          style={{
            marginTop: "1.5rem",
            padding: "1.25rem",
            background: colors.secondaryBg,
            borderRadius: 12,
            border: "1px solid var(--border-color)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <h3
            style={{
              color: colors.text,
              fontSize: "0.95rem",
              fontWeight: 700,
              margin: "0 0 0.75rem",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <FiBarChart2 style={{ color: "var(--primary)" }} />
            Define Hierarchy (optional)
          </h3>
          <p style={{ color: colors.textSecondary, fontSize: "0.8125rem", margin: "0 0 0.75rem" }}>
            Describe how you want to group transactions beyond categories. For example:
            &quot;Break down by Region (NA, SA, EU, APAC), then by Department (Engineering, Sales, Marketing)&quot;
          </p>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <textarea
              id="hierarchy-prompt"
              placeholder="e.g., Group by Region (North America, Europe, Asia), then by Department"
              rows={2}
              style={{
                flex: 1,
                padding: "0.5rem 0.75rem",
                fontSize: "0.8125rem",
                border: `1px solid ${theme === "dark" ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)"}`,
                borderRadius: 8,
                background: theme === "dark" ? "#111827" : "#fff",
                color: colors.text,
                resize: "vertical",
              }}
            />
            <button
              onClick={async () => {
                const textArea = document.getElementById("hierarchy-prompt") as HTMLTextAreaElement;
                const prompt = textArea?.value?.trim();
                if (!prompt) { toast.error("Please describe your hierarchy first"); return; }

                const tid = toast.loading("Saving dimension hierarchy…");
                try {
                  const parts = prompt.split(/,?\s+then\s+(?:by\s+)?/i);
                  const definitions = parts.map((part, idx) => {
                    const nameMatch = part.match(/^(?:(?:break\s+down|group)\s+by\s+)?(\w[\w\s]*?)(?:\s*\(([^)]+)\))?$/i);
                    const name = nameMatch ? nameMatch[1].trim() : part.trim();
                    const valsStr = nameMatch?.[2];
                    const allowed_values = valsStr ? valsStr.split(",").map((v: string) => v.trim()).filter(Boolean) : undefined;
                    return { name, level: idx, allowed_values, default_value: allowed_values?.[0] || undefined, prompt };
                  });

                  const res = await fetch(
                    `${API_BASE_URL}/api/ledger/dimensions?user_id=${encodeURIComponent(userId)}`,
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
                      body: JSON.stringify({ definitions, raw_prompt: prompt }),
                    }
                  );
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.detail || "Failed to save");
                  toast.update(tid, {
                    render: `Saved ${data.saved} dimension levels`,
                    type: "success", isLoading: false, autoClose: 4000,
                  });
                } catch (err) {
                  toast.update(tid, {
                    render: err instanceof Error ? err.message : "Failed to save hierarchy",
                    type: "error", isLoading: false, autoClose: 4000,
                  });
                }
              }}
              style={{
                padding: "0.5rem 1rem",
                fontSize: "0.8125rem",
                fontWeight: 600,
                background: "var(--primary)",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              Save
            </button>
          </div>
        </section>
      )}

      {tableData && tableData.headers.length > 0 && (
        <div
          style={{
            marginTop: "2rem",
            borderRadius: 12,
            overflow: "hidden",
            background: colors.secondaryBg,
            boxShadow: theme === "dark" ? "var(--shadow-lg)" : "var(--shadow-md)",
            border: `1px solid ${theme === "dark" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"}`,
          }}
        >
          <div
            style={{
              overflowX: "auto",
              overflowY: "auto",
              maxHeight: 520,
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "0.8125rem",
              }}
              role="grid"
              aria-label="Uploaded CSV data"
            >
              <thead>
                <tr
                  className="ai-gradient"
                  style={{
                    position: "sticky",
                    top: 0,
                    zIndex: 1,
                    background: theme === "dark" ? "#1e293b" : "#f8fafc",
                    borderBottom: `2px solid ${theme === "dark" ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)"}`,
                  }}
                >
                  {tableData.headers.map((h, i) => (
                    <th
                      key={i}
                      className="ai-gradient"
                      style={{
                        padding: "0.75rem 1rem",
                        textAlign: "left",
                        fontWeight: 600,
                        fontSize: "0.8125rem",
                        letterSpacing: "0.02em",
                        whiteSpace: "nowrap",
                        minWidth: 100,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableData.rows
                  .slice(0, MAX_TABLE_ROWS)
                  .map((row, rowIndex) => (
                    <tr
                      key={rowIndex}
                      style={{
                        background: rowIndex % 2 === 0 ? "transparent" : (theme === "dark" ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)"),
                        borderBottom: `1px solid ${theme === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`,
                      }}
                    >
                      {tableData.headers.map((_, colIndex) => (
                        <td
                          key={colIndex}
                          style={{
                            padding: "0.25rem 0.5rem",
                            verticalAlign: "middle",
                          }}
                        >
                          <input
                            type="text"
                            value={row[colIndex] ?? ""}
                            onChange={(e) => handleCellChange(rowIndex, colIndex, e.target.value)}
                            style={{
                              width: "100%",
                              minWidth: 80,
                              padding: "0.5rem 0.75rem",
                              fontSize: "0.8125rem",
                              color: colors.text,
                              background: theme === "dark" ? "rgba(255,255,255,0.05)" : "#fff",
                              border: `1px solid ${theme === "dark" ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"}`,
                              borderRadius: 6,
                              outline: "none",
                              boxSizing: "border-box",
                            }}
                            onFocus={(e) => {
                              e.target.style.borderColor = "#2563eb";
                              e.target.style.boxShadow = "0 0 0 2px rgba(37, 99, 235, 0.2)";
                            }}
                            onBlur={(e) => {
                              e.target.style.borderColor = theme === "dark" ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)";
                              e.target.style.boxShadow = "none";
                            }}
                            aria-label={`${tableData.headers[colIndex]} row ${rowIndex + 1}`}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {tableData.rows.length > MAX_TABLE_ROWS && (
            <p
              style={{
                margin: 0,
                padding: "0.625rem 1rem",
                fontSize: "0.8125rem",
                color: colors.textSecondary,
                borderTop: `1px solid ${theme === "dark" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"}`,
                background: theme === "dark" ? "rgba(0,0,0,0.2)" : "rgba(0,0,0,0.02)",
              }}
            >
              Showing first {MAX_TABLE_ROWS} of {tableData.rows.length} rows
            </p>
          )}
        </div>
      )}

      {/* ---- Stripe Connect Modal ---- */}
      {stripeModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.5)",
            backdropFilter: "blur(4px)",
          }}
          onClick={() => { if (!stripeConnecting) { setStripeModalOpen(false); setStripeKeyInput(""); } }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 480,
              margin: "0 1rem",
              background: theme === "dark" ? "#1e293b" : "#fff",
              borderRadius: 16,
              padding: "2rem",
              boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
              border: `1px solid ${theme === "dark" ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)"}`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.25rem" }}>
              <span
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  fontSize: "1.125rem",
                  background: "#6366f1",
                }}
              >
                <FiDollarSign />
              </span>
              <div>
                <h3 style={{ margin: 0, color: colors.text, fontSize: "1.125rem", fontWeight: 700, fontFamily: "'Inter', sans-serif" }}>
                  Connect Stripe Account
                </h3>
                <p style={{ margin: 0, color: colors.textSecondary, fontSize: "0.8125rem" }}>
                  Enter your Stripe Secret Key to pull transactions
                </p>
              </div>
            </div>

            <label
              htmlFor="stripe-key-input"
              style={{
                display: "block",
                fontSize: "0.8125rem",
                fontWeight: 600,
                color: colors.textSecondary,
                marginBottom: "0.375rem",
              }}
            >
              Stripe Secret Key
            </label>
            <input
              id="stripe-key-input"
              type="password"
              value={stripeKeyInput}
              onChange={(e) => setStripeKeyInput(e.target.value)}
              placeholder="sk_test_... or sk_live_..."
              autoFocus
              style={{
                width: "100%",
                padding: "0.625rem 0.875rem",
                fontSize: "0.875rem",
                color: colors.text,
                background: theme === "dark" ? "rgba(255,255,255,0.06)" : "#f8fafc",
                border: `1px solid ${theme === "dark" ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)"}`,
                borderRadius: 8,
                boxSizing: "border-box",
                fontFamily: "monospace",
                outline: "none",
              }}
              onFocus={(e) => { e.target.style.borderColor = "#6366f1"; e.target.style.boxShadow = "0 0 0 3px rgba(99,102,241,0.15)"; }}
              onBlur={(e) => { e.target.style.borderColor = theme === "dark" ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)"; e.target.style.boxShadow = "none"; }}
              onKeyDown={(e) => { if (e.key === "Enter" && stripeKeyInput.startsWith("sk_")) handleStripeConnect(stripeKeyInput); }}
            />
            <p style={{ margin: "0.5rem 0 1.25rem", fontSize: "0.75rem", color: colors.textSecondary, lineHeight: 1.4 }}>
              Your key is stored securely on the server and never shared. Find it in your
              {" "}<a href="https://dashboard.stripe.com/apikeys" target="_blank" rel="noopener noreferrer" style={{ color: "#6366f1" }}>Stripe Dashboard</a>.
            </p>

            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => { setStripeModalOpen(false); setStripeKeyInput(""); }}
                disabled={stripeConnecting}
                style={{
                  padding: "0.5rem 1rem",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  color: colors.textSecondary,
                  background: "transparent",
                  border: `1px solid ${theme === "dark" ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)"}`,
                  borderRadius: 8,
                  cursor: "pointer",
                  fontFamily: "'Inter', sans-serif",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleStripeConnect(stripeKeyInput)}
                disabled={stripeConnecting || !stripeKeyInput.startsWith("sk_")}
                style={{
                  padding: "0.5rem 1.25rem",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  color: "#fff",
                  background: stripeConnecting || !stripeKeyInput.startsWith("sk_") ? "#94a3b8" : "#6366f1",
                  border: "none",
                  borderRadius: 8,
                  cursor: stripeConnecting || !stripeKeyInput.startsWith("sk_") ? "not-allowed" : "pointer",
                  fontFamily: "'Inter', sans-serif",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                {stripeConnecting ? (
                  <>
                    <span
                      style={{
                        width: 14,
                        height: 14,
                        border: "2px solid rgba(255,255,255,0.3)",
                        borderTopColor: "#fff",
                        borderRadius: "50%",
                        animation: "spin 0.8s linear infinite",
                      }}
                    />
                    Connecting…
                  </>
                ) : (
                  <>
                    <FiLink size={14} />
                    Connect
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConnectData;
