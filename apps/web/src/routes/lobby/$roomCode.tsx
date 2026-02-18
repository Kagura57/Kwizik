import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { getRoomState, startRoom } from "../../lib/api";
import { useGameStore } from "../../stores/gameStore";

export function LobbyPage() {
  const navigate = useNavigate();
  const { roomCode } = useParams({ from: "/lobby/$roomCode" });
  const session = useGameStore((state) => state.session);
  const canStart = session.isHost && session.roomCode === roomCode;

  const roomStateQuery = useQuery({
    queryKey: ["room-state", roomCode],
    queryFn: () => getRoomState(roomCode),
    refetchInterval: 2_000,
  });

  const startMutation = useMutation({
    mutationFn: () =>
      startRoom({
        roomCode,
        categoryQuery: session.categoryQuery || "popular hits",
      }),
    onSuccess: () => {
      roomStateQuery.refetch();
    },
  });

  const state = roomStateQuery.data;

  return (
    <section className="card stack">
      <h2 className="section-title">Lobby {roomCode}</h2>
      <p className="section-copy">Les joueurs se regroupent ici avant le lancement de la partie.</p>

      <div className="inline-meta">
        <div>État: {state?.state ?? "loading"}</div>
        <div>Joueurs: {state?.playerCount ?? "-"}</div>
        <div>Pool préchargé: {state?.poolSize ?? "-"}</div>
        <div>Catégorie: {state?.categoryQuery ?? session.categoryQuery}</div>
      </div>

      <div className="button-row">
        {canStart && (
          <button
            className="btn btn-primary"
            onClick={() => startMutation.mutate()}
            disabled={startMutation.isPending}
          >
            {startMutation.isPending ? "Lancement..." : "Démarrer la partie"}
          </button>
        )}
        <button className="btn btn-secondary" onClick={() => roomStateQuery.refetch()}>
          Rafraîchir
        </button>
        <button
          className="btn btn-secondary"
          onClick={() =>
            navigate({
              to: "/play/$roomCode",
              params: { roomCode },
            })
          }
        >
          Aller au jeu
        </button>
      </div>

      <p
        className={
          roomStateQuery.isError || startMutation.isError ? "status status-error" : "status"
        }
      >
        {roomStateQuery.isLoading && "Synchronisation du lobby..."}
        {roomStateQuery.isError && "Impossible de charger l'état de la room."}
        {startMutation.isError && "Le lancement a échoué."}
        {startMutation.isSuccess && "Partie démarrée. Passe sur l'écran de jeu."}
      </p>
    </section>
  );
}
