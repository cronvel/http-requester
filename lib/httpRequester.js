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
var path = require( 'path' ) ;

var serverKit = require( 'server-kit' ) ;
var term = require( 'terminal-kit' ).terminal ;
var tree = require( 'tree-kit' ) ;
var async = require( 'async-kit' ) ;



// Create the object and export it
var httpRequester = {} ;
module.exports = httpRequester ;

// Get all the package info
httpRequester.package = require( '../package.json' ) ;

tree.extend( null , httpRequester ,
	require( './constants.js' ) ,
	require( './display.js' )
) ;





			/* Command Line Interface */



httpRequester.cli = function cli()
{
	var self = this , args , query , serverConf ;
	
	args = require( 'minimist' )( process.argv.slice( 2 ) ) ;
	
	if ( args.help || args.h )
	{
		this.help() ;
		return ;
	}
	
	if ( process.argv.length === 2 ) { args.shell = true ; }
	
	// We should process the config argument beforehand
	if ( args._.length === 1 && ! args._[ 0 ].match( /:\/\// ) ) { args.config = args._[ 0 ] ; }
	
	this.loadConfig( args.config , function( error , config ) {
		
		if ( error ) { term.red( error.toString() + '\n' ) ; process.exit( 1 ) ; }
		
		args = tree.extend( { deep: true } , {} , config , args ) ;
		delete args.config ;
		
		if ( args.server )
		{
			serverConf = self.cliArgsToServerConf( args ) ;
			self.cliServer( serverConf ) ;
			return ;
		}
		
		query = self.cliArgsToQuery( args ) ;
		
		if ( args.shell )
		{
			self.shell( query ) ;
			return ;
		}
		
		if ( query.protocol === 'ws' )
		{
			self.cliWsMessages( query ) ;
			return ;
		}
		
		self.cliRequest( query ) ;
	} ) ;
} ;



httpRequester.help = function help()
{
	this.displayCliHelp() ;
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
	timeout: true ,
	messages: true ,
	server: true ,
	closeMatch: true , "close-match": true ,
	"silent-header": true ,
	"silent-body": true
} ;



httpRequester.protocols = {
	http: true ,
	https: true ,
	ws: true
} ;



httpRequester.cliArgsToQuery = function cliArgsToQuery( args )
{
	var key ,
		query = tree.extend( { deep: true } , {} , args ) ;
	
	// /!\ The order matters! /!\
	
	delete query.shell ;
	
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
		this.url2query( query._[ 0 ] , query ) ;
	}
	else if ( query._.length === 2 )
	{
		query.method = query._[ 0 ] ;
		this.url2query( query._[ 1 ] , query ) ;
	}
	
	delete query._ ;
	
	
	// URL options
	if ( query.url )
	{
		this.url2query( query.url , query ) ;
		delete query.url ;
	}
	
	
	// If no protocol, set 'http' as default
	if ( ! query.protocol ) { query.protocol = 'http' ; }
	
	
	if ( query.protocol === 'http' || query.protocol === 'https' )
	{
		// Method
		if ( ! query.method ) { query.method = 'GET' ; }
		else { query.method = query.method.toUpperCase() ; }
		
		
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
		if ( ! this.cliRequestOptions[ key ] )
		{
			query.headers[ key ] = query[ key ] ;
			delete query[ key ] ;
		}
	}
	
	// Finally, normalize headers
	this.normalizeHeaders( query.headers ) ;
	
	
	// Defaults...
	if ( ! query.hostname ) { query.hostname = 'localhost' ; }
	if ( ! query.port ) { query.port = query.protocol === 'https' ? 443 : 80 ; }
	if ( ! query.path ) { query.path = '/' ; }
	if ( ! query.timeout ) { query.timeout = 5000 ; }	// 5 seconds
	
	
	return query ;
} ;



httpRequester.cliArgsToServerConf = function cliArgsToServerConf( args )
{
	var serverConf = tree.extend( { deep: true } , {} , args ) ;
	
	delete serverConf.shell ;
	
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
	var self = this , streams = {} ;
	
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
			self.performRequest( query , streams , self.displayHeader.bind( self , query ) , seriesCallback ) ;
		}
	} )
	.exec( function( error , results ) {
		
		if ( error )
		{
			term.red( error.toString() + '\n' ) ;
			process.exit( 1 ) ;
		}
		
		if ( ! streams.output ) { self.displayBody( query , results.performRequest[ 1 ] ) ; }
		
		process.exit( 0 ) ;
	} ) ;
} ;



