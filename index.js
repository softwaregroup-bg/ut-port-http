'use strict';
const request = (process.type === 'renderer') ? require('ut-browser-request') : require('request');
const xml2js = require('xml2js');
const errorsFactory = require('./errors');
const statusCodeError = (msg, resp) => {
    if (resp.statusCode < 200 || resp.statusCode >= 300) {
        if (msg.allowedStatusCodes) {
            if (typeof msg.allowedStatusCodes === 'number') {
                return msg.allowedStatusCodes !== resp.statusCode;
            }
            if (Array.isArray(msg.allowedStatusCodes)) {
                return msg.allowedStatusCodes.indexOf(resp.statusCode) === -1;
            }
            if (msg.allowedStatusCodes instanceof RegExp) {
                return !msg.allowedStatusCodes.test(resp.statusCode);
            }
        }
        return true;
    }
    return false;
};

let processDownload = (blob, fileName) => {
    if (typeof window === 'object') {
        let url = window.URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.style = 'display: none';
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
    }
};
module.exports = ({utPort}) => class HttpPort extends utPort {
    constructor() {
        super(...arguments);
        Object.assign(this.errors, errorsFactory(this.bus.errors));
    }
    get defaults() {
        return {
            type: 'http',
            url: false,
            method: 'get',
            uri: '/',
            headers: {}
        };
    }
    async init() {
        const result = super.init(...arguments);
        this.bytesSent = this.counter && this.counter('counter', 'bs', 'Bytes sent', 300);
        this.bytesReceived = this.counter && this.counter('counter', 'br', 'Bytes received', 300);
        return result;
    }
    async start() {
        this.bus.attachHandlers(this.methods, this.config.imports, this);
        const result = await super.start(...arguments);
        this.pull(this.exec);
        return result;
    }
    async exec(msg) {
        let $meta = (arguments.length > 1 && arguments[arguments.length - 1]);
        let methodName = ($meta && $meta.method);
        if (methodName) {
            let method = this.findHandler(methodName);
            if (method instanceof Function) {
                return method.apply(this, Array.prototype.slice.call(arguments));
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
                reject(this.errors['portHTTP.configPropMustBeSet']('url should be set'));
                return;
            } else {
                url = url + (msg.uri || this.config.uri || '');
            }

            let reqProps = {
                followRedirect: false,
                json: msg.json || this.config.json,
                withCredentials: msg.withCredentials || this.config.withCredentials,
                qs: msg.qs,
                method: msg.httpMethod || this.config.method,
                url: url,
                timeout: msg.requestTimeout || this.config.requestTimeout || 30000,
                headers: headers,
                blob: msg.blob,
                body: msg.payload
            };
            // if there is a raw config property it will be merged with `reqProps`
            if (this.config.raw) {
                Object.assign(reqProps, this.config.raw);
            }
            this.log && this.log.debug && this.log.debug(reqProps);
            // do the connection + request
            let req = request(reqProps, (error, response, body) => {
                this.log && this.log.debug && this.log.debug({error, response, body});
                if (error) { // return error if any
                    if (this.bus.config.debug) {
                        error.request = reqProps;
                    } else {
                        error.request = {method: reqProps.body && reqProps.body.method};
                    }
                    switch (error.code) {
                        case 'ECONNREFUSED':
                            reject(this.errors['port.notConnected']());
                            break;
                        case 'EPIPE':
                        case 'ECONNRESET':
                            reject(this.errors['port.disconnectBeforeResponse']());
                            break;
                        case 'ESOCKETTIMEDOUT':
                        case 'ETIMEDOUT':
                            reject(this.errors[error.connect ? 'port.notConnected' : 'port.disconnectBeforeResponse']());
                            break;
                        default:
                            reject(this.errors['portHTTP.generic'](error));
                    }
                } else {
                    // prepare response
                    $meta.mtid = 'response';
                    let correctResponse = {
                        headers: response.headers,
                        httpStatus: response.statusCode,
                        payload: body
                    };
                    if (statusCodeError(msg, response)) {
                        let error = this.errors.portHTTP({
                            message: (response.body && response.body.message) || 'HTTP error',
                            statusCode: response.statusCode,
                            statusText: response.statusText,
                            statusMessage: response.statusMessage,
                            validation: response.body && response.body.validation,
                            debug: response.body && response.body.debug,
                            code: response.statusCode,
                            body: response.body
                        });
                        this.log && this.log.error && this.log.error(error);
                        reject(error);
                    } else if (!body || body === '') { // if response is empty
                        correctResponse.payload = ((parseResponse) ? {} : body);
                        resolve(correctResponse);
                    } else {
                        // process blob type response
                        if (reqProps.blob) {
                            correctResponse.payload = {
                                result: (((response.getResponseHeader('Content-Disposition') || '').split('filename=') || [])[1] || '').replace(/^"|"$/g, '')
                            };
                            processDownload(response.body, correctResponse.payload.result);
                            resolve(correctResponse);
                        }
                        // todo is this really necessarily, probably is provided by request module already
                        // parse the response if allowed
                        if (parseResponse) {
                            if (!response.headers['content-type']) {
                                reject(this.errors['portHTTP.parser.missingContentType']());
                            } else {
                                if (response.headers['content-type'].indexOf('/xml') !== -1 || response.headers['content-type'].indexOf('/soap+xml') !== -1) {
                                    xml2js.parseString(body, {explicitArray: false}, function(err, result) {
                                        if (err) {
                                            reject(this.errors['portHTTP.parser.xmlParser'](err));
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
    }
};
