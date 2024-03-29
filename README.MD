# UT Port HTTP Client

Create http/s requests based on
[`request`](https://www.npmjs.com/package/request) module

## Configuration

* `id`: unique identification of port
* `logLevel`: trace, debug or info.
* `url`: remote server URL `http://example.com:80`.
* `uri`: remote server request URI `/about.html`.
* `method`: http request method `POST` or `GET`.
* `receive`: incoming message convert function , return object or promise.
* `send`: outgoing message convert function, return object or promise .
* `tls`: can be used to enable TLS.
  For detailed information see
  [`tls.createSecureContext`](https://nodejs.org/api/tls.html#tls_tls_createsecurecontext_options)
  and
  [request TLS/SSL Protocol](https://www.npmjs.com/package/request#tlsssl-protocol)

  Accepts the options:

  * `cert` - Path to client certificate file
  * `key` - Path to client certificate private key file
  * `passphrase` - Client certificate passphrase
  * `ca` - Path to trusted root certificate, usually needed for using
    self signed certificates.

 Additional configuration options:

* `raw`: this property can be set in config file only, everything in this
  property will be merged with current configuration
* `parseResponse`: to parse the response or not, defaults to `true`
* `parseOptions`: to pass certain options when parsing the response
  (based on the content type)
example:

```json
{
    "parseResponse": true,
    "parseOptions": {
        "application/xml": {
            "explicitArray": true
        }
    }
}
```

* `requestTimeout`: in ms, time before timeout error emit, defaults to 30 sec.
* `headers`: object containing request header values.
* `namespace`: Array containing different namespaces of this port.
* `start`: function that will be called once on creation of port. It can be used
  for setting global variables and initializing objects.

### Response

Response is always an object containing response from remote server or error.
If server returns status code different from `200 (OK)` or some error occurred
during the process, the response message object will look like:

```javascript
{
    $$:{
        mtid: 'error',
        errorCode: '',
        errorMessage: ''
    }
}
```

Message properties:

* `payload`: Contains response data returned from the remote server.
  If header `content-type` contains `/xml` and `parseResponse = true`
  the data will be converted to javascript object, the same is for Json,
  if for some reason `parseResponse=true` and there is not parser available for
  parsing the response, error will be emitted
* `headers`: Response headers.
* `httpStatus`: Response status code.

## Example

Example `index.js` configuration file used for making web service requests to
external system. `Send` and `receive` are used for modifying message object just
before it is sent and just after response is received.

```javascript
var xmpParser = require('./xmlParser');
var loadTemplate;
module.exports = {
    id: 't24',
    type: 'http',
    logLevel: 'trace',
    url: 'http://twsdevcloudservice.cloudapp.net',
    uri: '/swg/swg.svc',
    method: 'post',
    namespace: ['cbs'],

    start: function() {
        loadTemplate = this.bus.importMethod('template.load');
    },

    receive:function(msg) {
        if(msg.$$.mtid == 'error'){
            return msg;
        }
        return xmpParser.parse(msg.$$.opcode, msg.payload)
            .then(function(res) {

                if(res.successIndicator != 'Success'){
                    msg.$$.mtid = 'error';
                    msg.$$.errorCode = res.messageId;
                    msg.$$.errorMessage = Array.isArray(res.message)
                        ? res.message.join('; ')
                        : res.message;
                    return msg;
                }
                msg.payload = res;
                return msg;
            });
    },

    send:function(msg) {
        msg.headers = {'Content-Type': 'text/xml'};
        var templatePath = require.resolve('./' + msg.$$.opcode + '.xml.marko');

        var template = loadTemplate(templatePath);

        return template.render(msg).then(function(res) {
            msg.payload = res;
            msg.$$.opcode = msg.opcode || msg.$$.opcode;
            return msg;
        });
    }
};


```

## Open API

`ut-port-http` provides the possibility to
be used as a swagger client in a semi-automatic
fashion. For this aim an additional configuration
property called `openApi` must be provided.

Example:

```js
module.exports = (...params) => {
    return class swaggerClient extends require('ut-port-http')(...params) {
        get defaults() {
            return {
                namespace: [
                    'provider1',
                    'provider2',
                    'provider3'
                ],
                openApi: {
                    'provider1': require('./provider2-swagger.json'),
                    'provider2.segment1': require.resolve('./provider2/segment1-swagger.json'),
                    'provider2.segment2': require.resolve('./provider2/segment2-swagger.json'),
                    'provider3': 'http://www.provider3.com/swagger.json'
                }
            };
        }
    };
};
```

Note that the `openApi` configuration property
represents a map where:

* the keys determine how the operation IDs of the
document will be prefixed. For example if the
document is prefixed with key `provider2.segment2`
and contains a route with operationId `operationX`,
then it will be accessible via the method
`provider2.segment2.operationX` through the bus.
Therefore the first parts (before the first dot) of
all prefixes must be present in the `namespace` array.

* the values are the documents themselves.
All three approaches are acceptable as a value:
  * the content of the swagger document
  * path to a local swagger document
  * url for obtaining the document with http `GET` request

The message format for calling these auto-generated
swagger methods has the following specifics:

* can have a `body` property which will be used
as a payload
* can have a `params` property which ill be used
for extracting `path`, `query` and `header` parameters.

Example:

```js
await utMethod('provider2.segment2.operationX')({
    body: {
        payloadProp1: 'payloadValue1',
        payloadProp2: 'payloadValue2'
    },
    params: {
        param1: 'value1',
        param2: 'value2'
    }
});
```

For more information see
[ut-openapi request format](https://github.com/softwaregroup-bg/ut-openapi/blob/master/format/request.js)
