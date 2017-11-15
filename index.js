'use strict';
const merge = require('lodash.merge');
const util = require('util');
const request = (process.type === 'renderer') ? require('browser-request') : require('request');
const xml2js = require('xml2js');
let errors;

module.exports = function({parent}) {
    function HttpPort({config}) {
        parent && parent.apply(this, arguments);
        this.config = merge({
            id: null,
            logLevel: 'info',
            type: 'http',
            url: false,
            method: 'get',
            uri: '/',
            headers: {}
        }, config);
        errors = errors || require('./errors')(this.defineError);
    }

    if (parent) {
        util.inherits(HttpPort, parent);
    }

    HttpPort.prototype.init = function init() {
        parent && parent.prototype.init.apply(this, arguments);
        this.bytesSent = this.counter && this.counter('counter', 'bs', 'Bytes sent', 300);
        this.bytesReceived = this.counter && this.counter('counter', 'br', 'Bytes received', 300);
    };

    HttpPort.prototype.start = function start(callback) {
        this.bus.importMethods(this.config, this.config.imports, {request: true, response: true}, this);
        return Promise.resolve()
            .then(() => parent.prototype.start.apply(this, Array.prototype.slice.call(arguments)))
            .then(result => {
                this.pull(this.exec);
                return result;
            });
    };
    HttpPort.prototype.exec = function exec(msg) {
        let $meta = (arguments.length > 1 && arguments[arguments.length - 1]);

        let methodName = ($meta && $meta.method);
        if (methodName) {
            let method = this.config[methodName];
            if (!method) {
                methodName = methodName.split('/', 2);
                method = methodName.length === 2 && this.config[methodName[1]];
            }
            if (method instanceof Function) {
                return Promise.resolve().then(() => method.apply(this, Array.prototype.slice.call(arguments)));
            }
        }

        let url = '';
        let headers = Object.assign({}, this.config.headers, msg.headers);
        let parseResponse = true;
        if (this.config.parseResponse === false) {
            parseResponse = false;
        }
        if (msg.parseResponse === false) {
            parseResponse = false;
        }

        return new Promise((resolve, reject) => {
            // check for required params
            if (!(url = msg.url || this.config.url)) {
                reject(errors.configPropMustBeSet('url should be set'));
                return;
            } else {
                url = url + (msg.uri || this.config.uri || '');
            }

            let reqProps = {
                'followRedirect': false,
                'qs': msg.qs,
                'method': msg.httpMethod || this.config.method,
                'url': url,
                'timeout': msg.requestTimeout || this.config.requestTimeout || 30000,
                'headers': headers,
                'body': msg.payload
            };
            // if there is a raw config property it will be merged with `reqProps`
            if (this.config.raw) {
                Object.assign(reqProps, this.config.raw);
            }

            // do the connection + request
            let req = request(reqProps, (error, response, body) => {
                if (error) { // return error if any
                    error.request = reqProps;
                    reject(errors.http(error));
                } else {
                    // prepare response
                    $meta.mtid = 'response';
                    let correctResponse = {
                        headers: response.headers,
                        httpStatus: response.statusCode,
                        payload: body
                    };
                    if (response.statusCode < 200 || response.statusCode >= 300) {
                        this.log && this.log.error && this.log.error('Http client request error! body: ' + body + ', statusCode: ' +
                            response.statusCode + ', statusMessage: ' + response.statusMessage);
                        let error;
                        error = errors.http(response);
                        error.code = response.statusCode;
                        error.body = response.body;
                        reject(error);
                    } else if (!body || body === '') { // if response is empty
                        correctResponse.payload = ((parseResponse) ? {} : body);
                        resolve(correctResponse);
                    } else {
                        // todo is this really necessarily, probably is provided by request module already
                        // parse the response if allowed
                        if (parseResponse) {
                            if (!response.headers['content-type']) {
                                reject(errors.missingContentType());
                            } else {
                                if (response.headers['content-type'].indexOf('/xml') !== -1 || response.headers['content-type'].indexOf('/soap+xml') !== -1) {
                                    xml2js.parseString(body, {explicitArray: false}, function(err, result) {
                                        if (err) {
                                            reject(errors.xmlParser(err));
                                        } else {
                                            correctResponse.payload = result;
                                            resolve(correctResponse);
                                        }
                                    });
                                } else {
                                    correctResponse.payload = body;
                                    resolve(correctResponse);
                                }
                            }
                        } else {
                            resolve(correctResponse);
                        }
                    }
                }
            });
            (typeof req.on === 'function') && req.on('request', req => {
                let start = 0;
                req.on('socket', socket => {
                    start = (socket.hasOwnProperty('bytesWritten') && socket.bytesWritten) || 0;
                    socket.on('data', data => {
                        this.bytesReceived && this.bytesReceived(data.length);
                    });
                });
                req.on('response', resp => {
                    this.bytesSent && req.socket && this.bytesSent(req.socket.bytesWritten - start);
                });
            });
        });
    };

    return HttpPort;
};
