/*
	HTTP Requester

	Copyright (c) 2015 - 2019 Cédric Ronvel

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



const zlib = require( 'zlib' ) ;
const http = require( 'http' ) ;
const https = require( 'https' ) ;
const WebSocket = require( 'ws' ) ;

const term = require( 'terminal-kit' ).terminal ;
const tree = require( 'tree-kit' ) ;
const serverKit = require( 'server-kit' ) ;

const Promise = require( 'seventh' ) ;



// Create the object and export it
const core = {} ;
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

	return: the request body, for more information, check this.lastResponse
*/
core.performRequest = async function( query , options = {} ) {
	var request , response , query_ , time ,
		bodyStream , body , bodyLength , bodyDownloadedBytes ;

	this.lastResponse = null ;

	if ( 'body' in query ) {
		if ( ! Buffer.isBuffer( query.body ) ) {
			if ( typeof query.body !== 'string' ) { query.body = JSON.stringify( query.body ) ; }
			query.body = Buffer.from( query.body ) ;
		}

		if (
			this.unexpectedBody[ query.method ] &&
			( ! query.headers['Transfer-Encoding'] || ! query.headers['Content-Length'] )
		) {
			// This is not done automatically for methods that are not expected bodies
			//query.headers['Content-Length'] = query.body.length ;
			query.headers['Transfer-Encoding'] = 'chunked' ;
		}
	}

	// http.request() accepts an undocumented 'protocol' property, but its format uses a trailing ':',
	// e.g. 'http:', and that causes trouble...
	query_ = tree.extend( null , {} , query , { protocol: null } ) ;

	if ( query.protocol === 'http' ) {
		request = http.request( query_ ) ;
	}
	else if ( query.protocol === 'https' ) {
		request = https.request( query_ ) ;
	}
	else {
		throw new Error( "Unsupported protocol '" + query.protocol + "'" ) ;
	}

	request.setTimeout( query.timeout , () => {
		request.abort() ;
	} ) ;

	setTimeout( () => {
		// Write the request body and end the request
		if ( query.body ) {
			//console.log( "BODY to send:" , query.body ) ;
			request.end( query.body ) ;
		}
		else {
			request.end() ;
		}
	} , 0 ) ;

	time = Date.now() ;

	// Await for the response
	response = await Promise.onceEventOrError( request , 'response' , [ 'close' , 'end' ] ) ;



	bodyStream = response ;
	bodyLength = response.headers['content-length'] || 0 ;

	//console.log( '[requester] STATUS: ' + response.statusCode ) ;
	//console.log( '[requester] HEADERS: ' + JSON.stringify( response.headers ) ) ;

	this.lastResponse = {
		httpVersion: response.httpVersion ,
		status: response.statusCode ,
		statusMessage: response.statusMessage ,
		standardStatusMessage: http.STATUS_CODES[ response.statusCode ] ,
		headers: response.headers
	} ;

	if ( typeof options.headerCallback === 'function' ) {
		options.headerCallback( this.lastResponse ) ;
	}

	if ( options.decompress && response.headers['content-encoding'] ) {
		// Decompress the body, if wanted
		switch ( response.headers['content-encoding'] ) {
			case 'gzip' :
				bodyStream = response.pipe( zlib.createGunzip() ) ;
				this.lastResponse.decompressed = true ;
				break ;
			case 'deflate' :
				bodyStream = response.pipe( zlib.createInflate() ) ;
				this.lastResponse.decompressed = true ;
				break ;
		}
	}

	bodyStream.setEncoding( 'utf8' ) ;

	bodyStream.on( 'error' , error => {
		term.red( "Body stream error: %E" , error ) ;
	} ) ;

	if ( typeof options.progressCallback === 'function' ) {
		bodyDownloadedBytes = 0 ;

		bodyStream.on( 'data' , ( chunk ) => {
			bodyDownloadedBytes += chunk.length ;
			options.progressCallback( ! bodyLength ? undefined : bodyDownloadedBytes / bodyLength ) ;
		} ) ;

		bodyStream.once( 'end' , () => {
			options.progressCallback( 1 ) ;
		} ) ;
	}

	if ( options.output ) {
		bodyStream.pipe( options.output ) ;
	}
	else {
		body = '' ;

		bodyStream.on( 'data' , ( chunk ) => {
			body += chunk.toString() ;
		} ) ;
	}

	await Promise.onceEvent( bodyStream , 'end' ) ;

	this.lastResponse.trailers = response.trailers ;
	this.lastResponse.body = body ;
	this.lastResponse.bodyBytes = bodyDownloadedBytes ;
	this.lastResponse.time = Date.now() - time ;

	return body ;
} ;



