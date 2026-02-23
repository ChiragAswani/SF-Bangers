const cors = require('cors');
const path = require('path');
const express = require('express');
const admin = require('firebase-admin');
const {getFirestore} = require('firebase-admin/firestore');
const env = require('./vars/env.json');
const credentials = require('./vars/credentials.json');
const {getFoopeeConcertRangesByDate, getArtistsForFoopeeWeek} = require("./src/foopee");
const {getSpotifyAccessTokenFromRefreshToken} = require("./src/generateSpotifyAccessToken");
const {generatePlaylistTop5PerArtist} = require("./src/generateSpotifyPlaylist");

const app = express();
app.disable('etag');
app.use(express.static(__dirname + '/build', { etag: false }));

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

admin.initializeApp({credential: admin.credential.cert(credentials.GCP_SERVICE_ACCOUNT)});
const db = getFirestore(app, 'sfbangers');

app.get('/generate-playlist', async (req, res) => {
    if (!req.query || !req.query.key || req.query.key !== 'ohBE0DPCNAlRv3lU') {
        return res.status(401).send('Unauthorized');
    }
    const dateRanges = await getFoopeeConcertRangesByDate();
    const selectedDateRange = dateRanges[0];
    const artists = await getArtistsForFoopeeWeek(selectedDateRange);
    const accessToken = await getSpotifyAccessTokenFromRefreshToken();
    const playlistTitle = `SF Bangers / ${selectedDateRange}`;
    const playlistDescription = `Auto generated playlist by SF Bangers for concerts in SF from ${selectedDateRange} powered by Foopee`
    const playlistObj = await generatePlaylistTop5PerArtist(accessToken, artists, playlistTitle, playlistDescription);

    const snap = await db.collection("playlists").where("isActive", "==", true).limit(1).get();
    if (snap.empty) return;
    await snap.docs[0].ref.update({ isActive: false });
    await db.collection("playlists").add({ dateRange: selectedDateRange, playlistId: playlistObj.playlistId, isActive: true, });

    return res.status(200).send(playlistObj.playlistId)
});

app.get('/get-playlists', async (req, res) => {
    const snapshot = await db.collection("playlists").get();
    if (snapshot.empty) {
        console.log("No active playlists found");
        return [];
    }
    const data = snapshot.docs.map(doc => ({id: doc.id, ...doc.data(),}));
    return res.status(200).send(data)
});


app.get('/ping', (req, res) => {return res.status(200).send(`${env.BACKEND_URL} ${env.NODE_ENV}`)});
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, "build", "index.html"), {
        headers: {
            "Cache-Control": "no-cache, no-store, must-revalidate",
        },
    });
});
app.listen(process.env.PORT || 8080, async () => {console.log('Running on port 8080');});