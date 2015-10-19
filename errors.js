var create = require('errno').custom.createError;

var PortHTTP = create('PortHTTP');
var Parser = create('Parser', PortHTTP);
var MissingContentType = create('MissingContentType', Parser);
var XmlParser = create('XmlParser', Parser);
var JsonParser = create('JsonParser', Parser);
var ParserNotFound = create('ParserNotFound', Parser);
var Config = create('Config', PortHTTP);
var ConfigPropMustBeSet = create('ConfigPropMustBeSet', Config);

module.exports = {
    http: function(cause) {
        return new PortHTTP('HTTP error', cause);
    },
    parser: function(cause) {
        return new Parser('Parser Error', cause);
    },
    missingContentType: function(cause) {
        return new MissingContentType('Server returned no content type', cause);
    },
    xmlParser: function(cause) {
        return new XmlParser('Xml Parser Error', cause);
    },
    jsonParser: function(cause) {
        return new JsonParser('Json Parser Error', cause);
    },
    parserNotFound: function(cause) {
        return new ParserNotFound('Parser Not Found', cause);
    },
    config: function(cause) {
        return new Config('Configuration error', cause);
    },
    configPropMustBeSet: function(cause) {
        return new ConfigPropMustBeSet('Configuration property should be set', cause);
    }
};
