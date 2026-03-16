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

function formatRoomState(state: string, locale: "fr" | "en") {
  switch (state) {
    case "waiting":
      return locale === "en" ? "Lobby open" : "Lobby ouvert";
    case "playing":
      return locale === "en" ? "Live match" : "Partie en cours";
    case "results":
      return locale === "en" ? "Results" : "Resultats";
    case "finished":
      return locale === "en" ? "Finished" : "Terminee";
    default:
      return state;
  }
}

export function HomePage() {
  const navigate = useNavigate();
  const locale = useCurrentLocale();
  const setSession = useGameStore((state) => state.setSession);
  const session = useGameStore((state) => state.session);
  const account = useGameStore((state) => state.account);
  const [entryMode, setEntryMode] = useState<"join" | "create">("join");
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
          heroKicker: "Anime multiplayer rooms",
          heroTitle: "Anime blind test rooms that go live instantly",
          heroBody:
            "Create a lobby, sync your anime taste, invite friends with one code, and launch a real-time opening and ending showdown directly in the browser.",
          heroActionPrimary: "Create a live lobby",
          heroActionSecondary: "Join with a code",
          heroFeatureOneTitle: "Shared playback",
          heroFeatureOneBody: "Everyone follows the same reveal rhythm with synchronized live audio.",
          heroFeatureTwoTitle: "Public or private",
          heroFeatureTwoBody: "Run open community rooms or keep the match invite-only for your group.",
          heroFeatureThreeTitle: "AniList-ready",
          heroFeatureThreeBody: "Build broader anime rounds or lean on synced AniList libraries when you want a sharper pool.",
          heroSignalRooms: "Public rooms",
          heroSignalJoinable: "Open to join",
          heroSignalModes: "Playlist modes",
          heroSignalModesValue: "Anime + AniList",
          heroSignalAccess: "Setup",
          heroSignalAccessValue: "Browser only",
          consoleKicker: "Lobby console",
          actionTitle: "Launch or join the next room",
          actionSubtitle:
            "One surface to jump into a running lobby or spin up your own room without losing the live-game energy.",
          joinBlockTitle: "Join room",
          createBlockTitle: "Create lobby",
          joinModeHint: "Enter a room code and keep your nickname ready. The first player in becomes host.",
          createModeHint:
            "Open a room instantly, choose whether it should be public, then configure the anime source from the lobby.",
          joinModeMeta: "Fastest path when someone already sent you the code.",
          createModeMeta: "Best choice when you want to host and shape the match flow yourself.",
          publicRoomsTitle: "Rooms you can join now",
          publicRoomsSubtitle:
            "A live queue of public lobbies, with just enough state and mode detail to pick the right room fast.",
          publicRoomsCount: "listed rooms",
          publicRoomsEmpty:
            "No public room is open right now. Create one and it will appear here for the next players.",
          publicRoomsKicker: "Live room feed",
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
          heroKicker: "Rooms anime multijoueur",
          heroTitle: "Des rooms de blind test anime qui partent en direct instantanement",
          heroBody:
            "Cree un lobby, synchronise ton univers anime, invite tes amis avec un code court, puis lance un duel openings et endings en temps reel dans le navigateur.",
          heroActionPrimary: "Creer un lobby live",
          heroActionSecondary: "Rejoindre avec un code",
          heroFeatureOneTitle: "Lecture partagee",
          heroFeatureOneBody: "Tout le monde suit le meme rythme de reveal avec un audio synchronise en direct.",
          heroFeatureTwoTitle: "Public ou prive",
          heroFeatureTwoBody: "Ouvre des rooms communautaires ou garde la partie reservee a ton groupe.",
          heroFeatureThreeTitle: "Pret pour AniList",
          heroFeatureThreeBody:
            "Construis des rounds larges ou appuie-toi sur des bibliotheques AniList synchronisees pour une selection plus pointue.",
          heroSignalRooms: "Rooms publiques",
          heroSignalJoinable: "Ouvertes",
          heroSignalModes: "Modes de playlist",
          heroSignalModesValue: "Anime + AniList",
          heroSignalAccess: "Installation",
          heroSignalAccessValue: "Navigateur uniquement",
          consoleKicker: "Console de lobby",
          actionTitle: "Lancer ou rejoindre la prochaine room",
          actionSubtitle:
            "Une seule surface pour entrer dans un lobby existant ou ouvrir ta propre room sans perdre l'energie live du jeu.",
          joinBlockTitle: "Rejoindre une room",
          createBlockTitle: "Creer un lobby",
          joinModeHint:
            "Entre un code room et prepare ton pseudo. Le premier joueur qui entre devient host du lobby.",
          createModeHint:
            "Ouvre une room instantanement, choisis sa visibilite, puis configure la source anime depuis le lobby.",
          joinModeMeta: "Le chemin le plus rapide quand quelqu'un t'a deja envoye le code.",
          createModeMeta: "Le meilleur choix si tu veux host et piloter le rythme de la partie.",
          publicRoomsTitle: "Rooms disponibles maintenant",
          publicRoomsSubtitle:
            "Une file live de lobbies publics, avec juste assez d'etat et de contexte pour choisir la bonne room rapidement.",
          publicRoomsCount: "rooms listees",
          publicRoomsEmpty:
            "Aucune room publique n'est ouverte pour le moment. Cree-en une et elle apparaitra ici pour les prochains joueurs.",
          publicRoomsKicker: "File de rooms live",
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
  const publicRooms = publicRoomsQuery.data?.rooms ?? [];
  const joinableRoomCount = publicRooms.filter((room) => room.canJoin).length;
  const publicRoomCountLabel = publicRoomsQuery.isLoading ? "..." : String(publicRooms.length);
  const joinableRoomCountLabel = publicRoomsQuery.isLoading ? "..." : String(joinableRoomCount);

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

  function focusConsole(mode: "join" | "create") {
    setEntryMode(mode);
    document.getElementById("home-console")?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
    window.requestAnimationFrame(() => {
      const targetId = mode === "join" ? "join-room-code" : "create-display-name";
      const element = document.getElementById(targetId) as HTMLInputElement | null;
      element?.focus();
    });
  }

  return (
    <>
      <section className="home-landing">
        <div className="home-premium-shell">
          <article className="panel-card home-story-card">
            <div className="home-story-copy">
              <p className="kicker">{copy.heroKicker}</p>
              <h1 className="hero-title home-story-title">{copy.heroTitle}</h1>
              <p className="hero-copy home-story-body">{copy.heroBody}</p>
            </div>

            <div className="home-story-actions">
              <button className="solid-btn" type="button" onClick={() => focusConsole("create")}>
                {copy.heroActionPrimary}
              </button>
              <button className="ghost-btn" type="button" onClick={() => focusConsole("join")}>
                {copy.heroActionSecondary}
              </button>
            </div>
          </article>

          <aside className="panel-card home-console-card" id="home-console">
            <div className="home-console-head">
              <p className="kicker">{copy.consoleKicker}</p>
              <h2 className="panel-title">{copy.actionTitle}</h2>
              <p className="panel-copy">{copy.actionSubtitle}</p>
            </div>

            <div className="home-console-tabs" role="tablist" aria-label={copy.consoleKicker}>
              <button
                type="button"
                className={`home-console-tab${entryMode === "join" ? " active" : ""}`}
                onClick={() => setEntryMode("join")}
              >
                {copy.joinBlockTitle}
              </button>
              <button
                type="button"
                className={`home-console-tab${entryMode === "create" ? " active" : ""}`}
                onClick={() => setEntryMode("create")}
              >
                {copy.createBlockTitle}
              </button>
            </div>

            {entryMode === "join" ? (
              <section className="home-console-panel">
                <div className="home-console-copy">
                  <h3 className="panel-title">{copy.joinBlockTitle}</h3>
                  <p className="panel-copy">{copy.joinModeHint}</p>
                  <p className="status home-console-meta">{copy.joinModeMeta}</p>
                </div>

                <form className="panel-form" onSubmit={onJoin}>
                  <label>
                    <span>{copy.roomCode}</span>
                    <input
                      id="join-room-code"
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
              </section>
            ) : (
              <section className="home-console-panel">
                <div className="home-console-copy">
                  <h3 className="panel-title">{copy.createBlockTitle}</h3>
                  <p className="panel-copy">{copy.createModeHint}</p>
                  <p className="status home-console-meta">{copy.createModeMeta}</p>
                </div>
                {!account.userId && <p className="status">{copy.syncHint}</p>}

                <div className="panel-form">
                  <label>
                    <span>{copy.nickname}</span>
                    <input
                      id="create-display-name"
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
              </section>
            )}
          </aside>
        </div>

        <section className="home-support-strip">
          <div className="home-story-grid">
            <article className="home-story-feature">
              <strong>{copy.heroFeatureOneTitle}</strong>
              <p>{copy.heroFeatureOneBody}</p>
            </article>
            <article className="home-story-feature">
              <strong>{copy.heroFeatureTwoTitle}</strong>
              <p>{copy.heroFeatureTwoBody}</p>
            </article>
            <article className="home-story-feature">
              <strong>{copy.heroFeatureThreeTitle}</strong>
              <p>{copy.heroFeatureThreeBody}</p>
            </article>
          </div>

          <div className="home-signal-grid">
            <div className="home-signal-card">
              <span>{copy.heroSignalRooms}</span>
              <strong>{publicRoomCountLabel}</strong>
            </div>
            <div className="home-signal-card">
              <span>{copy.heroSignalJoinable}</span>
              <strong>{joinableRoomCountLabel}</strong>
            </div>
            <div className="home-signal-card">
              <span>{copy.heroSignalModes}</span>
              <strong>{copy.heroSignalModesValue}</strong>
            </div>
            <div className="home-signal-card">
              <span>{copy.heroSignalAccess}</span>
              <strong>{copy.heroSignalAccessValue}</strong>
            </div>
          </div>
        </section>
      </section>
      <section className="panel-card home-public-section" id="home-live-rooms">
        <div className="home-section-head">
          <div className="home-section-heading">
            <p className="kicker">{copy.publicRoomsKicker}</p>
            <h2 className="panel-title">{copy.publicRoomsTitle}</h2>
            <p className="panel-copy">{copy.publicRoomsSubtitle}</p>
          </div>
          <div className="home-public-summary" aria-label={copy.publicRooms}>
            <span className="home-summary-pill">
              <strong>{publicRoomCountLabel}</strong>
              <span>{copy.publicRoomsCount}</span>
            </span>
            <span className="home-summary-pill">
              <strong>{joinableRoomCountLabel}</strong>
              <span>{copy.heroSignalJoinable}</span>
            </span>
          </div>
        </div>

        {publicRooms.length > 0 ? (
          <ul className="public-room-list home-public-room-list">
            {publicRooms.map((room) => (
              <li key={room.roomCode}>
                <div className="home-room-main">
                  <div className="home-room-topline">
                    <strong className="home-room-code">{room.roomCode}</strong>
                    <span className={`home-room-state home-room-state-${room.state}`}>
                      {formatRoomState(room.state, locale)}
                    </span>
                  </div>
                  <div className="home-room-meta">
                    <span>
                      {room.playerCount} {copy.players}
                    </span>
                    <span>
                      {copy.mode}:{" "}
                      {room.sourceMode === "anilist_union" ? copy.synchronizedAniList : copy.anime}
                      {room.sourceMode === "public_playlist" && room.playlistName
                        ? ` · ${withRomajiLabel(room.playlistName)}`
                        : ""}
                    </span>
                  </div>
                </div>
                <div className="home-room-actions">
                  <button
                    className="solid-btn"
                    type="button"
                    disabled={!room.canJoin || joinMutation.isPending}
                    onClick={() => onJoinPublicRoom(room.roomCode)}
                  >
                    {room.canJoin ? copy.joinPublicRoom : copy.closed}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="status home-empty-state">{copy.publicRoomsEmpty}</p>
        )}
      </section>

      <section className="home-editorial-grid">
        <article className="panel-card home-editorial-card">
          <h2 className="panel-title">{copy.howItWorksTitle}</h2>
          <p className="panel-copy">{copy.howItWorksBody}</p>
        </article>

        <article className="panel-card home-editorial-card">
          <h2 className="panel-title">{copy.whyTitle}</h2>
          <p className="panel-copy">{copy.whyBody}</p>
        </article>

        <article className="panel-card home-editorial-card">
          <h2 className="panel-title">{copy.faqTitle}</h2>
          <div className="faq-list">
            <div className="faq-item">
              <strong>{copy.faqQ1}</strong>
              <p className="panel-copy">{copy.faqA1}</p>
            </div>
            <div className="faq-item">
              <strong>{copy.faqQ2}</strong>
              <p className="panel-copy">{copy.faqA2}</p>
            </div>
          </div>
        </article>
      </section>
    </>
  );
}
