function parseCookies(req) {
    const header = req.headers.cookie;
    const out = {};
    if (!header) return out;
    header.split(';').forEach((pair) => {
        const idx = pair.indexOf('=');
        if (idx === -1) return;
        const key = pair.slice(0, idx).trim();
        const val = pair.slice(idx + 1).trim();
        if (!key) return;
        try {
            out[key] = decodeURIComponent(val);
        } catch (e) {
            out[key] = val;
        }
    });
    return out;
}

// Mobile can't rely on httpOnly cookies (the in-app auth browser session isn't
// shared with the app's own fetch calls), so it sends the session id as a
// bearer token instead; web keeps using the cookie.
function getSessionId(req, cookieName) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.slice('Bearer '.length).trim() || null;
    }
    return parseCookies(req)[cookieName] || null;
}

module.exports = { parseCookies, getSessionId };
