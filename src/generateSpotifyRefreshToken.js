const express = require("express");
const crypto = require("crypto");
const credentials = require("../vars/credentials");
const admin = require('firebase-admin');
const {getFirestore} = require('firebase-admin/firestore');

const app = express();
admin.initializeApp({credential: admin.credential.cert(credentials.GCP_SERVICE_ACCOUNT)});
const db = getFirestore(app, 'sfbangers');

const REDIRECT_URI = "http://127.0.0.1:8080/callback";
let CLIENT_ID = '';
const SCOPES = [
    "playlist-modify-private",
    "playlist-modify-public",
    "user-read-private",
].join(" ");

function base64url(buffer) {
    return buffer
        .toString("base64")
        .replace(/=/g, "")
        .replace(/\+/g, "-")
        .replace(/\//g, "_");
}

function sha256(buffer) {
    return crypto.createHash("sha256").update(buffer).digest();
}

// STEP 1 — redirect user to Spotify login
app.get("/login", (req, res) => {
    const codeVerifier = base64url(crypto.randomBytes(64));
    const codeChallenge = base64url(sha256(codeVerifier));

    // store temporarily in memory (fine for one-time script)
    app.locals.codeVerifier = codeVerifier;

    const authUrl = new URL("https://accounts.spotify.com/authorize");
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", CLIENT_ID);
    authUrl.searchParams.set("scope", SCOPES);
    authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
    authUrl.searchParams.set("code_challenge_method", "S256");
    authUrl.searchParams.set("code_challenge", codeChallenge);

    res.redirect(authUrl.toString());
});

// STEP 2 — exchange code → refresh token
app.get("/callback", async (req, res) => {
    try {
        const code = req.query.code;
        const codeVerifier = app.locals.codeVerifier;

        const body = new URLSearchParams({
            client_id: CLIENT_ID,
            grant_type: "authorization_code",
            code: code,
            redirect_uri: REDIRECT_URI,
            code_verifier: codeVerifier,
        });

        const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body,
        });

        const data = await tokenRes.json();

        if (!tokenRes.ok) {
            console.error(data);
            return res.send("❌ Error getting token — check console");
        }

        console.log(`\n🎉 YOUR REFRESH TOKEN:\n${data.refresh_token}`);
        await db.collection("credentials").doc("SPOTIFY").update({"REFRESH_TOKEN": data.refresh_token});
        return res.send("✅ Done — check your terminal for the refresh token");
    } catch (err) {
        console.error(err);
        res.send("❌ Something went wrong");
    }
});

// start server + open browser automatically
app.listen(8080, async () => {
    console.log("🚀 http://127.0.0.1:8080/login");
    const snapshot =  await db.collection('credentials').doc('SPOTIFY').get();
    const SPOTIFY_CREDENTIALS = snapshot.data();
    CLIENT_ID = SPOTIFY_CREDENTIALS.CLIENT_ID;
});