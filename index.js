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
};

HttpPort.prototype.start = function start(callback) {
    Port.prototype.start.apply(this, arguments);
    this.pipeExec(this.exec.bind(this), this.config.concurrency);
};
HttpPort.prototype.exec = function exec(msg) {
    var $meta = (arguments.length > 1 && arguments[arguments.length - 1]);
    var url = '';
    var self = this;
    var headers = assign({}, this.config.headers, msg.headers);
    var parseResponse = true;
    if (this.config.parseResponse === false) {
        parseResponse = false;
    }
    if (msg.parseResponse === false) {
        parseResponse = false;
    }

    return when.promise(function(resolve, reject) {
        //check for required params
        if (!(url = msg.url || self.config.url)) {
            reject(errors.configPropMustBeSet('url should be set'));
            return;
        } else {
            url = url + (msg.uri || self.config.uri || '');
        }

        var connProps = {
            'followRedirect': false,
            'method': msg.httpMethod || self.config.method,
            'url': url,
            'timeout': msg.requestTimeout || self.config.requestTimeout || 30000,
            'headers': headers,
            'body': msg.payload
        };
        //if there is a raw config propery it will be merged with `connProps`
        if (self.config.raw) {
            assign(connProps, self.config.raw);
        }

        //do the connection + request
        request(connProps, function cbresp(error, response, body) {
            if (error) {//return error if any
                reject(errors.http(error));
            } else {
                //prepare response
                $meta.mtid = 'response';
                var correctResponse = {
                    headers: response.headers,
                    httpStatus: response.statusCode,
                    payload: body
                };
                if (response.statusCode !== 200) {
                    self.log && self.log.error && self.log.error('Http client request error! body: ' + body + ', statusCode: ' +
                        response.statusCode + ', statusMessage: ' + response.statusMessage);
                    var e;
                    e = errors.http(response);
                    e.code = response.statusCode;
                    reject(e);
                } else if (!body || body === '') {//if response is empty
                    correctResponse.payload = ((parseResponse) ? {} : body);
                    resolve(correctResponse);
                } else {
                    //todo is this really necessarry, probably is provided by request module already
                    //parse the response if allowed
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
                            } else if (response.headers['content-type'].indexOf('application/json') !== -1) {
                                try {
                                    correctResponse.payload = JSON.parse(body);
                                } catch (err) {
                                    reject(errors.jsonParser(err));
                                    return;
                                }
                                resolve(correctResponse);
                            } else {
                                reject(errors.parserNotFound('No parser found to parse response of type: ' + response.headers['content-type']));
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
