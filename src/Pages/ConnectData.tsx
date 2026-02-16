import { useRef, useState, useEffect, useMemo } from "react";
import { FiChevronDown, FiDownload, FiFileText, FiUpload } from "react-icons/fi";
import "../Components/Navbar.css";
import "./ConnectData.css";

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
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const [selectedCompany, setSelectedCompany] = useState<string>("");
  const [tableData, setTableData] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [currentPage, setCurrentPage] = useState(0);
  const isSectionDisabled = !selectedCompany;

  const { uniqueByHeader, filteredRows, originalIndices } = useMemo(() => {
    if (!tableData || tableData.headers.length === 0) {
      return {
        uniqueByHeader: {} as Record<string, string[]>,
        filteredRows: [] as string[][],
        originalIndices: [] as number[],
      };
    }
    const detailsCol = tableData.headers.indexOf("Details");
    const typeCol = tableData.headers.indexOf("Type");
    const uniqueDetails = new Set<string>();
    const uniqueType = new Set<string>();
    tableData.rows.forEach((row) => {
      if (detailsCol >= 0) {
        const v = String(row[detailsCol] ?? "").trim();
        if (v) uniqueDetails.add(v);
      }
      if (typeCol >= 0) {
        const v = String(row[typeCol] ?? "").trim();
        if (v) uniqueType.add(v);
      }
    });
    const uniqueByHeader: Record<string, string[]> = {};
    if (detailsCol >= 0) uniqueByHeader["Details"] = [...uniqueDetails].sort();
    if (typeCol >= 0) uniqueByHeader["Type"] = [...uniqueType].sort();

    const formatCellDate = (cell: string): string => {
      const s = String(cell ?? "").trim();
      if (!s) return "";
      const d = new Date(s);
      if (Number.isNaN(d.getTime())) return "";
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };

    const indices: number[] = [];
    tableData.rows.forEach((row, i) => {
      const columnMatch = tableData.headers.every((h, colIndex) => {
        const filterVal = columnFilters[h]?.trim();
        if (!filterVal) return true;
        const cell = String(row[colIndex] ?? "").trim();
        if (h === "Details" || h === "Type") {
          return cell === filterVal;
        }
        if (h === "Posting Date") {
          const cellDate = formatCellDate(row[colIndex] ?? "");
          return cellDate === filterVal;
        }
        return cell.toLowerCase().includes(filterVal.toLowerCase());
      });
      if (columnMatch) indices.push(i);
    });
    return {
      uniqueByHeader,
      filteredRows: indices.map((i) => tableData.rows[i]),
      originalIndices: indices,
    };
  }, [tableData, columnFilters]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / MAX_TABLE_ROWS));
  const pageStart = currentPage * MAX_TABLE_ROWS;
  const pageEnd = Math.min(pageStart + MAX_TABLE_ROWS, filteredRows.length);
  const pageRows = filteredRows.slice(pageStart, pageEnd);
  const pageOriginalIndices = originalIndices.slice(pageStart, pageEnd);

  useEffect(() => {
    setCurrentPage(0);
  }, [tableData, columnFilters]);

  useEffect(() => {
    const totalP = Math.max(1, Math.ceil(filteredRows.length / MAX_TABLE_ROWS));
    setCurrentPage((p) => (p >= totalP ? Math.max(0, totalP - 1) : p));
  }, [filteredRows.length]);

  useEffect(() => {
    tableScrollRef.current?.scrollTo({ top: 0, left: 0 });
  }, [currentPage]);

  const setColumnFilter = (header: string, value: string) => {
    setColumnFilters((prev) => ({ ...prev, [header]: value }));
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

  const cardsClass = [
    "connect-data__cards",
    isMobile ? "connect-data__cards--mobile" : "",
    isSectionDisabled ? "connect-data__cards--disabled" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="connect-data">
      <header className="connect-data__header">
        <div>
          <h1 className="connect-data__title">Connect Data</h1>
          <p className="connect-data__subtitle">
            Choose how to import your financial data
          </p>
        </div>
        <div className="connect-data__select-wrap">
          <select
            className="connect-data__select"
            value={selectedCompany}
            onChange={(e) => setSelectedCompany(e.target.value)}
            aria-label="Select company"
          >
            <option value="">Select company</option>
            <option value="company1">Company 1</option>
            <option value="company2">Company 2</option>
          </select>
          <span className="connect-data__select-chevron" aria-hidden>
            <FiChevronDown size={16} />
          </span>
        </div>
      </header>

      <section
        className={cardsClass}
        aria-label="Data connection options"
        aria-disabled={isSectionDisabled}
      >
        <article className="connect-data__card" aria-labelledby="card-title-csv">
          <span className="connect-data__icon">
            <FiFileText aria-hidden />
          </span>
          <h2 id="card-title-csv" className="connect-data__card-title">
            Excel / CSV
          </h2>
          <p className="connect-data__card-desc">
            Upload spreadsheet files with your transaction data
          </p>
          <p className="connect-data__card-desc">
            Support for CSV and Excel formats
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleFileChange}
            disabled={isSectionDisabled}
            className="connect-data__file-input"
            aria-label="Upload CSV or spreadsheet file"
          />
          <button
            type="button"
            className="connect-data__btn"
            disabled={isSectionDisabled}
            onClick={handleUploadClick}
          >
            <FiUpload aria-hidden />
            Upload File
          </button>
          <button
            type="button"
            className="connect-data__btn"
            disabled={isSectionDisabled}
            onClick={handleDownloadSample}
          >
            <FiDownload aria-hidden />
            Download Sample
          </button>
        </article>
      </section>

      {tableData && tableData.headers.length > 0 && (
        <div className="connect-data__table-wrap">
          <div ref={tableScrollRef} className="connect-data__table-scroll">
            <table
              className="connect-data__table"
              role="grid"
              aria-label="Uploaded CSV data"
            >
              <thead className="connect-data__thead">
                <tr className="ai-gradient">
                  {tableData.headers.map((h, i) => (
                    <th key={i} className="connect-data__th ai-gradient">
                      {h}
                    </th>
                  ))}
                </tr>
                <tr className="connect-data__filter-row">
                  {tableData.headers.map((h, i) => (
                    <td key={i} className="connect-data__filter-td">
                      {h === "Details" || h === "Type" ? (
                        <select
                          className="connect-data__filter-select"
                          value={columnFilters[h] ?? ""}
                          onChange={(e) => setColumnFilter(h, e.target.value)}
                          aria-label={`Filter by ${h}`}
                        >
                          <option value="">All</option>
                          {(uniqueByHeader[h] ?? []).map((v) => (
                            <option key={v} value={v}>
                              {v}
                            </option>
                          ))}
                        </select>
                      ) : h === "Posting Date" ? (
                        <input
                          type="date"
                          className="connect-data__filter-input connect-data__filter-date"
                          value={columnFilters[h] ?? ""}
                          onChange={(e) => setColumnFilter(h, e.target.value)}
                          aria-label={`Filter by ${h}`}
                        />
                      ) : (
                        <input
                          type="text"
                          className="connect-data__filter-input"
                          placeholder={h}
                          value={columnFilters[h] ?? ""}
                          onChange={(e) => setColumnFilter(h, e.target.value)}
                          aria-label={`Filter by ${h}`}
                        />
                      )}
                    </td>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row, displayIndex) => {
                  const originalRowIndex = pageOriginalIndices[displayIndex];
                  return (
                    <tr key={originalRowIndex} className="connect-data__body-tr">
                      {tableData.headers.map((_, colIndex) => (
                        <td key={colIndex} className="connect-data__td">
                          <input
                            type="text"
                            className="connect-data__cell-input"
                            value={row[colIndex] ?? ""}
                            onChange={(e) =>
                              handleCellChange(originalRowIndex, colIndex, e.target.value)
                            }
                            aria-label={`${tableData.headers[colIndex]} row ${pageStart + displayIndex + 1}`}
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="connect-data__table-footer">
            <span className="connect-data__table-footer-text">
              {filteredRows.length === 0
                ? "No rows match your filters."
                : `Showing ${filteredRows.length <= MAX_TABLE_ROWS ? filteredRows.length : `${pageStart + 1}-${pageEnd}`} of ${filteredRows.length} rows`}
            </span>
            {totalPages > 1 && (
              <div className="connect-data__pagination">
                <button
                  type="button"
                  className="connect-data__pagination-btn"
                  disabled={currentPage === 0}
                  onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                  aria-label="Previous page"
                >
                  Previous
                </button>
                <span className="connect-data__pagination-info">
                  Page {currentPage + 1} of {totalPages}
                </span>
                <button
                  type="button"
                  className="connect-data__pagination-btn"
                  disabled={currentPage >= totalPages - 1}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
                  aria-label="Next page"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ConnectData;
