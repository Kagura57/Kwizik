import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toRomaji } from "wanakana";
import { formatHomeRoomState, getHomeCopy, getHomeJoinErrorMessage } from "../i18n/copy/home";
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
  const copy = getHomeCopy(locale);
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
      notify.error(getHomeJoinErrorMessage(error, locale), {
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
                      {formatHomeRoomState(room.state, locale)}
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
