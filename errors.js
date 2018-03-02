'use strict';
module.exports = create => {
    const PortHTTP = create('portHTTP');
    const Generic = create('generic', PortHTTP);
    const Parser = create('parser', PortHTTP, 'Parser Error');

    return {
        http: function(response) {
            if (response instanceof Error) {
                return new Generic(response);
            } else {
                return new PortHTTP({
                    message: (response.body && response.body.message) || 'HTTP error',
                    statusCode: response.statusCode,
                    statusText: response.statusText,
                    statusMessage: response.statusMessage,
                    validation: response.body && response.body.validation,
                    debug: response.body && response.body.debug
                });
            }
        },
        config: create('config', PortHTTP, 'Configuration error'),
        missingContentType: create('missingContentType', Parser, 'Server returned no content type'),
        xmlParser: create('xmlParser', Parser, 'XML Parser Error'),
        jsonParser: create('jsonParser', Parser, 'Json Parser Error'),
        parserNotFound: create('parserNotFound', Parser, 'Parser Not Found'),
        configPropMustBeSet: create('configPropMustBeSet', PortHTTP, 'Configuration property should be set')
    };
};
