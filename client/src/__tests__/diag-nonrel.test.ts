import { describe, it } from "vitest";
import { detectIntentHybrid } from "../lib/intent-engine";

describe("diag", () => {
  it("diag failing cases", () => {
    const cases = ["credit card declined","I have a new credit card","refill"];
    for (const c of cases) {
      console.log(`"${c}" → ${detectIntentHybrid(c)}`);
    }
  });
});
