import { describe, expect, it } from "vitest";
import { app } from "../src/index";

describe("room snapshot", () => {
  it("returns room state for resync", async () => {
    const createRes = await app.handle(
      new Request("http://localhost/quiz/create", {
        method: "POST",
      }),
    );
    const created = (await createRes.json()) as { roomCode: string };

    const res = await app.handle(new Request(`http://localhost/room/${created.roomCode}/state`));
    expect(res.status).toBe(200);
    const payload = (await res.json()) as {
      roomCode: string;
      state: string;
      round: number;
      playerCount: number;
      poolSize: number;
      categoryQuery: string;
    };
    expect(payload.roomCode).toBe(created.roomCode);
    expect(payload.state).toBe("waiting");
    expect(payload.round).toBe(0);
    expect(payload.playerCount).toBe(0);
    expect(payload.poolSize).toBe(0);
    expect(payload.categoryQuery).toBe("anilist:linked:union");
  });

  it("updates source mode to random_classic through quiz source mode route and persists snapshot", async () => {
    const createRes = await app.handle(
      new Request("http://localhost/quiz/create", {
        method: "POST",
      }),
    );
    const created = (await createRes.json()) as { roomCode: string };

    const joinRes = await app.handle(
      new Request("http://localhost/quiz/join", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          roomCode: created.roomCode,
          displayName: "Host",
        }),
      }),
    );
    expect(joinRes.status).toBe(200);
    const joined = (await joinRes.json()) as {
      ok: true;
      playerId: string;
    };

    const modeRes = await app.handle(
      new Request("http://localhost/quiz/source/mode", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          roomCode: created.roomCode,
          playerId: joined.playerId,
          mode: "random_classic",
        }),
      }),
    );
    expect(modeRes.status).toBe(200);
    const modePayload = (await modeRes.json()) as {
      ok: true;
      mode: string;
    };
    expect(modePayload.mode).toBe("random_classic");

    const stateRes = await app.handle(new Request(`http://localhost/room/${created.roomCode}/state`));
    expect(stateRes.status).toBe(200);
    const payload = (await stateRes.json()) as {
      sourceMode: string;
      categoryQuery: string;
    };
    expect(payload.sourceMode).toBe("random_classic");
    expect(payload.categoryQuery).toBe("anilist:random:classic");
  });

  it("updates the AniList difficulty filter through the quiz settings route", async () => {
    const createRes = await app.handle(
      new Request("http://localhost/quiz/create", {
        method: "POST",
      }),
    );
    const created = (await createRes.json()) as { roomCode: string };

    const joinRes = await app.handle(
      new Request("http://localhost/quiz/join", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          roomCode: created.roomCode,
          displayName: "Host",
        }),
      }),
    );
    expect(joinRes.status).toBe(200);
    const joined = (await joinRes.json()) as {
      ok: true;
      playerId: string;
    };

    const updateRes = await app.handle(
      new Request("http://localhost/quiz/settings/difficulty", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          roomCode: created.roomCode,
          playerId: joined.playerId,
          filter: "medium",
        }),
      }),
    );
    expect(updateRes.status).toBe(200);
    const updated = (await updateRes.json()) as {
      ok: true;
      filter: string;
    };
    expect(updated.filter).toBe("medium");

    const stateRes = await app.handle(new Request(`http://localhost/room/${created.roomCode}/state`));
    expect(stateRes.status).toBe(200);
    const payload = (await stateRes.json()) as {
      sourceConfig: {
        difficultyFilter: string;
      };
    };
    expect(payload.sourceConfig.difficultyFilter).toBe("medium");
  });

  it("updates AniList content filters through the quiz settings route", async () => {
    const createRes = await app.handle(
      new Request("http://localhost/quiz/create", {
        method: "POST",
      }),
    );
    const created = (await createRes.json()) as { roomCode: string };

    const joinRes = await app.handle(
      new Request("http://localhost/quiz/join", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          roomCode: created.roomCode,
          displayName: "Host",
        }),
      }),
    );
    expect(joinRes.status).toBe(200);
    const joined = (await joinRes.json()) as {
      ok: true;
      playerId: string;
    };

    const updateRes = await app.handle(
      new Request("http://localhost/quiz/settings/content-filters", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          roomCode: created.roomCode,
          playerId: joined.playerId,
          decades: [1990, 2010],
          genres: ["Action", "Mystery"],
        }),
      }),
    );
    expect(updateRes.status).toBe(200);
    const updated = (await updateRes.json()) as {
      ok: true;
      contentFilters: {
        decades: number[];
        genres: string[];
      };
    };
    expect(updated.contentFilters).toEqual({
      decades: [1990, 2010],
      genres: ["Action", "Mystery"],
    });

    const stateRes = await app.handle(new Request(`http://localhost/room/${created.roomCode}/state`));
    expect(stateRes.status).toBe(200);
    const payload = (await stateRes.json()) as {
      sourceConfig: {
        contentFilters: {
          decades: number[];
          genres: string[];
        };
      };
    };
    expect(payload.sourceConfig.contentFilters).toEqual({
      decades: [1990, 2010],
      genres: ["Action", "Mystery"],
    });
  });

  it("updates the lives settings through the quiz settings route", async () => {
    const createRes = await app.handle(
      new Request("http://localhost/quiz/create", {
        method: "POST",
      }),
    );
    const created = (await createRes.json()) as { roomCode: string };

    const joinRes = await app.handle(
      new Request("http://localhost/quiz/join", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          roomCode: created.roomCode,
          displayName: "Host",
        }),
      }),
    );
    expect(joinRes.status).toBe(200);
    const joined = (await joinRes.json()) as {
      ok: true;
      playerId: string;
    };

    const updateRes = await app.handle(
      new Request("http://localhost/quiz/settings/lives", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          roomCode: created.roomCode,
          playerId: joined.playerId,
          livesMode: true,
          maxLives: 2,
        }),
      }),
    );
    expect(updateRes.status).toBe(200);
    const updated = (await updateRes.json()) as {
      ok: true;
      livesMode: boolean;
      maxLives: number;
    };
    expect(updated).toMatchObject({
      livesMode: true,
      maxLives: 2,
    });

    const stateRes = await app.handle(new Request(`http://localhost/room/${created.roomCode}/state`));
    expect(stateRes.status).toBe(200);
    const payload = (await stateRes.json()) as {
      livesMode: boolean;
      maxLives: number;
    };
    expect(payload).toMatchObject({
      livesMode: true,
      maxLives: 2,
    });
  });
});
