import path from "path";

// Repo root = parent of web/
export const REPO_ROOT = path.resolve(process.cwd(), "..");
export const DATA_DIR = path.join(REPO_ROOT, "data", "public");
export const RUNS_DIR = path.join(process.cwd(), "runs");
export const DB_PATH = path.join(process.cwd(), "gallery.db");

// Python interpreter with pandas/numpy/matplotlib/seaborn preinstalled.
// Override with VENV_PYTHON on the server (e.g. a conda env path).
export const VENV_PYTHON =
  process.env.VENV_PYTHON || path.join(REPO_ROOT, ".venv", "bin", "python");

// --- guardrails for the live audience ---
export const LIMITS = {
  maxTurns: 24, // agent reasoning/tool turns per analysis
  timeoutMs: 180_000, // hard wall-clock cap per analysis (3 min)
};
