/*
	The Cedric's Swiss Knife (CSK) - CSK HTTP Requester

	Copyright (c) 2015 Cédric Ronvel 
	
	The MIT License (MIT)

	Permission is hereby granted, free of charge, to any person obtaining a copy
	of this software and associated documentation files (the "Software"), to deal
	in the Software without restriction, including without limitation the rights
	to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	copies of the Software, and to permit persons to whom the Software is
	furnished to do so, subject to the following conditions:

	The above copyright notice and this permission notice shall be included in all
	copies or substantial portions of the Software.

	THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
	AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
	SOFTWARE.
*/



// Modules
var http = require( 'http' ) ;
var https = require( 'https' ) ;
var WebSocket = require( 'ws' ) ;
var fs = require( 'fs' ) ;
var url = require( 'url' ) ;

var serverKit = require( 'server-kit' ) ;
var term = require( 'terminal-kit' ).terminal ;
var tree = require( 'tree-kit' ) ;
var async = require( 'async-kit' ) ;



// Create the object
var httpRequester = {} ;

// Export it!
module.exports = httpRequester ;





			/* Command Line Interface */



httpRequester.cli = function cli()
{
	var args , query , serverConf ;
	
	args = require( 'minimist' )( process.argv.slice( 2 ) ) ;
	
	if ( args.help || args.h )
	{
		httpRequester.help() ;
		return ;
	}
	
	// We should process the config argument beforehand
	if ( args._.length === 1 && ! args._[ 0 ].match( /:\/\// ) ) { args.config = args._[ 0 ] ; }
	
	httpRequester.loadConfig( args.config , function( error , config ) {
		
		if ( error ) { term.red( error.toString() + '\n' ) ; process.exit( 1 ) ; }
		
		args = tree.extend( { deep: true } , {} , config , args ) ;
		delete args.config ;
		
		if ( args.server )
		{
			serverConf = httpRequester.cliArgsToServerConf( args ) ;
			httpRequester.cliServer( serverConf ) ;
			return ;
		}
		
		query = httpRequester.cliArgsToQuery( args ) ;
		
		if ( query.protocol === 'ws' )
		{
			httpRequester.cliWsMessages( query ) ;
			return ;
		}
		
		httpRequester.cliRequest( query ) ;
	} ) ;
} ;



httpRequester.help = function help()
{
	httpRequester.displayCliHelp() ;
	process.exit( 0 ) ;
} ;



httpRequester.cliRequestOptions = {
	output: true , o: true ,
	input: true , i: true ,
	config: true ,
	url: true ,
	protocol: true , http: true , https: true , ws: true ,
	host: true ,
	hostname: true ,
	port: true , p: true ,
	localAddress: true ,
	socketPath: true ,
	method: true ,
	path: true ,
	headers: true ,
	auth: true ,
	//agent: true
	body: true ,
	messages: true ,
	server: true ,
	closeMatch: true , "close-match": true ,
	"silent-header": true ,
	"silent-body": true
} ;



httpRequester.cliArgsToQuery = function cliArgsToQuery( args )
{
	var key ,
		query = tree.extend( { deep: true } , {} , args ) ;
	
	// /!\ The order matters! /!\
	
	// short-option substitution
	if ( query.p ) { query.port = query.p ; delete query.p ; }
	if ( query.o ) { query.output = query.o ; delete query.o ; }
	if ( query.i ) { query.input = query.i ; delete query.i ; }
	if ( query.host ) { query.hostname = query.host ; delete query.host ; }
	
	// shortcuts
	if ( query.http ) { query.protocol = 'http' ; delete query.http ; }
	if ( query.https ) { query.protocol = 'https' ; delete query.https ; }
	if ( query.ws ) { query.protocol = 'ws' ; delete query.ws ; }
	
	// Process arguments not belonging to any options
	if ( args._.length === 1 && args._[ 0 ].match( /:\/\// ) )
	{
		httpRequester.url2query( query._[ 0 ] , query ) ;
	}
	else if ( query._.length === 2 )
	{
		query.method = query._[ 0 ] ;
		httpRequester.url2query( query._[ 1 ] , query ) ;
	}
	
	delete query._ ;
	
	
	// URL options
	if ( query.url )
	{
		httpRequester.url2query( query.url , query ) ;
		delete query.url ;
	}
	
	
	// If no protocol, set 'http' as default
	if ( ! query.protocol ) { query.protocol = 'http' ; }
	
	
	if ( query.protocol === 'http' || query.protocol === 'https' )
	{
		// Method
		if ( ! query.method ) { query.method = 'GET' ; }
		else { query.method = query.method.toUpperCase() ; }
		
		
		// Process headers options
		if ( typeof query.headers === 'string' )
		{
			try {
				query.headers = JSON.parse( query.headers ) ;
			}
			catch ( error ) {
				query.headers = undefined ;
			}
		}
		
		if ( ! query.headers || typeof query.headers !== 'object' ) { query.headers = {} ; }
		
		for ( key in query )
		{
			// Any options that are not recognized are turned to header
			if ( ! httpRequester.cliRequestOptions[ key ] )
			{
				query.headers[ key ] = query[ key ] ;
				delete query[ key ] ;
			}
		}
	}
	else if ( query.protocol === 'ws' )
	{
		if ( ! query.messages ) { query.messages = [] ; }
		
		if ( query[ 'close-match' ] )
		{
			query.closeMatch = query[ 'close-match' ] ;
			delete query[ 'close-match' ] ;
		}
		
		if ( ! query.closeMatch ) { query.closeMatch = { count: query.messages.length } ; }
	}
	
	
	// Defaults...
	if ( ! query.hostname ) { query.hostname = 'localhost' ; }
	if ( ! query.port ) { query.port = query.protocol === 'https' ? 443 : 80 ; }
	
	
	return query ;
} ;



httpRequester.cliArgsToServerConf = function cliArgsToServerConf( args )
{
	var serverConf = tree.extend( { deep: true } , {} , args ) ;
	
	// short-option substitution
	if ( serverConf.p ) { serverConf.port = serverConf.p ; delete serverConf.p ; }
	
	// shortcuts
	if ( serverConf.http ) { serverConf.protocol = 'http' ; delete serverConf.http ; }
	if ( serverConf.https ) { serverConf.protocol = 'https' ; delete serverConf.https ; }
	if ( serverConf.ws ) { serverConf.protocol = 'ws' ; delete serverConf.ws ; }
	
	
	if ( ! serverConf.responses ) { serverConf.responses = [] ; }
	
	if ( serverConf[ 'default-response' ] )
	{
		serverConf.defaultResponse = serverConf[ 'default-response' ] ;
		delete serverConf[ 'default-response' ] ;
	}
	
	if ( ! serverConf.defaultResponse )
	{
		serverConf.defaultResponse = {
			status: 404 ,
			headers: {} ,
			body: "404: Not Found."
		} ;
	}
	
	// Defaults...
	if ( ! serverConf.protocol ) { serverConf.protocol = 'http' ; }
	//if ( ! serverConf.hostname ) { serverConf.hostname = 'localhost' ; }
	if ( ! serverConf.port ) { serverConf.port = serverConf.protocol === 'https' ? 443 : 80 ; }
	
	return serverConf ;
} ;



httpRequester.loadConfig = function loadConfig( filePath , callback )
{
	//console.log( filePath ) ;
	if ( ! filePath ) { callback( undefined , {} ) ; return ; }
	
	fs.readFile( filePath , { encoding: 'utf8' } , function( error , content ) {
		
		if ( error ) { callback( error ) ; return ; }
		
		var config ;
		
		try {
			config = JSON.parse( content ) ;
		}
		catch ( error ) {
			callback( error ) ;
			return ;
		}
		
		callback( undefined , config ) ;
	} ) ;
} ;



httpRequester.cliRequest = function cliRequest( query )
{
	//console.log( query ) ;
	var streams = {} ;
	
	async.series( {
		output: function( seriesCallback ) {
			
			if ( ! query.output ) { seriesCallback() ; return ; }
			
			streams.output = fs.createWriteStream( query.output ) ;
			
			streams.output.on( 'open' , function() {
				streams.output.removeListener( 'error' , seriesCallback ) ;
				seriesCallback() ;
			} ) ;
			
			streams.output.on( 'error' , seriesCallback ) ;
		} ,
		performRequest: function( seriesCallback ) {
			//console.log( query ) ;
			httpRequester.performRequest( query , streams , httpRequester.displayHeader.bind( this , query ) , seriesCallback ) ;
		}
	} )
	.exec( function( error , results ) {
		
		if ( error )
		{
			term.red( error.toString() + '\n' ) ;
			process.exit( 1 ) ;
		}
		
		if ( ! streams.output ) { httpRequester.displayBody( query , results.performRequest[ 1 ] ) ; }
		
		process.exit( 0 ) ;
	} ) ;
} ;



httpRequester.cliWsMessages = function cliWsMessages( query )
{
	httpRequester.wsMessages( query , function( error , messages ) {
		
		if ( error )
		{
			term.red( error.toString() + '\n' ) ;
			process.exit( 1 ) ;
		}
		
		process.exit( 0 ) ;
	} ) ;
} ;



httpRequester.cliServer = function cliServer( serverConf )
{
	//console.log( serverConf ) ;
	var streams = {} ;
	
	async.series( {
		output: function( seriesCallback ) {
			
			if ( ! serverConf.output ) { seriesCallback() ; return ; }
			
			streams.output = fs.createWriteStream( serverConf.output ) ;
			
			streams.output.on( 'open' , function() {
				streams.output.removeListener( 'error' , seriesCallback ) ;
				seriesCallback() ;
			} ) ;
			
			streams.output.on( 'error' , seriesCallback ) ;
		} ,
		startServer: function( seriesCallback ) {
			//console.log( serverConf ) ;
			httpRequester.startServer( serverConf , streams ) ;
		}
	} )
	.exec( function( error , results ) {
		
		if ( error )
		{
			term.red( error.toString() + '\n' ) ;
			process.exit( 1 ) ;
		}
		
		if ( ! streams.output ) { httpRequester.displayBody( results.performRequest[ 1 ] ) ; }
		
		process.exit( 0 ) ;
	} ) ;
} ;



/*
	query: object, where:
		host: A domain name or IP address of the server to issue the request to. Defaults to 'localhost'.
		hostname: To support url.parse() hostname is preferred over host
		port: Port of remote server. Defaults to 80.
		localAddress: Local interface to bind for network connections.
		socketPath: Unix Domain Socket (use one of host:port or socketPath)
		method: A string specifying the HTTP request method. Defaults to 'GET'.
		path: Request path. Defaults to '/'. Should include query string if any. E.G. '/index.html?page=12'
		headers: An object containing request headers.
		auth: Basic authentication i.e. 'user:password' to compute an Authorization header.
		body: the request body, if it's an object, it will be JSON.stringify'ed

	callback( error , response )
		error: ...
		response: an object, where:
			httpVersion: the HTTP version of the response
			status: the HTTP status code
			statusMessage: the HTTP status message
			headers: the HTTP response headers
			body: the response body
*/
httpRequester.performRequest = function performRequest( query , streams , headerCallback , callback )
{
	var request , query_ ;
	
	if ( 'body' in query )
	{
		if ( typeof query.body !== 'string' ) { query.body = JSON.stringify( query.body ) ; }
		
		// This is not done automatically!
		query.headers['Content-Length'] = query.body.length ;
	}
	
	// http.request() accepts an undocumented 'protocol' property, but its format uses a trailing ':',
	// e.g. 'http:', and that causes trouble...
	query_ = tree.extend( null , {} , query , { protocol: null } ) ;
	
	if ( query.protocol === 'http' )
	{
		request = http.request( query_ ) ;
	}
	else if ( query.protocol === 'https' )
	{
		request = https.request( query_ ) ;
	}
	else
	{
		callback( new Error( "Unsupported protocol '" + query.protocol + "'" ) ) ;
		return ;
	}
	
	request.on( 'response' , function( response ) {
		
		var body = '' ;
		
		//console.log( '[requester] STATUS: ' + response.statusCode ) ;
		//console.log( '[requester] HEADERS: ' + JSON.stringify( response.headers ) ) ;
		response.setEncoding( 'utf8' ) ;
		
		headerCallback( {
			httpVersion: response.httpVersion ,
			status: response.statusCode ,
			statusMessage: http.STATUS_CODES[ response.statusCode ] ,
			headers: response.headers
		} ) ;
		
		if ( streams.output )
		{
			response.pipe( streams.output ) ;
			streams.output.on( 'end' , callback ) ;
		}
		else
		{
			response.on( 'data', function ( chunk ) {
				body += chunk.toString() ;
			} ) ;
			
			response.on( 'end' , function() {
				callback( undefined , body ) ;
			} ) ;
		}
		
	} ) ;
	
	request.on( 'error' , function( error ) {
		//console.log( '[requester] problem with request: ' + error.message ) ;
		callback( error ) ;
	} ) ;
	
	// Write the request body
	if ( query.body )
	{
		//console.log( "BODY to send:" , query.body ) ;
		request.end( query.body ) ;
	}
	else
	{
		request.end() ;
	}
} ;



httpRequester.wsMessages = function wsMessages( query , callback )
{
	var ws , messages = [] , count = 0 , terminated = false ;
	
	ws = new WebSocket( 'ws://' + query.hostname + ':' + query.port + query.path ) ;
	
	ws.on( 'open' , function() {
		
		var i ;
		
		httpRequester.displayOpenedConnection( query ) ;
		
		for ( i = 0 ; i < query.messages.length ; i ++ )
		{
			ws.send( query.messages[ i ].message ) ;
		}
	} ) ;
	
	ws.on( 'message', function( message , flags ) {
		
		if ( terminated ) { return ; }
		
		// flags.binary will be set if a binary data is received.
		// flags.masked will be set if the data was masked.
		messages[ count ++ ] = message ;
		httpRequester.displayMessage( query , count , message ) ;
		
		if ( query.closeMatch.message === message || query.closeMatch.count === count )
		{
			ws.terminate() ;
			terminated = true ;
		}
	} ) ;
	
	ws.on( 'close' , function() {
		
		httpRequester.displayClosedConnection( query ) ;
		callback( undefined , messages ) ;
	} ) ;
} ;



httpRequester.startServer = function startServer( serverConf )
{
	var options , server ;
	
	options = {
		port: serverConf.port ,
		http: serverConf.protocol === 'http' ,
		ws: serverConf.protocol === 'ws' ,
		catchErrors: false ,
		verbose: false
	} ;
	
	switch ( serverConf.protocol )
	{
		case 'http':
			server = serverKit.createServer( options , httpRequester.serverHttpHandler.bind( this , serverConf ) ) ;
			break ;
		case 'ws':
			server = serverKit.createServer( options , httpRequester.serverWsHandler.bind( this , serverConf ) ) ;
			break ;
	}
	
	server.on( 'error' , function( error ) {
		
		if ( error.code === 'EACCES' )
		{
			term.red( "Error EACCES: opening port %i is forbidden.\n" , serverConf.port ) ;
			term.red( "Please use the --port option to specify another port.\n" ) ;
		}
		else if ( error.code === 'EADDRINUSE' )
		{
			term.red( "Error EADDRINUSE: port %i is already used by another program on your system.\n" , serverConf.port ) ;
			term.red( "Please use the --port option to specify another port.\n" ) ;
		}
		else
		{
			term.red( error.toString() + '\n' ) ;
		}
		
		process.exit( 1 ) ;
	} ) ;
} ;



httpRequester.serverHttpHandler = function serverHttpHandler( serverConf , client )
{
	var i , match , path , url , host , body = '' , response ;
	
	path = client.request.url ;
	host = client.request.headers.host.split( ':' )[ 0 ] ;
	url = serverConf.protocol + '://' + client.request.headers.host + client.request.url ;
	
	client.request.on( 'data' , function ( chunk ) {
		//console.log( "data event, received:" , chunk ) ;
		body += chunk.toString() ;
	} ) ;
	
	client.request.on( 'end' , function() {
		
		//console.log( "end event" ) ;
		httpRequester.displayHeader( serverConf , client.request ) ;
		httpRequester.displayBody( serverConf , body ) ;
		httpRequester.displaySeparator( serverConf ) ;
		
		for ( i = 0 ; i < serverConf.responses.length ; i ++ )
		{
			match = serverConf.responses[ i ].match ;
			
			if (
				( match.host === undefined || match.host === host ) &&
				( match.path === undefined || match.path === path ) &&
				( match.url === undefined || match.url === url )
			)
			{
				response = serverConf.responses[ i ] ;
				break ;
			}
		}
		
		if ( ! response ) { response = serverConf.defaultResponse ; }
		
		client.response.writeHeader( response.status , response.headers ) ;
		client.response.end( response.body ) ;
	} ) ;
	
} ;



httpRequester.connectionId = 0 ;



httpRequester.serverWsHandler = function serverWsHandler( serverConf , client )
{
	var i , match , path , url , host , response , id = httpRequester.connectionId ++ ;
	
	/*
	path = client.request.url ;
	host = client.request.headers.host.split( ':' )[ 0 ] ;
	url = serverConf.protocol + '://' + client.request.headers.host + client.request.url ;
	*/
	
	httpRequester.displayOpenedConnection( serverConf , id ) ;
	
	client.websocket.on( 'message' , function ( message ) {
		
		response = undefined ;
		httpRequester.displayMessage( serverConf , id , message ) ;
		
		for ( i = 0 ; i < serverConf.responses.length ; i ++ )
		{
			match = serverConf.responses[ i ].match ;
			
			if (
				( match.host === undefined || match.host === host ) &&
				( match.path === undefined || match.path === path ) &&
				( match.url === undefined || match.url === url ) &&
				( match.message === undefined || match.message === message )
			)
			{
				response = serverConf.responses[ i ] ;
				break ;
			}
		}
		
		if ( ! response ) { response = serverConf.defaultResponse ; }
		
		client.websocket.send( response.message ) ;
	} ) ;
	
	client.websocket.on( 'close' , function() {
		
		httpRequester.displayClosedConnection( serverConf , id ) ;
	} ) ;
	
} ;



httpRequester.normalizeHeader = function normalizeHeader( header )
{
	var i , splitted = header.split( '-' ) ;
	
	for ( i = 0 ; i < splitted.length ; i ++ )
	{
		splitted[ i ] = splitted[ i ].charAt( 0 ).toUpperCase() + splitted[ i ].slice(1);
	}
	
	header = splitted.join( '-' ) ;
	
	return header ;
} ;



httpRequester.url2query = function url2query( fullUrl , query )
{
	var parsed ;
	
	// Default to http, if no protocol given: the 'url' module has no fallback for that
	if ( ! fullUrl.match( /^[a-z]+:\/\// ) ) { fullUrl = 'http://' + fullUrl ; }
	
	parsed = url.parse( fullUrl ) ;
	
	query.hostname = parsed.hostname ;	// parsed.host contains port
	
	if ( parsed.port ) { query.port = parsed.port ; }
	
	//query.protocol = parsed.protocol ;
	query.protocol = parsed.protocol.replace( /^([a-z+]+):$/ , '$1' ) ;
	
	query.path = parsed.path ;
} ;



httpRequester.displayHeader = function displayHeader( config , incomingMessage )
{
	if ( config[ 'silent-header' ] ) { return ; }
	
	var key , statusGroup ;
	
	// First line, it depends on the message being a request or a response
	
	if ( incomingMessage.method ) { term.brightGreen.bold( incomingMessage.method + ' ' ).green( incomingMessage.url + ' ' ) ; }
	
	term.magenta( "HTTP/%s " , incomingMessage.httpVersion ) ;
	
	if ( incomingMessage.status )
	{
		statusGroup = Math.floor( incomingMessage.status / 100 ) ;
		
		if ( statusGroup >= 1 && statusGroup <= 2 )
		{
			term.brightGreen.bold( incomingMessage.status ).green( " %s" , incomingMessage.statusMessage ) ;
		}
		else if ( statusGroup >= 4 && statusGroup <= 5 )
		{
			term.brightRed.bold( incomingMessage.status ).red( " %s" , incomingMessage.statusMessage ) ;
		}
		else
		{
			term.brightYellow.bold( incomingMessage.status ).yellow( " %s" , incomingMessage.statusMessage ) ;
		}
	}
	
	term( '\n' ) ;
	
	
	// Headers
	
	//*
	for ( key in incomingMessage.headers )
	{
		term.brightCyan.bold( httpRequester.normalizeHeader( key ) ).white( ': %s\n' , incomingMessage.headers[ key ] ) ;
	}
	//*/
	
	/* available in node 0.12, but not in 0.10
	console.log( incomingMessage.rawHeaders ) ;
	
	for ( key = 0 ; key < incomingMessage.rawHeaders.length ; key += 2 )
	{
		term( '%s: %s\n' , incomingMessage.rawHeaders[ key ] , incomingMessage.rawHeaders[ key + 1 ] ) ;
	}
	//*/
	
	//console.log( incomingMessage.headers ) ;
} ;



httpRequester.displayBody = function displayBody( config , body )
{
	if ( config[ 'silent-body' ] || ! body ) { return ; }
	
	if ( config[ 'silent-header' ] )
	{
		term.noFormat( body + '\n' ) ;
	}
	else
	{
		term.brightBlue.bold( '\nBody:\n' ).noFormat( body + '\n' ) ;
	}
} ;



httpRequester.displayOpenedConnection = function displayOpenedConnection( config , id )
{
	if ( config.server ) { term.brightGreen.bold( 'New connection #%i opened\n' , id ) ; }
	else { term.brightGreen.bold( 'Connection opened\n' ) ; }
} ;



httpRequester.displayClosedConnection = function displayClosedConnection( config , id )
{
	if ( config.server ) { term.red.bold( 'Connection #%i closed\n' , id ) ; }
	else { term.red.bold( 'Connection closed\n' ) ; }
} ;



httpRequester.displayMessage = function displayMessage( config , id , message )
{
	if ( config.server ) { term.blue( 'Message from #%i:' , id ) ; }
	else { term.blue( 'Message #%i:' , id ) ; }
	
	term(  ( message.indexOf( '\n' ) >= 0 ? '\n' : ' ' )  + message + '\n' ) ;
} ;



httpRequester.displaySeparator = function displayBody( config )
{
	term( '\n' ) ;
} ;



httpRequester.displayCliHelp = function displayCliHelp()
{
	term( '\n' ) ;
	term.brightCyan.bold( 'Available options:\n' ) ;
	term.cyan( '\t--help, -h: display this help\n' ) ;
	term.cyan( '\t--method <method>: set the HTTP method\n' ) ;
	term.cyan( "\t--protocol http|https|ws: set the protocol, 'http', 'https' or 'ws'\n" ) ;
	term.cyan( '\t--host <host>: set the targeted host\n' ) ;
	term.cyan( '\t--port <port number>, -p <port number>: set the targeted port, default is 80 (HTTP) or 443 (HTTPS)\n' ) ;
	term.cyan( '\t--path <path>: set the path of the targeted resource in the host\n' ) ;
	term.cyan( '\t--url <URL>: the full URL of the resource, will be splitted into protocol, host, port and path\n' ) ;
	term.cyan( '\t--headers.* <header value>: any header can be specified as an option, e.g. --headers.content-type application/json.\n' ) ;
	term.cyan( '\t\tIf it is not conflicting with another options, it can be used without prefix,\n' ) ;
	term.cyan( '\t\tlike --content-type application/json\n' ) ;
	term.cyan( '\t--headers <json string>: specify all headers using the JSON format\n' ) ;
	term.cyan( "\t--output <file>, -o <file>: if given, the body's response will be written to this file instead of STDOUT\n" ) ;
	term.cyan( "\t--http: shortcut for --protocol http\n" ) ;
	term.cyan( "\t--https: shortcut for --protocol https\n" ) ;
	term.cyan( "\t--ws: shortcut for --protocol ws\n" ) ;
	term.cyan( "\t--server: start a server\n" ) ;
	term.cyan( '\t--config <file>: a JSON file containing all the above options, structured in an object\n' ) ;
	term( '\n\n' ) ;
} ;