httpRequester.cliWsMessages = function cliWsMessages( query )
{
	this.wsMessages( query , function( error , messages ) {
		
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
	var self = this , streams = {} ;
	
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
			self.startServer( serverConf , streams ) ;
		}
	} )
	.exec( function( error , results ) {
		
		if ( error )
		{
			term.red( error.toString() + '\n' ) ;
			process.exit( 1 ) ;
		}
		
		if ( ! streams.output ) { self.displayBody( results.performRequest[ 1 ] ) ; }
		
		process.exit( 0 ) ;
	} ) ;
} ;



httpRequester.methods = {
	GET: true ,
	HEAD: true ,
	POST: true ,
	PUT: true ,
	DELETE: true ,
	TRACE: true ,
	OPTIONS: true ,
	CONNECT: true ,
	PATCH: true
} ;



// Node does not expect body for those methods:
httpRequester.unexpectedBody = {
	GET: true ,
	HEAD: true ,
	CONNECT: true
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
		if ( ! Buffer.isBuffer( query.body ) )
		{
			if ( typeof query.body !== 'string' ) { query.body = JSON.stringify( query.body ) ; }
			query.body = new Buffer( query.body ) ;
		}
		
		if (
			this.unexpectedBody[ query.method ] &&
			( ! query.headers['Transfer-Encoding'] || ! query.headers['Content-Length'] )
		)
		{
			// This is not done automatically for methods that are not expected bodies
			//query.headers['Content-Length'] = query.body.length ;
			query.headers['Transfer-Encoding'] = 'chunked' ;
		}
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
	
	request.setTimeout( query.timeout , function() {
		request.abort() ;
	} ) ;
	
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
	
	request.on( 'error' , function errorHandler( error ) {
		//console.log( '[requester] problem with request: ' + error.message ) ;
		//console.trace( error , errorHandler ) ;
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
	var self = this , ws , messages = [] , count = 0 , terminated = false ;
	
	ws = new WebSocket( 'ws://' + query.hostname + ':' + query.port + query.path , { headers: query.headers } ) ;
	
	ws.on( 'open' , function() {
		
		var i ;
		
		self.displayOpenedConnection( query ) ;
		
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
		self.displayMessage( query , count , message ) ;
		
		if ( query.closeMatch.message === message || query.closeMatch.count === count )
		{
			ws.terminate() ;
			terminated = true ;
		}
	} ) ;
	
	ws.on( 'close' , function() {
		
		if ( terminated ) { return ; }
		terminated = true ;
		self.displayClosedConnection( query ) ;
		callback( undefined , messages ) ;
	} ) ;
	
	ws.on( 'error' , function( error ) {
		
		if ( terminated ) { return ; }
		terminated = true ;
		term.red( '\n' + error + '\n' ) ;
		callback() ;
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
			server = serverKit.createServer( options , this.serverHttpHandler.bind( this , serverConf ) ) ;
			break ;
		case 'ws':
			server = serverKit.createServer( options , this.serverWsHandler.bind( this , serverConf ) ) ;
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
	var self = this , i , match , path , url , host , body = '' , response ;
	
	path = client.request.url ;
	host = client.request.headers.host.split( ':' )[ 0 ] ;
	url = serverConf.protocol + '://' + client.request.headers.host + client.request.url ;
	
	client.request.on( 'data' , function ( chunk ) {
		//console.log( "data event, received:" , chunk ) ;
		body += chunk.toString() ;
	} ) ;
	
	client.request.on( 'end' , function() {
		
		//console.log( "end event" ) ;
		self.displayHeader( serverConf , client.request ) ;
		self.displayBody( serverConf , body ) ;
		self.displaySeparator( serverConf ) ;
		
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
	var self = this , i , match , path , url , host , response , terminated = false ,
		id = this.connectionId ++ ;
	
	path = client.request.url ;
	host = client.request.headers.host.split( ':' )[ 0 ] ;
	url = serverConf.protocol + '://' + client.request.headers.host + client.request.url ;
	
	//console.log( client ) ;
	
	this.displayOpenedConnection( serverConf , id ) ;
	this.displayHeader( serverConf , client.request ) ;
	this.displaySeparator( serverConf ) ;
	
	var processClient = function( message , special ) {
		
		// If messages are queued, this could be needed
		if ( terminated ) { return ; }
		
		response = undefined ;
		
		if ( ! special )
		{
			self.displayMessage( serverConf , id , message ) ;
			self.displaySeparator( serverConf ) ;
		}
		
		for ( i = 0 ; i < serverConf.responses.length ; i ++ )
		{
			match = serverConf.responses[ i ].match ;
			
			if (
				( ! match.connect || special === 'connect' ) &&
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
		
		// If the server is about to close, wait for the ack before doing that
		if ( response.close ) { terminated = true ; }
		
		if ( response.message !== undefined )
		{
			client.websocket.send( response.message , function( error ) {
				if ( error ) { self.displayConnectionError( serverConf , id , error ) ; }
				
				if ( response.close )
				{
					// Ok... Ack does not work... wait 10ms before terminating the websocket
					setTimeout( client.websocket.terminate.bind( client.websocket ) , 10 ) ;
				}
			} ) ;
		}
		else
		{
			if ( response.close )
			{
				// Same here...
				setTimeout( client.websocket.terminate.bind( client.websocket ) , 10 ) ;
			}
		}
	} ;
	
	processClient( undefined , 'connect' ) ;
	
	client.websocket.on( 'message' , processClient ) ;
	
	client.websocket.on( 'close' , function() {
		
		self.displayClosedConnection( serverConf , id ) ;
		self.displaySeparator( serverConf ) ;
	} ) ;
	
} ;



httpRequester.normalizeHeaders = function normalizeHeaders( headers )
{
	var header , normalized ;
	
	for ( header in headers )
	{
		normalized = this.normalizeHeader( header ) ;
		
		if ( header !== normalized )
		{
			headers[ normalized ] = headers[ header ] ;
			delete headers[ header ] ;
		}
	}
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
	
	//query.protocol = parsed.protocol ;
	query.protocol = parsed.protocol.replace( /^([a-z+-]+):$/ , '$1' ) ;
	
	if ( parsed.port )
	{
		query.port = parsed.port ;
	}
	else
	{
		if ( query.protocol === 'http' ) { query.port = 80 ; }
		else if ( query.protocol === 'https' ) { query.port = 443 ; }
	}
	
	query.path = parsed.path || '/' ;
} ;





			/* Interactive */



httpRequester.shell = function shell( query )
{
	if ( ! query.shell || typeof query.shell !== 'object' ) { query.shell = {} ; }
	if ( ! query.shell.autoclear ) { query.shell.autoclear = { headers: false , body: true } ; }
	
	this.displayIntro() ;
	term.blue( 'Type ' ).blue.bold( 'help' ).blue( ' for command description, press ' ).blue.bold( 'CTRL-C' ).blue( ' to quit.\n' ) ;
	term( '\n' ) ;
	
	term.grabInput() ;
	
	term.on( 'key' , this.onKey.bind( this ) ) ;
	
	this.repl( query ) ;
} ;



httpRequester.onKey = function onKey( key )
{
	switch ( key )
	{
		case 'CTRL_C' :
			term.green( 'CTRL-C received...\n' ) ;
			this.terminate() ;
			break ;
	}
} ;



httpRequester.terminate = function terminate()
{
	term.grabInput( false ) ;
	
	// Add a 100ms delay, so the terminal will be ready when the process effectively exit, preventing bad escape sequences drop
	setTimeout( function() { process.exit() ; } , 100 ) ;
} ;



httpRequester.repl = function repl( query , history )
{
	var self = this , rawCommand , command ;
	
	if ( ! query || typeof query !== 'object' ) { query = {} ; }
	
	if ( ! history ) { history = [] ; }
	
	async.series( [
		function read( seriesCallback )
		{
			self.prompt( query ) ;
			
			term.inputField( { history: history , autoComplete: self.clientAutoComplete } , function( error , input ) {
				term( '\n' ) ;
				if ( error ) { seriesCallback( error ) ; return ; }
				history.push( input ) ;
				//console.log( "Input:" , input ) ;
				rawCommand = input ;
				seriesCallback() ;
			} ) ;
		} ,
		function evaluate( seriesCallback )
		{
			command = self.parseShellCommand( rawCommand ) ;
			//console.log( "command:" , command ) ;
			self.runShellCommand[ command.type ].call( self , command , query , seriesCallback ) ;
		}
	] )
	.nice( 0 )
	.exec( function( error ) {
		if ( error )
		{
			term.red.bold( "\nAn unexpected error occurs: " + error + "\n" ) ;
			self.terminate() ;
			return ;
		}
		
		self.repl( query , history ) ;
	} ) ;
} ;



httpRequester.prompt = function prompt( query )
{
	term.dim( '%s://%s%s' , query.protocol , query.hostname ,
			( query.port === 80 && query.protocol === 'http' ) || ( query.port === 443 && query.protocol === 'https' ) ? '' : ':' + query.port
		)
		.bold( query.path )
		.dim( '> ' ) ;
} ;



httpRequester.shellSet = {
	//url: true ,
	protocol: true ,
	port: true ,
	method: true ,
	path: true ,
	headers: true ,
	auth: true ,
	body: true ,
	timeout: true
} ;



httpRequester.parseShellCommand = function parseShellCommand( rawCommand )
{
	var matches , tmp , command = { type: 'noop' } ;
	
	if ( rawCommand.match( /^\s*help\s*$/ ) )
	{
		// Body without argument start the multiline body input mode
		command.type = 'help' ;
	}
	else if ( rawCommand.match( /^\s*body\s*$/ ) )
	{
		// Body without argument start the multiline body input mode
		command.type = 'multiLineBody' ;
	}
	else if ( matches = rawCommand.match( /^\s*(.*:\/\/.*)\s*$/ ) )	// jshint ignore:line
	{
		command.type = 'changeUrl' ;
		command.url = matches[ 1 ] ;
	}
	else if ( matches = rawCommand.match( /^\s*([a-zA-Z]+)(\.([a-zA-Z-]+))?(\s+(.*)\s*)?$/ ) )	// jshint ignore:line
	{
		if ( matches[ 1 ] === 'req' || matches[ 1 ] === 'request' )
		{
			// This is a request <method> <path>
			command.type = 'request' ;
		}
		else if ( this.methods[ matches[ 1 ].toUpperCase() ] )
		{
			// This is a request <method> <path>
			command.type = 'request' ;
			command.method = matches[ 1 ].toUpperCase() ;
			command.path = matches[ 5 ] ;
		}
		else if ( matches[ 1 ] === 'ls' )
		{
			command.type = 'inspect' ;
		}
		else if ( matches[ 1 ] === 'host' )
		{
			command.type = 'changeHost' ;
			tmp = matches[ 5 ].split( ':' ) ;
			command.hostname = tmp[ 0 ] ;
			command.port = tmp[ 1 ] ;
		}
		else if ( matches[ 1 ] === 'clear' )
		{
			command.type = 'clear' ;
			command.clear = matches[ 5 ] ;
		}
		else if ( matches[ 1 ] === 'autoclear' )
		{
			command.type = 'autoclear' ;
			command.clear = matches[ 5 ] ;
		}
		else if ( matches[ 1 ] === 'cd' )
		{
			command.type = 'cd' ;
			command.path = matches[ 5 ] ;
		}
		else if ( this.shellSet[ matches[ 1 ] ] )
		{
			if ( matches[ 3 ] )
			{
				command.type = 'setHeader' ;
				command.header = matches[ 3 ] ;
				command.value = matches[ 5 ] ;
			}
			else
			{
				command.type = 'set' ;
				command.field = matches[ 1 ] ;
				command.value = matches[ 5 ] ;
			}
		}
		else
		{
			command.type = 'syntaxError' ;
			command.message = "Unknown command: " + matches[ 1 ] ;
		}
	}
	else if ( matches = rawCommand.match( /^\s*([a-zA-Z-]+):\s+(.*)\s*$/ ) )	// jshint ignore:line
	{
		command.type = 'setHeader' ;
		command.header = matches[ 1 ] ;
		command.value = matches[ 2 ] ;
	}
	else
	{
		matches = rawCommand.match( /^\s*(\S*).*$/ ) ;
		
		if ( matches[ 1 ] && matches[ 1 ].length > 0 )
		{
			command.type = 'syntaxError' ;
			command.message = "Unknown command: " + matches[ 1 ] ;
		}
	}
	
	return command ;
} ;



httpRequester.runShellCommand = {} ;



httpRequester.runShellCommand.noop = function runShellCommandNoop( command , query , callback )
{
	callback() ;
} ;



httpRequester.runShellCommand.syntaxError = function runShellCommandSyntaxError( command , query , callback )
{
	term.brightRed.bold( 'Syntax error' ).red( ' - %s\n' , command.message ) ;
	callback() ;
} ;



httpRequester.runShellCommand.help = function runShellCommandHelp( command , query , callback )
{
	var column = 40 ;
	
	term( '\n' ) ;
	
	term.cyan( 'ls' ).column( column ).dim( 'List the details of the request about to be performed.\n' ) ;
	term.cyan( 'request' ).dim( ' or ' ).cyan( 'req' ).column( column ).dim( 'Perform the request.\n' ) ;
	term.yellow( '<protocol>' ).cyan( '://' ).yellow( '<host>[:<port>][/<path>]' ).column( column ).dim( "Parse the full URL and set the protocol, host, port and path.\n" ) ;
	term.cyan( 'host ' ).yellow( '<hostname>[:<port>]' ).column( column ).dim( 'Set the host and port to connect to.\n' ) ;
	term.cyan( 'port ' ).yellow( '<port>' ).column( column ).dim( 'Set the port to connect to.\n' ) ;
	term.cyan( 'protocol ' ).yellow( 'http|https|ws' ).column( column ).dim( 'Set the protocol to use.\n' ) ;
	term.cyan( 'method ' ).yellow( '<HTTP method>' ).column( column ).dim( 'Set the HTTP method.\n' ) ;
	term.cyan( 'path ' ).yellow( '<URL path>' ).column( column ).dim( "Set the URL's path part to request.\n" ) ;
	term.cyan( 'headers.' ).yellow( '<header> <value>' ).column( column ).dim( "Set a HTTP header.\n" ) ;
	term.yellow( '<header>' ).cyan( ': ' ).yellow( '<value>' ).column( column ).dim( "The shortest way to set a HTTP header.\n" ) ;
	term.cyan( 'auth ' ).yellow( '<user>' ).cyan( ':' ).yellow( '<password>' ).column( column ).dim( "Basic authentication to compute an Authorization header.\n" ) ;
	term.cyan( 'body ' ).yellow( '<body string>' ).column( column ).dim( 'Set the body of the request.\n' ) ;
	term.cyan( 'body' ).column( column ).dim( 'Set the body of the request, using the multi-line mode.\n' ) ;
	term.cyan( 'timeout ' ).yellow( '<ms>' ).column( column ).dim( 'Set the request timeout in ms.\n' ) ;
	term.cyan( 'clear ' ).yellow( '[headers|body]' ).column( column ).dim( 'Clear headers or body, without argument: clear both.\n' ) ;
	term.cyan( 'autoclear ' ).yellow( '[headers|body]' ).column( column ).dim( 'Autoclear headers or body after each request, without argument: just check.\n' ) ;
	term.cyan( 'cd ' ).yellow( '<path>' ).column( column ).dim( "Modify the path the way a normal 'cd' command does.\n" ) ;
	
	term.magenta( '\nUse the ' ).magenta.bold( "TAB" ).magenta( ' key to auto-complete ' )
		.magenta.bold( 'like a boss' ).magenta( '! Even headers are supported!\n\n' ) ;
	
	// http methods
	
	callback() ;
} ;



httpRequester.runShellCommand.changeHost = function runShellCommandChangeHost( command , query , callback )
{
	query.hostname = command.hostname ;
	if ( command.port ) { query.port = command.port ; }
	callback() ;
} ;



httpRequester.runShellCommand.changeUrl = function runShellCommandChangeUrl( command , query , callback )
{
	this.url2query( command.url , query ) ;
	callback() ;
} ;



httpRequester.runShellCommand.set = function runShellCommandSet( command , query , callback )
{
	switch ( command.field )
	{
		case 'method' :
			command.value = command.value.toUpperCase() ;
			if ( this.methods[ command.value ] ) { query.method = command.value ; }
			break ;
		
		case 'port' :
			command.value = parseInt( command.value , 10 ) ;
			if ( ! isNaN( command.value ) && command.value >= 0 ) { query.port = command.value ; }
			break ;
		
		case 'timeout' :
			command.value = parseInt( command.value , 10 ) ;
			if ( ! isNaN( command.value ) && command.value >= 0 ) { query.timeout = command.value ; }
			break ;
		
		case 'protocol' :
			if ( this.protocols[ command.value ] ) { query.protocol = command.value ; }
			break ;
		
		default :
			query[ command.field ] = command.value ;
	}
	
	callback() ;
} ;



httpRequester.runShellCommand.setHeader = function runShellCommandSetHeader( command , query , callback )
{
	query.headers[ this.normalizeHeader( command.header ) ] = command.value ;
	callback() ;
} ;



httpRequester.runShellCommand.inspect = function runShellCommandInspect( command , query , callback )
{
	this.displayHeader( query , query ) ;
	this.displayBody( query , query.body ) ;
	callback() ;
} ;



httpRequester.runShellCommand.cd = function runShellCommandCd( command , query , callback )
{
	query.path = path.resolve( query.path , command.path ) ;
	callback() ;
} ;



httpRequester.runShellCommand.clear = function runShellCommandClear( command , query , callback )
{
	switch ( command.clear )
	{
		case 'headers' :
			query.headers = {} ;
			term.blue( 'Headers ' ).blue.bold( 'cleared.\n' ) ;
			break ;
		case 'body' :
			delete query.body ;
			term.blue( 'Body ' ).blue.bold( 'cleared.\n' ) ;
			break ;
		case '' :
		case undefined :
			query.headers = {} ;
			delete query.body ;
			term.blue( 'Header and body ' ).blue.bold( 'cleared.\n' ) ;
			break ;
	}
	
	callback() ;
} ;



httpRequester.runShellCommand.autoclear = function runShellCommandAutoclear( command , query , callback )
{
	switch ( command.clear )
	{
		case 'headers' :
			query.shell.autoclear.headers = ! query.shell.autoclear.headers ;
			break ;
		case 'body' :
			query.shell.autoclear.body = ! query.shell.autoclear.body ;
			break ;
	}
	
	term.blue( 'Autoclear status - headers: ' ).blue.bold( query.shell.autoclear.headers ? 'on' : 'off' )
		.blue( ' body: ' ).blue.bold( query.shell.autoclear.body ? 'on' : 'off' )( '\n' ) ;
	
	callback() ;
} ;



httpRequester.runShellCommand.multiLineBody = function runShellCommandMultiLineBody( command , query , callback )
{
	this.shellMultiLineInput( function( error , input ) {
		if ( error ) { callback( error ) ; return ; }
		query.body = input ;
		callback() ;
	} ) ;
} ;



httpRequester.runShellCommand.request = function runShellCommandRequest( command , query_ , callback )
{
	var self = this , query , streams = {} ;
	
	query = tree.extend( { deep: true } , {} , query_ ) ;
	
	if ( command.method ) { query.method = command.method ; }
	if ( command.path ) { query.path = command.path ; }
		
	//console.log( query ) ;
	
	if ( query.protocol === 'ws' )
	{
		this.wsChat( command , query_ , callback ) ;
		return ;
	}
	
	this.performRequest( query , streams , this.displayHeader.bind( this , query ) , function( error , body ) {
		
		if ( error )
		{
			term.red.bold( error + "\n" ) ;
			// Do not issue error: this is not an internal fatal error, just a request that cannot be processed...
			callback() ;
			return ;
		}
		
		// Do not auto-clear in case of errors
		if ( query_.shell.autoclear.body ) { delete query_.body ; }
		if ( query_.shell.autoclear.headers ) { query_.headers = {} ; }
		
		if ( ! streams.output ) { self.displayBody( query , body ) ; }
		
		callback() ;
	} ) ;
} ;



httpRequester.wsChat = function wsChat( command , query , callback )
{
	var self = this , ws , inputControler , terminated = false , rawMode = false , outputBuffer , history = [] ;
	
	// TODO: fix callback hell?
	
	ws = new WebSocket( 'ws://' + query.hostname + ':' + query.port + query.path , { headers: query.headers } ) ;
	
	var terminate = function terminate() {
		terminated = true ;
		ws.terminate() ;
	} ;
	
	ws.on( 'open' , function() {
		
		self.displayOpenedConnection( query ) ;
		
		var lines = '' ;
		
		term.blue( 'Websocket Chatter, ' )
			.blue.bold( 'CTRL-T' ).blue( ' to switch mode, ' )
			.blue.bold( 'CTRL-X' ).blue( ' to terminate:\n' ) ;
		
		var onKey = function onKey( key , matches , data ) {
			
			switch ( key )
			{
				case 'CTRL_X' :
					if ( rawMode )
					{
						term.removeListener( 'key' , onKey ) ;
						terminate() ;
						term( '\n' ) ;
					}
					else
					{
						term.removeListener( 'key' , onKey ) ;
						inputControler.abort() ;
						terminate() ;
						term( '\n' ) ;
					}
					break ;
				
				case 'CTRL_T' :
					rawMode = ! rawMode ;
					
					if ( rawMode )
					{
						term.blue( '\nWebsocket Raw Mode, ' )
							.blue.bold( 'CTRL-T' ).blue( ' to switch mode, ' )
							.blue.bold( 'CTRL-X' ).blue( ' to terminate:\n' ) ;
						inputControler.abort() ;
					}
					else
					{
						term.blue( '\nWebsocket Chatter, ' )
							.blue.bold( 'CTRL-T' ).blue( ' to switch mode, ' )
							.blue.bold( 'CTRL-X' ).blue( ' to terminate:\n' ) ;
						readLines() ;
					}
					break ;
						
				default :
					if ( rawMode )
					{
						// Send the raw input buffer, preserving escape sequences
						outputBuffer = Buffer.isBuffer( data.code ) ? data.code : new Buffer( [ data.code ] ) ;
						
						ws.send( outputBuffer , { binary: true } ) ;
					}
			}
		} ;
		
		var readLines = function readLines() {
			
			term( '> ' ) ;
			
			inputControler = term.inputField( { history: history } , function( error , input ) {
				
				term( '\n' ) ;
				if ( error ) { terminate() ; callback( error ) ; return ; }
				
				history.push( input ) ;
				
				ws.send( input , function( error ) {
					if ( error ) { terminate() ; callback( error ) ; return ; }
					readLines() ;
				} ) ;
			} ) ;
		} ;
		
		term.on( 'key' , onKey ) ;
		readLines() ;
	} ) ;
	
	ws.on( 'message', function( message , flags ) {
		
		var inputPosition ;
		
		if ( terminated ) { return ; }
		
		if ( rawMode )
		{
			term( message ) ;
		}
		else
		{
			// Get the input field position
			inputPosition = inputControler.getPosition() ;
			//console.error( inputPosition ) ;
			
			// Hide the input field
			inputControler.hide() ;
			
			// Insert the message before the current prompt and input field
			term.moveTo.cyan.bold( 1 , inputPosition.y , '< ' + message ).eraseLineAfter() ;
			
			// Restore the prompt
			term( '\n> ' ) ;
			
			// Rebase the input field to the current position
			inputControler.rebase() ;
		}
	} ) ;
	
	ws.on( 'close' , function() {
		
		if ( terminated ) { return ; }
		terminated = true ;
		term( '\n' ) ;
		self.displayClosedConnection( query ) ;
		callback() ;
	} ) ;
	
	ws.on( 'error' , function( error ) {
		
		if ( terminated ) { return ; }
		terminated = true ;
		term.red( '\n' + error + '\n' ) ;
		callback() ;
	} ) ;
} ;



httpRequester.shellMultiLineInput = function shellMultiLineInput( callback )
{
	var lines = '' , inputControler ;
	
	term.blue( 'Multi-line input, press ' ).blue.bold( 'CTRL-X' ).blue( ' to terminate:\n' ) ;
	
	var onKey = function onKey( key ) {
		if ( key !== 'CTRL_X' ) { return ; }
		term.removeListener( 'key' , onKey ) ;
		lines += inputControler.getInput()  ;
		inputControler.abort() ;
		term( '\n' ) ;
		callback( undefined , lines ) ;
	} ;
	
	var readLines = function readLines() {
		
		inputControler = term.inputField( function( error , input ) {
			term( '\n' ) ;
			if ( error ) { callback( error ) ; return ; }
			lines += input + '\n' ;
			readLines() ;
		} ) ;
	} ;
	
	term.on( 'key' , onKey ) ;
	readLines() ;
} ;


