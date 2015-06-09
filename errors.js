var create = require('errno').custom.createError;
var customErrors = {};

customErrors.HttpClient = {def: create('HttpClient'), message: 'Common error'};
customErrors.Parser = {def: create('Parser', customErrors.HttpClient.def), message: 'Parser Error'};
customErrors.MissingContentType = {def: create('MissingContentType', customErrors.Parser.def), message: 'Server returned no content type'};
customErrors.XmlParser = {def: create('XmlParser', customErrors.Parser.def), message: 'Xml Parser Error'};
customErrors.JsonParser = {def: create('JsonParser', customErrors.Parser.def), message: 'Json Parser Error'};
customErrors.ParserNotFound = {def: create('ParserNotFound', customErrors.Parser.def), message: 'Parser Not Found'};
customErrors.Config = {def: create('Config', customErrors.HttpClient.def), message: 'Configuration error'};
customErrors.ConfigPropMustdBeSet = {def: create('ConfigPropMustdBeSet', customErrors.Config.def), message: 'Configuration property should be set'};

module.exports = {
    errors: customErrors,
    create: function(hash, cause) {
        if (!customErrors[hash]) {
            return new customErrors.HttpClient.def(customErrors.HttpClient.message, cause);
        }
        var err = new customErrors[hash].def(customErrors[hash].message, cause);
        return err;
    },
    createUT5: function(hash, cause) {
        var err = this.create(hash, cause);
        return {'$$':{'mtid':'error', 'errorCode':err.name, 'errorMessage':err.message}};
    }
};
