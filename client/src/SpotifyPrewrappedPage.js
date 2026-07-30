import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import giglyIcon from "./assets/gigly-icon.png";
import env from "./env.json";
import "./assets/wrapped.css";

const api = axios.create({ baseURL: env.BACKEND_URL, withCredentials: true });

// Rotating trim palette for genre chips — same "clashing on purpose" house
// colors used throughout the rest of the site/app.
const HOUSE = ["#FF6F59", "#1FB6A6", "#FFC145", "#7B6FD1", "#FF7FA6", "#6FB56A"];

function SpotifyGlyph() {
    return (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.36-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141 4.32-1.32 9.719-.66 13.439 1.62.361.181.54.78.301 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.18-1.2-.181-1.38-.72-.18-.6.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.72 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.6-1.559.3z" />
        </svg>
    );
}

function initials(name) {
    return (name || "?").trim().charAt(0).toUpperCase();
}

function mainstreamLabel(score) {
    if (score >= 76) return "Certified mainstream";
    if (score >= 51) return "Nicely balanced";
    if (score >= 26) return "Off the beaten path";
    return "Deep cuts only";
}

export default function SpotifyPrewrappedPage() {
    const [status, setStatus] = useState("checking"); // checking | intro | loading | loaded | error
    const [connecting, setConnecting] = useState(false);
    const [stats, setStats] = useState(null);
    const [error, setError] = useState("");

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const justConnected = params.get("connected") === "1";
        if (justConnected) {
            window.history.replaceState({}, "", "/spotify-prewrapped");
        }

        api
            .get("/auth/spotify/status")
            .then((resp) => {
                if (resp.data?.connected) {
                    loadStats();
                } else {
                    setStatus("intro");
                }
            })
            .catch(() => setStatus("intro"));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function loadStats() {
        setStatus("loading");
        setError("");
        try {
            const resp = await api.get("/generate/wrapped-stats");
            setStats(resp.data);
            setStatus("loaded");
        } catch (e) {
            setError(
                e?.response?.status === 401
                    ? "Your Spotify session expired. Please reconnect."
                    : "Couldn't load your stats. Please try again."
            );
            setStatus("error");
        }
    }

    function connectSpotify() {
        setConnecting(true);
        window.location.href = `${env.BACKEND_URL}/auth/spotify/login`;
    }

    const year = new Date().getFullYear();

    return (
        <div className="wrappedShell">
            <div className="wrappedTopBar">
                <Link to="/" className="wrappedBackLink">
                    &larr; Back to Gigly
                </Link>
                <div className="wrappedBrand">
                    <img src={giglyIcon} alt="" className="wrappedBrandIcon" />
                    <span className="wrappedBrandText">Gigly</span>
                </div>
            </div>

            <div className="wrappedContent">
                {status === "checking" ? (
                    <div className="wrappedCenterStage">
                        <div className="wrappedSpinner" />
                    </div>
                ) : status === "intro" ? (
                    <div className="wrappedCenterStage">
                        <span className="wrappedEyebrow">Spotify Prewrapped</span>
                        <h1 className="wrappedHeadline">See your {year} Wrapped early</h1>
                        <p className="wrappedSubhero">
                            Connect Spotify to see your top artists, tracks, and genres from this year so
                            far — no need to wait for December.
                        </p>
                        <button className="wrappedSpotifyBtn" onClick={connectSpotify} disabled={connecting}>
                            <SpotifyGlyph />
                            {connecting ? "Connecting..." : "Connect Spotify"}
                        </button>
                    </div>
                ) : status === "loading" ? (
                    <div className="wrappedCenterStage">
                        <div className="wrappedSpinner" />
                    </div>
                ) : status === "error" ? (
                    <div className="wrappedCenterStage">
                        <span className="wrappedEyebrow">Spotify Prewrapped</span>
                        <p className="wrappedErrorText">{error}</p>
                        <button className="wrappedGhostBtn" onClick={connectSpotify}>
                            Reconnect Spotify
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="wrappedHeader">
                            <span className="wrappedEyebrow">Spotify Prewrapped</span>
                            <h1 className="wrappedYear">
                                {stats?.profile?.name ? `${stats.profile.name}'s` : "Your"} {year}, so far
                            </h1>
                            <p className="wrappedNote">
                                Based on roughly your last 6 months of listening — Spotify doesn't expose
                                exact calendar-year stats until the real Wrapped drops in December, so
                                think of this as an early preview, not the official thing.
                            </p>
                        </div>

                        {(stats?.counts?.likedSongs != null ||
                            stats?.counts?.playlists != null ||
                            stats?.counts?.followedArtists != null ||
                            stats?.counts?.savedAlbums != null) && (
                            <div className="wrappedStatRow">
                                {stats.counts.likedSongs != null && (
                                    <div className="wrappedStatPill">
                                        <span className="wrappedStatNumber">{stats.counts.likedSongs}</span>
                                        <span className="wrappedStatLabel">Liked Songs</span>
                                    </div>
                                )}
                                {stats.counts.playlists != null && (
                                    <div className="wrappedStatPill">
                                        <span className="wrappedStatNumber">{stats.counts.playlists}</span>
                                        <span className="wrappedStatLabel">Playlists</span>
                                    </div>
                                )}
                                {stats.counts.followedArtists != null && (
                                    <div className="wrappedStatPill">
                                        <span className="wrappedStatNumber">{stats.counts.followedArtists}</span>
                                        <span className="wrappedStatLabel">Artists Followed</span>
                                    </div>
                                )}
                                {stats.counts.savedAlbums != null && (
                                    <div className="wrappedStatPill">
                                        <span className="wrappedStatNumber">{stats.counts.savedAlbums}</span>
                                        <span className="wrappedStatLabel">Albums Saved</span>
                                    </div>
                                )}
                            </div>
                        )}

                        {typeof stats?.mainstreamScore === "number" && (
                            <div className="wrappedSection">
                                <h2 className="wrappedSectionTitle">Mainstream meter</h2>
                                <div className="wrappedMeterTrack">
                                    <div
                                        className="wrappedMeterFill"
                                        style={{ width: `${stats.mainstreamScore}%` }}
                                    />
                                </div>
                                <p className="wrappedMeterLabel">
                                    <strong>{stats.mainstreamScore}/100</strong> — {mainstreamLabel(stats.mainstreamScore)}
                                </p>
                            </div>
                        )}

                        {stats?.topGenres?.length > 0 && (
                            <div className="wrappedSection">
                                <h2 className="wrappedSectionTitle">Your top genres</h2>
                                <div className="wrappedGenreRow">
                                    {stats.topGenres.map((genre, idx) => (
                                        <span
                                            key={genre}
                                            className="wrappedGenreChip"
                                            style={{ backgroundColor: HOUSE[idx % HOUSE.length] }}
                                        >
                                            {genre}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {stats?.topArtists?.length > 0 && (
                            <div className="wrappedSection">
                                <h2 className="wrappedSectionTitle">Your top artists</h2>
                                <div className="wrappedArtistGrid">
                                    {stats.topArtists.map((artist, idx) => (
                                        <div key={artist.id} className="wrappedArtistCard">
                                            <div className="wrappedRank">
                                                {artist.image ? (
                                                    <img src={artist.image} alt="" className="wrappedArtistImg" />
                                                ) : (
                                                    <div className="wrappedArtistFallback">
                                                        {initials(artist.name)}
                                                    </div>
                                                )}
                                                <span className="wrappedRankBadge">{idx + 1}</span>
                                            </div>
                                            <span className="wrappedArtistName">{artist.name}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {stats?.newArtists?.length > 0 && (
                            <div className="wrappedSection">
                                <h2 className="wrappedSectionTitle">New in rotation</h2>
                                <p className="wrappedSectionNote">
                                    Showed up in your recent listening but not (yet) your long-time favorites.
                                </p>
                                <div className="wrappedChipRow">
                                    {stats.newArtists.map((artist) => (
                                        <div key={artist.id} className="wrappedNewArtistChip">
                                            {artist.image ? (
                                                <img src={artist.image} alt="" className="wrappedNewArtistImg" />
                                            ) : (
                                                <div className="wrappedNewArtistFallback" />
                                            )}
                                            <span className="wrappedNewArtistName">{artist.name}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {stats?.topTracks?.length > 0 && (
                            <div className="wrappedSection">
                                <h2 className="wrappedSectionTitle">Your top tracks</h2>
                                <div className="wrappedTrackList">
                                    {stats.topTracks.map((track, idx) => (
                                        <div key={track.id} className="wrappedTrackRow">
                                            <span className="wrappedTrackRank">{idx + 1}</span>
                                            {track.image ? (
                                                <img src={track.image} alt="" className="wrappedTrackImg" />
                                            ) : (
                                                <div className="wrappedTrackFallback" />
                                            )}
                                            <div className="wrappedTrackText">
                                                <span className="wrappedTrackName">{track.name}</span>
                                                <span className="wrappedTrackArtist">{track.artist}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {stats?.onRepeat && (
                            <div className="wrappedSection">
                                <h2 className="wrappedSectionTitle">On repeat</h2>
                                <div className="wrappedOnRepeatCard">
                                    {stats.onRepeat.image ? (
                                        <img src={stats.onRepeat.image} alt="" className="wrappedOnRepeatImg" />
                                    ) : (
                                        <div className="wrappedOnRepeatImg" />
                                    )}
                                    <div className="wrappedOnRepeatText">
                                        <span className="wrappedOnRepeatTitle">{stats.onRepeat.name}</span>
                                        <span className="wrappedOnRepeatMeta">
                                            {stats.onRepeat.artist} — played {stats.onRepeat.count} times recently
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {stats?.podcasts?.length > 0 && (
                            <div className="wrappedSection">
                                <h2 className="wrappedSectionTitle">Podcasts you follow</h2>
                                <p className="wrappedSectionNote">
                                    Spotify doesn't expose podcast listening stats publicly, so this is what
                                    you follow, not a ranked "top podcasts" list.
                                </p>
                                <div className="wrappedPodcastGrid">
                                    {stats.podcasts.map((show) => (
                                        <div key={show.id} className="wrappedPodcastCard">
                                            {show.image ? (
                                                <img src={show.image} alt="" className="wrappedPodcastImg" />
                                            ) : (
                                                <div className="wrappedPodcastFallback" />
                                            )}
                                            <span className="wrappedPodcastName">{show.name}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="wrappedFooter">
                            <Link to="/" className="wrappedBackLink">
                                &larr; Back to Gigly
                            </Link>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
