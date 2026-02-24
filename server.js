const cors = require('cors');
const path = require('path');
const express = require('express');
const admin = require('firebase-admin');
const {getFirestore} = require('firebase-admin/firestore');
const nodemailer = require("nodemailer");
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
    if (!req.query || !req.query.key || typeof(req.query.key) !== 'string' || req.query.key !== 'ohBE0DPCNAlRv3lU') {
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

app.get('/change-weekly-email-subscription', async (req, res) => {
    if (!req.query || !req.query.key || typeof(req.query.key) !== 'string' || req.query.key !== 'ohBE0DPCNAlRv3lU' || !req.query.email || typeof(req.query.email) !== 'string' || !req.query.email.includes('@') || req.query.email.length > 30) {
        return res.status(401).send('Unauthorized');
    }
    const colRef = db.collection('emails');
    const snap = await colRef.where("email", "==", req.query.email).get();
    if (!snap.empty) {
        const batch = db.batch();
        snap.docs.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
        return res.status(200).send(false);
    } else {
        await colRef.add({
            email: req.query.email,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return res.status(200).send(true);
    }
});

app.get('/send-weekly-playlist', async (req, res) => {
    if (!req.query || !req.query.key || typeof(req.query.key) !== 'string' || req.query.key !== 'ohBE0DPCNAlRv3lU') {
        return res.status(401).send('Unauthorized');
    }
    const snapshot = await db.collection("emails").get();
    const emails = []
    snapshot.forEach(doc => {const data = doc.data();emails.push(data.email)});
    const snap = await db.collection("playlists").where("isActive", "==", true).limit(1).get();
    const playlistObj = (snap.docs[0]).data();
    const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
            user: credentials.GMAIL.EMAIL_ADDRESS,
            pass: credentials.GMAIL.APP_PASSWORD
        },
    });
    const playlistUrl = `https://open.spotify.com/playlist/${playlistObj.playlistId}`;

    const mailOptions = {
        from: `"SF Bangers 🎶" <${credentials.GMAIL.EMAIL_ADDRESS}>`,
        to: credentials.GMAIL.EMAIL_ADDRESS,
        bcc: emails.join(","),
        subject: `🔥 SF Bangers: New Playlist for ${playlistObj.dateRange}`,
        html: `
  <!DOCTYPE html>
  <html>
  <body style="margin:0;padding:0;background-color:#f4f4f4;font-family:Arial, sans-serif;">
    
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f4;padding:20px 0;">
      <tr>
        <td align="center">
          
          <!-- Card -->
          <table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 14px rgba(0,0,0,0.08);">
            
            <!-- Header -->
            <tr>
              <td style="background:#111;padding:20px 30px;color:#ffffff;text-align:center;">
                <h1 style="margin:0;font-size:24px;letter-spacing:0.5px;">SF Bangers 🎶</h1>
                <p style="margin:5px 0 0;font-size:14px;opacity:0.8;">Your weekly playlist drop</p>
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding:30px;">
                
                <h2 style="margin-top:0;font-size:20px;">
                  New playlist for ${playlistObj.dateRange}
                </h2>

                <p style="font-size:14px;color:#555;">
                  Fresh tracks. No skips. Press play and enjoy your week 🔥
                </p>

                <!-- CTA Button -->
                <table cellpadding="0" cellspacing="0" border="0" style="margin:25px 0;">
                  <tr>
                    <td align="center">
                      <a href="${playlistUrl}"
                         style="background:#1DB954;color:#ffffff;text-decoration:none;
                                padding:14px 22px;border-radius:30px;font-weight:bold;
                                font-size:14px;display:inline-block;">
                        ▶ Listen on Spotify
                      </a>
                    </td>
                  </tr>
                </table>

                <!-- Fallback link -->
                <p style="font-size:12px;color:#999;">
                  If the button doesn’t work, copy & paste this link into your browser:
                </p>
                <p style="font-size:12px;">
                  <a href="${playlistUrl}" style="color:#1DB954;">${playlistUrl}</a>
                </p>

              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="background:#fafafa;padding:20px;text-align:center;font-size:12px;color:#999;">
                <p style="margin:0;">SF Bangers — made in San Francisco 🌉</p>
                <p style="margin:5px 0 0;">
                  You’re receiving this because you subscribed to weekly playlists
                </p>
              </td>
            </tr>

          </table>

        </td>
      </tr>
    </table>

  </body>
  </html>
  `,
    }
    const info = await transporter.sendMail(mailOptions);
    return res.status(200).send(info);
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