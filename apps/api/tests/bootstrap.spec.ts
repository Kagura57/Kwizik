import { describe, expect, it } from "vitest";
import { app } from "../src/index";

describe("bootstrap", () => {
  it("builds an Elysia app instance", () => {
    expect(app).toBeDefined();
  });
});
