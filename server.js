const cors = require('cors');
const path = require('path');
const express = require('express');
const admin = require('firebase-admin');
const {getFirestore} = require('firebase-admin/firestore');
const env = require('./vars/env.json');
const credentials = require('./vars/credentials.json');

const app = express();
app.disable('etag');
app.use(express.static(__dirname + '/build', { etag: false }));

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

admin.initializeApp({credential: admin.credential.cert(credentials.GCP_SERVICE_ACCOUNT)});
const db = getFirestore(app, 'sfbangers');

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