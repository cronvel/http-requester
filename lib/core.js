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

"use strict" ;



// Load modules
var http = require( 'http' ) ;
var https = require( 'https' ) ;
var WebSocket = require( 'ws' ) ;

var term = require( 'terminal-kit' ).terminal ;
var tree = require( 'tree-kit' ) ;
//var async = require( 'async-kit' ) ;
var serverKit = require( 'server-kit' ) ;



// Create the object and export it
var core = {} ;
module.exports = core ;



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

	options: 
		output: the output stream (e.g. a file), if specified, the body will be streamed into that
		headerCallback: called once the headers are received
		progressCallback: called each time a chunk of the body is received
	
	callback( error , response )
		error: ...
		response: an object, where:
			httpVersion: the HTTP version of the response
			status: the HTTP status code
			statusMessage: the HTTP status message
			headers: the HTTP response headers
			body: the response body
*/
core.performRequest = function performRequest( query , options , callback )
{
	var self = this , request , query_ , time ;
	
	if ( ! options || typeof options !== 'object' ) { options = {} ; }
	
	this.lastResponse = null ;
	
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
		
		var body = '' , bodyLength , bodyDownloadedBytes = 0 ;
		
		//console.log( '[requester] STATUS: ' + response.statusCode ) ;
		//console.log( '[requester] HEADERS: ' + JSON.stringify( response.headers ) ) ;
		response.setEncoding( 'utf8' ) ;
		bodyLength = response.headers['content-length'] || 0 ;
		
		self.lastResponse = {
			httpVersion: response.httpVersion ,
			status: response.statusCode ,
			statusMessage: http.STATUS_CODES[ response.statusCode ] ,
			headers: response.headers
		} ;
		
		if ( typeof options.headerCallback === 'function' )
		{
			options.headerCallback( self.lastResponse ) ;
		}
		
		if ( typeof options.progressCallback === 'function' )
		{
			response.on( 'data', function ( chunk ) {
				bodyDownloadedBytes += chunk.length ;
				options.progressCallback( ! bodyLength ? undefined : bodyDownloadedBytes / bodyLength ) ;
			} ) ;
			
			response.on( 'end' , function() {
				options.progressCallback( 1 ) ;
			} ) ;
		}
		
		if ( options.output )
		{
			response.pipe( options.output ) ;
			
			response.on( 'end' , function() {
				callback( undefined , undefined , Date.now() - time ) ;
			} ) ;
		}
		else
		{
			response.on( 'data', function ( chunk ) {
				body += chunk.toString() ;
			} ) ;
			
			response.on( 'end' , function() {
				self.lastResponse.body = body ;
				callback( undefined , body , Date.now() - time ) ;
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
	
	time = Date.now() ;
} ;



core.wsMessages = function wsMessages( query , callback )
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
		
		self.displayClosedConnection( query ) ;
		
		if ( terminated ) { return ; }
		
		terminated = true ;
		callback( undefined , messages ) ;
	} ) ;
	
	ws.on( 'error' , function( error ) {
		
		term.red( '\n' + error + '\n' ) ;
		
		if ( terminated ) { return ; }
		
		terminated = true ;
		callback() ;
	} ) ;
} ;



core.startServer = function startServer( serverConf )
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



core.serverHttpHandler = function serverHttpHandler( serverConf , client )
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



core.connectionId = 0 ;



core.serverWsHandler = function serverWsHandler( serverConf , client )
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
	
	var processClient = function( special , message ) {
		
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
					// Ok... Ack does not work... wait few ms before terminating the websocket
					setTimeout( client.websocket.terminate.bind( client.websocket ) , 50 ) ;
				}
			} ) ;
		}
		else
		{
			if ( response.close )
			{
				// Same here...
				setTimeout( client.websocket.terminate.bind( client.websocket ) , 50 ) ;
			}
		}
	} ;
	
	processClient( 'connect' ) ;
	
	client.websocket.on( 'message' , processClient.bind( self , undefined ) ) ;
	
	client.websocket.on( 'close' , function() {
		
		self.displayClosedConnection( serverConf , id ) ;
		self.displaySeparator( serverConf ) ;
	} ) ;
	
} ;
