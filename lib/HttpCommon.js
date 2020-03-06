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



const path = require( 'path' ) ;

const utils = require( './utils.js' ) ;
//const constants = require( './constants.js' ) ;

const termkit = require( 'terminal-kit' ) ;
const term = termkit.terminal ;



function HttpCommon( options = {} ) {
	// Paths
	this.httpRequesterDir = options.httpRequesterDir || path.join( require( 'os' ).homedir() , '.local' , 'share' , 'http-requester' ) ;
	this.commandHistoryPath = path.join( this.httpRequesterDir , 'commandHistory.json' ) ;
	this.pathCompletionPath = path.join( this.httpRequesterDir , 'pathCompletion.json' ) ;


	// Display
	this.silentHeader = !! options.silentHeader ;
	this.silentTrailer = !! options.silentTrailer ;
	this.silentBody = !! options.silentBody ;
	this.beautify = !! options.beautify ;
}

module.exports = HttpCommon ;



// Display headers of an incoming message, also compatible with the query format
HttpCommon.prototype.displayHeader = function( incomingMessage ) {
	if ( this.silentHeader ) { return ; }

	var key , statusGroup ;

	// First line, it depends on the message being a request or a response

	if ( incomingMessage.method ) {
		// use %s, to avoid having to escape %
		term.brightGreen.bold( "%s " , incomingMessage.method ) ;
		term.green( "%s " , incomingMessage.path || incomingMessage.url ) ;
	}

	if ( incomingMessage.httpVersion ) { term.magenta( "HTTP/%s " , incomingMessage.httpVersion ) ; }

	if ( incomingMessage.status ) {
		statusGroup = Math.floor( incomingMessage.status / 100 ) ;

		if ( statusGroup >= 1 && statusGroup <= 2 ) {
			term.brightGreen.bold( incomingMessage.status ).green( " %s" , incomingMessage.statusMessage ) ;
		}
		else if ( statusGroup >= 4 && statusGroup <= 5 ) {
			term.brightRed.bold( incomingMessage.status ).red( " %s" , incomingMessage.statusMessage ) ;
		}
		else {
			term.brightYellow.bold( incomingMessage.status ).yellow( " %s" , incomingMessage.statusMessage ) ;
		}

		if ( incomingMessage.statusMessage !== incomingMessage.standardStatusMessage ) {
			term.gray( " [%s]" , incomingMessage.standardStatusMessage ) ;
		}
	}

	term( '\n' ) ;


	// Headers

	for ( key in incomingMessage.headers ) {
		term.brightCyan.bold( utils.normalizeHeader( key ) )( ': %s\n' , incomingMessage.headers[ key ] ) ;
	}

	if ( incomingMessage.auth ) {
		// Add the Basic Auth header, it's simply 'Basic ' followed by base64 of the auth part of the parsed URL
		term.brightCyan.bold( 'Authorization' )( ': Basic %z\n' , incomingMessage.auth ) ;
	}
} ;



// Display headers of an incoming message, also compatible with the query format
HttpCommon.prototype.displayTrailer = function( incomingMessage ) {
	if ( this.silentTrailer || ! incomingMessage.trailers ) { return ; }

	var key , hasTrailer = false ;

	for ( key in incomingMessage.trailers ) {
		if ( ! hasTrailer ) {
			term.brightBlue.bold( '\nTrailers:\n' ) ;
			hasTrailer = true ;
		}

		term.brightCyan.bold( utils.normalizeHeader( key ) )( ': %s\n' , incomingMessage.trailers[ key ] ) ;
	}

	if ( hasTrailer ) { term( '\n' ) ; }
} ;



HttpCommon.prototype.displayBody = function( body , incomingMessage ) {
	var title = 'Body' , contentType ;

	if ( this.silentBody || body === undefined || body === null || ( ! body && incomingMessage ) ) { return ; }

	if ( incomingMessage && incomingMessage.decompressed ) {
		title = 'Decompressed ' + title ;
	}

	if ( this.beautify ) {
		if ( incomingMessage ) {
			contentType = incomingMessage.headers && incomingMessage.headers[ 'content-type' ] ;
		}
		else {
			contentType = this.headers && this.headers[ 'Content-Type' ] ;
		}

		switch ( contentType ) {
			case 'application/json' :
			case 'text/json' :
				try {
					body = JSON.stringify( JSON.parse( body ) , undefined , 2 ) ;
					title = 'Beautiful ' + title ;
				}
				catch ( error ) {}
				break ;
		}
	}

	if ( this.silentHeader ) {
		term.noFormat( body + '\n' ) ;
	}
	else {
		term.brightBlue.bold( '\n%s:\n' , title ).noFormat( body + '\n' ) ;
	}
} ;



HttpCommon.prototype.displayOpenedConnection = function( id ) {
	if ( this.server ) { term.brightGreen.bold( 'New connection #%i opened\n' , id ) ; }
	else { term.brightGreen.bold( 'Connection opened\n' ) ; }
} ;



HttpCommon.prototype.displayClosedConnection = function( id ) {
	if ( this.server ) { term.red.bold( 'Connection #%i closed\n' , id ) ; }
	else { term.red.bold( 'Connection closed\n' ) ; }
} ;



HttpCommon.prototype.displayConnectionError = function( id , error ) {
	if ( this.server ) { term.red( 'Connection #%i: %s\n' , error.toString() ) ; }
	else { term.red( 'Connection: %s\n' , error.toString() ) ; }
} ;



HttpCommon.prototype.displayMessage = function( id , message ) {
	if ( this.server ) { term.blue( 'Message from #%i:' , id ) ; }
	else { term.blue( 'Message #%i:' , id ) ; }

	term(  ( message.includes( '\n' ) ? '\n' : ' ' )  + message + '\n' ) ;
} ;



HttpCommon.prototype.displaySeparator = function() {
	term( '\n' ) ;
} ;



HttpCommon.prototype.displayProgressBar = function( context , progress ) {
	if ( ! context.instanciated ) {
		// No progress bar needed?
		if ( progress >= 1 ) { return ; }

		term( '\n' ) ;

		context.instanciated = true ;

		context.progressBar = term.progressBar( {
			title: 'Downloading:' ,
			percent: true ,
			eta: true ,
			width: 80
		} ) ;
	}

	context.progressBar.update( progress ) ;

	// Prevent from displaying the progress bar if the download was to fast
	if ( progress >= 1 ) { context.progressBar.stop() ; }
} ;

