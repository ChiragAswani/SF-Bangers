const {getSpotifyAccessTokenFromRefreshToken} = require("./generateSpotifyAccessToken");
const express = require("express");
const admin = require("firebase-admin");
const credentials = require("../vars/credentials.json");
const {getFirestore} = require("firebase-admin/firestore");
const app = express();
admin.initializeApp({credential: admin.credential.cert(credentials.GCP_SERVICE_ACCOUNT)});
const db = getFirestore(app, 'sfbangers');

(async () => {
    try {
        const accessToken = await getSpotifyAccessTokenFromRefreshToken(db);
        console.log(accessToken);
    } catch (e) {
        console.log(e.message);
        process.exit(1);
    }

})();