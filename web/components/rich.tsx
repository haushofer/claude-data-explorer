"use client";
import { useEffect, useState } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import hljs from "highlight.js/lib/core";
import python from "highlight.js/lib/languages/python";
import stata from "highlight.js/lib/languages/stata";
import "highlight.js/styles/github.css";

hljs.registerLanguage("python", python);
hljs.registerLanguage("stata", stata);

// Render authored markdown-lite with LaTeX: $$display$$, $inline$, **bold**, paragraphs.
// (Only used for trusted, authored text — not participant summaries, which may contain $.)
export function Rich({ text }: { text: string }) {
  if (!text) return null;
  let s = text;
  s = s.replace(/\$\$([\s\S]+?)\$\$/g, (_m, m) =>
    katex.renderToString(m, { displayMode: true, throwOnError: false })
  );
  s = s.replace(/\$([^$\n]+?)\$/g, (_m, m) =>
    katex.renderToString(m, { displayMode: false, throwOnError: false })
  );
  // markdown links [label](href) -> anchor
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank">$1</a>');
  s = s.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  s = s.replace(/\*([^*\n]+?)\*/g, "<i>$1</i>"); // single-asterisk italics (after bold)
  const html = s
    .split(/\n\n+/)
    .map((p) => `<p>${p.replace(/\n/g, "<br/>")}</p>`)
    .join("");
  return <div className="rich" dangerouslySetInnerHTML={{ __html: html }} />;
}

export function Code({ code, language = "python" }: { code: string; language?: string }) {
  const html = hljs.highlight(code, { language }).value;
  return (
    <pre className="code">
      <code dangerouslySetInnerHTML={{ __html: html }} />
    </pre>
  );
}

// Fetch a .py artifact and show it highlighted (for participant analyses).
export function CodeFromUrl({ url }: { url: string }) {
  const [code, setCode] = useState<string | null>(null);
  useEffect(() => {
    fetch(url).then((r) => r.text()).then(setCode).catch(() => setCode(null));
  }, [url]);
  if (code == null) return null;
  return <Code code={code} />;
}
