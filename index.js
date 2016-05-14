var Port = require('ut-bus/port');
var util = require('util');
var errors = require('./errors.js');
var request = (process.type === 'renderer') ? require('browser-request') : require('request');
var xml2js = require('xml2js');
var when = require('when');
var assign = require('lodash/object/assign');

function HttpPort() {
    Port.call(this);
    this.config = {
        id: null,
        logLevel: '',
        type: 'http',
        url: false,
        method: 'get',
        uri: '/',
        headers: {}
    };
}

util.inherits(HttpPort, Port);

HttpPort.prototype.init = function init() {
    Port.prototype.init.apply(this, arguments);
    this.latency = this.counter && this.counter('average', 'lt', 'Latency');
};

HttpPort.prototype.start = function start(callback) {
    Port.prototype.start.apply(this, arguments);
    this.pipeExec(this.exec.bind(this), this.config.concurrency);
};
HttpPort.prototype.exec = function exec(msg) {
    var $meta = (arguments.length > 1 && arguments[arguments.length - 1]);
    var url = '';
    var headers = assign({}, this.config.headers, msg.headers);
    var parseResponse = true;
    if (this.config.parseResponse === false) {
        parseResponse = false;
    }
    if (msg.parseResponse === false) {
        parseResponse = false;
    }

    return when.promise((resolve, reject) => {
        // check for required params
        if (!(url = msg.url || this.config.url)) {
            reject(errors.configPropMustBeSet('url should be set'));
            return;
        } else {
            url = url + (msg.uri || this.config.uri || '');
        }

        var connProps = {
            'followRedirect': false,
            'method': msg.httpMethod || this.config.method,
            'url': url,
            'timeout': msg.requestTimeout || this.config.requestTimeout || 30000,
            'headers': headers,
            'body': msg.payload
        };
        // if there is a raw config propery it will be merged with `connProps`
        if (this.config.raw) {
            assign(connProps, this.config.raw);
        }

        // do the connection + request
        request(connProps, (error, response, body) => {
            if (error) { // return error if any
                reject(errors.http(error));
            } else {
                // prepare response
                $meta.mtid = 'response';
                var correctResponse = {
                    headers: response.headers,
                    httpStatus: response.statusCode,
                    payload: body
                };
                if (response.statusCode !== 200) {
                    this.log && this.log.error && this.log.error('Http client request error! body: ' + body + ', statusCode: ' +
                        response.statusCode + ', statusMessage: ' + response.statusMessage);
                    var e;
                    e = errors.http(response);
                    e.code = response.statusCode;
                    reject(e);
                } else if (!body || body === '') { // if response is empty
                    correctResponse.payload = ((parseResponse) ? {} : body);
                    resolve(correctResponse);
                } else {
                    // todo is this really necessarry, probably is provided by request module already
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
    });
};

module.exports = HttpPort;
