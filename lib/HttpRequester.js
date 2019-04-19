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



const utils = require( './utils.js' ) ;
const constants = require( './constants.js' ) ;
const HttpCommon = require( './HttpCommon.js' ) ;

const Promise = require( 'seventh' ) ;

const fs = require( 'fs' ) ;
Promise.promisifyNodeApi( fs ) ;
const fsKit = require( 'fs-kit' ) ;
Promise.promisifyNodeApi( fsKit ) ;

const path = require( 'path' ) ;
const zlib = require( 'zlib' ) ;
const http = require( 'http' ) ;
const https = require( 'https' ) ;
const WebSocket = require( 'ws' ) ;

const termkit = require( 'terminal-kit' ) ;
const term = termkit.terminal ;
const tree = require( 'tree-kit' ) ;
const naturalSort = require( 'string-kit' ).naturalSort ;

const shellCommand = {} ;



function HttpRequester( options = {} ) {
	HttpCommon.call( this , options ) ;

	this.lastResponse = null ;


	// Query
	this.query = {
		method: options.method ,
		protocol: options.protocol ,
		auth: options.auth ,
		host: options.host ,
		hostname: options.hostname ,
		port: options.port ,
		path: options.path ,
		pathname: options.pathname ,
		search: options.search ,
		headers: options.headers ,
		body: options.body ,
		socketPath: options.socketPath ,
		localAddress: options.localAddress ,
		timeout: options.timeout ,


		input: options.input ,
		inputOffset: options.inputOffset || 0 ,
		output: options.output ,
		fakeCrashScenario: options.fakeCrashScenario || null
	} ;


	// WS client
	this.messages = options.messages ;
	this.closeMatch = options.closeMatch ;


	// Shell
	this.module = options.module ;
	this.cwd = options.cwd || process.cwd() ;
	this.decompress = options.decompress === undefined ? true : !! options.decompress ;
	this.trailingslash = options.trailingslash === undefined ? true : !! options.trailingslash ;
	this.autocookie = !! options.autocookie ;
	this.autoclear = options.autoclear ?
		{ headers: !! options.autoclear.headers , auth: !! options.autoclear.auth , body: options.autoclear.body === undefined ? true : !! options.autoclear.body } :
		{ headers: false , auth: false , body: true } ;


	// Shell lazy data
	this.shellIsInit = false ;
	this.commandHistory = null ;
	this.pathCompletion = null ;
}

HttpRequester.prototype = Object.create( HttpCommon.prototype ) ;
HttpRequester.prototype.constructor = HttpRequester ;

module.exports = HttpRequester ;



// Core part



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
		input: the input stream (e.g. a file), if specified, that will be streamed to the body
		headerCallback: called once the headers are received
		progressCallback: called each time a chunk of the body is received
		decompress: decompress the body on-the-fly

	return: the request body, for more information, check this.lastResponse
