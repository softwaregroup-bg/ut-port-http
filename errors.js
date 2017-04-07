var create = require('ut-error').define;

var PortHTTP = create('PortHTTP');
var Generic = create('Generic', PortHTTP);
var Parser = create('Parser', PortHTTP, 'Parser Error');
var MissingContentType = create('MissingContentType', Parser, 'Server returned no content type');
var XmlParser = create('XmlParser', Parser, 'XML Parser Error');
var JsonParser = create('JsonParser', Parser, 'Json Parser Error');
var ParserNotFound = create('ParserNotFound', Parser, 'Parser Not Found');
var Config = create('Config', PortHTTP, 'Configuration error');
var ConfigPropMustBeSet = create('ConfigPropMustBeSet', Config, 'Configuration property should be set');

module.exports = {
    http: function(response) {
        if (response instanceof Error) {
            return new Generic(response);
        } else {
            var params;
            try {
                params = JSON.parse(response.request.body).params;
            } catch (e) {
                params = {};
            }

            return new PortHTTP({
                message: (response.body && response.body.message) || 'HTTP error',
                statusCode: response.statusCode,
                params,
                statusMessage: response.statusText,
                validation: response.body && response.body.validation,
                debug: response.body && response.body.debug
            });
        }
    },
    parser: function(cause) {
        return new Parser(cause);
    },
    missingContentType: function(cause) {
        return new MissingContentType(cause);
    },
    xmlParser: function(cause) {
        return new XmlParser(cause);
    },
    jsonParser: function(cause) {
        return new JsonParser(cause);
    },
    parserNotFound: function(cause) {
        return new ParserNotFound(cause);
    },
    config: function(cause) {
        return new Config(cause);
    },
    configPropMustBeSet: function(cause) {
        return new ConfigPropMustBeSet(cause);
    }
};
