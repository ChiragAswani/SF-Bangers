import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Confetti from "react-confetti";
import { Button, Typography, Spin, message } from "antd";
import {
    SpotifyOutlined,
    CloseOutlined,
    ReloadOutlined,
    ArrowRightOutlined,
    CheckCircleFilled,
    CalendarOutlined,
    EnvironmentOutlined,
    LoadingOutlined,
    LeftOutlined,
    FireOutlined,
    CompassOutlined,
    LinkOutlined,
    StopOutlined,
} from "@ant-design/icons";
import axios from "axios";
import env from "./env.json";
import "./assets/generate.css";

const { Title, Text } = Typography;

const api = axios.create({ baseURL: env.BACKEND_URL, withCredentials: true });

function formatShowDate(show) {
    if (!show?.date) return show?.dayOfWeek || "Date TBD";
    try {
        const d = new Date(`${show.date}T00:00:00`);
        return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    } catch (e) {
        return show.date;
    }
}

function artistImageUrl(artist) {
    return artist?.images?.[0]?.url || null;
}

// picks `count` artists from the pool the user hasn't seen yet; once the pool
// is exhausted it resets so shuffling never just dead-ends
function pickBatch(pool, shownIds, count = 5) {
    let candidates = pool.filter((a) => !shownIds.has(a.id));
    let resetting = false;
    if (candidates.length < count) {
        candidates = pool;
        resetting = true;
    }
    const shuffled = [...candidates].sort(() => Math.random() - 0.5).slice(0, count);
    return { batch: shuffled, resetting };
}

