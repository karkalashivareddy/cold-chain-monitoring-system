import { describe, expect, it } from "vitest";
import { sanitizeDownloadFilename, sanitizeSpreadsheetCell } from "../src/modules/reports/reports.service";

describe("CSV spreadsheet formula protection", () => {
  it.each(["=1+1", "+1+1", "-1+1", "@SUM(A1:A2)", "  =HYPERLINK(\"https://example.invalid\")", "\t=1+1", "\uFEFF=1+1"])(
    "neutralizes formula-like value %s",
    (value) => {
      expect(sanitizeSpreadsheetCell(value)).toBe(`'${value}`);
    }
  );

  it("leaves ordinary text and numeric values' string representations alone", () => {
    expect(sanitizeSpreadsheetCell("FG-BATCH-001")).toBe("FG-BATCH-001");
    expect(sanitizeSpreadsheetCell("4.25")).toBe("4.25");
  });

  it("removes header delimiters and path characters from download filenames", () => {
    expect(sanitizeDownloadFilename('../../batch\r\nX-Evil: injected.csv')).toBe("batch__X-Evil__injected.csv");
    expect(sanitizeDownloadFilename('..\\..\\batch"name.csv')).toBe("batch_name.csv");
    expect(sanitizeDownloadFilename("../../")).toBe("frostguard-report.csv");
  });
});
