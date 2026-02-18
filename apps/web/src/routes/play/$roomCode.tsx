import { FormEvent, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { getRoomState, submitRoomAnswer } from "../../lib/api";
import { useGameStore } from "../../stores/gameStore";

export function PlayPage() {
  const navigate = useNavigate();
  const { roomCode } = useParams({ from: "/play/$roomCode" });
  const session = useGameStore((state) => state.session);
  const [answer, setAnswer] = useState("");

  const roomStateQuery = useQuery({
    queryKey: ["room-state", roomCode],
    queryFn: () => getRoomState(roomCode),
    refetchInterval: 1_500,
  });

  const answerMutation = useMutation({
    mutationFn: () =>
      submitRoomAnswer({
        roomCode,
        playerId: session.playerId ?? "",
        answer: answer.trim(),
      }),
    onSuccess: () => {
      setAnswer("");
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!answer.trim() || !session.playerId) return;
    answerMutation.mutate();
  }

  return (
    <section className="card stack">
      <h2 className="section-title">Partie en cours</h2>
      <p className="section-copy">Room {roomCode}</p>

      <div className="inline-meta">
        <div>État: {roomStateQuery.data?.state ?? "loading"}</div>
        <div>Round: {roomStateQuery.data?.round ?? "-"}</div>
        <div>Joueurs: {roomStateQuery.data?.playerCount ?? "-"}</div>
      </div>

      <form className="stack" onSubmit={onSubmit}>
        <label className="field">
          <span className="label">Ta réponse</span>
          <input
            className="input"
            value={answer}
            onChange={(event) => setAnswer(event.currentTarget.value)}
            placeholder="Titre ou artiste"
            maxLength={80}
            disabled={!session.playerId || answerMutation.isPending}
          />
        </label>

        <div className="button-row">
          <button
            className="btn btn-primary"
            type="submit"
            disabled={!session.playerId || answerMutation.isPending || answer.trim().length === 0}
          >
            {answerMutation.isPending ? "Envoi..." : "Envoyer"}
          </button>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() =>
              navigate({
                to: "/results/$roomCode",
                params: { roomCode },
              })
            }
          >
            Voir les résultats
          </button>
        </div>
      </form>

      <p
        className={
          roomStateQuery.isError || answerMutation.isError || !session.playerId
            ? "status status-error"
            : "status"
        }
      >
        {!session.playerId && "Tu dois rejoindre la room avant de répondre."}
        {roomStateQuery.isError && "Impossible de synchroniser la room."}
        {answerMutation.isError && "Réponse refusée ou invalide."}
        {answerMutation.isSuccess && "Réponse envoyée."}
      </p>
    </section>
  );
}
