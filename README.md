

# HTTP Requester

Perform HTTP request like a boss!
A command line utility that supports HTTP, HTTPS, Websocket and server creation.

Ideal for testing and debugging.

* License: MIT
* Current status: beta



Available options:

* --help, -h: display help
* --method <method>: set the HTTP method
* --protocol http|https|ws: set the protocol, 'http', 'https' or 'ws'
* --host <host>: set the targeted host
* --port <port number>, -p <port number>: set the targeted port, default is 80 (HTTP) or 443 (HTTPS)
* --path <path>: set the path of the targeted resource in the host
* --url <URL>: the full URL of the resource, will be splitted into protocol, host, port and path
* --headers.* <header value>: any header can be specified as an option, e.g. --headers.content-type application/json.
  If it is not conflicting with another options, it can be used without prefix,
  like --content-type application/json
* --headers <json string>: specify all headers using the JSON format
* --output <file>, -o <file>: if given, the body's response will be written to this file instead of STDOUT
* --http: shortcut for --protocol http
* --https: shortcut for --protocol https
* --ws: shortcut for --protocol ws
* --server: start a server
* --config <file>: a JSON file containing all the above options, structured in an object


