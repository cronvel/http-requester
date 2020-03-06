/*
	HTTP Requester

	Copyright (c) 2015 - 2020 Cédric Ronvel

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



const HttpCommon = require( './HttpCommon.js' ) ;

const serverKit = require( 'server-kit' ) ;
const termkit = require( 'terminal-kit' ) ;
const term = termkit.terminal ;



function HttpServer( options = {} ) {
	HttpCommon.call( this , options ) ;

	this.port = options.port ;
	this.protocol = options.protocol ;

	this.connectionId = 0 ;

	this.messages = options.messages ;
	this.closeMatch = options.closeMatch ;
	this.responses = options.responses ;
	this.defaultResponse = options.defaultResponse ;

	serverKit.setLogLevel( 'error' ) ;
}

HttpServer.prototype = Object.create( HttpCommon.prototype ) ;
HttpServer.prototype.constructor = HttpServer ;

module.exports = HttpServer ;



HttpServer.prototype.startServer = function() {
	var options , server ;

	options = {
		port: this.port ,
		http: this.protocol === 'http' ,
		ws: this.protocol === 'ws' ,
		catchErrors: false ,
		verbose: false
	} ;

	switch ( this.protocol ) {
		case 'http' :
			server = serverKit.createServer( options , this.serverHttpHandler.bind( this ) ) ;
			break ;
		case 'ws' :
			server = serverKit.createServer( options , this.serverWsHandler.bind( this ) ) ;
			break ;
	}

	server.on( 'error' , ( error ) => {
		if ( error.code === 'EACCES' ) {
			term.red( "Error EACCES: opening port %i is forbidden.\n" , this.port ) ;
			term.red( "Please use the --port option to specify another port.\n" ) ;
		}
		else if ( error.code === 'EADDRINUSE' ) {
			term.red( "Error EADDRINUSE: port %i is already used by another program on your system.\n" , this.port ) ;
			term.red( "Please use the --port option to specify another port.\n" ) ;
		}
		else {
			term.red( error.toString() + '\n' ) ;
		}

		process.exit( 1 ) ;
	} ) ;
} ;



HttpServer.prototype.serverHttpHandler = function( client ) {
	var i , match , path_ , url , host , body = '' , response ;

	term.bold.green( "== Received a new request on path: %s ==" , client.unicodePath )( "\n" ) ;
	path_ = client.request.url ;
	host = client.request.headers.host.split( ':' )[ 0 ] ;
	url = this.protocol + '://' + client.request.headers.host + client.request.url ;

	client.request.on( 'data' , ( chunk ) => {
		//console.log( "data event, received:" , chunk ) ;
		body += chunk.toString() ;
	} ) ;

	//client.request.on( 'close' , () => { term.red( "The request was closed\n" ) ; } ) ;

	client.request.on( 'aborted' , () => {
		term.bold.red( "== The request was aborted ==" )( "\n" ) ;

		this.displayHeader( client.request ) ;
		this.displayBody( body , client.request ) ;
		this.displayTrailer( client.request ) ;
		this.displaySeparator() ;
	} ) ;

	client.request.on( 'end' , () => {
		term.bold.green( "== The request ended ==" )( "\n" ) ;
		this.displayHeader( client.request ) ;
		this.displayBody( body , client.request ) ;
		this.displayTrailer( client.request ) ;
		this.displaySeparator() ;

		for ( i = 0 ; i < this.responses.length ; i ++ ) {
			match = this.responses[ i ].match ;

			if (
				( match.host === undefined || match.host === host ) &&
				( match.path === undefined || match.path === path_ ) &&
				( match.url === undefined || match.url === url )
			) {
				response = this.responses[ i ] ;
				break ;
			}
		}

		if ( ! response ) { response = this.defaultResponse ; }

		client.response.writeHeader( response.status , response.headers ) ;
		client.response.end( response.body ) ;
	} ) ;
} ;



HttpServer.prototype.serverWsHandler = function( client ) {
	var i , match , path_ , url , host , response , terminated = false ,
		id = this.connectionId ++ ;

	path_ = client.request.url ;
	host = client.request.headers.host.split( ':' )[ 0 ] ;
	url = this.protocol + '://' + client.request.headers.host + client.request.url ;

	//console.log( client ) ;

	this.displayOpenedConnection( id ) ;
	this.displayHeader( client.request ) ;
	this.displaySeparator() ;

	var processClient = ( special , message ) => {
		// If messages are queued, this could be needed
		if ( terminated ) { return ; }

		response = undefined ;

		if ( ! special ) {
			this.displayMessage( id , message ) ;
			this.displaySeparator() ;
		}

		for ( i = 0 ; i < this.responses.length ; i ++ ) {
			match = this.responses[ i ].match ;

			if (
				( ! match.connect || special === 'connect' ) &&
				( match.host === undefined || match.host === host ) &&
				( match.path === undefined || match.path === path_ ) &&
				( match.url === undefined || match.url === url ) &&
				( match.message === undefined || match.message === message )
			) {
				response = this.responses[ i ] ;
				break ;
			}
		}

		if ( ! response ) { response = this.defaultResponse ; }

		// If the server is about to close, wait for the ack before doing that
		if ( response.close ) { terminated = true ; }

		if ( response.message !== undefined ) {
			client.websocket.send( response.message , ( error ) => {
				if ( error ) { this.displayConnectionError( id , error ) ; }

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
		this.displayClosedConnection( id ) ;
		this.displaySeparator() ;
	} ) ;
} ;

