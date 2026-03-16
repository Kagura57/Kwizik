import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toRomaji } from "wanakana";
import { usePageSeo } from "../i18n/seo";
import { useCurrentLocale } from "../i18n/useLocale";
import { createRoom, getPublicRooms, joinRoom } from "../lib/api";
import { notify } from "../lib/notify";
import { useGameStore } from "../stores/gameStore";

function withRomajiLabel(value: string) {
  if (!value) return value;
  const romaji = toRomaji(value).trim();
  if (!romaji || romaji.toLowerCase() === value.toLowerCase()) return value;
  return romaji;
}

function joinErrorMessage(error: unknown, locale: "fr" | "en") {
  if (!(error instanceof Error)) {
    return locale === "en" ? "Unable to join this room." : "Impossible de rejoindre cette room.";
  }
  if (error.message === "ROOM_NOT_JOINABLE") {
    return locale === "en"
      ? "This room is finished and no longer accepts new players."
      : "La room est terminée et n’accepte plus de nouveaux joueurs.";
  }
  return locale === "en" ? "Unable to join this room." : "Impossible de rejoindre cette room.";
}

export function HomePage() {
  const navigate = useNavigate();
  const locale = useCurrentLocale();
  const setSession = useGameStore((state) => state.setSession);
  const session = useGameStore((state) => state.session);
  const account = useGameStore((state) => state.account);
  const [createDisplayName, setCreateDisplayName] = useState("Player One");
  const [joinDisplayName, setJoinDisplayName] = useState("Player One");
  const [joinRoomCode, setJoinRoomCode] = useState("");
  const [isPublicRoom, setIsPublicRoom] = useState(true);
  const copy =
    locale === "en"
      ? {
          joinTitle: "Join a room",
          joinSubtitle: "The first player in a room becomes the lobby host.",
          roomCode: "Room code",
          nickname: "Nickname",
          nicknamePlaceholder: "Your nickname",
          joining: "Joining...",
          enterRoom: "Enter the room",
          createTitle: "Create a room",
          createSubtitle: "Create a lobby in one click, choose visibility, then launch the game.",
          syncHint:
            "Tip: sign in, then add your AniList username in Settings to sync your anime library.",
          visibility: "Visibility",
          publicGame: "Public game",
          publicGameHint: "Visible in the public list",
          privateGame: "Private game",
          privateGameHint: "Accessible with the room code",
          hostHint: "The host configures the AniList mode and themes, then starts when everyone is ready.",
          creating: "Creating...",
          createRoom: "Create a room",
          publicRooms: "Public rooms",
          players: "players",
          mode: "Mode",
          synchronizedAniList: "Synced AniList",
          anime: "Anime",
          joinPublicRoom: "Join",
          closed: "Closed",
          roomCreated: "Room created.",
          roomJoined: "Joined room.",
          createError: "Unable to create the room.",
          promptNickname: "Choose a nickname to join this room",
          seoH1: "Anime Blind Test Online for Multiplayer Rooms",
          seoLead:
            "Kwizik lets you create a live anime blind test room, challenge friends on openings and endings, and launch the game instantly in your browser.",
          howItWorksTitle: "How Kwizik works",
          howItWorksBody:
            "Create a room, pick your anime source, invite players with a short code, then start a real-time blind test with shared playback and live scoring.",
          whyTitle: "Why anime fans use Kwizik",
          whyBody:
            "Kwizik mixes public rooms, private lobbies, AniList-based playlists, and live multiplayer gameplay for anime quiz nights with friends or communities.",
          faqTitle: "FAQ",
          faqQ1: "Can I play an anime blind test with friends online?",
          faqA1:
            "Yes. Create a room, share the code, and everyone can join from their browser before the host starts the match.",
          faqQ2: "Does Kwizik support anime openings and endings?",
          faqA2:
            "Yes. Hosts can configure the theme mode and build games around openings, endings, or mixed anime theme rounds.",
        }
      : {
          joinTitle: "Rejoindre une room",
          joinSubtitle: "Le premier joueur de la room devient host du lobby.",
          roomCode: "Code room",
          nickname: "Pseudo",
          nicknamePlaceholder: "Ton pseudo",
          joining: "Connexion...",
          enterRoom: "Entrer dans la room",
          createTitle: "Créer une room",
          createSubtitle: "Crée un lobby en un clic, choisis la visibilité, puis lance la partie.",
          syncHint:
            "Astuce: connecte-toi puis renseigne ton pseudo AniList dans Settings pour synchroniser ta liste anime.",
          visibility: "Visibilité",
          publicGame: "Partie publique",
          publicGameHint: "Visible dans la liste publique",
          privateGame: "Partie privée",
          privateGameHint: "Accessible avec le code room",
          hostHint: "Le host configure le mode AniList et les themes, puis lance quand tout le monde est pret.",
          creating: "Création...",
          createRoom: "Créer une room",
          publicRooms: "Rooms publiques",
          players: "joueurs",
          mode: "Mode",
          synchronizedAniList: "AniList synchronise",
          anime: "Anime",
          joinPublicRoom: "Rejoindre",
          closed: "Fermée",
          roomCreated: "Room créée.",
          roomJoined: "Room rejointe.",
          createError: "Impossible de créer la room.",
          promptNickname: "Choisis un pseudo pour rejoindre cette room",
          seoH1: "Blind Test Anime en ligne pour jouer en multijoueur",
          seoLead:
            "Kwizik te permet de créer une room de blind test anime, de défier tes amis sur des openings et endings, puis de lancer la partie directement dans le navigateur.",
          howItWorksTitle: "Comment fonctionne Kwizik",
          howItWorksBody:
            "Crée une room, choisis la source anime, invite les joueurs avec un code court, puis lance un blind test en direct avec lecture synchronisée et score live.",
          whyTitle: "Pourquoi utiliser Kwizik",
          whyBody:
            "Kwizik combine rooms publiques, lobbies privés, playlists AniList et gameplay multijoueur en direct pour organiser facilement un quiz anime entre amis ou en communauté.",
          faqTitle: "FAQ",
          faqQ1: "Peut-on jouer a un blind test anime en ligne avec des amis ?",
          faqA1:
            "Oui. Cree une room, partage le code, puis chacun peut rejoindre depuis son navigateur avant que le host lance la partie.",
          faqQ2: "Kwizik gere-t-il les openings et endings d'anime ?",
          faqA2:
            "Oui. Le host peut configurer le mode de themes pour jouer sur les openings, les endings, ou un mix des deux.",
        };
  usePageSeo({
    title:
      locale === "en"
        ? "Anime Blind Test Online Multiplayer | Kwizik"
        : "Blind Test Anime en ligne multijoueur | Kwizik",
    description:
      locale === "en"
        ? "Create an anime blind test room online, challenge friends on openings and endings, and play live with synchronized multiplayer scoring."
        : "Cree une room de blind test anime en ligne, defie tes amis sur des openings et endings, puis joue en multijoueur avec score en direct.",
    locale,
    path: "/",
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: "Kwizik",
        url: locale === "en" ? "https://kwizik.app/en" : "https://kwizik.app/fr",
      },
      {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: "Kwizik",
        applicationCategory: "GameApplication",
        operatingSystem: "Web",
        inLanguage: locale,
        description:
          locale === "en"
            ? "Multiplayer anime blind test rooms in the browser."
            : "Rooms de blind test anime multijoueur dans le navigateur.",
      },
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: [
          {
            "@type": "Question",
            name: copy.faqQ1,
            acceptedAnswer: {
              "@type": "Answer",
              text: copy.faqA1,
            },
          },
          {
            "@type": "Question",
            name: copy.faqQ2,
            acceptedAnswer: {
              "@type": "Answer",
              text: copy.faqA2,
            },
          },
        ],
      },
    ],
  });

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
        displayName: createDisplayName.trim() || "Player One",
      });

      return {
        roomCode: created.roomCode,
        playerId: joined.playerId,
      };
    },
    onSuccess: (result) => {
      notify.success(copy.roomCreated);
      setSession({
        roomCode: result.roomCode,
        playerId: result.playerId,
        displayName: createDisplayName.trim() || "Player One",
        categoryQuery: "",
      });
      navigate({
        to: "/$locale/room/$roomCode/play",
        params: { locale, roomCode: result.roomCode },
      });
    },
    onError: () => {
      notify.error(copy.createError, {
        key: "room:create:error",
      });
    },
  });

  const joinMutation = useMutation({
    mutationFn: (input: { roomCode: string; displayName: string }) =>
      joinRoom({
        roomCode: input.roomCode.trim().toUpperCase(),
        displayName: input.displayName.trim() || "Player One",
      }),
    onSuccess: (result, input) => {
      const normalizedCode = input.roomCode.trim().toUpperCase();
      const knownRoom = (publicRoomsQuery.data?.rooms ?? []).find(
        (room) => room.roomCode === normalizedCode,
      );
      notify.success(copy.roomJoined);
      setSession({
        roomCode: normalizedCode,
        playerId: result.playerId,
        displayName: input.displayName.trim() || "Player One",
        categoryQuery: knownRoom?.categoryQuery ?? "",
      });

      navigate({
        to: "/$locale/room/$roomCode/play",
        params: { locale, roomCode: normalizedCode },
      });
    },
    onError: (error) => {
      notify.error(joinErrorMessage(error, locale), {
        key: "room:join:error",
      });
    },
  });

  useEffect(() => {
    const suggestedName = account.name?.trim() ?? "";
    if (!suggestedName) return;
    setCreateDisplayName((current) => (current === "Player One" ? suggestedName : current));
    setJoinDisplayName((current) => (current === "Player One" ? suggestedName : current));
  }, [account.name]);

  function onCreate() {
    createRoomMutation.mutate();
  }

  function onJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!joinRoomCode.trim() || !joinDisplayName.trim()) return;
    joinMutation.mutate({
      roomCode: joinRoomCode.trim(),
      displayName: joinDisplayName.trim(),
    });
  }

  function onJoinPublicRoom(roomCode: string) {
    const normalizedCode = roomCode.trim().toUpperCase();
    const cachedDisplayName = session.displayName.trim();
    const hasCachedPseudo = cachedDisplayName.length > 0 && cachedDisplayName !== "Player One";
    const suggestedFromInputs = joinDisplayName.trim() || createDisplayName.trim();

    let displayName = account.userId
      ? account.name?.trim() || cachedDisplayName || suggestedFromInputs || "Player One"
      : hasCachedPseudo
        ? cachedDisplayName
        : "";

    if (!displayName) {
      const prompted = window.prompt(
        copy.promptNickname,
        suggestedFromInputs || "Player One",
      );
      if (!prompted || prompted.trim().length <= 0) return;
      displayName = prompted.trim();
      setJoinDisplayName(displayName);
      setCreateDisplayName((current) => (current === "Player One" ? displayName : current));
    }

    setJoinRoomCode(normalizedCode);
    joinMutation.mutate({
      roomCode: normalizedCode,
      displayName,
    });
  }

  return (
    <>
      <section className="home-grid home-grid-balanced home-top-grid">
        <article className="panel-card">
          <h2 className="panel-title">{copy.joinTitle}</h2>
          <p className="panel-copy">{copy.joinSubtitle}</p>

          <form className="panel-form" onSubmit={onJoin}>
            <label>
              <span>{copy.roomCode}</span>
              <input
                value={joinRoomCode}
                onChange={(event) => setJoinRoomCode(event.currentTarget.value)}
                maxLength={6}
                placeholder="ABC123"
              />
            </label>

            <label>
              <span>{copy.nickname}</span>
              <input
                value={joinDisplayName}
                onChange={(event) => setJoinDisplayName(event.currentTarget.value)}
                maxLength={24}
                placeholder={copy.nicknamePlaceholder}
              />
            </label>

            <button
              className="solid-btn"
              type="submit"
              disabled={joinMutation.isPending || createRoomMutation.isPending}
            >
              {joinMutation.isPending ? copy.joining : copy.enterRoom}
            </button>
          </form>
        </article>

        <article className="panel-card">
          <h2 className="panel-title">{copy.createTitle}</h2>
          <p className="panel-copy">{copy.createSubtitle}</p>
          {!account.userId && <p className="status">{copy.syncHint}</p>}

          <div className="panel-form">
            <label>
              <span>{copy.nickname}</span>
              <input
                value={createDisplayName}
                onChange={(event) => setCreateDisplayName(event.currentTarget.value)}
                maxLength={24}
                placeholder={copy.nicknamePlaceholder}
              />
            </label>

            <div className="field-block">
              <span className="field-label">{copy.visibility}</span>
              <div className="source-preset-grid">
                <button
                  type="button"
                  className={`source-preset-btn${isPublicRoom ? " active" : ""}`}
                  onClick={() => setIsPublicRoom(true)}
                >
                  <strong>{copy.publicGame}</strong>
                  <span>{copy.publicGameHint}</span>
                </button>
                <button
                  type="button"
                  className={`source-preset-btn${!isPublicRoom ? " active" : ""}`}
                  onClick={() => setIsPublicRoom(false)}
                >
                  <strong>{copy.privateGame}</strong>
                  <span>{copy.privateGameHint}</span>
                </button>
              </div>
            </div>

            <p className="status">{copy.hostHint}</p>

            <button
              id="create-room"
              className="solid-btn"
              type="button"
              onClick={onCreate}
              disabled={createRoomMutation.isPending || joinMutation.isPending}
            >
              {createRoomMutation.isPending ? copy.creating : copy.createRoom}
            </button>
          </div>
        </article>
      </section>
      <section className="single-panel">
        {(publicRoomsQuery.data?.rooms ?? []).length > 0 && (
          <article className="panel-card room-list-card">
            <h3 className="panel-title">{copy.publicRooms}</h3>
            <ul className="public-room-list">
              {(publicRoomsQuery.data?.rooms ?? []).map((room) => (
                <li key={room.roomCode}>
                  <div>
                    <strong>{room.roomCode}</strong>
                    <p>
                      {room.state} · {room.playerCount} {copy.players}
                    </p>
                    <p>
                      {copy.mode}:{" "}
                      {room.sourceMode === "anilist_union"
                        ? copy.synchronizedAniList
                        : copy.anime}
                      {room.sourceMode === "public_playlist" && room.playlistName
                        ? ` · ${withRomajiLabel(room.playlistName)}`
                        : ""}
                    </p>
                  </div>
                  <button
                    className="solid-btn"
                    type="button"
                    disabled={!room.canJoin || joinMutation.isPending}
                    onClick={() => onJoinPublicRoom(room.roomCode)}
                  >
                    {room.canJoin ? copy.joinPublicRoom : copy.closed}
                  </button>
                </li>
              ))}
            </ul>
          </article>
        )}
      </section>
      <section className="single-panel">
        <article className="panel-card">
          <h1 className="panel-title">{copy.seoH1}</h1>
          <p className="panel-copy">{copy.seoLead}</p>
          <div className="panel-form">
            <div className="field-block">
              <h2 className="panel-title">{copy.howItWorksTitle}</h2>
              <p className="panel-copy">{copy.howItWorksBody}</p>
            </div>
            <div className="field-block">
              <h2 className="panel-title">{copy.whyTitle}</h2>
              <p className="panel-copy">{copy.whyBody}</p>
            </div>
            <div className="field-block">
              <h2 className="panel-title">{copy.faqTitle}</h2>
              <p className="status">
                <strong>{copy.faqQ1}</strong>
                <br />
                {copy.faqA1}
              </p>
              <p className="status">
                <strong>{copy.faqQ2}</strong>
                <br />
                {copy.faqA2}
              </p>
            </div>
          </div>
        </article>
      </section>
    </>
  );
}
