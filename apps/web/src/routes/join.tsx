import { FormEvent, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { motion, useReducedMotion } from "motion/react";
import { formatJoinRoomState, getJoinCopy, getJoinErrorMessage } from "../i18n/copy/join";
import { usePageSeo } from "../i18n/seo";
import { useCurrentLocale } from "../i18n/useLocale";
import { impactHeroVariants, impactPageVariants } from "../lib/impactMotion";
import { getPublicRooms, joinRoom } from "../lib/api";
import { notify } from "../lib/notify";
import { useGameStore } from "../stores/gameStore";

export function JoinPage() {
  const navigate = useNavigate();
  const locale = useCurrentLocale();
  const setSession = useGameStore((state) => state.setSession);
  const [roomCode, setRoomCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const reduceMotion = useReducedMotion();
  const copy = getJoinCopy(locale);
  const stageMotion = reduceMotion
    ? {}
    : ({
        initial: "hidden",
        animate: "show",
      } as const);
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
      notify.error(getJoinErrorMessage(error, locale), {
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
    <motion.section className="single-panel" variants={impactPageVariants} {...stageMotion}>
      <motion.article className="panel-card" variants={impactHeroVariants}>
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
                  {formatJoinRoomState(room.state, locale)} - {room.playerCount} {copy.players}
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
      </motion.article>
    </motion.section>
  );
}
