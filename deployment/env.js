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
            obj.BACKEND_URL = 'http://localhost:8080'
            obj.FRONTEND_URL = 'http://localhost:3000'
            file.homepage = './'
        }
        if (NODE_ENV === 'prod') {
            obj.BACKEND_URL = 'https://sf-bangers.wl.r.appspot.com'
            obj.FRONTEND_URL = 'https://sf-bangers.wl.r.appspot.com'
            file.homepage = 'https://sf-bangers.wl.r.appspot.com'
        }
        fs.writeFile('../client/src/env.json', JSON.stringify(obj), 'utf8', () => {});
        fs.writeFile('../vars/env.json', JSON.stringify(obj), 'utf8', () => {});

    } catch (e) {
        console.log(e.message);
        process.exit(1);
    }

})();