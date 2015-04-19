

# HTTP Requester

Perform HTTP & WS requests like a boss!

A command line utility that supports HTTP, HTTPS, Websocket and server creation.

It features a cool interactive shell.

Ideal for testing and debugging.

* License: MIT
* Current status: beta



Feature highlights:

* HTTP, HTTPS and Websocket requests
* Dummy HTTP and Websocket server creation
* A cool interactive shell with history and auto-completion (even headers)
* An interactive Websocket Chatter



Available command line options:

* Without any argument, it runs the interactive shell
* --help, -h: display help
* --shell: run requests in an interactive shell, *like a boss!*
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
* --auth "<user>:<password>": basic authentication i.e. "user:password" to compute an Authorization header
* --timeout <ms>: set the request timeout in ms
* --output <file>, -o <file>: if given, the body's response will be written to this file instead of STDOUT
* --http: shortcut for --protocol http
* --https: shortcut for --protocol https
* --ws: shortcut for --protocol ws
* --server: start a server
* --config <file>: a JSON file containing all the above options, structured in an object



Available interactive shell commands:

* ls
	List the details of the request about to be performed.
* request or req
	Perform the request.
* <protocol>://<host>[:<port>][/<path>]
	Parse the full URL and set the protocol, host, port and path.
* host <hostname>[:<port>]
	Set the host and port to connect to.
* port <port>
	Set the port to connect to.
* protocol http|https|ws
	Set the protocol to use.
* method <HTTP method>
	Set the HTTP method.
* path <URL path>
	Set the URL's path part to request.
* headers.<header> <value>
	Set a HTTP header.
* <header>: <value>
	The shortest way to set a HTTP header.
* auth <user>:<password>
	Basic authentication to compute an Authorization header.
* body <body string>
	Set the body of the request.
* body
	Set the body of the request, using the multi-line mode.
* timeout <ms>
	Set the request timeout in ms.
* clear [headers|body]
	Clear headers or body, without argument: clear both.
* autoclear [headers|body]
	Autoclear headers or body after each request, without argument: just check.
* cd <path>
	Modify the path the way a normal 'cd' command does.



