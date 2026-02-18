import { describe, expect, it } from "vitest";
import { app } from "../src/index";

describe("quiz routes", () => {
  it("creates a room", async () => {
    const res = await app.handle(new Request("http://localhost/quiz/create", { method: "POST" }));
    expect(res.status).toBe(200);
    const payload = (await res.json()) as { roomCode: string };
    expect(payload.roomCode).toMatch(/^[A-Z2-9]{6}$/);
  });
});
