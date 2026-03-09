async function getSpotifyAccessTokenFromRefreshToken(db) {
    const SPOTIFY_CREDENTIALS = (await db.collection('credentials').doc('SPOTIFY').get()).data();
    const body = new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: SPOTIFY_CREDENTIALS.REFRESH_TOKEN,
        client_id: SPOTIFY_CREDENTIALS.CLIENT_ID,
    });

    const res = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization:
                "Basic " +
                Buffer.from(
                    `${SPOTIFY_CREDENTIALS.CLIENT_ID}:${SPOTIFY_CREDENTIALS.CLIENT_SECRET}`
                ).toString("base64"),
        },
        body,
    });

    const data = await res.json();
    await db.collection("credentials").doc("SPOTIFY").update({"REFRESH_TOKEN": data.refresh_token});
    return data.access_token;
}

module.exports = { getSpotifyAccessTokenFromRefreshToken };