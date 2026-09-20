/* Last-resort boundary for errors in the root layout itself. It replaces the
   whole document, so the providers (theme, next-intl) are NOT available here —
   the copy is intentionally hard-coded and the styling inline. */
"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#0d1117",
          color: "#e6edf3",
        }}
      >
        <div role="alert" style={{ textAlign: "center", maxWidth: 380 }}>
          <h1 style={{ fontSize: 18, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ fontSize: 14, opacity: 0.75, marginBottom: 16 }}>
            DevDigest hit an unexpected error. Try reloading the page.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #30363d", background: "transparent", color: "inherit", cursor: "pointer" }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
