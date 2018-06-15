'use strict';
module.exports = ({defineError, getError, fetchErrors}) => {
    if (!getError('portHTTP')) {
        const PortHTTP = defineError('portHTTP', null, 'http port error', 'error');
        defineError('configPropMustBeSet', PortHTTP, 'Configuration property should be set', 'error');
        defineError('generic', PortHTTP, 'http port generic error', 'error');
        defineError('config', PortHTTP, 'Configuration error', 'error');
        const Parser = defineError('parser', PortHTTP, 'Parser Error', 'error');
        defineError('missingContentType', Parser, 'Server returned no content type', 'error');
        defineError('xmlParser', Parser, 'XML Parser Error', 'error');
        defineError('jsonParser', Parser, 'Json Parser Error', 'error');
        defineError('parserNotFound', Parser, 'Parser Not Found', 'error');
    }
    return fetchErrors('portHTTP');
};
