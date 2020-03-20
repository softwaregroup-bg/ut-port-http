'use strict';
const request = (process.type === 'renderer') ? require('ut-browser-request') : require('request');
const utOpenAPI = require('ut-openapi');
const merge = require('ut-function.merge');
const xml2js = require('xml2js');
const errors = require('./errors.json');
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

const processDownload = (blob, fileName) => {
    if (typeof window === 'object') {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style = 'display: none';
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
    }
};
module.exports = ({utPort, registerErrors}) => class HttpPort extends utPort {
    constructor() {
        super(...arguments);
        Object.assign(this.errors, registerErrors(errors));
    }

    get defaults() {
        return {
            type: 'http',
            url: false,
            method: 'GET',
            uri: '/',
            headers: {},
            openApi: {}
        };
    }

    get schema() {
        return {
            type: 'object',
            properties: {
                url: {
                    oneOf: [
                        {
                            enum: [false]
                        },
                        {
                            type: 'string',
                            format: 'uri',
                            pattern: '^https?://'
                        }
                    ]
                },
                uri: {
                    type: 'string'
                },
                method: {
                    type: 'string',
                    enum: [
                        'GET', 'get',
                        'HEAD', 'head',
                        'POST', 'post',
                        'PUT', 'put',
                        'DELETE', 'delete',
                        'CONNECT', 'connect',
                        'OPTIONS', 'options',
                        'TRACE', 'trace',
                        'PATCH', 'patch'
                    ]
                },
                headers: {
                    type: 'object'
                },
                openApi: {
                    type: 'object'
                },
                parseResponse: {
                    type: 'boolean'
                },
                parseOptions: {
                    type: 'object'
                },
                requestTimeout: {
                    type: 'number'
                },
                withCredentials: {
                    type: 'boolean'
                },
                raw: {
                    type: 'object'
                }
            }
        };
    }

    async init() {
        const result = super.init(...arguments);
        this.bytesSent = this.counter && this.counter('counter', 'bs', 'Bytes sent', 300);
        this.bytesReceived = this.counter && this.counter('counter', 'br', 'Bytes received', 300);
        this.openApi = {};
        const openApiNamespaces = Object.keys({...this.config.openApi}).filter(Boolean);
        if (openApiNamespaces.length) {
            const openApi = utOpenAPI();
            openApiNamespaces.forEach(namespace => {
                if (![].concat(this.config.namespace).find(n => namespace.startsWith(n))) {
                    throw this.errors['portHTTP.namespaceNotDefined']({params: {namespace: namespace.split('.')[0]}});
                }
            });
            await openApi.load(this.config.openApi);
            Object.assign(this.openApi, openApi.export());
        }

        return result;
    }

    async start() {
        this.bus.attachHandlers(this.methods, this.config.imports, this);
        const result = await super.start(...arguments);
        this.pull(this.exec);
        return result;
    }

    async exec(msg) {
        const $meta = (arguments.length > 1 && arguments[arguments.length - 1]);
        const methodName = $meta && $meta.method;
        if (methodName) {
            const method = this.findHandler(methodName);
            if (method instanceof Function) {
                return method.apply(this, Array.prototype.slice.call(arguments));
            }
        }

        return new Promise((resolve, reject) => {
            const parseResponse = this.config.parseResponse !== false && msg.parseResponse !== false;
            const reqProps = {};
            const defaults = {
                withCredentials: msg.withCredentials || this.config.withCredentials,
                requestTimeout: msg.requestTimeout || this.config.requestTimeout || 30000,
                headers: this.config.headers,
                followRedirect: false
            };
            if (methodName && this.openApi[methodName]) {
                merge(reqProps, defaults, this.config.raw, this.openApi[methodName](msg));
            } else {
                // check for required params
                let url = msg.url || this.config.url;
                if (!url) return reject(this.errors['portHTTP.configPropMustBeSet']({params: {prop: 'url'}}));
                url += msg.uri || this.config.uri || '';

                merge(reqProps, defaults, {
                    qs: msg.qs,
                    method: msg.httpMethod || this.config.method,
                    url: url,
                    headers: msg.headers,
                    blob: msg.blob,
                    body: msg.payload,
                    formData: msg.formData
                }, this.config.raw);
            }

            this.log && this.log.debug && this.log.debug(reqProps);
            // do the connection + request
            const req = request(reqProps, (error, response = {}, body = {}) => {
                try {
                    const {
                        statusCode,
                        statusText,
                        statusMessage
                    } = response;
                    const {
                        method,
                        uri,
                        url
                    } = response.request || reqProps;
                    this.log && this.log.debug && this.log.debug({
                        error,
                        http: {
                            method,
                            url: (uri && uri.href) || url,
                            statusCode,
                            statusText,
                            statusMessage,
                            body
                        }
                    });
                    if (error) { // return error if any
                        if (this.bus.config.debug) {
                            error.request = reqProps;
                        } else {
                            error.request = {method: reqProps.body && reqProps.body.method};
                        }
                        switch (error.code) {
                            case 'ENOTFOUND':
                            case 'ECONNREFUSED':
                                reject(this.errors['port.notConnected'](error));
                                break;
                            case 'EPIPE':
                            case 'ECONNRESET':
                                reject(this.errors['port.disconnectBeforeResponse'](error));
                                break;
                            case 'ESOCKETTIMEDOUT':
                            case 'ETIMEDOUT':
                                reject(this.errors[error.connect ? 'port.notConnected' : 'port.disconnectBeforeResponse'](error));
                                break;
                            default:
                                reject(this.errors['portHTTP.generic'](error));
                        }
                    } else {
                        // prepare response
                        $meta.mtid = 'response';
                        const correctResponse = {
                            headers: response.headers,
                            httpStatus: statusCode,
                            payload: body
                        };
                        if (statusCodeError(msg, response)) {
                            const error = this.errors.portHTTP({
                                message: (response.body && response.body.message) || 'HTTP error',
                                statusCode,
                                statusText,
                                statusMessage,
                                validation: response.body && response.body.validation,
                                debug: response.body && response.body.debug,
                                code: statusCode,
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
                                    const parseOptions = msg.parseOptions || (this.config.parseOptions && this.config.parseOptions[response.headers['content-type']]);
                                    if (response.headers['content-type'].indexOf('/xml') !== -1 || response.headers['content-type'].indexOf('/soap+xml') !== -1) {
                                        xml2js.parseString(body, {
                                            explicitArray: false,
                                            ...parseOptions
                                        }, function(err, result) {
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
                } catch (e) {
                    reject(this.errors.portHTTP(e));
                }
            });
            (typeof req.on === 'function') && req.on('request', req => {
                let start = 0;
                req.on('socket', socket => {
                    start = socket.bytesWritten || 0;
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
