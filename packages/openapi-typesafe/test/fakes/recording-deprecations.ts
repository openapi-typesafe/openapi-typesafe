import type { DeprecationReporter } from "../../src/application/ports/deprecation-reporter.js";
import type { DeprecationCode } from "../../src/domain/deprecations.js";

/** An in-memory deprecation reporter that keeps every report (CODING_PRINCIPLES 6.1, rule 7). */
export class RecordingDeprecations implements DeprecationReporter {
  readonly reports: { code: DeprecationCode; message: string }[] = [];

  report(code: DeprecationCode, message: string): void {
    this.reports.push({ code, message });
  }

  codes(): DeprecationCode[] {
    return this.reports.map((report) => report.code);
  }
}
