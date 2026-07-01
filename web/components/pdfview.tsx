"use client";
import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";

// Self-hosted worker (version-matched copy in /public) so PDFs render reliably
// in any browser — independent of the native PDF plugin / "download PDFs" setting.
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

// One page, rendered only when scrolled near (keeps long PDFs responsive).
// `aspect` is the real page height/width ratio, so the placeholder reserves the
// EXACT height the rendered page will take — otherwise pages resizing as they
// load shift the scroll position. Lazy-loading is keyed to the page viewport, so
// the whole document flows inline: page 1 starts at the top and you scroll the
// page itself all the way through to the end.
function LazyPage({ pageNumber, width, aspect }: {
  pageNumber: number; width: number; aspect: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(pageNumber <= 2);
  useEffect(() => {
    if (show || !ref.current) return;
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setShow(true); io.disconnect(); } },
      { root: null, rootMargin: "1200px" } // null root = the page viewport
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, [show]);
  const ph = Math.round(width * aspect);
  return (
    <div ref={ref} className="pdfpage" style={{ minHeight: ph }}>
      {show && (
        <Page pageNumber={pageNumber} width={width}
          renderTextLayer={false} renderAnnotationLayer={false}
          loading={<div className="pdfpage-ph" style={{ height: ph, width }} />} />
      )}
    </div>
  );
}

export default function PdfView({ src }: { src: string }) {
  const [numPages, setNumPages] = useState(0);
  const [width, setWidth] = useState(820);
  const [aspect, setAspect] = useState(1.294); // US Letter default until measured
  const [err, setErr] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.min(1000, el.clientWidth - 28)));
    ro.observe(el);
    setWidth(Math.min(1000, el.clientWidth - 28));
    return () => ro.disconnect();
  }, []);

  if (err) {
    return (
      <div className="pdfview">
        <p className="muted">Couldn’t render inline. <a href={src} target="_blank" className="pdfopen">Open the PDF ↗</a></p>
      </div>
    );
  }

  return (
    <div className="pdfview" ref={wrapRef}>
      <div className="pdfbar">
        <span className="muted">{numPages ? `${numPages} pages` : "Loading…"} — scroll to read all</span>
        <a href={src} target="_blank" className="pdfopen">Open full PDF ↗</a>
      </div>
      <div className="pdfcanvas">
        <Document file={src}
          onLoadSuccess={(pdf) => {
            setNumPages(pdf.numPages);
            // measure the real page aspect ratio so placeholders reserve exact height
            pdf.getPage(1)
              .then((p: any) => {
                const v = p.getViewport({ scale: 1 });
                if (v.width) setAspect(v.height / v.width);
              })
              .catch(() => {});
          }}
          onLoadError={() => setErr(true)} loading={<p className="muted" style={{ padding: 16 }}>Loading PDF…</p>}>
          {Array.from({ length: numPages }, (_, i) => (
            <LazyPage key={i} pageNumber={i + 1} width={width} aspect={aspect} />
          ))}
        </Document>
      </div>
    </div>
  );
}
