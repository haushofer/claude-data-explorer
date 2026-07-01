// ---------------------------------------------------------------------------
// THE ONE FILE YOU EDIT.
//
// Everything user-facing about your explorer lives here: the title, the dataset
// filename, the one-paragraph description the AI agent is given, and the example
// prompts. Secrets (ANTHROPIC_API_KEY, SITE_PASSWORD) and machine paths
// (VENV_PYTHON) are NOT here — those go in web/.env.local (see .env.example).
//
// This module is imported by client, edge, and server code, so keep it free of
// Node-only APIs (no `fs`, no `path`, no `process.env`).
// ---------------------------------------------------------------------------

export const SITE = {
  // Shown in the browser tab, the nav bar, and the login screen.
  title: "Data Explorer",
  brand: "Data Explorer",
  description:
    "Explore this dataset and run your own analyses with an AI data-analysis agent.",
};

export const DATASET = {
  // The CSV that lives in data/public/. This is the file the agent analyzes and
  // that visitors can download. Replace it with your own and update this name.
  file: "example.csv",
  // The filename offered when a visitor clicks "Download".
  downloadAs: "example.csv",
  // One factual paragraph describing the dataset. It is injected verbatim into
  // the agent's system prompt so it knows what it is analyzing. Mention the unit
  // of observation, the key variables, and anything the agent must not assume.
  // The agent is ALSO given data_dictionary.md, so you don't need to list every
  // column here — just the orientation.
  description:
    "A tabular dataset with one row per observation. Read data_dictionary.md for " +
    "the meaning of every column before analyzing.",
};

// Shown as clickable suggestions in the "Analyze" box. Write a few that fit your
// data — they teach visitors what kinds of questions work.
export const EXAMPLE_PROMPTS: string[] = [
  "Summarize the dataset: how many rows and columns, and what are the key variables?",
  "Show the distribution of the main outcome variable as a histogram.",
  "Which variables are most strongly correlated with the primary outcome?",
  "Compare the outcome across the main groups and test whether the difference is significant.",
];

// The placeholder text inside the analysis box.
export const ANALYZE_PLACEHOLDER =
  "e.g. Summarize the dataset and plot the distribution of the main outcome.";
