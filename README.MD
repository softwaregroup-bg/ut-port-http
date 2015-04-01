# UT Port HTTP Client

Create requests using `http` or `https` protocol.

## USAGE

#### Configuration index file required otions:

```
    id: '',
    type: 'http',
    logLevel: '',
    host: '',
    method: '',

    receive:function(msg) {
        return msg;
    },
    send:function(msg) {
        return msg;
    }
```

 * `id`: unique identification of port 
 
 * `logLevel`: trace, debug or info. 
 
 * `host`: remote server IP addres. 
 
 * `method`: http request method `POST` or `GET`.  
 
 * `receive`: incoming message convert function , return object or promise.
 
 * `send`: outgoing message convert function, return object or promise .
 
 Additional configuration options:
 
* `port`: remote server port.

* `path`: query-string, default is `/`.

* `secure`: `true` or `false` determine whether connection have to be secure or not using `https` protocol. If set to true there is additional options:
    * `validateCert`: `true` or `false` If `true`, checks if the server certificate is valid. Default true.
    * `sslKeyFile`: path to file
    * `sslCertFile`: path to file
    * `sslRootCertFile`: path to file
    
* `headers`: object containing request header values.
* `auth`: object containing basic authentication. Property names: `userName` and `password`.
* `start`: function that will be called once on creation of port. It can be used for setting global variables and initialising objects.
* `namespace`: Array containing diferent namespaces of this port. 

In order to send request to remote server this port receive a message object. All cofiguration options can be overrided and replaced dynamicaly by setting them in this message object.             
Message object property `payload` contains request body data that will be send. If `payload` is object it will be converted to JSON string and request header `content-type` will be set to `application/json`
With message object can be set additional options:    

* `timeout`: set request timeout in miliseconds
* `fileAttachment`: path to file

#### Response:

Response is always an object containing response from remote server or error.           
If server returns status code different from `200 (OK)` or some error occured during the process, the response message object will look like:
```javascript
{
    $$:{
        mtid: 'error',
        errorCode: '',
        errorMessage: ''
    }
}
```

Message proporties:
* `payload`: Contains response data returned from the remote server. If header `content-type` is `application/xml` the data will be converted to javascript object. If `content-type` is `application/json` the data will be converted to json object.
* `headers`: Response headers.
* `httpStatus`: Response status code.

## Example

Example `index.js` configuration file used for making web service requests to external system. `Send` and `receive` are used for modifying message object just before it is sent and just after response is received.
```javascript
var xmpParser = require('./xmlParser');
var loadTemplate;
module.exports = {
    id: 't24',
    type: 'http',
    logLevel: 'trace',
    host: 'twsdevcloudservice.cloudapp.net',
    port: 8011,
    path: '/swg/swg.svc',
    method: 'post',
    secure: false,
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
                    msg.$$.errorMessage = Array.isArray(res.message) ? res.message.join('; ') : res.message;
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