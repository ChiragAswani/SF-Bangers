// Points at the deployed Gigly backend. Swap to your machine's LAN IP
// (e.g. "http://192.168.1.23:8080") to test against a local `npm start` in
// the repo root — 127.0.0.1 won't resolve from a physical device/simulator.
export const BACKEND_URL = 'https://giglymusic.com';

export const MOBILE_AUTH_RETURN_URL = 'gigly://auth-callback';

// Kill switch for the Spotify-dependent features (OAuth login, pulling real
// top artists, saving a lineup as a Spotify playlist). Spotify's Development
// Mode caps a new app at 5 allowlisted users, so this lets the rest of the
// app ship and work for everyone else while that's sorted out — flip back
// to true once the app has Extended Quota Mode.
export const USE_SPOTIFY = false;
