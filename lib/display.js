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



// Load modules
const term = require( 'terminal-kit' ).terminal ;



// Create the object and export it
const display = {} ;
module.exports = display ;



// Display headers of an incoming message, also compatible with the query format
display.displayHeader = function( config , incomingMessage ) {
	if ( config[ 'silent-header' ] ) { return ; }

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

	//*
	for ( key in incomingMessage.headers ) {
		term.brightCyan.bold( this.normalizeHeader( key ) )( ': %s\n' , incomingMessage.headers[ key ] ) ;
	}

	if ( incomingMessage.auth ) {
		term.brightCyan.bold( 'Authorization' ).dim.italic( ': %s\n' , incomingMessage.auth ) ;
	}
	//*/

	/* available in node 0.12, but not in 0.10
	//console.log( incomingMessage.rawHeaders ) ;

	for ( key = 0 ; key < incomingMessage.rawHeaders.length ; key += 2 )
	{
		term( '%s: %s\n' , incomingMessage.rawHeaders[ key ] , incomingMessage.rawHeaders[ key + 1 ] ) ;
	}
	//*/

	//console.log( incomingMessage.headers ) ;
} ;



// Display headers of an incoming message, also compatible with the query format
display.displayTrailer = function( config , incomingMessage ) {
	if ( config[ 'silent-trailer' ] || ! incomingMessage.trailers ) { return ; }

	var key , hasTrailer = false ;

	//*
	for ( key in incomingMessage.trailers ) {
		if ( ! hasTrailer ) {
			term.brightBlue.bold( '\nTrailers:\n' ) ;
			hasTrailer = true ;
		}

		term.brightCyan.bold( this.normalizeHeader( key ) )( ': %s\n' , incomingMessage.trailers[ key ] ) ;
	}

	if ( hasTrailer ) { term( '\n' ) ; }
	//*/

	/* available in node 0.12, but not in 0.10
	console.log( incomingMessage.rawTrailers ) ;

	for ( key = 0 ; key < incomingMessage.rawTrailers.length ; key += 2 )
	{
		term( '%s: %s\n' , incomingMessage.rawTrailers[ key ] , incomingMessage.rawTrailers[ key + 1 ] ) ;
	}
	//*/

	//console.log( incomingMessage.trailers ) ;
} ;



display.displayBody = function( config , body , incomingMessage ) {
	var title = 'Body' , contentType ;

	if ( config[ 'silent-body' ] || ! body ) { return ; }

	if ( incomingMessage && incomingMessage.decompressed ) {
		title = 'Decompressed ' + title ;
	}

	if ( config.beautify ) {
		if ( incomingMessage ) {
			contentType = incomingMessage.headers && incomingMessage.headers[ 'content-type' ] ;
		}
		else {
			contentType = config.headers && config.headers[ 'Content-Type' ] ;
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

	if ( config[ 'silent-header' ] ) {
		term.noFormat( body + '\n' ) ;
	}
	else {
		term.brightBlue.bold( '\n%s:\n' , title ).noFormat( body + '\n' ) ;
	}
} ;



display.displayOpenedConnection = function( config , id ) {
	if ( config.server ) { term.brightGreen.bold( 'New connection #%i opened\n' , id ) ; }
	else { term.brightGreen.bold( 'Connection opened\n' ) ; }
} ;



display.displayClosedConnection = function( config , id ) {
	if ( config.server ) { term.red.bold( 'Connection #%i closed\n' , id ) ; }
	else { term.red.bold( 'Connection closed\n' ) ; }
} ;



display.displayConnectionError = function( config , id , error ) {
	if ( config.server ) { term.red( 'Connection #%i: %s\n' , error.toString() ) ; }
	else { term.red( 'Connection: %s\n' , error.toString() ) ; }
} ;



display.displayMessage = function( config , id , message ) {
	if ( config.server ) { term.blue( 'Message from #%i:' , id ) ; }
	else { term.blue( 'Message #%i:' , id ) ; }

	term(  ( message.indexOf( '\n' ) >= 0 ? '\n' : ' ' )  + message + '\n' ) ;
} ;



display.displaySeparator = function( config ) {
	term( '\n' ) ;
} ;



display.displayProgressBar = function( context , progress ) {
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

