(function(define) {define(function(require) {
    //dependencies

    var Port = require('ut-bus/port');
    var util = require('util');
    var fs = require('fs');
    var when = require('when');

    function HttpPort() {
        Port.call(this);
        this.config = {
            id: null,
            logLevel: '',
            type: 'http',
            host: '127.0.0.1',
            port: '81',
            listen: false,
            method: 'POST',
            path: '/',
            headers: {},
            auth: {},
            secure: false,
            SSLKeyFile: '',
            SSLCertFile: '',
            SSLRootCertFile: '',
            validateCert: true
        };
        this.http = null;
        this.httpServer = null;
        this.key = null;
        this.cert = null;
        this.pfx = null;
    }

    util.inherits(HttpPort, Port);

    HttpPort.prototype.init = function init() {
        Port.prototype.init.apply(this, arguments);
        if (this.config.secure) {
            this.http = require('https');

            if (this.config.SSLKeyFile != '') {
                this.key = fs.readFileSync(this.config.SSLKeyFile);
            }
            if (this.config.SSLCertFile != '') {
                this.cert = fs.readFileSync(this.config.SSLCertFile);
            }
            if (this.config.SSLRootCertFile != '') {
                this.pfx = fs.readFileSync(this.config.SSLRootCertFile);
            }
        } else {
            this.http = require('http');
        }
    };

    HttpPort.prototype.start = function start(callback) {
        Port.prototype.start.apply(this, arguments);
        var options = {};
        if (this.config.listen) {
            if (this.config.secure) {
                options = {
                    key: this.key,
                    cert: this.cert
                };
            }
            this.httpServer = this.http.createServer(options, function(req, res) {
                this.level.debug && this.log.debug(req);
                var msg = this.receive(req);
                //msg.headers = {'Content-Type': 'text/plain'}
                res.writeHead(200, msg.headers);
                res.write(msg.body);
                res.end();
            });

            this.httpServer.listen(this.config.port, this.config.host);
        }
    };

    HttpPort.prototype.stop = function ConsoleStop() {
        Port.prototype.stop.call(this);
        if (this.httpServer != null) {
            this.httpServer.close();
            this.httpServer = null;
        }
    };

    HttpPort.prototype.execRequest = function execRequest(msg) {

        options = {
            hostname: this.config.host,
            port: this.config.port,
            path: this.config.path,
            method: this.config.method,
            headers: this.config.headers,
            auth: this.config.auth
        };
        if (this.config.secure) {
            options.key = this.key;
            options.cert = this.cert;
            options.pfx = this.pfx;
            options.agent = false;
            options.rejectUnauthorized = this.config.validateCert;
        }
        var self = this;
        return when.promise(function(resolve, reject) {

            var req = http.request(options, function(res) {
                var resp = '';
                msg.Headers = res.headers;
                msg.HTTPStatus = res.statusCode;
                res.on('data', function(data) {
                    resp += data;
                });
                res.on('end', function() {
                    msg.payload = resp;
                    resolve(msg);
                });
                res.on('error', function(e) {
                    self.log.error(e.message);
                    msg._ErrorCode = '2038';
                    msg._ErrorMessage = e.message;
                    msg.payload = e;
                    reject(msg);
                });

            });

            req.on('error', function(e) {
                self.log.error(e.message);
                msg._ErrorCode = '2038';
                msg._ErrorMessage = e.message;
                msg.payload = e;
                reject(msg);
            });

            req.write(msg.payload);
            req.end();
        });
    };

    return HttpPort;

});}(typeof define === 'function' && define.amd ? define : function(factory) { module.exports = factory(require); }));
