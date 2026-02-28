/**
 * ChatHtmlFrame - Sandboxed iframe for rendering rich HTML in the agent chat.
 *
 * Supports <script>, <style>, <canvas>, Chart.js, CSS animations, etc.
 * Reports rendering errors back to the parent via postMessage so the
 * agent can be informed and self-correct.
 */

import React, { useRef, useState, useEffect, useMemo } from "react";

interface ChatHtmlFrameProps {
  html: string;
  label?: string;
  onRenderError?: (error: string) => void;
}

function getTheme(): string {
  return localStorage.getItem("theme") || "light";
}

function buildChatSrcDoc(html: string, theme: string): string {
  const bg = theme === "dark" ? "#1e293b" : "#ffffff";
  const text = theme === "dark" ? "#e2e8f0" : "#1e293b";
  const textSecondary = theme === "dark" ? "#94a3b8" : "#64748b";
  const border = theme === "dark" ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)";
  const thBg = theme === "dark" ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)";
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  *, *::before, *::after { box-sizing: border-box; }
  html { overflow-x: auto; overflow-y: hidden; }
  body {
    margin: 0; padding: 8px;
    font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
    font-size: 13px; line-height: 1.6;
    background: ${bg}; color: ${text};
    overflow-x: auto; overflow-y: hidden;
  }
  #__wrap { overflow: visible; }
  table { border-collapse: collapse; width: 100%; }
  th, td { padding: 6px 10px; border: 1px solid ${border}; text-align: left; }
  th { font-weight: 600; background: ${thBg}; }
  a { color: #6366f1; }
  h1, h2, h3, h4, h5, h6 { margin: 0.5em 0 0.3em; }
  .text-secondary { color: ${textSecondary}; }
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
      type: 'chat-render-error',
      error: String(msg) + (line ? ' (line ' + line + ')' : '')
    }, '*');
  };
  window.addEventListener('unhandledrejection', function(e) {
    window.parent.postMessage({
      type: 'chat-render-error',
      error: 'Unhandled promise rejection: ' + String(e.reason)
    }, '*');
  });
  try {
    (function() {
      function send() {
        var el = document.getElementById('__wrap');
        if (!el) return;
        var h = el.scrollHeight || el.offsetHeight;
        if (h > 10) {
          window.parent.postMessage({ type: 'chat-frame-resize', height: h }, '*');
        }
      }
      send();
      setTimeout(send, 300);
      setTimeout(send, 800);
      setTimeout(send, 1500);
      setTimeout(send, 3000);

      // Chart.js health check
      setTimeout(function() {
        if (typeof Chart === 'undefined') return;
        var canvases = document.querySelectorAll('canvas');
        var errors = [];
        canvases.forEach(function(c, i) {
          var inst = Chart.getChart ? Chart.getChart(c) : null;
          if (!inst) {
            errors.push('Canvas #' + (i+1) + ' has no Chart.js instance');
            return;
          }
          var ds = inst.data && inst.data.datasets;
          if (!ds || ds.length === 0) {
            errors.push('Chart #' + (i+1) + ' has no datasets');
          } else if (ds.every(function(d) { return !d.data || d.data.length === 0; })) {
            errors.push('Chart #' + (i+1) + ' has empty data');
          }
        });
        if (errors.length > 0) {
          window.parent.postMessage({
            type: 'chat-render-error',
            error: errors.join('; ')
          }, '*');
        }
      }, 4000);
    })();
  } catch (e) {
    window.parent.postMessage({
      type: 'chat-render-error',
      error: String(e)
    }, '*');
  }
</script>
</body>
</html>`;
}

export default function ChatHtmlFrame({ html, label, onRenderError }: ChatHtmlFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(120);
  const lockedRef = useRef(false);
  const theme = getTheme();

  useEffect(() => {
    lockedRef.current = false;
    const lockTimer = setTimeout(() => { lockedRef.current = true; }, 7000);

    const handler = (e: MessageEvent) => {
      if (e.data?.type === "chat-frame-resize" && typeof e.data.height === "number") {
        if (!lockedRef.current && iframeRef.current && e.source === iframeRef.current.contentWindow) {
          setHeight(Math.min(Math.max(e.data.height + 16, 60), 800));
        }
      }
      if (e.data?.type === "chat-render-error" && typeof e.data.error === "string") {
        if (iframeRef.current && e.source === iframeRef.current.contentWindow) {
          const prefix = label ? `Chat HTML (${label}): ` : "Chat HTML: ";
          onRenderError?.(prefix + e.data.error);
        }
      }
    };

    window.addEventListener("message", handler);
    return () => {
      window.removeEventListener("message", handler);
      clearTimeout(lockTimer);
    };
  }, [html, onRenderError]);

  const srcDoc = useMemo(() => buildChatSrcDoc(html, theme), [html, theme]);

  return (
    <iframe
      ref={iframeRef}
      srcDoc={srcDoc}
      sandbox="allow-scripts"
      className="chat-html-frame"
      style={{ height }}
      title="Agent HTML content"
    />
  );
}
