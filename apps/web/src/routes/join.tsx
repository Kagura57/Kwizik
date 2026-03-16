import { FormEvent, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { usePageSeo } from "../i18n/seo";
import { useCurrentLocale } from "../i18n/useLocale";
import { getPublicRooms, joinRoom } from "../lib/api";
import { notify } from "../lib/notify";
import { useGameStore } from "../stores/gameStore";

function joinErrorMessage(error: unknown, locale: "fr" | "en") {
  if (!(error instanceof Error)) return locale === "en" ? "Unable to join this room." : "Impossible de rejoindre cette room.";
  if (error.message === "ROOM_NOT_JOINABLE") {
    return locale === "en"
      ? "This room is finished and no longer accepts new players."
      : "La room est terminée et n’accepte plus de nouveaux joueurs.";
  }
  return locale === "en" ? "Unable to join this room." : "Impossible de rejoindre cette room.";
}

export function JoinPage() {
  const navigate = useNavigate();
  const locale = useCurrentLocale();
  const setSession = useGameStore((state) => state.setSession);
  const [roomCode, setRoomCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const copy =
    locale === "en"
      ? {
          title: "Join a room",
          subtitle: "The first player in a room becomes the lobby host.",
          roomCode: "Room code",
          nickname: "Nickname",
          nicknamePlaceholder: "Your nickname",
          connecting: "Joining...",
          submit: "Enter the room",
          publicRooms: "Public rooms",
          players: "players",
          use: "Use",
          locked: "Locked",
          joined: "Joined room.",
        }
      : {
          title: "Rejoindre une room",
          subtitle: "Le premier joueur de la room devient host du lobby.",
          roomCode: "Code room",
          nickname: "Pseudo",
          nicknamePlaceholder: "Ton pseudo",
          connecting: "Connexion...",
          submit: "Entrer dans la room",
          publicRooms: "Rooms publiques",
          players: "joueurs",
          use: "Utiliser",
          locked: "Locked",
          joined: "Room rejointe.",
        };
  usePageSeo({
    title: locale === "en" ? "Join an anime quiz room | Kwizik" : "Rejoindre une room anime | Kwizik",
    description:
      locale === "en"
        ? "Join an existing Kwizik anime blind test room with a code."
        : "Rejoins une room Kwizik existante avec un code pour jouer au blind test anime.",
    locale,
    path: "/join",
    noindex: true,
  });

  const publicRoomsQuery = useQuery({
    queryKey: ["public-rooms"],
    queryFn: getPublicRooms,
    refetchInterval: 4_000,
  });

  const joinMutation = useMutation({
    mutationFn: () =>
      joinRoom({
        roomCode: roomCode.trim().toUpperCase(),
        displayName: displayName.trim(),
      }),
    onSuccess: (result) => {
      const normalizedCode = roomCode.trim().toUpperCase();
      notify.success(copy.joined);
      setSession({
        roomCode: normalizedCode,
        playerId: result.playerId,
        displayName: displayName.trim(),
      });

      navigate({
        to: "/$locale/room/$roomCode/play",
        params: { locale, roomCode: normalizedCode },
      });
    },
    onError: (error) => {
      notify.error(joinErrorMessage(error, locale), {
        key: "join-page:join:error",
      });
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!roomCode.trim() || !displayName.trim()) return;
    joinMutation.mutate();
  }

  return (
    <section className="single-panel">
      <article className="panel-card">
        <h2 className="panel-title">{copy.title}</h2>
        <p className="panel-copy">{copy.subtitle}</p>

        <form className="panel-form" onSubmit={onSubmit}>
          <label>
            <span>{copy.roomCode}</span>
            <input
              value={roomCode}
              onChange={(event) => setRoomCode(event.currentTarget.value)}
              maxLength={6}
              placeholder="ABC123"
            />
          </label>

          <label>
            <span>{copy.nickname}</span>
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.currentTarget.value)}
              maxLength={24}
              placeholder={copy.nicknamePlaceholder}
            />
          </label>

          <button className="solid-btn" type="submit" disabled={joinMutation.isPending}>
            {joinMutation.isPending ? copy.connecting : copy.submit}
          </button>
        </form>
        <h3 className="panel-title">{copy.publicRooms}</h3>
        <ul className="public-room-list">
          {(publicRoomsQuery.data?.rooms ?? []).map((room) => (
            <li key={room.roomCode}>
              <div>
                <strong>{room.roomCode}</strong>
                <p>
                  {room.state} - {room.playerCount} {copy.players}
                </p>
              </div>
              <button
                className="ghost-btn"
                type="button"
                disabled={!room.canJoin}
                onClick={() => setRoomCode(room.roomCode)}
              >
                {room.canJoin ? copy.use : copy.locked}
              </button>
            </li>
          ))}
        </ul>
      </article>
    </section>
  );
}
