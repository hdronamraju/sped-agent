import Papa from "papaparse";

export type Cell = string | number | Date | null;

export interface Sheet {
  name: string;
  rows: Cell[][];
}

export interface ParsedFile {
  fileName: string;
  sheets: Sheet[];
}

export async function parseFile(fileName: string, data: ArrayBuffer): Promise<ParsedFile> {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xlsm")) {
    return { fileName, sheets: await parseXlsx(data) };
  }
  if (lower.endsWith(".xls")) {
    throw new Error("Old .xls files aren't supported. In Excel, use File → Save As → .xlsx or .csv.");
  }
  const text = new TextDecoder("utf-8").decode(data).replace(/^﻿/, "");
  return { fileName, sheets: [parseCsvText(text, fileName)] };
}

export function parseCsvText(text: string, name = "Sheet1"): Sheet {
  const res = Papa.parse<string[]>(text, { skipEmptyLines: "greedy" });
  return { name, rows: res.data.map((r) => r.map((c) => (c === "" ? null : c))) };
}

async function parseXlsx(data: ArrayBuffer): Promise<Sheet[]> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data);
  const sheets: Sheet[] = [];
  wb.eachSheet((ws) => {
    const rows: Cell[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const out: Cell[] = [];
      for (let c = 1; c <= ws.columnCount; c++) out.push(cellValue(row.getCell(c).value));
      rows.push(out);
    });
    if (rows.length) sheets.push({ name: ws.name, rows });
  });
  return sheets;
}

function cellValue(v: unknown): Cell {
  if (v == null) return null;
  if (v instanceof Date || typeof v === "number" || typeof v === "string") return v;
  if (typeof v === "boolean") return String(v);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("result" in o) return cellValue(o.result);
    if ("richText" in o && Array.isArray(o.richText)) return o.richText.map((t: { text: string }) => t.text).join("");
    if ("text" in o) return cellValue(o.text);
  }
  return String(v);
}
