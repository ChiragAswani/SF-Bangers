import React, { useEffect, useMemo, useRef, useState } from "react";
import logo from "./assets/logo.png";
import {
    Button,
    Input,
    message,
    Typography,
    Space,
    Card,
    Skeleton,
    Tag,
    Tooltip,
    Empty,
} from "antd";
import {
    CopyOutlined,
    MailOutlined,
    ReloadOutlined,
    SearchOutlined,
    SpotifyOutlined,
    InfoCircleOutlined,
    CalendarOutlined,
    EnvironmentOutlined,
    LinkOutlined,
    LoadingOutlined,
    StopOutlined,
    FireOutlined,
    CompassOutlined,
} from "@ant-design/icons";
import axios from "axios";
import env from "./env.json";
import "./assets/homepage.css";

const { Title, Text, Link } = Typography;

function formatShowDate(show) {
    if (!show?.date) return show?.dayOfWeek || "Date TBD";
    try {
        const d = new Date(`${show.date}T00:00:00`);
        return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    } catch (e) {
        return show.date;
    }
}

function isValidEmail(email) {
    if (!email) return false;
    if (typeof email !== "string") return false;
    if (email.length > 60) return false;
    // simple + safe email check (not perfect, but good UX)
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export default function HomePage() {
    const [messageApi, contextHolder] = message.useMessage();

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [activePlaylistId, setActivePlaylistId] = useState("");
    const [activePlaylistDateRange, setActivePlaylistDateRange] = useState("");
    const [archivedPlaylists, setArchivedPlaylists] = useState([]);
    const [email, setEmail] = useState("");
    const [archiveSearch, setArchiveSearch] = useState("");
    const [error, setError] = useState("");
    const [similarArtistQuery, setSimilarArtistQuery] = useState("");
    const [similarArtists, setSimilarArtists] = useState([]);
    const [similarArtistsLoading, setSimilarArtistsLoading] = useState(false);
    const [similarArtistsError, setSimilarArtistsError] = useState("");
    const [similarArtistsSearched, setSimilarArtistsSearched] = useState(false);
    const [ticketLinksLoading, setTicketLinksLoading] = useState(false);
    const [discoveryMode, setDiscoveryMode] = useState("blowing-up");
    const [archivesCardHeight, setArchivesCardHeight] = useState(null);

    const playlistCardRef = useRef(null);
    const emailCardRef = useRef(null);

    const activePlaylistUrl = useMemo(() => {
        if (!activePlaylistId) return "";
        return `https://open.spotify.com/playlist/${activePlaylistId}`;
    }, [activePlaylistId]);

    const activeEmbedUrl = useMemo(() => {
        if (!activePlaylistId) return "";
        return `https://open.spotify.com/embed/playlist/${activePlaylistId}`;
    }, [activePlaylistId]);

    const filteredArchives = useMemo(() => {
        const q = archiveSearch.trim().toLowerCase();
        if (!q) return archivedPlaylists;
        return archivedPlaylists.filter((p) => p.dateRange.toLowerCase().includes(q));
    }, [archivedPlaylists, archiveSearch]);

    const sortedSimilarArtists = useMemo(
        () => [...similarArtists].sort((a, b) => (b.score || 0) - (a.score || 0)),
        [similarArtists]
    );

    function normalizePlaylists(raw) {
        let active = null;
        const archives = [];

        for (const p of raw || []) {
            if (p?.isActive) {
                active = p;
            } else if (p?.playlistId && p?.dateRange) {
                archives.push({
                    key: p.playlistId,
                    dateRange: p.dateRange,
                    playlistUrl: `https://open.spotify.com/playlist/${p.playlistId}`,
                });
            }
        }

        // newest-ish first by dateRange text (best effort)
        archives.reverse();

        return { active, archives };
    }

    async function fetchPlaylists({ showSpinner = true } = {}) {
        if (showSpinner) setLoading(true);
        setError("");

        try {
            const resp = await axios.get(`${env.BACKEND_URL}/get-playlists`);
            const { active, archives } = normalizePlaylists(resp.data);

            if (active?.playlistId) {
                setActivePlaylistId(active.playlistId);
                setActivePlaylistDateRange(active.dateRange || "");
            } else {
                setActivePlaylistId("");
                setActivePlaylistDateRange("");
            }
            setArchivedPlaylists(archives);
        } catch (e) {
            setError("Couldn’t load playlists. Please try again.");
        } finally {
            if (showSpinner) setLoading(false);
        }
    }

    useEffect(() => {
        fetchPlaylists({ showSpinner: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // CSS alone can't shrink the archives card to match the playlist card's height —
    // stretch/flex-grow only ever grows a shorter column, never clips a naturally-tall
    // one — so measure the real rendered heights and set an explicit pixel height instead.
    useEffect(() => {
        const GAP = 14;

        const updateHeight = () => {
            const leftHeight = playlistCardRef.current?.offsetHeight;
            const emailHeight = emailCardRef.current?.offsetHeight;
            if (!leftHeight || !emailHeight) return;
            setArchivesCardHeight(Math.max(160, leftHeight - emailHeight - GAP));
        };

        updateHeight();

        const observer = new ResizeObserver(updateHeight);
        if (playlistCardRef.current) observer.observe(playlistCardRef.current);
        if (emailCardRef.current) observer.observe(emailCardRef.current);

        return () => observer.disconnect();
    }, []);

    function copyToClipboard(text, successMsg = "Copied") {
        if (!text) return;
        navigator.clipboard
            .writeText(text)
            .then(() => messageApi.success(successMsg))
            .catch(() => messageApi.error("Couldn’t copy to clipboard"));
    }

    async function toggleWeeklyEmailSubscription() {
        const trimmed = email.trim();

        if (!isValidEmail(trimmed)) {
            messageApi.error("Please enter a valid email address.");
            return;
        }

        try {
            const resp = await axios.get(
                `${env.BACKEND_URL}/change-weekly-email-subscription?email=${encodeURIComponent(
                    trimmed
                )}&key=ohBE0DPCNAlRv3lU`
            );

            messageApi.success(
                resp.data ? "Subscribed to weekly updates." : "Unsubscribed from weekly updates."
            );
            setEmail("");
        } catch (e) {
            messageApi.error("Subscription update failed. Please try again.");
        }
    }

    async function findSimilarArtists() {
        const trimmed = similarArtistQuery.trim();
        if (!trimmed) {
            messageApi.error("Please enter an artist name.");
            return;
        }

        setSimilarArtistsLoading(true);
        setSimilarArtistsError("");
        setSimilarArtistsSearched(true);

        try {
            const resp = await axios.get(`${env.BACKEND_URL}/similar-artists`, {
                params: { artist: trimmed, mode: discoveryMode },
            });
            const results = resp.data || [];
            setSimilarArtists(results);
            fetchTicketLinks(results);
        } catch (e) {
            setSimilarArtistsError("Couldn’t find similar artists. Please try again.");
            setSimilarArtists([]);
        } finally {
            setSimilarArtistsLoading(false);
        }
    }

    async function fetchTicketLinks(results) {
        const events = results
            .filter((item) => item.nextShow && item.nextShow.venue && item.nextShow.date)
            .map((item) => ({ artist: item.name, venue: item.nextShow.venue, date: item.nextShow.date }));
        if (events.length === 0) return;

        setTicketLinksLoading(true);
        try {
            const resp = await axios.post(`${env.BACKEND_URL}/ticket-links`, { events });
            const infoByArtist = new Map((resp.data?.results || []).map((r) => [r.artist, r]));
            setSimilarArtists((prev) =>
                prev.map((p) => {
                    if (!p.nextShow) return p;
                    const info = infoByArtist.get(p.name);
                    return {
                        ...p,
                        nextShow: { ...p.nextShow, ticketLink: info?.ticketLink ?? null, price: info?.price ?? null },
                    };
                })
            );
        } catch (e) {
            // Ticket info is a non-critical enhancement. Resolve every pending card to
            // "not available" rather than leaving them stuck showing a loading spinner.
            setSimilarArtists((prev) =>
                prev.map((p) =>
                    p.nextShow ? { ...p, nextShow: { ...p.nextShow, ticketLink: null, price: null } } : p
                )
            );
        } finally {
            setTicketLinksLoading(false);
        }
    }

    async function onRefresh() {
        setRefreshing(true);
        await fetchPlaylists({ showSpinner: false });
        setRefreshing(false);
        messageApi.success("Updated.");
    }

    return (
        <div className="pageShell">
            {contextHolder}

            {/* Background decoration */}
            <div className="bgGlow bgGlowA" />
            <div className="bgGlow bgGlowB" />

            <header className="topBar" id="section-home">
                <div className="brandRow">
                    <img src={logo} className="brandLogo" alt="SF Bangers logo" />
                    <div className="brandText">
                        <Title level={3} className="brandTitle">
                            SF Bangers
                        </Title>
                        <Text className="brandSubtitle">
                            Discover new music from artists playing live in San Francisco.
                        </Text>
                    </div>
                </div>
            </header>

            <main className="grid">
                {/* LEFT: Active playlist */}
                <section className="leftCol">
                    <Card ref={playlistCardRef} className="card glass" bodyStyle={{ padding: 18 }} id="section-weekly">
                        <div className="cardHeader">
                            <div>
                                <Text className="eyebrow">This week</Text>
                                <div className="titleRow">
                                    <Title level={4} className="cardTitle">
                                        {loading ? "Loading playlist…" : activePlaylistDateRange || "No active playlist"}
                                    </Title>
                                    <Tag className="pillTag" color="green">
                                        Mondays
                                    </Tag>
                                </div>
                                <Text className="muted">
                                    New playlist generated every Monday with one song from each artist playing live in SF that week.
                                </Text>
                            </div>

                        </div>

                        {loading ? (
                            <div style={{ paddingTop: 12 }}>
                                <Skeleton active paragraph={{ rows: 6 }} />
                            </div>
                        ) : error ? (
                            <div className="centerPad">
                                <Text className="errorText">{error}</Text>
                                <div style={{ marginTop: 12 }}>
                                    <Button type="primary" onClick={() => fetchPlaylists({ showSpinner: true })}>
                                        Try again
                                    </Button>
                                </div>
                            </div>
                        ) : activeEmbedUrl ? (
                            <iframe
                                className="spotifyFrame"
                                data-testid="embed-iframe"
                                src={activeEmbedUrl}
                                allowFullScreen=""
                                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                                loading="lazy"
                                title="SF Bangers active playlist"
                            />
                        ) : (
                            <Empty description="No active playlist found." />
                        )}

                        {activePlaylistUrl && !loading && !error && (
                            <div className="activeFooter">
                                <Button
                                    className="ghostBtn"
                                    icon={<SpotifyOutlined />}
                                    onClick={() => window.open(activePlaylistUrl, "_blank", "noreferrer")}
                                >
                                    Open in Spotify
                                </Button>
                                <Button
                                    className="ghostBtn"
                                    icon={<CopyOutlined />}
                                    onClick={() => copyToClipboard(activePlaylistUrl, "Playlist link copied")}
                                >
                                    Copy link
                                </Button>
                            </div>
                        )}
                    </Card>
                </section>

                {/* RIGHT: Email + Archives */}
                <section className="rightCol">
                    {/* Email card */}
                    <Card ref={emailCardRef} className="card glass" bodyStyle={{ padding: 18 }} id="section-subscribe">
                        <div className="sectionTitleRow">
                            <Title level={5} className="sectionTitle">
                                Weekly Updates
                            </Title>
                            <Text className="muted">Subscribe/unsubscribe anytime.</Text>
                        </div>

                        <Space.Compact style={{ width: "100%" }}>
                            <Input
                                style={{ borderRadius: '0px !important' }}
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="Email address"
                                prefix={<MailOutlined />}
                                onPressEnter={toggleWeeklyEmailSubscription}
                            />
                            <Button type="primary" onClick={toggleWeeklyEmailSubscription} style={{marginLeft: 10}}>
                                Submit
                            </Button>
                        </Space.Compact>

                        <Text className="tinyMuted">
                            We’ll only email when a new playlist drops.
                        </Text>
                    </Card>

                    {/* Archives card */}
                    <Card
                        className="card glass archivesCard"
                        style={archivesCardHeight ? { height: archivesCardHeight } : undefined}
                        bodyStyle={{ padding: 18, display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}
                        id="section-archives"
                    >
                        <div className="sectionTitleRow">
                            <div>
                                <Title level={5} className="sectionTitle">
                                    Archives
                                </Title>
                                <Text className="muted">
                                    Previously generated playlists for SF shows.
                                </Text>
                            </div>
                        </div>

                        {filteredArchives.length === 0 ? (
                            <div className="centerPad">
                                <Empty
                                    description={
                                        archivedPlaylists.length ? "No matches." : "No archived playlists yet."
                                    }
                                />
                            </div>
                        ) : (
                            <div className="archivesList">
                                {filteredArchives.map((record) => (
                                    <div className="archiveRow" key={record.key}>
                                        <a
                                            href={record.playlistUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="archiveRowLink"
                                        >
                                            <SpotifyOutlined />
                                            <span>SF Bangers / {record.dateRange}</span>
                                        </a>
                                        <Tooltip title="Copy link">
                                            <Button
                                                size="small"
                                                className="ghostBtn"
                                                icon={<CopyOutlined />}
                                                onClick={() => copyToClipboard(record.playlistUrl, "Archive link copied")}
                                            />
                                        </Tooltip>
                                    </div>
                                ))}
                            </div>
                        )}

                        {archivedPlaylists.length > 0 && (
                            <div className="tableFooter">
                                <Text className="tinyMuted">
                                    Tip: click a row link to open Spotify, or copy from the icon.
                                </Text>
                            </div>
                        )}
                    </Card>
                </section>
            </main>

            <section className="similarArtistsSection" id="section-similar-artists">
                <Card className="card glass similarArtistsCard" bodyStyle={{ padding: 24 }}>
                    <div className="similarArtistsHeader">
                        <div>
                            <Text className="eyebrow">Discover</Text>
                            <Title level={4} className="cardTitle similarArtistsTitle">
                                Find Similar Artists
                            </Title>
                            <Text className="muted">
                                Enter an artist you like and we’ll surface similar acts with upcoming SF shows.
                            </Text>
                        </div>

                        <Space.Compact className="similarArtistsSearch">
                            <Input
                                value={similarArtistQuery}
                                onChange={(e) => setSimilarArtistQuery(e.target.value)}
                                placeholder="e.g. Electric Guest, Sombr.."
                                prefix={<SearchOutlined />}
                                onPressEnter={findSimilarArtists}
                            />
                            <Button
                                style={{marginLeft: 10}}
                                type="primary"
                                loading={similarArtistsLoading}
                                onClick={findSimilarArtists}
                            >
                                Search
                            </Button>
                        </Space.Compact>
                    </div>

                    <div className="discoveryModeRow">
                        <Text className="tinyMuted discoveryModeLabel">Discovery mode</Text>
                        <div className="discoveryModeToggle" role="radiogroup" aria-label="Similar artist discovery mode">
                            <button
                                type="button"
                                role="radio"
                                aria-checked={discoveryMode === "blowing-up"}
                                className={`discoveryModeOption discoveryModeBlowingUp${
                                    discoveryMode === "blowing-up" ? " active" : ""
                                }`}
                                onClick={() => setDiscoveryMode("blowing-up")}
                            >
                                <FireOutlined className="discoveryModeIcon" />
                                <span className="discoveryModeText">
                                    <span className="discoveryModeName">Blowing Up</span>
                                    <span className="discoveryModeDesc">Buzzing acts on the rise</span>
                                </span>
                            </button>
                            <button
                                type="button"
                                role="radio"
                                aria-checked={discoveryMode === "hidden-gems"}
                                className={`discoveryModeOption discoveryModeHiddenGems${
                                    discoveryMode === "hidden-gems" ? " active" : ""
                                }`}
                                onClick={() => setDiscoveryMode("hidden-gems")}
                            >
                                <CompassOutlined className="discoveryModeIcon" />
                                <span className="discoveryModeText">
                                    <span className="discoveryModeName">Hidden Gems</span>
                                    <span className="discoveryModeDesc">Deep cuts, off the radar</span>
                                </span>
                            </button>
                        </div>
                    </div>

                    {similarArtistsLoading ? (
                        <div style={{ paddingTop: 20 }}>
                            <Skeleton active paragraph={{ rows: 4 }} />
                        </div>
                    ) : similarArtistsError ? (
                        <div className="centerPad">
                            <Text className="errorText">{similarArtistsError}</Text>
                        </div>
                    ) : similarArtistsSearched && similarArtists.length === 0 ? (
                        <div style={{ paddingTop: 20 }}>
                            <Empty description="No similar artists found." />
                        </div>
                    ) : sortedSimilarArtists.length > 0 ? (
                        <div className="similarArtistsGrid">
                            {sortedSimilarArtists.map((item, idx) => (
                                <div className="similarArtistCard" key={item.name}>
                                    <div className="similarArtistRank">{idx + 1}</div>
                                    <div className="similarArtistBody">
                                        <div className="similarArtistNameRow">
                                            <Text strong className="similarArtistName">
                                                {item.name}
                                            </Text>
                                            <Tooltip title="Similarity score">
                                                <span className="similarArtistScore">{item.score}%</span>
                                            </Tooltip>
                                        </div>

                                        <div className="similarArtistScoreBar">
                                            <div
                                                className="similarArtistScoreBarFill"
                                                style={{ width: `${item.score}%` }}
                                            />
                                        </div>

                                        <Text className="tinyMuted similarArtistReason">
                                            {item.reason}
                                        </Text>

                                        {item.nextShow ? (
                                            <div className="similarArtistShow">
                                                <span className="similarArtistShowRow">
                                                    <CalendarOutlined />
                                                    <Text className="muted">{formatShowDate(item.nextShow)}</Text>
                                                </span>
                                                {item.nextShow.venue && (
                                                    <span className="similarArtistShowRow">
                                                        <EnvironmentOutlined />
                                                        <Text className="muted">{item.nextShow.venue}</Text>
                                                    </span>
                                                )}
                                                {item.nextShow.ticketLink ? (
                                                    <a
                                                        href={item.nextShow.ticketLink}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="similarArtistShowRow similarArtistTicketLink"
                                                    >
                                                        <LinkOutlined />
                                                        <Text className="muted">
                                                            Buy tickets{item.nextShow.price ? ` · ${item.nextShow.price}` : ""}
                                                        </Text>
                                                    </a>
                                                ) : item.nextShow.ticketLink === undefined && ticketLinksLoading ? (
                                                    <span className="similarArtistShowRow similarArtistTicketPending">
                                                        <LoadingOutlined spin />
                                                        <Text className="tinyMuted">Finding tickets…</Text>
                                                    </span>
                                                ) : (
                                                    <Tooltip title="Couldn't verify a ticket link for this show">
                                                        <span className="similarArtistShowRow similarArtistTicketUnavailable">
                                                            <StopOutlined />
                                                            <Text className="tinyMuted">No tickets found</Text>
                                                        </span>
                                                    </Tooltip>
                                                )}
                                                {item.showCount > 1 && (
                                                    <Tag className="pillTag" color="blue">
                                                        +{item.showCount - 1} more show{item.showCount - 1 > 1 ? "s" : ""}
                                                    </Tag>
                                                )}
                                            </div>
                                        ) : (
                                            <Text className="tinyMuted">No upcoming show found.</Text>
                                        )}
                                    </div>

                                    <Tooltip title="Listen on Spotify">
                                        <Button
                                            shape="circle"
                                            className="ghostBtn similarArtistSpotifyBtn"
                                            icon={<SpotifyOutlined />}
                                            onClick={() =>
                                                window.open(
                                                    `https://open.spotify.com/search/${encodeURIComponent(item.name)}`,
                                                    "_blank",
                                                    "noreferrer"
                                                )
                                            }
                                        />
                                    </Tooltip>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="centerPad">
                            <Text className="muted">Search for an artist above to get started.</Text>
                        </div>
                    )}
                </Card>
            </section>

            <footer className="footer">
                <Text className="tinyMuted">
                    SF Bangers • Built for discovering live music in SF
                </Text>
            </footer>
        </div>
    );
}