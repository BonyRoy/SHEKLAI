import { useRef, useState, useEffect } from "react";
import { FiChevronDown, FiDownload, FiFileText, FiUpload } from "react-icons/fi";
import { useTheme } from "../contexts/ThemeContext";
import "../Components/Navbar.css";

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
    text: "#000000",
    textSecondary: "#666666",
    secondaryBg: "#f5f5f5",
  },
  dark: {
    text: "#ffffff",
    textSecondary: "#b0b0b0",
    secondaryBg: "#1a1a1a",
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

const ConnectData = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const isMobile = useIsMobile();
  const [selectedCompany, setSelectedCompany] = useState<string>("");
  const [tableData, setTableData] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const isSectionDisabled = !selectedCompany;

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
    if (!isCSV) {
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        const parsed = parseCSV(text);
        setTableData(parsed);
      }
    };
    reader.readAsText(file, "UTF-8");
    e.target.value = "";
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
    <div style={{ padding: "2rem 1.25rem 3rem", maxWidth: 1200, margin: "0 auto" }}>
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
              fontSize: "clamp(1.75rem, 4vw, 2rem)",
              fontWeight: 700,
              marginBottom: "0.5rem",
              lineHeight: 1.2,
            }}
          >
            Connect Data
          </h1>
          <p
            style={{
              color: colors.textSecondary,
              fontSize: "1rem",
              fontWeight: 400,
              margin: 0,
            }}
          >
            Choose how to import your financial data
          </p>
        </div>
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
              border: `1px solid ${colors.textSecondary}`,
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
      </header>

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
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.06)",
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
              borderRadius: 8,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontSize: "1.25rem",
              background: "#2e7d32",
            }}
          >
            <FiFileText aria-hidden />
          </span>
          <h2
            id="card-title-csv"
            style={{
              color: colors.text,
              fontSize: "1.125rem",
              fontWeight: 700,
              margin: 0,
              lineHeight: 1.3,
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
            Upload spreadsheet files with your transaction data
          </p>
          <p
            style={{
              color: colors.textSecondary,
              fontSize: "0.875rem",
              lineHeight: 1.45,
              margin: 0,
            }}
          >
            Support for CSV and Excel formats
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
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
              fontSize: "0.9375rem",
              fontWeight: 600,
              color: "#fff",
              background: "#1976d2",
              border: "none",
              borderRadius: 8,
              cursor: isSectionDisabled ? "not-allowed" : "pointer",
              marginTop: "auto",
            }}
            onClick={handleUploadClick}
          >
            <FiUpload aria-hidden style={{ width: "1.125rem", height: "1.125rem" }} />
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
              fontSize: "0.9375rem",
              fontWeight: 600,
              color: "#fff",
              background: "#1976d2",
              border: "none",
              borderRadius: 8,
              cursor: isSectionDisabled ? "not-allowed" : "pointer",
              marginTop: "auto",
            }}
            onClick={handleDownloadSample}
          >
            <FiDownload aria-hidden style={{ width: "1.125rem", height: "1.125rem" }} />
            Download Sample
          </button>
        </article>
      </section>

      {tableData && tableData.headers.length > 0 && (
        <div
          style={{
            marginTop: "2rem",
            borderRadius: 12,
            overflow: "hidden",
            background: colors.secondaryBg,
            boxShadow: theme === "dark" ? "0 4px 24px rgba(0,0,0,0.4)" : "0 4px 24px rgba(0,0,0,0.08)",
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
                              e.target.style.borderColor = "#3b82f6";
                              e.target.style.boxShadow = "0 0 0 2px rgba(59, 130, 246, 0.25)";
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
    </div>
  );
};

export default ConnectData;
