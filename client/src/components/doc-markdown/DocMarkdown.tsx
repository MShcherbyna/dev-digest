/* DocMarkdown — renders UNTRUSTED repo markdown for the preview.
   No raw HTML (no rehype-raw), only absolute http(s) links, and images render
   as their alt text only so previewing a doc never makes the browser fetch a
   remote URL. Own wrapper because the vendored `Markdown` allows relative and
   mailto links and renders images. */
import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { isSafeHref } from "./helpers";
import { s } from "./styles";

export function DocMarkdown({ children }: { children?: string | null }) {
  if (!children) return null;
  return (
    <div style={s.root}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={(url) => (isSafeHref(url) ? url : "")}
        components={{
          h1: ({ children }) => <h1 style={s.h1}>{children}</h1>,
          h2: ({ children }) => <h2 style={s.h2}>{children}</h2>,
          h3: ({ children }) => <h3 style={s.h3}>{children}</h3>,
          p: ({ children }) => <p style={s.p}>{children}</p>,
          ul: ({ children }) => <ul style={s.list}>{children}</ul>,
          ol: ({ children }) => <ol style={s.list}>{children}</ol>,
          li: ({ children }) => <li style={s.li}>{children}</li>,
          strong: ({ children }) => <strong style={s.strong}>{children}</strong>,
          code: ({ children, className }) =>
            className ? (
              <code className={`mono ${className}`}>{children}</code>
            ) : (
              <code className="mono" style={s.code}>
                {children}
              </code>
            ),
          pre: ({ children }) => (
            <pre className="mono" style={s.pre}>
              {children}
            </pre>
          ),
          blockquote: ({ children }) => <blockquote style={s.quote}>{children}</blockquote>,
          img: ({ alt }) => (alt ? <span style={s.alt}>{alt}</span> : null),
          a: ({ children, href }) =>
            href ? (
              <a href={href} target="_blank" rel="noopener noreferrer nofollow" style={s.link}>
                {children}
              </a>
            ) : (
              <span>{children}</span>
            ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
