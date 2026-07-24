const fs = require('fs');
(async () => {
    try {
        let NODE_ENV = '';
        process.argv.forEach((val, index) => {
            if (val === 'local' || val === 'prod') NODE_ENV = val
        });
        const obj = {
            NODE_ENV,
        }
        const filePath = '/Users/chiragaswani/Documents/GitHub/sfbangers/client/package.json';
        const file = require(filePath);
        if (NODE_ENV === 'local') {
            // Spotify's OAuth redirect URI validation rejects the "localhost" hostname
            // (it can be hijacked via DNS/hosts-file manipulation, per RFC 8252) and
            // requires the literal loopback IP instead.
            obj.BACKEND_URL = 'http://127.0.0.1:8080'
            // must be the same host (127.0.0.1) as BACKEND_URL, not "localhost" — they're
            // different sites for SameSite cookie purposes, which breaks the session cookie
            // on cross-origin XHR calls even though both resolve to loopback.
            obj.FRONTEND_URL = 'http://127.0.0.1:3000'
            file.homepage = './'
        }
        if (NODE_ENV === 'prod') {
            obj.BACKEND_URL = 'https://sfbangers.com'
            obj.FRONTEND_URL = 'https://sfbangers.com'
            file.homepage = 'https://sf-bangers.appspot.com'
        }
        fs.writeFile('../client/src/env.json', JSON.stringify(obj), 'utf8', () => {});
        fs.writeFile('../vars/env.json', JSON.stringify(obj), 'utf8', () => {});

    } catch (e) {
        console.log(e.message);
        process.exit(1);
    }

})();