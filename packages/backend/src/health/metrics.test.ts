import { describe, expect, it } from "vitest";
import { renderPrometheus } from "./metrics.js";

describe("Prometheus rendering", () => {
  it("renders help, type and escaped labels", () => {
    const text = renderPrometheus([
      { name: "advo_ledger_balanced", help: "1 when balanced", samples: [{ value: 1 }] },
      { name: "advo_controller_reachable", help: "Reachability", samples: [{ labels: { controller: 'Lab "A"', mode: "LIVE" }, value: 0 }] },
      { name: "advo_withdrawals", help: "No rows yet", samples: [] },
    ]);
    expect(text).toBe(
      [
        "# HELP advo_ledger_balanced 1 when balanced",
        "# TYPE advo_ledger_balanced gauge",
        "advo_ledger_balanced 1",
        "# HELP advo_controller_reachable Reachability",
        "# TYPE advo_controller_reachable gauge",
        'advo_controller_reachable{controller="Lab \\"A\\"",mode="LIVE"} 0',
        "# HELP advo_withdrawals No rows yet",
        "# TYPE advo_withdrawals gauge",
        "",
      ].join("\n"),
    );
  });
});
