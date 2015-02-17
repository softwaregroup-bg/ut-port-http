(function(define) {define(function(require) {
    //dependencies

    var Port = require('ut-bus/port');
    var util = require('util');
    var fs = require('fs');
    var request = require('superagent');
    var xml2js = require('xml2js');

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

            if (this.config.sslKeyFile && this.config.sslKeyFile != '') {
                this.key = fs.readFileSync(this.config.sslKeyFile);
            }
            if (this.config.sslCertFile && this.config.sslCertFile != '') {
                this.cert = fs.readFileSync(this.config.sslCertFile);
            }
            if (this.config.sslRootCertFile && this.config.sslRootCertFile != '') {
                this.pfx = fs.readFileSync(this.config.sslRootCertFile);
            }
        }
    };

    HttpPort.prototype.start = function start(callback) {
        Port.prototype.start.apply(this, arguments);
        this.pipeExec(this.exec.bind(this));
    };

    HttpPort.prototype.exec = function exec(msg, callback) {
        var method = msg.httpMethod || this.config.method;
        var hostname = msg.url || this.config.host;
        var prt = msg.port || this.config.port;
        if (this.config.port || msg.port) {
            hostname += ':' + prt;
        }
        var pth = msg.path || this.config.path;
        if (this.config.path || msg.path) {
            hostname += pth;
        }

        var req = request(method == 'get' ? 'GET' : 'POST', hostname);

        if(prt){
            req = req.set('port', prt);
        }
        if (method == 'form') {
            req = req.type('form');
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

        var headers = msg.headers || this.config.headers;
        if (!headers['User-Agent']) {
            headers['User-Agent'] = this.config.userAgent;
        }
        req = req.set(headers);

        var self = this;

        req.send(msg.payload);

        req.on('error', function(e) {
            self.log.error('Http client request error:' + e.message);
            msg.$$.mtid = 'error';
            msg.$$.errorCode = '2038';
            msg.$$.errorMessage = e.message;
            callback(msg, null);
        });


        req.end(function(res) {
            if(res.status != 200){
                self.log.error('Http client request error: ' + res.text);
                callback({
                    $$: {mtid: 'error',
                        errorCode: res.status,
                        errorMessage: 'Http client request error!',
                    }
                }, null);
            }

            var resData = {
                $$: {mtid: 'response'},
                headers: res.header,
                httpStatus: res.status,
                payload: restxt
            };
            if(res.text) {
                resData.payload = res.text;
                callback(null, resData);
                return;
            }
            var restxt = '';
            res.res.on('data', function(chunk){
                restxt += chunk;
            });
            res.res.on('end', function () {
                resData.payload = restxt;
                if(res.headers['content-type'].indexOf('application/xml') != -1){
                    xml2js.parseString(restxt,{ explicitArray: false }, function (err, result) {
                        if(err){
                            self.log.error('Unable to parse xml response! errorMessage:' + err.message);
                            resData.$$.mtid = 'error';
                            resData.$$.errorCode = '2038';
                            resData.$$.errorMessage = 'Unable to parse xml response';
                            callback(resData, null);
                        }else{
                            resData.payload = result;
                            callback(null, resData);
                        }
                    });
                }else{
                    callback(null, resData);
                }
            });

        });

    };

    return HttpPort;

});}(typeof define === 'function' && define.amd ? define : function(factory) { module.exports = factory(require); }));
