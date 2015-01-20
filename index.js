(function(define) {define(function(require) {
    //dependencies

    var Port = require('ut-bus/port');
    var util = require('util');
    var fs = require('fs');
    var request = require('superagent');

    function HttpPort() {
        Port.call(this);
        this.config = {
            id: null,
            logLevel: '',
            type: 'http',
            host: '127.0.0.1',
            port: '',
            method: 'get',
            path: '/',
            userAgent: 'ut5-HttpPort',
            headers: {},
            auth: {},
            secure: false,
            sslKeyFile: '',
            sslCertFile: '',
            sslRootCertFile: '',
            validateCert: true
        };
        this.http = null;
        this.key = '';
        this.cert = '';
        this.pfx = '';
    }

    util.inherits(HttpPort, Port);

    HttpPort.prototype.init = function init() {
        Port.prototype.init.apply(this, arguments);
        if (this.config.secure) {
            this.http = require('https');

            if (this.config.sslKeyFile != '') {
                this.key = fs.readFileSync(this.config.sslKeyFile);
            }
            if (this.config.sslCertFile != '') {
                this.cert = fs.readFileSync(this.config.sslCertFile);
            }
            if (this.config.sslRootCertFile != '') {
                this.pfx = fs.readFileSync(this.config.sslRootCertFile);
            }
        }
    };

    HttpPort.prototype.start = function start(callback) {
        Port.prototype.start.apply(this, arguments);
        this.pipeExec(this.exec);
    };

    HttpPort.prototype.exec = function exec(msg, callback) {
        var method = msg.httPMethod || this.config.method;
        var hostname = msg.url || this.config.host;
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

        var usernm = (msg.auth && msg.auth.userName) ?  msg.auth.userName : (this.config.auth ? this.config.auth.user : false);
        var pass = (msg.auth && msg.auth.password) ? msg.auth.password : (this.config.auth ? this.config.auth.password : '');
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
        if (msg.timeout) {
            req.timeout(msg.timeout);
        }

        if (msg.fileAttachment) {
            req = req.attach('file', msg.fileAttachment);
        }

        var headers = msg.Header || this.config.headers;
        if (!headers['User-Agent']) {
            headers['User-Agent'] = this.config.userAgent;
        }
        req = req.set(headers);

        req.send(msg.payload);

        var self = this;

        req.on('error', function(e) {
            self.log.error({opcode:'HttpPort.exec', id:self.config.id, err: e.message});
            msg.$$.mtid = 'error';
            msg.$$.errorCode = '2038';
            msg.$$.errorMessage = e.message;
            msg.payload = e;
            callback(msg, null);
        });
        req.end(function(res) {
            msg.$$.mtid = 'response';
            msg.headers = res.header;
            msg.httpStatus = res.status;
            msg.payload = {body: res.body, text: res.text};
            callback(null, msg);
        });
    };

    return HttpPort;

});}(typeof define === 'function' && define.amd ? define : function(factory) { module.exports = factory(require); }));
