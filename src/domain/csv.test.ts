import { describe, expect, it } from "vitest";
import { csvCell, rupeesCell, toCsv } from "@/domain/csv";

describe("csv", () => {
  it("quotes commas, quotes and line breaks", () => {
    expect(csvCell('Kumar, "Arjun"')).toBe('"Kumar, ""Arjun"""');
    expect(csvCell("a\nb")).toBe('"a\nb"');
  });
  it("defuses text a spreadsheet would run as a formula, but leaves numbers alone", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvCell("+91 98200")).toBe("'+91 98200");
    expect(csvCell(-5)).toBe("-5");
  });
  it("writes a header and rows with CRLF line ends", () => expect(toCsv(["a", "b"], [[1, "x"], [null, undefined]])).toBe("a,b\r\n1,x\r\n,\r\n"));
  it("writes rupees as plain numbers with two decimals", () => expect(rupeesCell(248600)).toBe("2486.00"));
});
