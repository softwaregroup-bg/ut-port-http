(function(define) {define(function(require) {
    //dependencies

    var Port = require('ut-bus/port');
    var util = require('util');
    var fs = require('fs');
    var when = require('when');
    var request = require('superagent');

    function HttpPort() {
        Port.call(this);
        this.config = {
            id: null,
            logLevel: '',
            type: 'http',
            host: '127.0.0.1',
            port: '',
            listen: false,
            method: 'get',
            path: '/',
            userAgent: 'ut5-HttpPort',
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
        this.key = '';
        this.cert = '';
        this.pfx = '';
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
            if (this.config.listen) {
                this.http = require('http');
            }
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
        var method = msg.HTTPMethod || this.config.method;
        var hostname = msg.URL || this.config.host;
        var req = request(method == 'get' ? 'GET' : 'POST', hostname);

        if (method == 'form') {
            req = req.type('form');
        }
        if (this.config.path) {
            req  = req.query(this.config.path);
        }
        if (this.config.port != '') {
            req = req.set('port', this.config.port);
        }

        var usernm = (msg._Auth && msg._Auth.UserName) ?  msg._Auth.UserName : (this.config.auth ? this.config.auth.User : false);
        var pass = (msg._Auth && msg._Auth.Password) ? msg._Auth.Password : (this.config.auth ? this.config.auth.Password : '');
        if (usernm) {
            req = req.auth(usernm, pass);
        }
        if (this.config.secure) {
            req = req.agent(new this.http.Agent({
                key: this.key,
                cert: this.cert,
                pfx: this.pfx,
                rejectUnauthorized: this.config.validateCert
            }));
        }
        if (msg._Timeout) {
            req.timeout(msg._Timeout);
        }

        if (msg._FileAttachment) {
            req = req.attach('file', msg._FileAttachment);
        }

        var headers = msg._Header || this.config.headers;
        if (!headers['User-Agent']) {
            headers['User-Agent'] = this.config.userAgent;
        }
        req = req.set(headers);

        req.send(msg.payload);

        var self = this;
        return when.promise(function(resolve, reject) {

            req.on('error', function(e) {
                self.log.error({_opcode:'HttpPort.execRequest', id:self.config.id, err: e.message});
                msg._ErrorCode = '2038';
                msg._ErrorMessage = e.message;
                msg.payload = e;
                reject(msg);
            });
            req.end(function(res) {
                msg.Headers = res.header;
                msg.HTTPStatus = res.status;
                msg.payload = {body: res.body, text: res.text};
                resolve(msg);
            });

        });
    };

    return HttpPort;

});}(typeof define === 'function' && define.amd ? define : function(factory) { module.exports = factory(require); }));