export default function GeneratePage() {
    const [messageApi, contextHolder] = message.useMessage();

    const [step, setStep] = useState("loading"); // loading | intro | topArtists | similarSelection | review | result
    const [checkingAuth, setCheckingAuth] = useState(true);

    const [pool, setPool] = useState([]);
    const [poolLoading, setPoolLoading] = useState(false);
    const [poolError, setPoolError] = useState("");
    const [shownIds, setShownIds] = useState(new Set());
    const [displayedTopArtists, setDisplayedTopArtists] = useState([]);
    const [shuffleTick, setShuffleTick] = useState(0);

    const [committedTopArtists, setCommittedTopArtists] = useState([]);
    const [expandedId, setExpandedId] = useState(null);
    const [similarByTopArtistId, setSimilarByTopArtistId] = useState({});
    const [selections, setSelections] = useState({}); // topArtistId -> Set(similarArtistName)
    const [discoveryMode, setDiscoveryMode] = useState("blowing-up");

    const [generating, setGenerating] = useState(false);
    const [playlistId, setPlaylistId] = useState("");
    const [generateError, setGenerateError] = useState("");

    const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });
    const [showConfetti, setShowConfetti] = useState(false);

    const poolFetchedRef = useRef(false);

    useEffect(() => {
        const onResize = () => setWindowSize({ width: window.innerWidth, height: window.innerHeight });
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, []);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const justConnected = params.get("connected") === "1";

        api
            .get("/auth/spotify/status")
            .then((resp) => {
                if (resp.data?.connected) {
                    setStep("topArtists");
                } else {
                    setStep("intro");
                }
            })
            .catch(() => setStep("intro"))
            .finally(() => setCheckingAuth(false));

        if (justConnected) {
            window.history.replaceState({}, "", "/generate");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (step !== "topArtists" || poolFetchedRef.current) return;
        poolFetchedRef.current = true;
        loadTopArtists();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [step]);

    async function loadTopArtists() {
        setPoolLoading(true);
        setPoolError("");
        try {
            const resp = await api.get("/generate/top-artists");
            const artists = resp.data?.artists || [];
            setPool(artists);
            const { batch } = pickBatch(artists, new Set(), 5);
            setDisplayedTopArtists(batch);
            setShownIds(new Set(batch.map((a) => a.id)));
        } catch (e) {
            setPoolError(
                e?.response?.status === 401
                    ? "Your Spotify session expired. Please reconnect."
                    : "Couldn't load your top artists. Please try again."
            );
        } finally {
            setPoolLoading(false);
        }
    }

    function onShuffle() {
        if (!pool.length) return;
        const { batch, resetting } = pickBatch(pool, shownIds, 5);
        setDisplayedTopArtists(batch);
        setShownIds(resetting ? new Set(batch.map((a) => a.id)) : new Set([...shownIds, ...batch.map((a) => a.id)]));
        setShuffleTick((t) => t + 1);
    }

    function onNext() {
        setCommittedTopArtists(displayedTopArtists);
        setStep("similarSelection");
    }

    async function fetchTicketLinksForGroup(id, items) {
        const events = items
            .filter((item) => item.nextShow && item.nextShow.venue && item.nextShow.date)
            .map((item) => ({ artist: item.name, venue: item.nextShow.venue, date: item.nextShow.date }));
        if (events.length === 0) return;

        function applyTicketInfo(infoByArtist) {
            setSimilarByTopArtistId((prev) => {
                const group = prev[id];
                if (!group) return prev;
                const updatedItems = group.items.map((it) => {
                    if (!it.nextShow) return it;
                    const info = infoByArtist.get(it.name);
                    return {
                        ...it,
                        nextShow: { ...it.nextShow, ticketLink: info?.ticketLink ?? null, price: info?.price ?? null },
                    };
                });
                return { ...prev, [id]: { ...group, items: updatedItems } };
            });
        }

        try {
            const resp = await api.post("/ticket-links", { events });
            applyTicketInfo(new Map((resp.data?.results || []).map((r) => [r.artist, r])));
        } catch (e) {
            applyTicketInfo(new Map());
        }
    }

    async function loadSimilarForGroup(topArtist, mode) {
        const id = topArtist.id;
        setSimilarByTopArtistId((prev) => ({ ...prev, [id]: { loading: true, error: "", items: [], images: {} } }));

        try {
            const resp = await api.get("/similar-artists", { params: { artist: topArtist.name, mode } });
            const items = resp.data || [];

            setSimilarByTopArtistId((prev) => ({
                ...prev,
                [id]: { loading: false, error: "", items, images: {} },
            }));

            if (items.length) {
                const names = items.map((i) => i.name).join(",");
                api
                    .get("/generate/artist-images", { params: { names } })
                    .then((imgResp) => {
                        const imageMap = {};
                        (imgResp.data || []).forEach((r) => {
                            if (r.image) imageMap[r.name] = r.image;
                        });
                        setSimilarByTopArtistId((prev) => ({
                            ...prev,
                            [id]: { ...prev[id], images: imageMap },
                        }));
                    })
                    .catch(() => {});

                fetchTicketLinksForGroup(id, items);
            }
        } catch (e) {
            setSimilarByTopArtistId((prev) => ({
                ...prev,
                [id]: { loading: false, error: "Couldn't load similar artists.", items: [], images: {} },
            }));
        }
    }

    function toggleExpanded(topArtist) {
        const id = topArtist.id;
        if (expandedId === id) {
            setExpandedId(null);
            return;
        }
        setExpandedId(id);

        if (similarByTopArtistId[id]) return; // already loaded/loading
        loadSimilarForGroup(topArtist, discoveryMode);
    }

    function onDiscoveryModeChange(mode) {
        if (mode === discoveryMode) return;
        setDiscoveryMode(mode);
        // rankings depend on mode — drop cached results so re-opening a group re-fetches;
        // selections are kept since they refer to artist names, not to the cached list
        setSimilarByTopArtistId({});
        if (expandedId) {
            const topArtist = committedTopArtists.find((a) => a.id === expandedId);
            if (topArtist) loadSimilarForGroup(topArtist, mode);
        }
    }

    function toggleSelection(topArtistId, similarName) {
        setSelections((prev) => {
            const current = new Set(prev[topArtistId] || []);
            if (current.has(similarName)) {
                current.delete(similarName);
            } else {
                current.add(similarName);
            }
            return { ...prev, [topArtistId]: current };
        });
    }

    const allSelectedArtists = useMemo(() => {
        const set = new Set();
        Object.values(selections).forEach((s) => s.forEach((name) => set.add(name)));
        return [...set];
    }, [selections]);

    async function onGenerate() {
        if (allSelectedArtists.length === 0) {
            messageApi.error("Pick at least one artist first.");
            return;
        }
        setGenerating(true);
        setGenerateError("");
        try {
            const resp = await api.post("/generate/playlist", { artists: allSelectedArtists });
            setPlaylistId(resp.data?.playlistId || "");
            setStep("result");
            setShowConfetti(true);
            setTimeout(() => setShowConfetti(false), 6000);
        } catch (e) {
            setGenerateError(
                e?.response?.status === 401
                    ? "Your Spotify session expired. Please reconnect."
                    : "Couldn't generate your playlist. Please try again."
            );
        } finally {
            setGenerating(false);
        }
    }

    function goHome() {
        window.location.href = "/";
    }

    function connectSpotify() {
        window.location.href = `${env.BACKEND_URL}/auth/spotify/login`;
    }

    const playlistUrl = playlistId ? `https://open.spotify.com/playlist/${playlistId}` : "";
    const playlistEmbedUrl = playlistId ? `https://open.spotify.com/embed/playlist/${playlistId}` : "";

    return (
        <div className="generateShell">
            {contextHolder}
            <div className="generateGlowA" />
            <div className="generateGlowB" />

            <button className="generateCloseBtn" onClick={goHome} aria-label="Close">
                <CloseOutlined />
            </button>

            {showConfetti && (
                <Confetti
                    width={windowSize.width}
                    height={windowSize.height}
                    recycle={false}
                    numberOfPieces={350}
                    gravity={0.25}
                />
            )}

            <AnimatePresence exitBeforeEnter>
                {checkingAuth ? (
                    <motion.div key="checking" className="generateCenterStage" exit={{ opacity: 0 }}>
                        <Spin indicator={<LoadingOutlined style={{ fontSize: 40, color: "#1DB954" }} spin />} />
                    </motion.div>
                ) : step === "intro" ? (
                    <motion.div
                        key="intro"
                        className="generateCenterStage"
                        initial={{ opacity: 0, y: 24 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -24 }}
                        transition={{ duration: 0.5 }}
                    >
                        <Text className="generateEyebrow">SF Bangers</Text>
                        <Title className="generateHero">Generate your SF mix</Title>
                        <Text className="generateSubhero">
                            Connect Spotify, discover artists playing live in SF who sound like your favorites,
                            and walk away with a playlist made just for you.
                        </Text>
                        <Button
                            className="generateSpotifyBtn"
                            size="large"
                            icon={<SpotifyOutlined />}
                            onClick={connectSpotify}
                        >
                            Connect Spotify
                        </Button>
                    </motion.div>
                ) : step === "topArtists" ? (
                    <motion.div
                        key="topArtists"
                        className="generateStage"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.4 }}
                    >
                        <Text className="generateEyebrow">Your top artists</Text>
                        <Title className="generateStageTitle">Here's what you've been playing</Title>

                        {poolLoading ? (
                            <div className="generateCenterStage">
                                <Spin indicator={<LoadingOutlined style={{ fontSize: 36, color: "#1DB954" }} spin />} />
                            </div>
                        ) : poolError ? (
                            <div className="generateCenterStage">
                                <Text className="generateErrorText">{poolError}</Text>
                                <Button
                                    className="generateGhostBtn"
                                    icon={<ReloadOutlined />}
                                    onClick={() => {
                                        poolFetchedRef.current = false;
                                        setStep("intro");
                                    }}
                                >
                                    Try again
                                </Button>
                            </div>
                        ) : (
                            <>
                                <div className="generateArtistGrid">
                                    <AnimatePresence>
                                        {displayedTopArtists.map((artist, idx) => (
                                            <motion.div
                                                key={`${artist.id}-${shuffleTick}`}
                                                className="generateArtistCard"
                                                initial={{ opacity: 0, scale: 0.85, y: 20 }}
                                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                                exit={{ opacity: 0, scale: 0.85 }}
                                                transition={{ duration: 0.4, delay: idx * 0.07 }}
                                            >
                                                <div className="generateArtistImgWrap">
                                                    {artistImageUrl(artist) ? (
                                                        <img
                                                            src={artistImageUrl(artist)}
                                                            alt={artist.name}
                                                            className="generateArtistImg"
                                                        />
                                                    ) : (
                                                        <div className="generateArtistImgFallback">
                                                            {artist.name?.[0]}
                                                        </div>
                                                    )}
                                                </div>
                                                <Text className="generateArtistName">{artist.name}</Text>
                                            </motion.div>
                                        ))}
                                    </AnimatePresence>
                                </div>

                                <div className="generateActionsRow">
                                    <Button
                                        className="generateGhostBtn"
                                        size="large"
                                        icon={<ReloadOutlined />}
                                        onClick={onShuffle}
                                    >
                                        Shuffle
                                    </Button>
                                    <Button
                                        className="generatePrimaryBtn"
                                        size="large"
                                        onClick={onNext}
                                        icon={<ArrowRightOutlined />}
                                        iconPosition="end"
                                    >
                                        Next
                                    </Button>
                                </div>
                            </>
                        )}
                    </motion.div>
                ) : step === "similarSelection" ? (
                    <motion.div
                        key="similarSelection"
                        className="generateStage"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.4 }}
                    >
                        <button className="generateBackBtn" onClick={() => setStep("topArtists")}>
                            <LeftOutlined /> Back
                        </button>
                        <Text className="generateEyebrow">Discover</Text>
                        <Title className="generateStageTitle">Tap an artist to find similar SF shows</Title>
                        <Text className="generateSubhero generateSubheroSmall">
                            Pick as many as you want from each group — they'll all end up in your playlist.
                        </Text>

                        <div className="generateModeRow" role="radiogroup" aria-label="Similar artist discovery mode">
                            <button
                                type="button"
                                role="radio"
                                aria-checked={discoveryMode === "blowing-up"}
                                className={`generateModeOption${discoveryMode === "blowing-up" ? " active" : ""}`}
                                onClick={() => onDiscoveryModeChange("blowing-up")}
                            >
                                <FireOutlined className="generateModeIcon" />
                                <span className="generateModeText">
                                    <span className="generateModeName">Blowing Up</span>
                                    <span className="generateModeDesc">Buzzing acts on the rise</span>
                                </span>
                            </button>
                            <button
                                type="button"
                                role="radio"
                                aria-checked={discoveryMode === "hidden-gems"}
                                className={`generateModeOption${discoveryMode === "hidden-gems" ? " active" : ""}`}
                                onClick={() => onDiscoveryModeChange("hidden-gems")}
                            >
                                <CompassOutlined className="generateModeIcon" />
                                <span className="generateModeText">
                                    <span className="generateModeName">Hidden Gems</span>
                                    <span className="generateModeDesc">Deep cuts, off the radar</span>
                                </span>
                            </button>
                        </div>

                        <div className="generateGroupList">
                            {committedTopArtists.map((topArtist) => {
                                const group = similarByTopArtistId[topArtist.id];
                                const isOpen = expandedId === topArtist.id;
                                const selectedCount = selections[topArtist.id]?.size || 0;

                                return (
                                    <div className="generateGroup" key={topArtist.id}>
                                        <button
                                            className={`generateGroupHeader${isOpen ? " open" : ""}`}
                                            onClick={() => toggleExpanded(topArtist)}
                                        >
                                            <div className="generateGroupHeaderLeft">
                                                {artistImageUrl(topArtist) ? (
                                                    <img
                                                        src={artistImageUrl(topArtist)}
                                                        alt={topArtist.name}
                                                        className="generateGroupThumb"
                                                    />
                                                ) : (
                                                    <div className="generateGroupThumbFallback">
                                                        {topArtist.name?.[0]}
                                                    </div>
                                                )}
                                                <span className="generateGroupName">{topArtist.name}</span>
                                            </div>
                                            <div className="generateGroupHeaderRight">
                                                {selectedCount > 0 && (
                                                    <span className="generateGroupBadge">{selectedCount} selected</span>
                                                )}
                                                <span className={`generateGroupChevron${isOpen ? " open" : ""}`}>
                                                    <ArrowRightOutlined />
                                                </span>
                                            </div>
                                        </button>

                                        <AnimatePresence>
                                            {isOpen && (
                                                <motion.div
                                                    className="generateGroupBody"
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: "auto", opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    transition={{ duration: 0.3 }}
                                                >
                                                    {group?.loading ? (
                                                        <div className="generateGroupLoading">
                                                            <Spin
                                                                indicator={
                                                                    <LoadingOutlined style={{ fontSize: 26, color: "#1DB954" }} spin />
                                                                }
                                                            />
                                                        </div>
                                                    ) : group?.error ? (
                                                        <Text className="generateErrorText">{group.error}</Text>
                                                    ) : group?.items?.length ? (
                                                        <div className="generateSimilarGrid">
                                                            {group.items.map((item) => {
                                                                const selected = selections[topArtist.id]?.has(item.name);
                                                                const image = group.images?.[item.name];
                                                                return (
                                                                    <div
                                                                        key={item.name}
                                                                        role="button"
                                                                        tabIndex={0}
                                                                        className={`generateSimilarCard${selected ? " selected" : ""}`}
                                                                        onClick={() => toggleSelection(topArtist.id, item.name)}
                                                                        onKeyDown={(e) => {
                                                                            if (e.key === "Enter" || e.key === " ") {
                                                                                e.preventDefault();
                                                                                toggleSelection(topArtist.id, item.name);
                                                                            }
                                                                        }}
                                                                    >
                                                                        {selected && (
                                                                            <CheckCircleFilled className="generateSimilarCheck" />
                                                                        )}

                                                                        <div className="generateSimilarTop">
                                                                            <div className="generateSimilarImgWrap">
                                                                                {image ? (
                                                                                    <img src={image} alt={item.name} />
                                                                                ) : (
                                                                                    <div className="generateArtistImgFallback">
                                                                                        {item.name?.[0]}
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                            <div className="generateSimilarHeadline">
                                                                                <span className="generateSimilarName">{item.name}</span>
                                                                                {typeof item.score === "number" && (
                                                                                    <span className="generateSimilarScore">
                                                                                        {item.score}% match
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        </div>

                                                                        {typeof item.score === "number" && (
                                                                            <div className="generateSimilarScoreBar">
                                                                                <div
                                                                                    className="generateSimilarScoreBarFill"
                                                                                    style={{ width: `${item.score}%` }}
                                                                                />
                                                                            </div>
                                                                        )}

                                                                        {item.reason && (
                                                                            <span className="generateSimilarReason">{item.reason}</span>
                                                                        )}

                                                                        {item.nextShow ? (
                                                                            <div className="generateSimilarShowBlock">
                                                                                <span className="generateSimilarShowRow">
                                                                                    <CalendarOutlined /> {formatShowDate(item.nextShow)}
                                                                                </span>
                                                                                {item.nextShow.venue && (
                                                                                    <span className="generateSimilarShowRow">
                                                                                        <EnvironmentOutlined /> {item.nextShow.venue}
                                                                                    </span>
                                                                                )}
                                                                                {item.nextShow.ticketLink ? (
                                                                                    <a
                                                                                        href={item.nextShow.ticketLink}
                                                                                        target="_blank"
                                                                                        rel="noopener noreferrer"
                                                                                        className="generateSimilarShowRow generateSimilarTicketLink"
                                                                                        onClick={(e) => e.stopPropagation()}
                                                                                    >
                                                                                        <LinkOutlined /> Buy tickets
                                                                                        {item.nextShow.price ? ` · ${item.nextShow.price}` : ""}
                                                                                    </a>
                                                                                ) : item.nextShow.ticketLink === undefined ? (
                                                                                    <span className="generateSimilarShowRow generateSimilarTicketPending">
                                                                                        <LoadingOutlined spin /> Finding tickets…
                                                                                    </span>
                                                                                ) : (
                                                                                    <span className="generateSimilarShowRow generateSimilarTicketUnavailable">
                                                                                        <StopOutlined /> No tickets found
                                                                                    </span>
                                                                                )}
                                                                                {item.showCount > 1 && (
                                                                                    <span className="generateSimilarMoreShows">
                                                                                        +{item.showCount - 1} more show
                                                                                        {item.showCount - 1 > 1 ? "s" : ""}
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        ) : (
                                                                            <span className="generateSimilarMuted">
                                                                                No upcoming show found.
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    ) : (
                                                        <Text className="generateMuted">No similar artists found.</Text>
                                                    )}
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="generateActionsRow">
                            <Button
                                className="generatePrimaryBtn"
                                size="large"
                                disabled={allSelectedArtists.length === 0}
                                onClick={() => setStep("review")}
                                icon={<ArrowRightOutlined />}
                                iconPosition="end"
                            >
                                Review ({allSelectedArtists.length} selected)
                            </Button>
                        </div>
                    </motion.div>
                ) : step === "review" ? (
                    <motion.div
                        key="review"
                        className="generateStage"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.4 }}
                    >
                        <button className="generateBackBtn" onClick={() => setStep("similarSelection")}>
                            <LeftOutlined /> Back
                        </button>
                        <Text className="generateEyebrow">Your mix</Text>
                        <Title className="generateStageTitle">{allSelectedArtists.length} artists, one song each</Title>

                        <div className="generateReviewList">
                            {allSelectedArtists.map((name) => (
                                <span className="generateReviewChip" key={name}>
                                    {name}
                                </span>
                            ))}
                        </div>

                        {generateError && <Text className="generateErrorText">{generateError}</Text>}

                        <div className="generateActionsRow">
                            <Button
                                className="generatePrimaryBtn"
                                size="large"
                                loading={generating}
                                onClick={onGenerate}
                                icon={<SpotifyOutlined />}
                            >
                                Generate Playlist
                            </Button>
                        </div>
                    </motion.div>
                ) : step === "result" ? (
                    <motion.div
                        key="result"
                        className="generateCenterStage"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.5 }}
                    >
                        <Text className="generateEyebrow">All done</Text>
                        <Title className="generateHero">Your SF mix is ready</Title>
                        <Text className="generateSubhero">
                            One track from each artist you picked, saved straight to your Spotify.
                        </Text>

                        {playlistEmbedUrl && (
                            <iframe
                                className="generatePlaylistEmbed"
                                src={playlistEmbedUrl}
                                allowFullScreen=""
                                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                                loading="lazy"
                                title="Your generated playlist"
                            />
                        )}

                        <div className="generateActionsRow">
                            {playlistUrl && (
                                <Button
                                    className="generateSpotifyBtn"
                                    size="large"
                                    icon={<SpotifyOutlined />}
                                    onClick={() => window.open(playlistUrl, "_blank", "noreferrer")}
                                >
                                    Open in Spotify
                                </Button>
                            )}
                            <Button className="generateGhostBtn" size="large" onClick={goHome}>
                                Done
                            </Button>
                        </div>
                    </motion.div>
                ) : null}
            </AnimatePresence>
        </div>
    );
}
