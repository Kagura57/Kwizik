import { Elysia } from "elysia";

export const quizRoutes = new Elysia({ prefix: "/quiz" })
  .post("/create", () => ({ roomCode: "ABCD12" }))
  .post("/join", () => ({ ok: true }))
  .post("/start", () => ({ ok: true }))
  .post("/answer", () => ({ accepted: true }))
  .get("/results/:roomCode", ({ params }) => ({ roomCode: params.roomCode, ranking: [] }));
