require('repl').start({useGlobal: true});

var wire = require('wire');

m = wire({
    bunyan: {
        create: {
            module: 'ut-log',
            args: {
                type: 'bunyan',
                name: 'bunyan_test',
                streams: [
                    {
                        level: 'trace',
                        stream: 'process.stdout'
                    }
                ]
            }
        }
    },
    httpReq: {
        create: 'ut-port-http',
        init: 'init',
        properties: {
            config: {
                id: 'httpRequest',
                logLevel: 'debug',
                host: 'encrypted.google.com',
                port: '',
                method: 'get',
                path: '/',
                userAgent: 'ut5-HttpPort',
                headers: {},
                auth: {},
                secure: true,
                SSLKeyFile: '',
                SSLCertFile: '',
                SSLRootCertFile: '',
                validateCert: false

            },
            log: {$ref: 'bunyan'}
        }
    }
}, {require: require}).then(function contextLoaded(context) {
    var msgg = {
        URL: 'https://git.softwaregroup-bg.com',
        HTTPMethod: 'get',
        data:''
    };

    context.httpReq.execRequest(msgg).done(function ok (msg) {
        console.log('OK:');
        console.log(msg);
    }, function error (msg) {
        console.log('ERROR:');
        console.log(msg);

    });
}).done();
