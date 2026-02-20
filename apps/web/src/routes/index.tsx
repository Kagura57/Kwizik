import { FormEvent, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { createRoom, getPublicRooms, joinRoom, type PublicRoomSummary } from "../lib/api";
import { useGameStore } from "../stores/gameStore";

function formatRoomLabel(room: PublicRoomSummary) {
  const roundLabel = room.totalRounds > 0 ? `${room.round}/${room.totalRounds}` : "lobby";
  const source = room.categoryQuery.trim().length > 0 ? room.categoryQuery : "playlist non choisie";
  return `${room.state} - ${room.playerCount} joueurs - ${roundLabel} - ${source}`;
}

export function HomePage() {
  const navigate = useNavigate();
  const setSession = useGameStore((state) => state.setSession);
  const [displayName, setDisplayName] = useState("Player One");
  const [isPublicRoom, setIsPublicRoom] = useState(true);

  const publicRoomsQuery = useQuery({
    queryKey: ["public-rooms"],
    queryFn: getPublicRooms,
    refetchInterval: 4_000,
  });

  const createRoomMutation = useMutation({
    mutationFn: async () => {
      const created = await createRoom({
        isPublic: isPublicRoom,
      });

      const joined = await joinRoom({
        roomCode: created.roomCode,
        displayName: displayName.trim() || "Player One",
      });

      return {
        roomCode: created.roomCode,
        playerId: joined.playerId,
      };
    },
    onSuccess: (result) => {
      setSession({
        roomCode: result.roomCode,
        playerId: result.playerId,
        displayName: displayName.trim() || "Player One",
        categoryQuery: "",
      });
      navigate({
        to: "/room/$roomCode/play",
        params: { roomCode: result.roomCode },
      });
    },
  });

  const quickJoinMutation = useMutation({
    mutationFn: async (room: PublicRoomSummary) => {
      const joined = await joinRoom({
        roomCode: room.roomCode,
        displayName: displayName.trim() || "Player One",
      });
      return { room, joined };
    },
    onSuccess: ({ room, joined }) => {
      setSession({
        roomCode: room.roomCode,
        playerId: joined.playerId,
        displayName: displayName.trim() || "Player One",
        categoryQuery: room.categoryQuery,
      });
      navigate({
        to: "/room/$roomCode/play",
        params: { roomCode: room.roomCode },
      });
    },
  });

  function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createRoomMutation.mutate();
  }

  return (
    <section className="home-grid home-grid-balanced">
      <article className="panel-card">
        <h2 className="panel-title">Créer un lobby</h2>
        <form className="panel-form" onSubmit={onCreate}>
          <label>
            <span>Pseudo</span>
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.currentTarget.value)}
              maxLength={24}
              placeholder="Ton pseudo"
            />
          </label>

          <div className="field-block">
            <span className="field-label">Visibilité</span>
            <div className="source-preset-grid">
              <button
                type="button"
                className={`source-preset-btn${isPublicRoom ? " active" : ""}`}
                onClick={() => setIsPublicRoom(true)}
              >
                <strong>Partie publique</strong>
                <span>Visible dans la liste publique</span>
              </button>
              <button
                type="button"
                className={`source-preset-btn${!isPublicRoom ? " active" : ""}`}
                onClick={() => setIsPublicRoom(false)}
              >
                <strong>Partie privée</strong>
                <span>Accessible avec le code room</span>
              </button>
            </div>
          </div>

          <p className="status">
            Le host choisit la playlist dans le lobby, puis lance seulement quand tout le monde est prêt.
          </p>

          <button id="create-room" className="solid-btn" type="submit" disabled={createRoomMutation.isPending}>
            {createRoomMutation.isPending ? "Création..." : "Créer le lobby"}
          </button>
        </form>

        <p className={createRoomMutation.isError ? "status error" : "status"}>
          {createRoomMutation.isError && "Impossible de créer la room."}
        </p>

        <Link className="text-link" to="/join">
          J’ai déjà un code room
        </Link>
      </article>

      <article className="panel-card">
        <h2 className="panel-title">Parties publiques</h2>
        <p className="panel-copy">Rejoins un lobby ou une partie publique active.</p>
        <ul className="public-room-list">
          {(publicRoomsQuery.data?.rooms ?? []).map((room) => (
            <li key={room.roomCode}>
              <div>
                <strong>{room.roomCode}</strong>
                <p>{formatRoomLabel(room)}</p>
              </div>
              <button
                className="ghost-btn"
                type="button"
                disabled={quickJoinMutation.isPending || !room.canJoin}
                onClick={() => quickJoinMutation.mutate(room)}
              >
                {room.canJoin ? "Rejoindre" : "Indisponible"}
              </button>
            </li>
          ))}
        </ul>
        {publicRoomsQuery.data?.rooms.length === 0 && (
          <p className="status">Aucune partie publique active pour le moment.</p>
        )}
      </article>
    </section>
  );
}
