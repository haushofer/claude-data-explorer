import { NextResponse } from "next/server";
import { readDictionary } from "@/lib/data";

export const runtime = "nodejs";

// column -> { description, non_null } for the dataset table header.
export async function GET() {
  const map: Record<string, { description: string; non_null: number }> = {};
  for (const d of readDictionary()) map[d.column] = { description: d.description, non_null: d.non_null };
  return NextResponse.json(map, { headers: { "cache-control": "public, max-age=3600" } });
}