*/
HttpRequester.prototype.performRequest = async function( query , options = {} ) {
	var request , response , query_ , time , crashLength , sent , data , engorged ,
		bodyStream , body , bodyLength , bodyDownloadedBytes ;

	this.lastResponse = null ;

	if ( options.input ) {
		if (
			constants.unexpectedBody[ query.method ] &&
			( ! query.headers['Transfer-Encoding'] || ! query.headers['Content-Length'] )
		) {
			// This is not done automatically for methods that are not expected bodies
			//query.headers['Content-Length'] = query.body.length ;
			query.headers['Transfer-Encoding'] = 'chunked' ;
		}
	}
	else if ( query.body !== undefined ) {
		if ( ! Buffer.isBuffer( query.body ) ) {
			if ( typeof query.body !== 'string' ) { query.body = JSON.stringify( query.body ) ; }
			query.body = Buffer.from( query.body ) ;
		}

		if (
			constants.unexpectedBody[ query.method ] &&
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

	request.on( 'error' , error => {
		switch ( error.code ) {
			case 'EPIPE' :
			case 'ECONNRESET' :
				// One of possible errors is EPIPE, when input is piped to the request and for some reason the request is aborted from server-side
				// We just ignore it...
				break ;
			default :
				term.red( "Request error: %E\n" , error ) ;
		}
	} ) ;

	setTimeout( async () => {
		// Write the request body and end the request
		if ( options.input ) {
			if ( options.fakeCrashScenario === 'mid-body' ) {
				crashLength = Math.floor( Math.random() * ( options.input.lstat ? options.input.lstat.size : 0 ) ) ;
				//term( "^G -- targeting a crash after %i bytes out of %i^:\n" , crashLength , options.input.lstat.size ) ;
				sent = 0 ;

				while ( sent < crashLength ) {
					/*
					data = await Promise.onceEvent( options.input , 'data' ) ;
					*/

					//term( "^G -- readable %Y %Y\n" , options.input.readable , options.input.readableLength ) ;
					if ( ! options.input.readable || ! options.input.readableLength ) {
						//term( "^G -- awaiting readable\n" ) ;
						await Promise.onceEvent( options.input , 'readable' ) ;
						//term( "^G -- readable\n" ) ;
					}

					//term( "^G -- getting data\n" ) ;
					data = options.input.read() ;
					if ( data === null  ) {
						//term( "^G -- null returned\n" ) ;
						break ;
					}
					//term( "^G -- data.length: %i^:\n" , data.length ) ;

					if ( sent + data.length > crashLength ) {
						data = data.slice( 0 , crashLength - sent ) ;
						//term( "^G -- data.length after: %i^:\n" , data.length ) ;
					}

					sent += data.length ;

					await new Promise( resolve => {
						request.write( data , async () => {
							//term( "^G -- write CB\n" ) ;

							if ( ! request.writable ) {
								//term( "^G -- awaiting drain\n" ) ;
								await Promise.onceEvent( request , 'drain' ) ;
								//term( "^G -- drain\n" ) ;
							}

							resolve() ;
						} ) ;
					} ) ;

					//term( "^G -- write done\n" ) ;
				}

				term( "^rFAKE CRASH SCENARIO: ^+mid-body^ ^y-- crash after %i bytes (stream)^:\n" , sent ) ;
				request.socket.destroy() ;
			}
			else {
				options.input.pipe( request ) ;

				try {
					await Promise.onceEventOrError( options.input , 'end' ) ;
				}
				catch ( error ) {
					term.red( "Input file error: %s\n" , error ) ;
				}

				request.end() ;
			}
		}
		else if ( query.body ) {
			if ( options.fakeCrashScenario === 'mid-body' ) {
				crashLength = Math.floor( Math.random() * query.body.length ) ;
				term( "^rFAKE CRASH SCENARIO: ^+mid-body^ ^y-- crash after %i bytes out of %i^:\n" , crashLength , query.body.length ) ;
				request.write( query.body.slice( 0 , crashLength ) , () => request.socket.destroy() ) ;
			}
			else {
				//console.log( "BODY to send:" , query.body ) ;
				request.end( query.body ) ;
			}
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



// ws client
HttpRequester.prototype.wsMessages = async function() {
	var ws , messages = [] , count = 0 , terminated = false ;

	ws = new WebSocket( 'ws://' + this.query.hostname + ':' + this.query.port + this.query.path , { headers: this.query.headers } ) ;

	// Wait for an opening connection
	await Promise.onceEventOrError( ws , 'open' , [ 'close' , 'end' ] ) ;

	this.displayOpenedConnection() ;

	this.messages.forEach( m => {
		if ( typeof m.message === 'string' ) { ws.send( m.message ) ; }
		else { ws.send( JSON.stringify( m.message ) ) ; }
	} ) ;

	ws.on( 'message' , ( message , flags ) => {
		if ( terminated ) { return ; }

		// flags.binary will be set if a binary data is received.
		// flags.masked will be set if the data was masked.
		messages[ count ++ ] = message ;
		this.displayMessage( count , message ) ;

		if ( this.closeMatch.message === message || this.closeMatch.count === count ) {
			ws.terminate() ;
		}
	} ) ;

	// Wait for a closing connection
	await Promise.onceEventOrError( ws , 'close' ) ;

	this.displayClosedConnection() ;

	return messages ;
} ;



// Shell



HttpRequester.prototype.shell = function() {
	if ( ! this.shellIsInit ) {
		try {
			this.commandHistory = require( this.commandHistoryPath ) ;
		}
		catch ( error ) {
			term.red( "Can't load commandHistory.json\n" ) ;
			this.commandHistory = [] ;
		}

		try {
			this.pathCompletion = require( this.pathCompletionPath ) ;
			//console.log( "load:" , pathCompletion ) ;
		}
		catch ( error ) {
			term.red( "Can't load pathCompletion.json\n" ) ;
			this.pathCompletion = {} ;
		}

		if ( this.module ) { this.initModule() ; }

		this.shellIsInit = true ;
	}

	term.blue( 'Type ' ).blue.bold( 'help' ).blue( ' for command description, press ' )
		.blue.bold( 'TAB' ).blue( ' to auto-complete, press ' )
		.blue.bold( 'CTRL-C' ).blue( ' to quit.\n' ) ;
	term( '\n' ) ;

	term.grabInput() ;

	term.on( 'key' , this.onKey.bind( this ) ) ;

	return this.repl() ;
} ;



HttpRequester.prototype.onKey = function( key ) {
	switch ( key ) {
		case 'CTRL_C' :
			term.green( 'CTRL-C received...\n' ) ;
			this.terminate() ;
			break ;
	}
} ;



HttpRequester.prototype.terminate = function() {
	// Save command history
	try {
		this.commandHistory = this.commandHistory.slice( -100 ) ;	// Only save the last 100 lines
		fs.writeFileSync( this.commandHistoryPath , JSON.stringify( this.commandHistory ) ) ;
	}
	catch ( error ) {
		term.red( "Can't save commandHistory.json\n" ) ;
	}

	// Save path completion
	try {
		//console.log( "save: " , pathCompletionPath , JSON.stringify( pathCompletion ) ) ;
		fs.writeFileSync( this.pathCompletionPath , JSON.stringify( this.pathCompletion ) ) ;
	}
	catch ( error ) {
		term.red( "Can't save pathCompletion.json\n" ) ;
	}

	term.processExit() ;
} ;



HttpRequester.prototype.repl = async function() {
	try {
		for ( ;; ) {
			await this.replNext() ;
		}
	}
	catch ( error ) {
		term.red.bold( "\nAn unexpected error occurs: %E\n" , error ) ;
		this.terminate() ;
	}
} ;



// emulate is for module: it emulates user input
HttpRequester.prototype.replNext = async function( emulateCommand ) {
	var rawCommand , command ;

	this.prompt() ;

	if ( emulateCommand ) {
		rawCommand = emulateCommand ;
		term( emulateCommand ) ;
		term( '\n' ) ;
	}
	else {
		rawCommand = await term.inputField( {
			history: this.commandHistory ,
			autoComplete: this.clientAutoComplete.bind( this ) ,
			autoCompleteMenu: {
				selectedStyle: term.dim.blue.bgGreen
			}
		} ).promise ;

		term( '\n' ) ;

		// Only add a line to the history if it's not blank and different from the last entry
		if ( rawCommand.match( /\S/ ) && rawCommand !== this.commandHistory[ this.commandHistory.length - 1 ] ) {
			this.commandHistory.push( rawCommand ) ;
		}

		//console.log( "Input:" , rawCommand ) ;
	}

	command = this.parseShellCommand( rawCommand ) ;
	//console.log( "command:" , command ) ;
	await shellCommand[ command.type ].call( this , command ) ;
} ;



HttpRequester.prototype.prompt = function() {
	term.dim( '%s://%s%s%s' ,
		this.query.protocol ,
		this.query.auth ? this.query.auth.replace( /^([^:]*):(.*)$/g , ( m , user , pw ) => user + ':' + termkit.spChars.password.repeat( pw.length ) ) + '@' : '' ,
		this.query.hostname ,
		( this.query.port === 80 && this.query.protocol === 'http' ) || ( this.query.port === 443 && this.query.protocol === 'https' ) ? '' : ':' + this.query.port
	) ;

	term.bold( this.query.pathname ) ;

	if ( this.query.search ) {
		// use %s, to avoid having to escape %
		term.bold.brightRed( "%s" , this.query.search[ 0 ] ).brightRed( "%s" , this.query.search.slice( 1 ) ) ;
	}

	term.dim( '> ' ) ;
} ;



HttpRequester.prototype.parseShellCommand = function( rawCommand ) {
	var matches , subMatches  , tmp , command = { type: 'noop' } ;

	if ( rawCommand.match( /^\s*help\s*$/ ) ) {
		command.type = 'help' ;
	}
	else if ( rawCommand.match( /^\s*body\s*$/ ) ) {
		// Body without argument start the multiline body input mode
		command.type = 'multiLineBody' ;
	}
	else if ( ( matches = rawCommand.match( /^\s*(\S*:\/\/.*)\s*$/ ) ) ) {
		command.type = 'changeUrl' ;
		command.url = matches[ 1 ] ;
	}
	else if ( ( matches = rawCommand.match( /^\s*\?(.*)\s*$/ ) ) ) {
		command.type = 'changeQueryString' ;
		command.search = matches[ 1 ] ;
	}
	else if ( ( matches = rawCommand.match( /^\s*([a-zA-Z]+)(\.([a-zA-Z-]+))?(\s+(.*)\s*)?$/ ) ) ) {
		if ( matches[ 1 ] === 'req' || matches[ 1 ] === 'request' ) {
			// This is a request <method> <path>
			command.type = 'request' ;

			if ( matches[ 5 ] && ( subMatches = matches[ 5 ].match( /^(?:\s*<\s*([^<>\s]+)\s*)?(?:\s*>\s*([^<>\s]+)\s*)?(?:\s*<\s*([^<>\s]+)\s*)?$/ ) ) ) {
				command.inputFile = subMatches[ 3 ] || subMatches[ 1 ] ;
				command.outputFile = subMatches[ 2 ] ;
			}
		}
		else if ( constants.methods[ matches[ 1 ].toUpperCase() ] ) {
			// This is a request <method> <path>
			command.type = 'request' ;
			command.method = matches[ 1 ].toUpperCase() ;

			if ( matches[ 5 ] && ( subMatches = matches[ 5 ].match( /^([^<>\s]*)(?:\s*<\s*([^<>\s]+)\s*)?(?:\s*>\s*([^<>\s]+)\s*)?(?:\s*<\s*([^<>\s]+)\s*)?$/ ) ) ) {
				command.path = subMatches[ 1 ] ;
				command.inputFile = subMatches[ 4 ] || subMatches[ 2 ] ;
				command.outputFile = subMatches[ 3 ] ;

				if ( command.path && command.path.match( /:\/\// ) ) { utils.urlToQuery( command.path , command ) ; }
			}
		}
		else if ( matches[ 1 ] === 's' || matches[ 1 ] === 'show' ) {
			command.type = 'inspect' ;
		}
		else if ( matches[ 1 ] === 'ls' ) {
			command.type = 'ls' ;
		}
		else if ( matches[ 1 ] === 'lls' ) {
			command.type = 'lls' ;
		}
		else if ( matches[ 1 ] === 'host' ) {
			command.type = 'changeHost' ;
			tmp = matches[ 5 ].split( ':' ) ;
			command.hostname = tmp[ 0 ] ;
			command.port = tmp[ 1 ] ;
		}
		else if ( matches[ 1 ] === 'clear' ) {
			command.type = 'clear' ;
			command.clear = matches[ 5 ] ;
		}
		else if ( matches[ 1 ] === 'autoclear' ) {
			command.type = 'autoclear' ;
			command.clear = matches[ 5 ] ;
		}
		else if ( matches[ 1 ] === 'trailingslash' ) {
			command.type = 'trailingslash' ;
		}
		else if ( matches[ 1 ] === 'beautify' ) {
			command.type = 'beautify' ;
		}
		else if ( matches[ 1 ] === 'decompress' ) {
			command.type = 'decompress' ;
		}
		else if ( matches[ 1 ] === 'fakecrash' ) {
			command.type = 'fakecrash' ;
			command.scenario = matches[ 5 ] ;
		}
		else if ( matches[ 1 ] === 'inputoffset' ) {
			command.type = 'inputoffset' ;
			command.offset = matches[ 5 ] ;
		}
		else if ( matches[ 1 ] === 'autocookie' ) {
			command.type = 'autocookie' ;
		}
		else if ( matches[ 1 ] === 'cd' ) {
			command.type = 'cd' ;
			command.path = matches[ 5 ] ;
		}
		else if ( matches[ 1 ] === 'lcd' ) {
			command.type = 'lcd' ;
			command.localPath = matches[ 5 ] ;
		}
		else if ( matches[ 1 ] === 'lcat' ) {
			command.type = 'lcat' ;
			command.localPath = matches[ 5 ] ;
		}
		else if ( matches[ 1 ] === 'lrm' ) {
			command.type = 'lrm' ;
			command.localPath = matches[ 5 ] ;
		}
		else if ( constants.shellSet[ matches[ 1 ] ] ) {
			if ( matches[ 3 ] ) {
				command.type = 'setHeader' ;
				command.header = matches[ 3 ] ;
				command.value = matches[ 5 ] ;
			}
			else {
				command.type = 'set' ;
				command.field = matches[ 1 ] ;
				command.value = matches[ 5 ] ;
			}
		}
		else if ( this.module && typeof this.module.commands[ matches[ 1 ] ] === 'function' ) {
			command.type = 'moduleCommand' ;
			command.method = matches[ 1 ] ;
			command.args = this.parseModuleCommandArguments( matches[ 5 ] ) ;
		}
		else {
			command.type = 'syntaxError' ;
			command.message = "Unknown command: " + matches[ 1 ] ;
		}
	}
	else if ( ( matches = rawCommand.match( /^\s*([a-zA-Z0-9-]+):\s*(.*)\s*$/ ) )	) {
		command.type = 'setHeader' ;
		command.header = matches[ 1 ] ;
		command.value = matches[ 2 ] ;
	}
	else {
		matches = rawCommand.match( /^\s*(\S+)(?:\s+(.*)\s*)?$/ ) ;

		if ( matches ) {
			if ( this.module && typeof this.module.commands[ matches[ 1 ] ] === 'function' ) {
				command.type = 'moduleCommand' ;
				command.method = matches[ 1 ] ;
				command.args = this.parseModuleCommandArguments( matches[ 2 ] ) ;
			}
			else if ( matches[ 1 ] && matches[ 1 ].length > 0 ) {
				command.type = 'syntaxError' ;
				command.message = "Unknown command: " + matches[ 1 ] ;
			}
		}
	}

	return command ;
} ;



shellCommand.noop = () => undefined ;



shellCommand.syntaxError = function( command ) {
	term.brightRed.bold( 'Syntax error' ).red( ' - %s\n' , command.message ) ;
} ;



shellCommand.help = function() {
	var column = 40 ;

	term( '\n' ) ;

	term.cyan( 'show' ).dim( ' or ' )
		.cyan( 's' )
		.column( column )
		.dim( 'List the details of the request about to be performed.\n' ) ;
	term.cyan( 'request' ).dim( ' or ' )
		.cyan( 'req' )
		.column( column )
		.dim( 'Perform the request.\n' ) ;
	term.cyan( 'request > output-file.ext' )
		.column( column )
		.dim( "Output the body request's response to this file.\n" ) ;
	term.cyan( 'request < input-file.ext' )
		.column( column )
		.dim( "Use this file as the input for the request's body.\n" ) ;
	term.cyan( 'request < input.ext > output.ext' )
		.column( column )
		.dim( "Combine both input file and output file.\n" ) ;
	term.yellow( '<protocol>' ).cyan( '://' )
		.yellow( '<host>[:<port>][/<path>]' )
		.column( column )
		.dim( "Parse the full URL and set the protocol, host, port and path.\n" ) ;
	term.cyan( 'host ' ).yellow( '<hostname>[:<port>]' )
		.column( column )
		.dim( 'Set the host and port to connect to.\n' ) ;
	term.cyan( 'port ' ).yellow( '<port>' )
		.column( column )
		.dim( 'Set the port to connect to.\n' ) ;
	term.cyan( 'protocol ' ).yellow( 'http|https|ws' )
		.column( column )
		.dim( 'Set the protocol to use.\n' ) ;
	term.cyan( 'method ' ).yellow( '<HTTP method>' )
		.column( column )
		.dim( 'Set the HTTP method.\n' ) ;
	term.cyan( 'cd ' ).yellow( '<path>' )
		.column( column )
		.dim( "Modify the path like UNIX 'cd' does, start w/ '/' for absolute path, w/o for relative path.\n" ) ;
	term.cyan( 'ls' ).column( column )
		.dim( "List all known sub-resources of the current path, like UNIX 'ls' does.\n" ) ;
	term.cyan( '?' ).yellow( '<query string>' )
		.column( column )
		.dim( "Set the query string part of the URL. Use a single '?' to erase it.\n" ) ;
	term.cyan( 'headers.' ).yellow( '<header> <value>' )
		.column( column )
		.dim( "Set a HTTP header.\n" ) ;
	term.yellow( '<header>' ).cyan( ': ' )
		.yellow( '<value>' )
		.column( column )
		.dim( "The shortest way to set a HTTP header.\n" ) ;
	term.cyan( 'auth ' ).yellow( '<user>' )
		.cyan( ':' )
		.yellow( '<password>' )
		.column( column )
		.dim( "Basic authentication to compute an Authorization header.\n" ) ;
	term.cyan( 'body ' ).yellow( '<body string>' )
		.column( column )
		.dim( 'Set the body of the request.\n' ) ;
	term.cyan( 'body' ).column( column )
		.dim( 'Set the body of the request, using the multi-line mode.\n' ) ;
	term.cyan( 'timeout ' ).yellow( '<ms>' )
		.column( column )
		.dim( 'Set the request timeout in ms.\n' ) ;
	term.cyan( 'clear ' ).yellow( '[headers|auth|body]' )
		.column( column )
		.dim( 'Clear headers, auth or body, without argument: clear both.\n' ) ;
	term.cyan( 'autoclear ' ).yellow( '[headers|auth|body]' )
		.column( column )
		.dim( 'Switch autoclear mode for headers/auth/body after each request, w/o arg: display.\n' ) ;
	term.cyan( 'trailingslash ' ).column( column )
		.dim( 'Automatically add/remove trailing slashes.\n' ) ;
	term.cyan( 'autocookie' ).column( column )
		.dim( 'Turn autocookie on/off.\n' ) ;
	term.cyan( 'beautify' ).column( column )
		.dim( 'Turn beautify on/off for JSON body.\n' ) ;
	term.cyan( 'decompress' ).column( column )
		.dim( 'Turn body decompression on/off.\n' ) ;
	term.cyan( 'lcd ' ).yellow( '<path>' )
		.column( column )
		.dim( "Modify the local path like UNIX 'cd' does, start w/ '/' for absolute path, w/o for relative path.\n" ) ;
	term.cyan( 'lls' ).column( column )
		.dim( "Local list of files and directories in the current working directory, like UNIX 'ls' does.\n" ) ;
	term.cyan( 'lcat ' ).yellow( '<file-path>' )
		.column( column )
		.dim( "Display a local file like UNIX 'cat' does, start w/ '/' for absolute path, w/o for relative path.\n" ) ;
	term.cyan( 'lrm ' ).yellow( '<file-path>' )
		.column( column )
		.dim( "Delete a local a local file like UNIX 'rm' does, start w/ '/' for absolute path, w/o for relative path.\n" ) ;
	term.cyan( 'fakecrash ^y[off|^/scenario^:^y]' ).column( column )
		.dim( 'Simulate some request error.\n' ) ;
	term.cyan( 'inputoffset ' ).yellow( '<offset>' )
		.column( column )
		.dim( "In conjunction with an input file, start streaming from that offset instead of the begining of the file.\n" ) ;

	term.magenta( '\nUse the ' ).magenta.bold( "TAB" ).magenta( ' key to auto-complete ' )
		.magenta.bold( 'like a boss' ).magenta( '! Even headers are supported!\n\n' ) ;

	// http methods
} ;



shellCommand.changeHost = function( command ) {
	this.query.hostname = command.hostname ;
	if ( command.port ) { this.query.port = command.port ; }
} ;



shellCommand.changeUrl = function( command ) {
	utils.urlToQuery( command.url , this.query ) ;
} ;



shellCommand.set = async function( command ) {
	var upperCased , ok ;

	switch ( command.field ) {
		case 'method' :
			upperCased = command.value.toUpperCase() ;

			if ( constants.methods[ upperCased ] ) {
				this.query.method = upperCased ;
			}
			else {
				term.red( "'" )
					.italic.bold.red( command.value )
					.red( "' is not a valid HTTP method and is unlikely to succeed. " )
					.brightGreen( "Proceed anyway? " )
					.bold( "[Y/n] " ) ;

				ok = await this.yesOrNo() ;
				term( '\n' ) ;
				if ( ok ) { this.query.method = command.value ; }
			}
			break ;

		case 'port' :
			command.value = parseInt( command.value , 10 ) ;
			if ( ! isNaN( command.value ) && command.value >= 0 ) { this.query.port = command.value ; }
			break ;

		case 'timeout' :
			command.value = parseInt( command.value , 10 ) ;
			if ( ! isNaN( command.value ) && command.value >= 0 ) { this.query.timeout = command.value ; }
			term( '^bQuery timeout: ^B%sms\n' , this.query.timeout ) ;
			break ;

		case 'protocol' :
			if ( constants.protocols[ command.value ] ) { this.query.protocol = command.value ; }
			break ;

		case 'headers' :
			// shellCommand.setHeader() should be used
			// If we are here, a blank 'headers' command have been issued
			term.red( "'headers' should be followed by dot '.' and the name of the header to set\n" ) ;
			break ;

		default :
			this.query[ command.field ] = command.value ;
	}
} ;



shellCommand.setHeader = function( command ) {
	if ( ! command.value ) {
		// If the value is empty, then we delete that header
		delete this.query.headers[ utils.normalizeHeader( command.header ) ] ;
	}
	else {
		this.query.headers[ utils.normalizeHeader( command.header ) ] = command.value ;
	}
} ;



shellCommand.inspect = function( command ) {
	this.displayHeader( this.query ) ;
	this.displayBody( this.query.body ) ;
	this.displayTrailer( this.query ) ;
} ;



shellCommand.cd = function( command ) {
	this.query.pathname = path.resolve( this.query.pathname || '/' , command.path || '/' ) ;

	if ( this.trailingslash === true && this.query.pathname[ this.query.pathname.length - 1 ] !== '/' ) {
		this.query.pathname += '/' ;
	}
	else if ( this.trailingslash === false && this.query.pathname[ this.query.pathname.length - 1 ] === '/' ) {
		this.query.pathname = this.query.pathname.slice( 0 , -1 ) ;
	}

	this.query.path = this.query.pathname ;

	if ( this.query.search ) { this.query.path += this.query.search ; }
} ;



shellCommand.lcd = async function( command ) {
	var cwd , stats ;

	if ( path.isAbsolute( command.localPath ) ) {
		cwd = path.normalize( command.localPath ) ;
	}
	else {
		cwd = path.normalize( path.join( this.cwd , command.localPath ) ) ;
	}

	try {
		stats = await fs.lstatAsync( cwd ) ;
	}
	catch ( error ) {
		if ( error.code === 'ENOENT' ) {
			term.red( "Directory not found.\n" ) ;
		}
		else {
			term.red( "Directory not found or not accessible: %s\n" , error ) ;
		}
		return ;
	}

	if ( ! stats.isDirectory() ) {
		term.red( "This is not a directory.\n" ) ;
		return ;
	}

	this.cwd = cwd ;
	term.italic.dim.blue( "Local: %s\n" , this.cwd ) ;
} ;



shellCommand.lcat = async function( command ) {
	var filePath , stream ;

	if ( path.isAbsolute( command.localPath ) ) {
		filePath = command.localPath ;
	}
	else {
		filePath = path.join( this.cwd , command.localPath ) ;
	}

	term.italic.dim.blue( "Local file %s:\n" , filePath ) ;

	stream = fs.createReadStream( filePath ) ;

	// Use %s format rather than direct string: it sanitizes the string
	stream.on( 'data' , chunk => term( '%s' , chunk ) ) ;

	try {
		await Promise.onceEventOrError( stream , 'end' ) ;
	}
	catch ( error ) {
		if ( error.code === 'ENOENT' ) {
			term.red( "File not found: %s\n" , filePath ) ;
		}
		else if ( error.code === 'EISDIR' ) {
			term.red( "This is not a file: %s\n" , filePath ) ;
		}
		else {
			term.red( "Can't lcat %s: %s\n" , filePath , error ) ;
		}
		return ;
	}

	term( '\n' ) ;
} ;



shellCommand.lrm = async function( command ) {
	var filePath , stream ;

	if ( path.isAbsolute( command.localPath ) ) {
		filePath = command.localPath ;
	}
	else {
		filePath = path.join( this.cwd , command.localPath ) ;
	}

	try {
		await fs.unlinkAsync( filePath ) ;
	}
	catch ( error ) {
		if ( error.code === 'ENOENT' ) {
			term.red( "File not found: %s\n" , filePath ) ;
		}
		else {
			term.red( "Can't lrm %s: %s\n" , filePath , error ) ;
		}
		return ;
	}

	term.yellow( "Deleted local file %s\n" , filePath ) ;
} ;



shellCommand.changeQueryString = function( command ) {
	if ( command.search.length > 1 ) {
		// This try to encode only unreserved chars, and should be compatible with RestQuery query string
		this.query.search = '?' + command.search.replace( /[^&=,[\]+]+/g , match => encodeURIComponent( match ) ) ;
		this.query.path = this.query.pathname + this.query.search ;
	}
	else {
		this.query.search = null ;
		this.query.path = this.query.pathname ;
	}
} ;



shellCommand.ls = function( command ) {
	var i , j , pathArray , pathNode , keys , key , width = 0 , columns ;

	pathArray = ( this.query.hostname + ':' + this.query.port + this.query.pathname ).split( '/' ) ;
	if ( pathArray[ pathArray.length - 1 ] === '' ) { pathArray.pop() ; }
	pathNode = tree.path.get( this.pathCompletion , pathArray ) ;

	if ( ! pathNode || typeof pathNode !== 'object' ) { return ; }

	keys = Object.keys( pathNode ) ;

	if ( ! keys.length ) { return ; }

	term.italic.dim.blue( "Known resources:\n" ) ;

	keys.sort( naturalSort ) ;

	for ( i = 0 ; i < keys.length ; i ++ ) { width = Math.max( width , keys[ i ].length ) ; }
	width += 2 ;
	columns = Math.floor( term.width / width ) ;

	//console.log( '\ncolumns:' , columns , width , term.width ) ;

	for ( i = 0 ; i < keys.length ; i ++ ) {
		key = keys[ i ] ;

		j = i % columns ;
		term.column( j * width ) ;

		if ( i && ! j ) { term( '\n' ) ; }

		if ( pathNode[ key ] && typeof pathNode[ key ] === 'object' ) { term.magenta.bold( key ).bold( '/' ) ; }
		else { term.brightGreen( key ) ; }
	}

	term( '\n' ) ;
} ;



shellCommand.lls = async function( command ) {
	var i , j , files , file , width = 0 , columns ;

	try {
		files = await fsKit.readdirAsync( this.cwd , { slash: true } ) ;
	}
	catch ( error ) {
		term.red( "Can't access directory %s: %s\n" , this.cwd , error ) ;
		return ;
	}

	files.sort( naturalSort ) ;
	term.italic.dim.blue( "Local %s:\n" , this.cwd ) ;

	for ( i = 0 ; i < files.length ; i ++ ) { width = Math.max( width , files[ i ].length ) ; }
	width += 2 ;
	columns = Math.floor( term.width / width ) ;

	//console.log( '\ncolumns:' , columns , width , term.width ) ;

	for ( i = 0 ; i < files.length ; i ++ ) {
		file = files[ i ] ;

		j = i % columns ;
		term.column( j * width ) ;

		if ( i && ! j ) { term( '\n' ) ; }

		if ( file.endsWith( '/' ) ) { term.brightBlue( file ) ; }
		else { term( file ) ; }
	}

	term( '\n' ) ;
} ;



shellCommand.clear = function( command ) {
	switch ( command.clear ) {
		case 'headers' :
			this.query.headers = {} ;
			term.blue( 'Headers ' ).blue.bold( 'cleared.\n' ) ;
			break ;
		case 'body' :
			delete this.query.body ;
			term.blue( 'Body ' ).blue.bold( 'cleared.\n' ) ;
			break ;
		case 'auth' :
			delete this.query.auth ;
			term.blue( 'Auth ' ).blue.bold( 'cleared.\n' ) ;
			break ;
		case '' :
		case undefined :
			this.query.headers = {} ;
			delete this.query.body ;
			delete this.query.auth ;
			term.blue( 'Headers, auth and body ' ).blue.bold( 'cleared.\n' ) ;
			break ;
	}
} ;



shellCommand.autoclear = function( command ) {
	switch ( command.clear ) {
		case 'headers' :
			this.autoclear.headers = ! this.autoclear.headers ;
			break ;
		case 'body' :
			this.autoclear.body = ! this.autoclear.body ;
			break ;
		case 'auth' :
			this.autoclear.auth = ! this.autoclear.auth ;
			break ;
	}

	term.blue( 'Autoclear status:   headers ' ).blue.bold( this.autoclear.headers ? 'on' : 'off' )
		.blue( '   auth ' ).blue.bold( this.autoclear.auth ? 'on' : 'off' )
		.blue( '   body ' ).blue.bold( this.autoclear.body ? 'on' : 'off' )( '\n' ) ;
} ;



shellCommand.fakecrash = function( command ) {
	switch ( command.scenario ) {
		case 'mid-body' :
			this.query.fakeCrashScenario = command.scenario ;
			break ;
		case '' :
			// Just display current
			break ;
		default :
			this.query.fakeCrashScenario = null ;
	}

	term.blue( 'Fake crash scenario: ' ).blue.bold( this.query.fakeCrashScenario ? this.query.fakeCrashScenario : 'off' )( '\n' ) ;
} ;



shellCommand.inputoffset = function( command ) {
	if ( command.offset ) {
		this.query.inputOffset = parseInt( command.offset , 10 ) || 0 ;
	}

	term( '^bInput offset: ^+%s^:\n' , this.query.inputOffset ) ;
} ;



shellCommand.trailingslash = function( command ) {
	term.blue( 'Trailing-slash status: ' ) ;

	if ( this.trailingslash === true ) {
		this.trailingslash = false ;
		term.blue.bold( 'remove' ) ;
	}
	else if ( this.trailingslash === false ) {
		this.trailingslash = null ;
		term.blue.bold( 'do nothing' ) ;
	}
	else {
		this.trailingslash = true ;
		term.blue.bold( 'add' ) ;
	}

	term( '\n' ) ;
} ;



shellCommand.beautify = function( command ) {
	this.beautify = ! this.beautify ;
	term.blue( 'Beautify status: ' ).blue.bold( this.beautify ? 'on' : 'off' )( '\n' ) ;
} ;



shellCommand.decompress = function( command ) {
	this.decompress = ! this.decompress ;
	term.blue( 'Decompress status: ' ).blue.bold( this.decompress ? 'on' : 'off' )( '\n' ) ;
} ;



shellCommand.autocookie = function( command ) {
	this.autocookie = ! this.autocookie ;
	term.blue( 'Autocookie status: ' ).blue.bold( this.autocookie ? 'on' : 'off' )( '\n' ) ;
} ;



shellCommand.multiLineBody = async function( command ) {
	this.query.body = await this.shellMultiLineInput() ;
} ;



shellCommand.request = async function( command ) {
	var query , streams = {} , incomingMessage , shouldRedirect = false , pathArray , body , ok , stats ;

	query = tree.extend( { deep: true } , {} , this.query ) ;

	if ( command.method ) { query.method = command.method ; }
	if ( command.path ) { query.path = command.path ; }
	if ( command.protocol ) { query.protocol = command.protocol ; }
	if ( command.host ) { query.host = command.host ; }
	if ( command.hostname ) { query.hostname = command.hostname ; }
	if ( command.port ) { query.port = command.port ; }
	if ( command.auth ) { query.auth = command.auth ; }

	if ( command.outputFile ) {
		if ( ! path.isAbsolute( command.outputFile ) ) {
			command.outputFile = path.join( this.cwd , command.outputFile ) ;
		}

		streams.output = fs.createWriteStream( command.outputFile ) ;
		streams.output.on( 'error' , error => term.red( "Output stream error: %s\n" , error ) ) ;
	}

	if ( command.inputFile ) {
		if ( ! path.isAbsolute( command.inputFile ) ) {
			command.inputFile = path.join( this.cwd , command.inputFile ) ;
		}

		try {
			stats = await fs.lstatAsync( command.inputFile ) ;
		}
		catch ( error ) {
			if ( error.code === 'ENOENT' ) {
				term.red( "Input file not found.\n" ) ;
			}
			else {
				term.red( "Input file not found or not accessible: %s\n" , error ) ;
			}
			return ;
		}

		if ( ! stats.isFile() ) {
			term.red( "This is not a file.\n" ) ;
			return ;
		}

		streams.input = fs.createReadStream( command.inputFile , {
			start: query.inputOffset || undefined
		} ) ;

		// Add lstat data, can be useful later
		streams.input.lstat = stats ;

		streams.input.on( 'error' , error => term.red( "Input stream error: %s\n" , error ) ) ;
	}

	// Useful?
	if ( command.pathname ) { query.pathname = command.pathname ; }
	if ( command.search ) { query.search = command.search ; }

	//console.log( query ) ;


	if ( query.protocol === 'ws' ) {
		return this.wsChat( command ) ;
	}


	try {
		body = await this.performRequest( query , {
			output: streams.output ,
			input: streams.input ,
			//decompress: this.query.decompress ,
			decompress: true ,
			fakeCrashScenario: this.query.fakeCrashScenario ,
			headerCallback: incomingMessage_ => {
				incomingMessage = incomingMessage_ ;
				this.displayHeader( incomingMessage ) ;
			} ,
			progressCallback: this.displayProgressBar.bind( this , {} )
		} ) ;
	}
	catch ( error ) {
		term.red.bold( error + "\n" ) ;
		// Do not issue error: this is not an internal fatal error, just a request that cannot be processed...
		//term.red.bold( "%E\n" , error ) ;
		return ;
	}

	term( '\n' ) ;

	// Do not auto-clear in case of errors
	if ( this.autoclear.body ) { delete this.query.body ; }
	if ( this.autoclear.auth ) { delete this.query.auth ; }
	if ( this.autoclear.headers ) { this.query.headers = {} ; }

	if ( this.autocookie && incomingMessage.headers && incomingMessage.headers['set-cookie'] ) {
		this.query.headers.cookie = incomingMessage.headers['set-cookie'] ;
	}

	if ( ! streams.output ) {
		this.displayBody( body , incomingMessage ) ;
		this.displayTrailer( incomingMessage ) ;
	}

	term.dim.magenta( '[Received ' + ( body ? utils.byteString( body.length ) + ' ' : '' ) + 'in ' + this.lastResponse.time + 'ms]\n' ) ;

	// Various stuff
	switch ( incomingMessage.status ) {
		case 200 :
		case 201 :
			// Add a new entry to pathCompletion
			pathArray = ( query.hostname + ':' + query.port + query.pathname ).split( '/' ) ;
			if ( pathArray[ pathArray.length - 1 ] === '' ) { pathArray.pop() ; }
			tree.path.define( this.pathCompletion , pathArray , true ) ;
			break ;
		case 404 :
			// Remove the entry from pathCompletion
			pathArray = ( query.hostname + ':' + query.port + query.pathname ).split( '/' ) ;
			if ( pathArray[ pathArray.length - 1 ] === '' ) { pathArray.pop() ; }
			tree.path.delete( this.pathCompletion , pathArray ) ;
			break ;
	}

	// Handle redirections
	if ( incomingMessage.headers && incomingMessage.headers.location ) {
		switch ( incomingMessage.status ) {
			case 301 :
			case 307 :
			case 308 :
				command = { outputFile: command.outputFile , inputFile: command.inputFile } ;
				utils.urlToQuery( incomingMessage.headers.location , command , false , this.trailingslash ) ;

				command.method = query.method ;
				shouldRedirect = true ;
				break ;
			case 302 :
			case 303 :
				command = { outputFile: command.outputFile , inputFile: command.inputFile } ;
				utils.urlToQuery( incomingMessage.headers.location , command , false , this.trailingslash ) ;

				command.method = query.method === 'HEAD' ? 'HEAD' : 'GET' ;
				shouldRedirect = true ;
				break ;
		}

		if ( shouldRedirect ) {
			if ( command.hostname === '' ) { command.hostname = query.hostname ; }

			//console.log( command ) ;

			term.brightGreen( 'Redirect to ' )
				.yellow( '(' + command.method + ') ' )
				.dim.noFormat( incomingMessage.headers.location )
				.brightGreen( ' ? ' )
				.bold( '[Y/n] ' ) ;

			ok = await this.yesOrNo() ;
			term( '\n' ) ;

			if ( ok ) {
				tree.extend( null , this.query , command ) ;
				return shellCommand.request.call( this , command ) ;
			}
		}
	}
} ;



shellCommand.moduleCommand = async function( command ) {
	try {
		await this.module.commands[ command.method ]( command.args ) ;
	}
	catch ( error ) {
		term.red( "Error in module '%s': %E" , this.module.name , error ) ;
	}
} ;



HttpRequester.prototype.wsChat = async function( command ) {
	var ws , inputController , cleanedUp = false , rawMode = false ,
		outputBuffer , history = [] ;

	// First define a lot of functions

	var onKey = ( key , matches , data ) => {
		switch ( key ) {
			case 'CTRL_X' :
				if ( rawMode ) {
					term( '\n' ) ;
					cleanUp() ;
				}
				else {
					term( '\n' ) ;
					cleanUp() ;
				}
				break ;

			case 'CTRL_T' :
				rawMode = ! rawMode ;

				if ( rawMode ) {
					term.blue( '\nWebsocket Raw Mode, ' )
						.blue.bold( 'CTRL-T' ).blue( ' to switch mode, ' )
						.blue.bold( 'CTRL-X' ).blue( ' to terminate:\n' ) ;

					if ( inputController ) {
						inputController.abort() ;
						inputController = undefined ;
					}
				}
				else {
					term.blue( '\nWebsocket Chatter, ' )
						.blue.bold( 'CTRL-T' ).blue( ' to switch mode, ' )
						.blue.bold( 'CTRL-X' ).blue( ' to terminate:\n' ) ;
					readLines() ;
				}
				break ;

			default :
				if ( rawMode ) {
					// Send the raw input buffer, preserving escape sequences
					outputBuffer = Buffer.isBuffer( data.code ) ? data.code : Buffer.from( [ data.code ] ) ;

					ws.send( outputBuffer , { binary: true } ) ;
				}
		}
	} ;

	var readLines = () => {
		term( '> ' ) ;

		inputController = term.inputField( { history: history } , ( error , input ) => {
			term( '\n' ) ;
			if ( error ) { cleanUp() ; return ; }

			history.push( input ) ;

			ws.send( input , ( error_ ) => {
				if ( error_ ) { cleanUp() ; return ; }
				readLines() ;
			} ) ;
		} ) ;
	} ;

	var onMessage = ( message /*, flags */ ) => {
		var inputPosition ;

		if ( cleanedUp ) { return ; }

		if ( rawMode ) {
			term( message ) ;
		}
		else {
			if ( inputController && inputController.ready ) {
				// Get the input field position
				inputPosition = inputController.getPosition() ;
				//console.error( inputPosition ) ;

				// Hide the input field
				inputController.hide() ;

				// Insert the message before the current prompt and input field
				term.moveTo.cyan.bold( 1 , inputPosition.y , '< ' + message ).eraseLineAfter() ;
			}
			else {
				// Insert the message before the current prompt and input field
				term.column.cyan.bold( 1 , '< ' + message ).eraseLineAfter() ;
			}

			// Restore the prompt
			term( '\n> ' ) ;

			// Rebase the input field to the current position
			inputController.rebase() ;
		}
	} ;

	var cleanUp = () => {
		if ( cleanedUp ) { return ; }

		cleanedUp = true ;

		term.removeListener( 'key' , onKey ) ;
		ws.removeListener( 'message' , onMessage ) ;

		if ( inputController ) {
			inputController.hide() ;
			term.column( 1 ) ;
			inputController.abort() ;
			inputController = undefined ;
		}
		else {
			term( '\n' ) ;
		}

		ws.terminate() ;
	} ;


	// Then start the WS chatter flow

	try {
		ws = new WebSocket( 'ws://' + this.query.hostname + ':' + this.query.port + this.query.path , { headers: this.query.headers } ) ;

		// Wait for an opening connection
		await Promise.onceEventOrError( ws , 'open' , [ 'close' , 'end' ] ) ;

		this.displayOpenedConnection() ;

		term.blue( 'Websocket Chatter, ' )
			.blue.bold( 'CTRL-T' ).blue( ' to switch mode, ' )
			.blue.bold( 'CTRL-X' ).blue( ' to terminate:\n' ) ;

		term.on( 'key' , onKey ) ;
		readLines() ;

		ws.on( 'message' , onMessage ) ;

		// Wait for a closing connection
		await Promise.onceEventOrError( ws , 'close' ) ;

		cleanUp() ;

		this.displayClosedConnection() ;
		term( '\n' ) ;
	}
	catch ( error ) {
		term.red( '\n' + error + '\n' ) ;
		cleanUp() ;
	}

	// Give some time to close the connection (avoid a 'closed connection' message after the next prompt)
	return Promise.resolveTimeout( 20 ) ;
} ;



HttpRequester.prototype.shellMultiLineInput = function() {
	return new Promise( ( resolve , reject ) => {
		var lines = '' , inputController , cleanedUp = false ;

		term.blue( 'Multi-line input, press ' ).blue.bold( 'CTRL-X' ).blue( ' to terminate:\n' ) ;

		var cleanUp = () => {
			if ( cleanedUp ) { return ; }
			cleanedUp = true ;

			term.removeListener( 'key' , onKey ) ;

			if ( inputController ) {
				inputController.abort() ;
			}

			term( '\n' ) ;
		} ;

		var onKey = key => {
			if ( key !== 'CTRL_X' ) { return ; }
			lines += inputController.getInput()  ;
			cleanUp() ;
			resolve( lines ) ;
		} ;

		var readLines = () => {
			inputController = term.inputField( ( error , input ) => {
				term( '\n' ) ;

				if ( error ) {
					cleanUp() ;
					reject( error ) ;
					return ;
				}

				lines += input + '\n' ;
				readLines() ;
			} ) ;
		} ;

		term.on( 'key' , onKey ) ;
		readLines() ;
	} ) ;
} ;



HttpRequester.prototype.clientAutoComplete = function( start ) {
	var typedPath ;

	if ( start.startsWith( 'cd ' ) ) {
		typedPath = start.slice( 3 ).trim() ;
		start = 'cd ' + typedPath ;		// rewrite the start
		return this.autoCompletePath( start , typedPath , 'cd ' , true ) ;
	}
	else if ( start.startsWith( 'lcd ' ) ) {
		typedPath = start.slice( 4 ).trim() ;
		start = 'lcd ' + typedPath ;		// rewrite the start
		return this.autoCompleteLocalPath( start , typedPath , 'lcd ' , true ) ;
	}
	else if ( start.startsWith( 'lcat ' ) ) {
		typedPath = start.slice( 5 ).trim() ;
		start = 'lcat ' + typedPath ;		// rewrite the start
		return this.autoCompleteLocalPath( start , typedPath , 'lcat ' ) ;
	}
	else if ( start.startsWith( 'lrm ' ) ) {
		typedPath = start.slice( 4 ).trim() ;
		start = 'lrm ' + typedPath ;		// rewrite the start
		return this.autoCompleteLocalPath( start , typedPath , 'lrm ' ) ;
	}
	else if ( start.startsWith( 'http://' ) ) {
		typedPath = start.slice( 7 ) ;
		return this.autoCompletePath( start , typedPath , 'http://' , false ) ;
	}
	else if ( start.startsWith( 'https://' ) ) {
		typedPath = start.slice( 8 ) ;
		return this.autoCompletePath( start , typedPath , 'https://' , false ) ;
	}
	else if ( start.startsWith( 'ws://' ) ) {
		typedPath = start.slice( 5 ) ;
		return this.autoCompletePath( start , typedPath , 'ws://' , false ) ;
	}

	// Use the default terminal-kit auto-completer with the client array of possibilities
	return termkit.autoComplete( constants.clientAutoCompleteArray , start , true ) ;
} ;



HttpRequester.prototype.autoCompletePath = function( start , typedPath , prefix , isRelative ) {
	var key , pathArray = [] , node , lastTypedPart , typedDir , typedPathArray , typedDirArray , completion = [] ;

	if ( isRelative ) {
		pathArray = ( this.query.hostname + ':' + this.query.port + this.query.pathname ).split( '/' ) ;
		if ( pathArray[ pathArray.length - 1 ] === '' ) { pathArray.pop() ; }
	}

	lastTypedPart = typedPath ;
	typedDir = '' ;
	typedPathArray = typedPath.split( '/' ) ;

	if ( typedPathArray.length > 1 ) {
		lastTypedPart = typedPathArray[ typedPathArray.length - 1 ] ;
		typedDirArray = typedPathArray.slice( 0 , -1 ) ;
		typedDir = typedDirArray.join( '/' ) + '/' ;
		pathArray = pathArray.concat( typedDirArray ) ;

		if ( typedPathArray[ typedPathArray.length - 1 ] === '' ) { typedPathArray.pop() ; }
	}

	prefix += typedDir ;
	node = pathArray.length ? tree.path.get( this.pathCompletion , pathArray ) : this.pathCompletion ;

	//console.log( '\n\nnode:' , node , pathArray ) ;

	if ( ! node || typeof node !== 'object' ) { return start ; }

	for ( key in node ) {
		if ( node[ key ] && typeof node[ key ] === 'object' ) { completion.push( key + '/' ) ; }
		else { completion.push( key ) ; }
	}

	completion = termkit.autoComplete( completion , lastTypedPart , true ) ;
	if ( ! Array.isArray( completion ) ) { return prefix + completion ; }

	completion.sort( naturalSort ) ;
	completion.prefix = prefix ;

	return completion ;
} ;



HttpRequester.prototype.autoCompleteLocalPath = async function( start , typedPath , prefix , onlyDir ) {
	var completion , files , parentDirPath , typedImplicitFullPath , typedDir , typedFile ;

	//if ( typedPath === '.' || typedPath === '..' ) { typedPath += '/' ; }

	typedImplicitFullPath = path.isAbsolute( typedPath ) ? typedPath : this.cwd + path.sep + typedPath ;

	if ( ! typedPath || typedPath[ typedPath.length - 1 ] === '/' ) {
		parentDirPath = typedImplicitFullPath ;
		typedDir = typedPath ;
		typedFile = '' ;
	}
	else {
		parentDirPath = path.dirname( typedImplicitFullPath ) ;
		typedFile = path.basename( typedPath ) ;

		switch ( typedPath ) {
			case '.' :
				typedDir = '' ;
				break ;
			case '..' :
				typedDir = '' ;
				break ;
			default :
				typedDir = path.dirname( typedPath ) + '/' ;
		}
	}

	//term.green( "\n'%s' '%s' '%s' '%s'\n" , typedImplicitFullPath , typedDir , typedFile , parentDirPath ) ;
	try {
		files = await fsKit.readdirAsync( parentDirPath , { slash: true , directories: true , files: ! onlyDir } ) ;
		if ( files.length ) { files.push( '../' ) ; }
	}
	catch ( error ) {
		return prefix + typedPath ;
	}

	//console.log( files ) ;
	if ( ! Array.isArray( files ) || ! files.length ) { return prefix + typedPath ; }

	completion = termkit.autoComplete( files , typedFile , true ) ;

	// force inputField() to prefix that *AFTER* singleLineMenu()
	if ( Array.isArray( completion ) ) { completion.prefix = prefix + typedDir ; }
	else { completion = prefix + typedDir + completion ; }

	return completion ;
} ;



HttpRequester.prototype.yesOrNo = function() {
	return term.yesOrNo( {
		yes: [ 'y' , 'ENTER' ] ,
		no: [ 'n' ] ,
		echoYes: 'yes' ,
		echoNo: 'no'
	} ).promise ;
} ;



// Third party modules
HttpRequester.prototype.initModule = function() {
	if ( typeof this.module === 'string' ) {
		if ( path.isAbsolute( this.module ) ) {
			this.module = require( this.module ) ;
		}
		else {
			this.module = require( path.join( process.cwd() , this.module ) ) ;
		}
	}

	var api = {
		term: term ,
		lastResponse: () => this.lastResponse ,
		emulate: async ( command ) => {
			if ( typeof command === 'string' ) {
				await this.replNext( command ) ;
			}
			else if ( Array.isArray( command ) ) {
				await Promise.forEach( command , command_ => this.replNext( command_ ) ) ;
			}
		}
	} ;

	if ( typeof this.module.init === 'function' ) { this.module.init( api ) ; }

	if ( ! this.module.commands || typeof this.module.commands !== 'object' ) { this.module.commands = {} ; }

	for ( let k in this.module.commands ) { constants.clientAutoCompleteArray.push( k + ' ' ) ; }

	this.module.name = this.module.name || this.configName || '(unknown)' ;
	term( "^yModule ^+^_^Y%s^ ^yloaded.^:\n\n" , this.module.name ) ;
} ;



HttpRequester.prototype.parseModuleCommandArguments = function( strArgs ) {
	var matches , args = [] ;
	var regex = /\s*(?:"((?:\\"|[^"])*)"|(\S+))\s*/g ;

	while ( ( matches = regex.exec( strArgs ) ) !== null ) {
		if ( matches[ 1 ] ) {
			args.push( matches[ 1 ].replace( /\\"/g , '"' ) ) ;
		}
		else if ( matches[ 2 ] ) {
			args.push( matches[ 2 ] ) ;
		}
	}

	return args ;
} ;

