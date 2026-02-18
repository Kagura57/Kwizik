import { Elysia } from "elysia";
import { quizRoutes } from "./routes/quiz";
import { roomRoutes } from "./routes/room";

export const app = new Elysia().use(quizRoutes).use(roomRoutes);
