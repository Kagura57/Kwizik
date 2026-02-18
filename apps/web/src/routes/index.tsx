import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { createRoomWithFallback, joinRoom } from "../lib/api";
import { useGameStore } from "../stores/gameStore";

type CreateFlowResult = {
  roomCode: string;
  source: "api" | "fallback";
  playerId: string | null;
};

export function HomePage() {
  const navigate = useNavigate();
  const setSession = useGameStore((state) => state.setSession);
  const [displayName, setDisplayName] = useState("Host");
  const [categoryQuery, setCategoryQuery] = useState("popular hits");

  const createRoomMutation = useMutation({
    mutationFn: async (): Promise<CreateFlowResult> => {
      const created = await createRoomWithFallback();

      if (created.source !== "api") {
        return { roomCode: created.roomCode, source: created.source, playerId: null };
      }

      const joined = await joinRoom({
        roomCode: created.roomCode,
        displayName: displayName.trim() || "Host",
      });

      return {
        roomCode: created.roomCode,
        source: created.source,
        playerId: joined.playerId,
      };
    },
    onSuccess: (result) => {
      if (!result.playerId) return;
      setSession({
        roomCode: result.roomCode,
        playerId: result.playerId,
        displayName: displayName.trim() || "Host",
        isHost: true,
        categoryQuery: categoryQuery.trim() || "popular hits",
      });

      navigate({
        to: "/lobby/$roomCode",
        params: { roomCode: result.roomCode },
      });
    },
  });

  const status = createRoomMutation.data;
  const statusClass = createRoomMutation.isError
    ? "status status-error"
    : createRoomMutation.isSuccess
      ? "status status-success"
      : "status";

  return (
    <section className="card stack">
      <h2 className="section-title">Créer une partie</h2>
      <p className="section-copy">Démarre une room, puis lance la partie depuis le lobby.</p>

      <label className="field">
        <span className="label">Ton pseudo</span>
        <input
          className="input"
          value={displayName}
          onChange={(event) => setDisplayName(event.currentTarget.value)}
          maxLength={24}
          placeholder="Host"
        />
      </label>

      <label className="field">
        <span className="label">Catégorie musicale</span>
        <input
          className="input"
          value={categoryQuery}
          onChange={(event) => setCategoryQuery(event.currentTarget.value)}
          maxLength={40}
          placeholder="popular hits"
        />
      </label>

      <div className="button-row">
        <button
          id="create-room"
          className="btn btn-primary"
          onClick={() => createRoomMutation.mutate()}
          disabled={createRoomMutation.isPending}
        >
          {createRoomMutation.isPending ? "Création..." : "Créer une room"}
        </button>
        <Link className="btn btn-secondary" to="/join">
          Rejoindre une room
        </Link>
      </div>

      <p id="status" className={statusClass}>
        {createRoomMutation.isPending && "Création de la room..."}
        {createRoomMutation.isError && "Impossible de créer la room."}
        {createRoomMutation.isSuccess && `Room créée (${status?.source}) : ${status?.roomCode}`}
        {!createRoomMutation.isPending &&
          !createRoomMutation.isError &&
          !createRoomMutation.isSuccess &&
          "Prêt pour une nouvelle partie."}
      </p>

      {status?.source === "fallback" && (
        <p className="status">API indisponible: code local généré pour le mode dev.</p>
      )}
    </section>
  );
}
