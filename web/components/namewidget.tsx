"use client";
import { useEffect, useState } from "react";

// Session-wide name shown in the header. Entered once, solidifies on Enter,
// re-editable via the edit button, and attached to the person's contributions.
export const NAME_KEY = "explorer_name";

export default function NameWidget() {
  const [name, setName] = useState("");
  const [editing, setEditing] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem(NAME_KEY) || "";
    setName(saved);
    setEditing(!saved.trim()); // already named -> show solidified
  }, []);

  const save = (v: string) => {
    setName(v);
    localStorage.setItem(NAME_KEY, v.trim());
    window.dispatchEvent(new CustomEvent("explorer-name", { detail: v.trim() }));
  };
  const solidify = () => { if (name.trim()) setEditing(false); };

  if (editing) {
    return (
      <div className="namebox editing" title="Type your name, then press Enter">
        <span className="nameicon">👤</span>
        <input
          className="nameinput"
          placeholder="Enter your name"
          value={name}
          autoFocus
          onChange={(e) => save(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); solidify(); } }}
          aria-label="Your name"
        />
        {name.trim() && <button className="nameok" onClick={solidify} title="Save (Enter)">✓</button>}
      </div>
    );
  }
  return (
    <div className="namebox solid" title="Your name — attached to analyses you contribute">
      <span className="nameicon">👤</span>
      <span className="namedisplay">{name}</span>
      <button className="nameedit" onClick={() => setEditing(true)}>edit</button>
    </div>
  );
}
