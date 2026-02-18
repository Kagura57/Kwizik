import { describe, expect, it } from "vitest";
import { app } from "../src/index";

describe("room snapshot", () => {
  it("returns room state for resync", async () => {
    const res = await app.handle(new Request("http://localhost/room/ABCD12/state"));
    expect(res.status).toBe(200);
  });
});
