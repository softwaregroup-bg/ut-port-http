var Port = require('ut-bus/port');
var util = require('util');
var fs = require('fs');
var errors = require('./errors.js');
var request = require('request');
var xml2js = require('xml2js');
var when = require('when');
var _ = require('lodash');

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
HttpPort.prototype.exec = function exec(msg, callback) {
    var url = '';
    var self = this;
    var headers = msg.headers || this.config.headers || {};
    headers['User-Agent'] = headers['User-Agent'] || 'Software Group UT-Route 5';
    var parseResponse = true;
    if (this.config.parseResponse === false) {
        parseResponse = false;
    }
    if (msg.parseResponse === false) {
        parseResponse = false;
    }

    //check for required params
    if (!(url = msg.url || this.config.url)) {
        callback(errors.createUT5('ConfigPropMustdBeSet', 'url should be set'));
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
    //if there is a raw config propery it will be merged with `connProps`
    if (this.config.raw) {
        _.assign(connProps, this.config.raw);
    }
    //do the connection + request
    request(connProps, function cbresp(error, response, body) {
        if (error) {//return error if any
            return callback({'$$':{'mtid':'error', 'errorCode':error.code, 'errorMessage': error.message}});
        } else {
            //prepare response
            var correctResponse = {
                $$: {mtid: 'response', opcode: msg && msg.$$ && msg.$$.opcode},
                headers: response.headers,
                httpStatus: response.statusCode,
                payload: body
            };
            if (response.statusCode != 200) {
                self.log && self.log.error && self.log.error('Http client request error! body: ' + body + ', statusCode: ' + response.statusCode + ', statusMessage: ' + response.statusMessage);
                return callback({'$$':{'mtid':'error', 'errorCode': response.statusCode,
                    'errorMessage': 'Http client: Remote server encountered an error processing the request!'
                }});
            }

            if (!body || body === '') {//if response is empty
                correctResponse.payload = ((parseResponse) ? {} : body);
                return callback(null, correctResponse);
            } else {
                //parse the response if allowed
                if (parseResponse) {
                    if (!response.headers['content-type']) {
                        return callback(errors.createUT5('MissingContentType'));
                    } else {

                        if (response.headers['content-type'].indexOf('/xml') !== -1 || response.headers['content-type'].indexOf('/soap+xml') !== -1) {
                            return xml2js.parseString(body, {explicitArray: false}, function(err, result) {
                                if (err) {
                                    callback(errors.createUT5('XmlParser', err));
                                } else {
                                    correctResponse.payload = result
                                    callback(null, correctResponse);
                                }
                            });
                        } else if (response.headers['content-type'].indexOf('application/json') !== -1) {
                            try {
                                correctResponse.payload = JSON.parse(body);
                            } catch (err) {
                                return callback(errors.createUT5('JsonParser', err));
                            }
                            return callback(null, correctResponse);
                        } else {
                            return callback(errors.createUT5('ParserNotFound', 'No parser found to parse response of type: ' + response.headers['content-type']));
                        }
                    }
                }
                //finally return the result
                return callback(null, correctResponse);
            }
        }
    });
};

module.exports = HttpPort;
