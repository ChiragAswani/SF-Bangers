const crypto = require("crypto");

const SESSION_SCOPES = [
    "user-top-read",
    "playlist-modify-private",
    "playlist-modify-public",
].join(" ");

// access tokens are refreshed a bit early so a request never races an expiry mid-flight
const EXPIRY_SAFETY_MS = 60 * 1000;

function base64url(buffer) {
    return buffer.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function sha256(input) {
    return crypto.createHash("sha256").update(input).digest();
}

function generatePkcePair() {
    const codeVerifier = base64url(crypto.randomBytes(64));
    const codeChallenge = base64url(sha256(codeVerifier));
    return { codeVerifier, codeChallenge };
}

function buildAuthorizeUrl(clientId, redirectUri, codeChallenge) {
    const authUrl = new URL("https://accounts.spotify.com/authorize");
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("scope", SESSION_SCOPES);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("code_challenge_method", "S256");
    authUrl.searchParams.set("code_challenge", codeChallenge);
    return authUrl.toString();
}

async function getSpotifyAppCredentials(db) {
    const snap = await db.collection("credentials").doc("SPOTIFY").get();
    const data = snap.data();
    if (!data || !data.CLIENT_ID || !data.CLIENT_SECRET) {
        throw new Error("Missing Spotify app credentials in credentials/SPOTIFY");
    }
    return { clientId: data.CLIENT_ID, clientSecret: data.CLIENT_SECRET };
}

async function exchangeCodeForTokens(clientId, clientSecret, redirectUri, code, codeVerifier) {
    const body = new URLSearchParams({
        client_id: clientId,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
    });

    const res = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
        },
        body,
    });

    const data = await res.json();
    if (!res.ok) {
        throw new Error(`Spotify token exchange failed: ${data?.error_description || data?.error || res.status}`);
    }
    return data;
}

async function refreshAccessToken(clientId, clientSecret, refreshToken) {
    const body = new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: clientId,
    });

    const res = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
        },
        body,
    });

    const data = await res.json();
    if (!res.ok) {
        throw new Error(`Spotify token refresh failed: ${data?.error_description || data?.error || res.status}`);
    }
    return data;
}

async function createUserSession(db, tokens, spotifyUserId) {
    const sessionId = crypto.randomUUID();
    await db.collection("spotifyUserSessions").doc(sessionId).set({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: Date.now() + tokens.expires_in * 1000,
        spotifyUserId: spotifyUserId || null,
        createdAt: Date.now(),
    });
    return sessionId;
}

async function getValidAccessTokenForSession(db, sessionId) {
    if (!sessionId) return null;

    const ref = db.collection("spotifyUserSessions").doc(sessionId);
    const snap = await ref.get();
    if (!snap.exists) return null;

    const session = snap.data();
    if (Date.now() < session.expiresAt - EXPIRY_SAFETY_MS) {
        return session.accessToken;
    }

    const { clientId, clientSecret } = await getSpotifyAppCredentials(db);
    const refreshed = await refreshAccessToken(clientId, clientSecret, session.refreshToken);

    const update = {
        accessToken: refreshed.access_token,
        expiresAt: Date.now() + refreshed.expires_in * 1000,
    };
    // Spotify only rotates the refresh token sometimes; keep the old one otherwise
    if (refreshed.refresh_token) update.refreshToken = refreshed.refresh_token;

    await ref.update(update);
    return update.accessToken;
}

// simple in-process cache; app-only tokens aren't tied to any user session
let appTokenCache = { accessToken: null, expiresAt: 0 };

async function getSpotifyAppAccessToken(db) {
    if (appTokenCache.accessToken && Date.now() < appTokenCache.expiresAt - EXPIRY_SAFETY_MS) {
        return appTokenCache.accessToken;
    }

    const { clientId, clientSecret } = await getSpotifyAppCredentials(db);
    const body = new URLSearchParams({ grant_type: "client_credentials" });

    const res = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
        },
        body,
    });

    const data = await res.json();
    if (!res.ok) {
        throw new Error(`Spotify app token request failed: ${data?.error_description || data?.error || res.status}`);
    }

    appTokenCache = { accessToken: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
    return appTokenCache.accessToken;
}

module.exports = {
    generatePkcePair,
    buildAuthorizeUrl,
    getSpotifyAppCredentials,
    exchangeCodeForTokens,
    createUserSession,
    getValidAccessTokenForSession,
    getSpotifyAppAccessToken,
};
