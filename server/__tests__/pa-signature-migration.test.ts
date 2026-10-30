import { beforeEach, describe, expect, it, vi } from "vitest";

const { query, release, connect } = vi.hoisted(() => ({
  query: vi.fn(),
  release: vi.fn(),
  connect: vi.fn(),
}));

vi.mock("../db", () => ({
  pool: { connect },
}));

import { runPaSignatureMigration } from "../migrations/pa-signature-columns";

describe("PA signature startup migration", () => {
  beforeEach(() => {
    query.mockReset();
    release.mockReset();
    connect.mockReset();
    connect.mockResolvedValue({ query, release });
  });

  it("does not fail when the PA enum and table are absent", async () => {
    query
      .mockResolvedValueOnce({ rows: [{ enumExists: false }] })
      .mockResolvedValueOnce({ rows: [{ tableExists: false }] });

    await expect(runPaSignatureMigration()).resolves.toBeUndefined();

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls.flat().join("\n")).not.toContain("ALTER TYPE");
    expect(query.mock.calls.flat().join("\n")).not.toContain("ALTER TABLE");
    expect(release).toHaveBeenCalledOnce();
  });
});