core.wsMessages = async function( query ) {
	var ws , messages = [] , count = 0 , terminated = false ;

	ws = new WebSocket( 'ws://' + query.hostname + ':' + query.port + query.path , { headers: query.headers } ) ;

	// Wait for an opening connection
	await Promise.onceEventOrError( ws , 'open' , [ 'close' , 'end' ] ) ;

	this.displayOpenedConnection( query ) ;
	query.messages.forEach( message => ws.send( message ) ) ;

	ws.on( 'message' , ( message , flags ) => {
		if ( terminated ) { return ; }

		// flags.binary will be set if a binary data is received.
		// flags.masked will be set if the data was masked.
		messages[ count ++ ] = message ;
		this.displayMessage( query , count , message ) ;

		if ( query.closeMatch.message === message || query.closeMatch.count === count ) {
			ws.terminate() ;
		}
	} ) ;

	// Wait for a closing connection
	await Promise.onceEventOrError( ws , 'close' ) ;

	this.displayClosedConnection( query ) ;

	return messages ;
} ;



core.startServer = function( serverConf ) {
	var options , server ;

	options = {
		port: serverConf.port ,
		http: serverConf.protocol === 'http' ,
		ws: serverConf.protocol === 'ws' ,
		catchErrors: false ,
		verbose: false
	} ;

	switch ( serverConf.protocol ) {
		case 'http' :
			server = serverKit.createServer( options , this.serverHttpHandler.bind( this , serverConf ) ) ;
			break ;
		case 'ws' :
			server = serverKit.createServer( options , this.serverWsHandler.bind( this , serverConf ) ) ;
			break ;
	}

	server.on( 'error' , ( error ) => {

		if ( error.code === 'EACCES' ) {
			term.red( "Error EACCES: opening port %i is forbidden.\n" , serverConf.port ) ;
			term.red( "Please use the --port option to specify another port.\n" ) ;
		}
		else if ( error.code === 'EADDRINUSE' ) {
			term.red( "Error EADDRINUSE: port %i is already used by another program on your system.\n" , serverConf.port ) ;
			term.red( "Please use the --port option to specify another port.\n" ) ;
		}
		else {
			term.red( error.toString() + '\n' ) ;
		}

		process.exit( 1 ) ;
	} ) ;
} ;



core.serverHttpHandler = function( serverConf , client ) {
	var i , match , path , url , host , body = '' , response ;

	path = client.request.url ;
	host = client.request.headers.host.split( ':' )[ 0 ] ;
	url = serverConf.protocol + '://' + client.request.headers.host + client.request.url ;

	client.request.on( 'data' , ( chunk ) => {
		//console.log( "data event, received:" , chunk ) ;
		body += chunk.toString() ;
	} ) ;

	client.request.on( 'end' , () => {
		//console.log( "end event" ) ;
		this.displayHeader( serverConf , client.request ) ;
		this.displayBody( serverConf , body ) ;
		this.displayTrailer( serverConf , client.request ) ;
		this.displaySeparator( serverConf ) ;

		for ( i = 0 ; i < serverConf.responses.length ; i ++ ) {
			match = serverConf.responses[ i ].match ;

			if (
				( match.host === undefined || match.host === host ) &&
				( match.path === undefined || match.path === path ) &&
				( match.url === undefined || match.url === url )
			) {
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



core.serverWsHandler = function( serverConf , client ) {
	var i , match , path , url , host , response , terminated = false ,
		id = this.connectionId ++ ;

	path = client.request.url ;
	host = client.request.headers.host.split( ':' )[ 0 ] ;
	url = serverConf.protocol + '://' + client.request.headers.host + client.request.url ;

	//console.log( client ) ;

	this.displayOpenedConnection( serverConf , id ) ;
	this.displayHeader( serverConf , client.request ) ;
	this.displaySeparator( serverConf ) ;

	var processClient = ( special , message ) => {
		// If messages are queued, this could be needed
		if ( terminated ) { return ; }

		response = undefined ;

		if ( ! special ) {
			this.displayMessage( serverConf , id , message ) ;
			this.displaySeparator( serverConf ) ;
		}

		for ( i = 0 ; i < serverConf.responses.length ; i ++ ) {
			match = serverConf.responses[ i ].match ;

			if (
				( ! match.connect || special === 'connect' ) &&
				( match.host === undefined || match.host === host ) &&
				( match.path === undefined || match.path === path ) &&
				( match.url === undefined || match.url === url ) &&
				( match.message === undefined || match.message === message )
			) {
				response = serverConf.responses[ i ] ;
				break ;
			}
		}

		if ( ! response ) { response = serverConf.defaultResponse ; }

		// If the server is about to close, wait for the ack before doing that
		if ( response.close ) { terminated = true ; }

		if ( response.message !== undefined ) {
			client.websocket.send( response.message , ( error ) => {
				if ( error ) { this.displayConnectionError( serverConf , id , error ) ; }

				if ( response.close ) {
					// Ok... Ack does not work... wait few ms before terminating the websocket
					setTimeout( client.websocket.terminate.bind( client.websocket ) , 50 ) ;
				}
			} ) ;
		}
		else if ( response.close ) {
			// Same here...
			setTimeout( client.websocket.terminate.bind( client.websocket ) , 50 ) ;
		}
	} ;

	processClient( 'connect' ) ;

	client.websocket.on( 'message' , processClient.bind( this , undefined ) ) ;

	client.websocket.on( 'close' , () => {
		this.displayClosedConnection( serverConf , id ) ;
		this.displaySeparator( serverConf ) ;
	} ) ;
} ;

