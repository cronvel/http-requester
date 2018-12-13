/*
	HTTP Requester

	Copyright (c) 2015 - 2018 Cédric Ronvel

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
//var http = require( 'http' ) ;
//var https = require( 'https' ) ;
var WebSocket = require( 'ws' ) ;
var path = require( 'path' ) ;
var fs = require( 'fs' ) ;

var naturalSort = require( './naturalSort.js' ) ;

var termkit = require( 'terminal-kit' ) ;
var term = termkit.terminal ;

var async = require( 'async-kit' ) ;
var tree = require( 'tree-kit' ) ;



// Create the object and export it
var shell = {} ;
module.exports = shell ;



var homeDir = require( 'osenv' ).home() ;
var commandHistoryPath = homeDir + '/.http-requester/commandHistory.json' ;
var commandHistory = [] ;
var pathCompletionPath = homeDir + '/.http-requester/pathCompletion.json' ;
var pathCompletion = {} ;





shell.shell = function shell_( query ) {
	if ( ! query.shellConfig || typeof query.shellConfig !== 'object' ) { query.shellConfig = {} ; }

	query.shellConfig = tree.extend(
		{ deep: true } ,
		{
			autoclear: { headers: false , auth: false , body: true } ,
			trailingslash: true ,
			autocookie: false ,
			decompress: true
		} ,
		query.shellConfig
	) ;

	try {
		commandHistory = require( commandHistoryPath ) ;
	}
	catch ( error ) {
		commandHistory = [] ;
	}

	try {
		pathCompletion = require( pathCompletionPath ) ;
		//console.log( "load:" , pathCompletion ) ;
	}
	catch ( error ) {
		pathCompletion = {} ;
	}

	this.displayIntro() ;
	term.blue( 'Type ' ).blue.bold( 'help' ).blue( ' for command description, press ' )
	.blue.bold( 'TAB' ).blue( ' to auto-complete, press ' )
	.blue.bold( 'CTRL-C' ).blue( ' to quit.\n' ) ;
	term( '\n' ) ;

	term.grabInput() ;

	term.on( 'key' , this.onKey.bind( this ) ) ;

	if ( query.shellConfig.module ) { this.initModule( query ) ; }

	this.repl( query ) ;
} ;



shell.onKey = function onKey( key ) {
	switch ( key ) {
		case 'CTRL_C' :
			term.green( 'CTRL-C received...\n' ) ;
			this.terminate() ;
			break ;
	}
} ;



shell.terminate = function terminate() {
	// Save command history
	try {
		commandHistory = commandHistory.slice( -100 ) ;	// Only save the last 100 lines
		fs.writeFileSync( commandHistoryPath , JSON.stringify( commandHistory ) ) ;
	}
	catch ( error ) {}	// We don't care if it fails!

	// Save path completion
	try {
		//console.log( "save: " , pathCompletionPath , JSON.stringify( pathCompletion ) ) ;
		fs.writeFileSync( pathCompletionPath , JSON.stringify( pathCompletion ) ) ;
	}
	catch ( error ) {}	// We don't care if it fails!

	term.processExit() ;
} ;



// emulate is for module: it emulates user input
shell.repl = function repl( query , emulateCommand , emulateCallback ) {
	var rawCommand , command ;

	if ( ! query || typeof query !== 'object' ) { query = {} ; }

	if ( typeof emulateCommand !== 'string' ) { emulateCallback = null ; }
	else if ( typeof emulateCallback !== 'function' ) { emulateCommand = null ; }

	async.series( [
		seriesCallback => {
			this.prompt( query ) ;

			if ( emulateCommand ) {
				rawCommand = emulateCommand ;
				term( emulateCommand ) ;
				term( '\n' ) ;
				seriesCallback() ;
				return ;
			}

			term.inputField( {
				history: commandHistory ,
				autoComplete: this.clientAutoComplete.bind( this , query ) ,
				autoCompleteMenu: {
					selectedStyle: term.dim.blue.bgGreen
				}
			} , ( error , input ) => {

				term( '\n' ) ;

				if ( error ) { seriesCallback( error ) ; return ; }

				// Only add a line to the history if it's not blank
				if ( input.match( /\S/ ) ) { commandHistory.push( input ) ; }

				//console.log( "Input:" , input ) ;
				rawCommand = input ;
				seriesCallback() ;
			} ) ;
		} ,
		seriesCallback => {
			command = this.parseShellCommand( rawCommand ) ;
			//console.log( "command:" , command ) ;
			this.runShellCommand[ command.type ].call( this , command , query , seriesCallback ) ;
		}
	] )
	.nice( 0 )
	.exec( ( error ) => {
		if ( error ) {
			term.red.bold( "\nAn unexpected error occurs: " + error + "\n" ) ;
			this.terminate() ;
			return ;
		}

		if ( emulateCallback ) {
			emulateCallback() ;
			return ;
		}

		this.repl( query ) ;
	} ) ;
} ;



shell.prompt = function prompt( query ) {
	term.dim( '%s://%s%s' , query.protocol , query.hostname ,
		( query.port === 80 && query.protocol === 'http' ) || ( query.port === 443 && query.protocol === 'https' ) ?
			'' : ':' + query.port
	) ;

	term.bold( query.pathname ) ;

	if ( query.search ) {
		// use %s, to avoid having to escape %
		term.bold.brightRed( "%s" , query.search[ 0 ] ).brightRed( "%s" , query.search.slice( 1 ) ) ;
	}

	term.dim( '> ' ) ;
} ;



shell.shellSet = {
	//url: true ,
	protocol: true ,
	port: true ,
	method: true ,
	//path: true ,	// use 'cd' instead
	headers: true ,
	auth: true ,
	body: true ,
	timeout: true
} ;



shell.parseShellCommand = function parseShellCommand( rawCommand ) {
	var matches , tmp , command = { type: 'noop' } ;

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
		}
		else if ( this.methods[ matches[ 1 ].toUpperCase() ] ) {
			// This is a request <method> <path>
			command.type = 'request' ;
			command.method = matches[ 1 ].toUpperCase() ;
			command.path = matches[ 5 ] ;
			if ( command.path && command.path.match( /:\/\// ) ) { this.url2query( command.path , command ) ; }
		}
		else if ( matches[ 1 ] === 's' || matches[ 1 ] === 'show' ) {
			command.type = 'inspect' ;
		}
		else if ( matches[ 1 ] === 'ls' ) {
			command.type = 'ls' ;
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
		else if ( matches[ 1 ] === 'autocookie' ) {
			command.type = 'autocookie' ;
		}
		else if ( matches[ 1 ] === 'cd' ) {
			command.type = 'cd' ;
			command.path = matches[ 5 ] ;
		}
		else if ( this.shellSet[ matches[ 1 ] ] ) {
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



shell.runShellCommand = {} ;



shell.runShellCommand.noop = function runShellCommandNoop( command , query , callback ) {
	callback() ;
} ;



shell.runShellCommand.syntaxError = function runShellCommandSyntaxError( command , query , callback ) {
	term.brightRed.bold( 'Syntax error' ).red( ' - %s\n' , command.message ) ;
	callback() ;
} ;



shell.runShellCommand.help = function runShellCommandHelp( command , query , callback ) {
	var column = 40 ;

	term( '\n' ) ;

	term.cyan( 'show' ).dim( ' or ' ).cyan( 's' ).column( column ).dim( 'List the details of the request about to be performed.\n' ) ;
	term.cyan( 'request' ).dim( ' or ' ).cyan( 'req' ).column( column ).dim( 'Perform the request.\n' ) ;
	term.yellow( '<protocol>' ).cyan( '://' ).yellow( '<host>[:<port>][/<path>]' ).column( column ).dim( "Parse the full URL and set the protocol, host, port and path.\n" ) ;
	term.cyan( 'host ' ).yellow( '<hostname>[:<port>]' ).column( column ).dim( 'Set the host and port to connect to.\n' ) ;
	term.cyan( 'port ' ).yellow( '<port>' ).column( column ).dim( 'Set the port to connect to.\n' ) ;
	term.cyan( 'protocol ' ).yellow( 'http|https|ws' ).column( column ).dim( 'Set the protocol to use.\n' ) ;
	term.cyan( 'method ' ).yellow( '<HTTP method>' ).column( column ).dim( 'Set the HTTP method.\n' ) ;
	term.cyan( 'cd ' ).yellow( '<path>' ).column( column ).dim( "Modify the path like UNIX 'cd' does, start w/ '/' for absolute path, w/o for relative path.\n" ) ;
	term.cyan( '?' ).yellow( '<query string>' ).column( column ).dim( "Set the query string part of the URL. Use a single '?' to erase it.\n" ) ;
	term.cyan( 'headers.' ).yellow( '<header> <value>' ).column( column ).dim( "Set a HTTP header.\n" ) ;
	term.yellow( '<header>' ).cyan( ': ' ).yellow( '<value>' ).column( column ).dim( "The shortest way to set a HTTP header.\n" ) ;
	term.cyan( 'auth ' ).yellow( '<user>' ).cyan( ':' ).yellow( '<password>' ).column( column ).dim( "Basic authentication to compute an Authorization header.\n" ) ;
	term.cyan( 'body ' ).yellow( '<body string>' ).column( column ).dim( 'Set the body of the request.\n' ) ;
	term.cyan( 'body' ).column( column ).dim( 'Set the body of the request, using the multi-line mode.\n' ) ;
	term.cyan( 'timeout ' ).yellow( '<ms>' ).column( column ).dim( 'Set the request timeout in ms.\n' ) ;
	term.cyan( 'clear ' ).yellow( '[headers|auth|body]' ).column( column ).dim( 'Clear headers, auth or body, without argument: clear both.\n' ) ;
	term.cyan( 'autoclear ' ).yellow( '[headers|auth|body]' ).column( column ).dim( 'Switch autoclear mode for headers/auth/body after each request, w/o arg: display.\n' ) ;
	term.cyan( 'trailingslash ' ).column( column ).dim( 'Automatically add/remove trailing slashes.\n' ) ;
	term.cyan( 'autocookie' ).column( column ).dim( 'Turn autocookie on/off.\n' ) ;
	term.cyan( 'beautify' ).column( column ).dim( 'Turn beautify on/off for JSON body.\n' ) ;
	term.cyan( 'decompress' ).column( column ).dim( 'Turn body decompression on/off.\n' ) ;
	term.cyan( 'ls' ).column( column ).dim( "List all known sub-resources of the current path, like UNIX 'ls' does.\n" ) ;

	term.magenta( '\nUse the ' ).magenta.bold( "TAB" ).magenta( ' key to auto-complete ' )
	.magenta.bold( 'like a boss' ).magenta( '! Even headers are supported!\n\n' ) ;

	// http methods

	callback() ;
} ;



shell.runShellCommand.changeHost = function runShellCommandChangeHost( command , query , callback ) {
	query.hostname = command.hostname ;
	if ( command.port ) { query.port = command.port ; }
	callback() ;
} ;



shell.runShellCommand.changeUrl = function runShellCommandChangeUrl( command , query , callback ) {
	this.url2query( command.url , query ) ;
	callback() ;
} ;



shell.runShellCommand.set = function runShellCommandSet( command , query , callback ) {
	var upperCased ;

	switch ( command.field ) {
		case 'method' :
			upperCased = command.value.toUpperCase() ;

			if ( this.methods[ upperCased ] ) {
				query.method = upperCased ;
			}
			else {
				term.red( "'" )
				.italic.bold.red( command.value )
				.red( "' is not a valid HTTP method and is unlikely to succeed. " )
				.brightGreen( "Proceed anyway? " )
				.bold( "[Y/n] " ) ;

				shellYesOrNo( ( error , ok ) => {

					if ( error ) { callback( error ) ; return ; }
					term( '\n' ) ;
					if ( ok ) { query.method = command.value ; }
					callback() ;
				} ) ;

				return ;
			}
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

		case 'headers' :
			// shell.runShellCommand.setHeader() should be used
			// If we are here, a blank 'headers' command have been issued
			term.red( "'headers' should be followed by dot '.' and the name of the header to set\n" ) ;
			break ;

		default :
			query[ command.field ] = command.value ;
	}

	callback() ;
} ;



shell.runShellCommand.setHeader = function runShellCommandSetHeader( command , query , callback ) {
	if ( ! command.value ) {
		// If the value is empty, then we delete that header
		delete query.headers[ this.normalizeHeader( command.header ) ] ;
	}
	else {
		query.headers[ this.normalizeHeader( command.header ) ] = command.value ;
	}

	callback() ;
} ;



shell.runShellCommand.inspect = function runShellCommandInspect( command , query , callback ) {
	this.displayHeader( query , query ) ;
	this.displayBody( query , query.body ) ;
	this.displayTrailer( query , query ) ;
	callback() ;
} ;



shell.runShellCommand.cd = function runShellCommandCd( command , query , callback ) {
	query.pathname = path.resolve( query.pathname || '/' , command.path || '/' ) ;

	if ( query.shellConfig.trailingslash === true && query.pathname[ query.pathname.length - 1 ] !== '/' ) {
		query.pathname += '/' ;
	}
	else if ( query.shellConfig.trailingslash === false && query.pathname[ query.pathname.length - 1 ] === '/' ) {
		query.pathname = query.pathname.slice( 0 , -1 ) ;
	}

	query.path = query.pathname ;

	if ( query.search ) { query.path += query.search ; }

	callback() ;
} ;



shell.runShellCommand.changeQueryString = function runShellCommandChangeQueryString( command , query , callback ) {
	if ( command.search.length > 1 ) {
		// This try to encode only unreserved chars, and should be compatible with RestQuery query string
		query.search = '?' + command.search.replace( /[^&=,[\]]+/g , match => encodeURIComponent( match ) ) ;
		query.path = query.pathname + query.search ;
	}
	else {
		query.search = null ;
		query.path = query.pathname ;
	}

	callback() ;
} ;



shell.runShellCommand.ls = function runShellLs( command , query , callback ) {
	var i , j , pathArray , pathNode , keys , key , width = 0 , columns ;

	pathArray = ( query.hostname + ':' + query.port + query.pathname ).split( '/' ) ;
	if ( pathArray[ pathArray.length - 1 ] === '' ) { pathArray.pop() ; }
	pathNode = tree.path.get( pathCompletion , pathArray ) ;

	if ( ! pathNode || typeof pathNode !== 'object' ) { callback() ; return ; }

	keys = Object.keys( pathNode ) ;

	if ( ! keys.length ) { callback() ; return ; }

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

	callback() ;
} ;



shell.runShellCommand.clear = function runShellCommandClear( command , query , callback ) {
	switch ( command.clear ) {
		case 'headers' :
			query.headers = {} ;
			term.blue( 'Headers ' ).blue.bold( 'cleared.\n' ) ;
			break ;
		case 'body' :
			delete query.body ;
			term.blue( 'Body ' ).blue.bold( 'cleared.\n' ) ;
			break ;
		case 'auth' :
			delete query.auth ;
			term.blue( 'Auth ' ).blue.bold( 'cleared.\n' ) ;
			break ;
		case '' :
		case undefined :
			query.headers = {} ;
			delete query.body ;
			delete query.auth ;
			term.blue( 'Headers, auth and body ' ).blue.bold( 'cleared.\n' ) ;
			break ;
	}

	callback() ;
} ;



shell.runShellCommand.autoclear = function runShellCommandAutoclear( command , query , callback ) {
	switch ( command.clear ) {
		case 'headers' :
			query.shellConfig.autoclear.headers = ! query.shellConfig.autoclear.headers ;
			break ;
		case 'body' :
			query.shellConfig.autoclear.body = ! query.shellConfig.autoclear.body ;
			break ;
		case 'auth' :
			query.shellConfig.autoclear.auth = ! query.shellConfig.autoclear.auth ;
			break ;
	}

	term.blue( 'Autoclear status:   headers ' ).blue.bold( query.shellConfig.autoclear.headers ? 'on' : 'off' )
	.blue( '   auth ' ).blue.bold( query.shellConfig.autoclear.auth ? 'on' : 'off' )
	.blue( '   body ' ).blue.bold( query.shellConfig.autoclear.body ? 'on' : 'off' )( '\n' ) ;

	callback() ;
} ;



shell.runShellCommand.trailingslash = function runShellCommandTrailingslash( command , query , callback ) {
	term.blue( 'Trailing-slash status: ' ) ;

	if ( query.shellConfig.trailingslash === true ) {
		query.shellConfig.trailingslash = false ;
		term.blue.bold( 'remove' ) ;
	}
	else if ( query.shellConfig.trailingslash === false ) {
		query.shellConfig.trailingslash = null ;
		term.blue.bold( 'do nothing' ) ;
	}
	else {
		query.shellConfig.trailingslash = true ;
		term.blue.bold( 'add' ) ;
	}

	term( '\n' ) ;
	callback() ;
} ;



shell.runShellCommand.beautify = function runShellCommandBeautify( command , query , callback ) {
	query.beautify = ! query.beautify ;
	term.blue( 'Beautify status: ' ).blue.bold( query.beautify ? 'on' : 'off' )( '\n' ) ;
	callback() ;
} ;



shell.runShellCommand.decompress = function runShellCommandDecompress( command , query , callback ) {
	query.decompress = ! query.decompress ;
	term.blue( 'Decompress status: ' ).blue.bold( query.decompress ? 'on' : 'off' )( '\n' ) ;
	callback() ;
} ;



shell.runShellCommand.autocookie = function runShellCommandAutocookie( command , query , callback ) {
	query.shellConfig.autocookie = ! query.shellConfig.autocookie ;
	term.blue( 'Autocookie status: ' ).blue.bold( query.shellConfig.autocookie ? 'on' : 'off' )( '\n' ) ;
	callback() ;
} ;



shell.runShellCommand.multiLineBody = function runShellCommandMultiLineBody( command , query , callback ) {
	this.shellMultiLineInput( ( error , input ) => {
		if ( error ) { callback( error ) ; return ; }
		query.body = input ;
		callback() ;
	} ) ;
} ;



shell.runShellCommand.request = function runShellCommandRequest( command , query_ , callback ) {
	var query , streams = {} , incomingMessage , shouldRedirect = false , pathArray ;

	query = tree.extend( { deep: true } , {} , query_ ) ;

	if ( command.method ) { query.method = command.method ; }
	if ( command.path ) { query.path = command.path ; }
	if ( command.protocol ) { query.protocol = command.protocol ; }
	if ( command.host ) { query.host = command.host ; }
	if ( command.hostname ) { query.hostname = command.hostname ; }
	if ( command.port ) { query.port = command.port ; }
	if ( command.auth ) { query.auth = command.auth ; }

	// Useful?
	if ( command.pathname ) { query.pathname = command.pathname ; }
	if ( command.search ) { query.search = command.search ; }

	//console.log( query ) ;


	if ( query.protocol === 'ws' ) {
		this.wsChat( command , query_ , callback ) ;
		return ;
	}

	this.performRequest(
		query , {
			output: streams.output ,
			//decompress: query.decompress ,
			decompress: true ,
			headerCallback: incomingMessage_ => {
				incomingMessage = incomingMessage_ ;
				this.displayHeader( query , incomingMessage ) ;
			} ,
			progressCallback: this.displayProgressBar.bind( this , {} )
		} , ( error , body , time ) => {

			term( '\n' ) ;

			if ( error ) {
				term.red.bold( error + "\n" ) ;
				// Do not issue error: this is not an internal fatal error, just a request that cannot be processed...
				callback() ;
				return ;
			}

			// Do not auto-clear in case of errors
			if ( query_.shellConfig.autoclear.body ) { delete query_.body ; }
			if ( query_.shellConfig.autoclear.auth ) { delete query_.auth ; }
			if ( query_.shellConfig.autoclear.headers ) { query_.headers = {} ; }

			if ( query_.shellConfig.autocookie && incomingMessage.headers && incomingMessage.headers['set-cookie'] ) {
				query_.headers.cookie = incomingMessage.headers['set-cookie'] ;
			}

			if ( ! streams.output ) {
				this.displayBody( query , body , incomingMessage ) ;
				this.displayTrailer( query , incomingMessage ) ;
			}

			term.dim.magenta( '[Received ' + ( body ? this.byteString( body.length ) + ' ' : '' ) + 'in ' + time + 'ms]\n' ) ;

			// Various stuff
			switch ( incomingMessage.status ) {
				case 200 :
				case 201 :
					// Add a new entry to pathCompletion
					pathArray = ( query.hostname + ':' + query.port + query.pathname ).split( '/' ) ;
					if ( pathArray[ pathArray.length - 1 ] === '' ) { pathArray.pop() ; }
					tree.path.define( pathCompletion , pathArray , true ) ;
					break ;
				case 404 :
					// Remove the entry from pathCompletion
					pathArray = ( query.hostname + ':' + query.port + query.pathname ).split( '/' ) ;
					if ( pathArray[ pathArray.length - 1 ] === '' ) { pathArray.pop() ; }
					tree.path.delete( pathCompletion , pathArray ) ;
					break ;
			}

			// Handle redirections
			if ( incomingMessage.headers && incomingMessage.headers.location ) {
				switch ( incomingMessage.status ) {
					case 301 :
					case 307 :
					case 308 :
						command = { shellConfig: query.shellConfig } ;
						this.url2query( incomingMessage.headers.location , command ) ;
						command.method = query.method ;
						shouldRedirect = true ;
						break ;
					case 302 :
					case 303 :
						command = { shellConfig: query.shellConfig } ;
						this.url2query( incomingMessage.headers.location , command ) ;
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

					shellYesOrNo( ( error_ , ok ) => {

						if ( error_ ) { callback( error_ ) ; return ; }

						term( '\n' ) ;

						if ( ok ) {
							tree.extend( null , query_ , command ) ;
							shell.runShellCommand.request.call( this , command , query_ , callback ) ;
						}
						else {
							callback() ;
						}
					} ) ;

					return ;
				}
			}

			callback() ;
		}
	) ;
} ;



shell.runShellCommand.moduleCommand = function runShellCommandModuleCommand( command , query , callback ) {
	this.module.commands[ command.method ]( command.args , query , callback ) ;
} ;



shell.wsChat = function wsChat( command , query , callback ) {
	var ws , inputController , onKey , terminated = false , rawMode = false ,
		outputBuffer , history = [] ;

	// TODO: fix callback hell?

	ws = new WebSocket( 'ws://' + query.hostname + ':' + query.port + query.path , { headers: query.headers } ) ;

	var terminate = error => {

		if ( terminated ) { return ; }

		terminated = true ;

		if ( onKey ) { term.removeListener( 'key' , onKey ) ; }

		if ( inputController ) {
			inputController.abort() ;
			inputController = undefined ;
		}

		ws.terminate() ;

		// Give some time to close the connection (avoid a 'closed connection' message after the next prompt)
		setTimeout( () => { callback( error ) ; } , 20 ) ;
	} ;

	ws.on( 'open' , () => {

		this.displayOpenedConnection( query ) ;

		term.blue( 'Websocket Chatter, ' )
		.blue.bold( 'CTRL-T' ).blue( ' to switch mode, ' )
		.blue.bold( 'CTRL-X' ).blue( ' to terminate:\n' ) ;

		onKey = ( key , matches , data ) => {

			switch ( key ) {
				case 'CTRL_X' :
					if ( rawMode ) {
						term( '\n' ) ;
						terminate() ;
					}
					else {
						term( '\n' ) ;
						terminate() ;
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
				if ( error ) { terminate( error ) ; return ; }

				history.push( input ) ;

				ws.send( input , ( error_ ) => {
					if ( error_ ) { terminate( error_ ) ; return ; }
					readLines() ;
				} ) ;
			} ) ;
		} ;

		term.on( 'key' , onKey ) ;
		readLines() ;
	} ) ;

	ws.on( 'message' , ( message /*, flags */ ) => {

		var inputPosition ;

		if ( terminated ) { return ; }

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
	} ) ;

	ws.on( 'close' , () => {

		if ( inputController ) { inputController.hide() ; term.column( 1 ) ; }
		else { term( '\n' ) ; }

		this.displayClosedConnection( query ) ;

		term( '\n' ) ;

		terminate() ;
	} ) ;

	ws.on( 'error' , ( error ) => {

		if ( inputController ) { inputController.hide() ; term.column( 1 ) ; }

		term.red( '\n' + error + '\n' ) ;

		terminate() ;
	} ) ;
} ;



shell.shellMultiLineInput = function shellMultiLineInput( callback ) {
	var lines = '' , inputController ;

	term.blue( 'Multi-line input, press ' ).blue.bold( 'CTRL-X' ).blue( ' to terminate:\n' ) ;

	var onKey = key => {
		if ( key !== 'CTRL_X' ) { return ; }
		term.removeListener( 'key' , onKey ) ;
		lines += inputController.getInput()  ;
		inputController.abort() ;
		term( '\n' ) ;
		callback( undefined , lines ) ;
	} ;

	var readLines = () => {

		inputController = term.inputField( ( error , input ) => {
			term( '\n' ) ;
			if ( error ) { callback( error ) ; return ; }
			lines += input + '\n' ;
			readLines() ;
		} ) ;
	} ;

	term.on( 'key' , onKey ) ;
	readLines() ;
} ;



shell.clientAutoComplete = function clientAutoComplete( query , start ) {
	var typedPath ;

	if ( start.length >= 3 && start.slice( 0 , 3 ) === 'cd ' ) {
		typedPath = start.slice( 3 ).trim() ;
		start = 'cd ' + typedPath ;		// rewrite the start
		return autoCompletePath( query , start , typedPath , 'cd ' , true ) ;
	}
	else if ( start.length >= 7 && start.slice( 0 , 7 ) === 'http://' ) {
		typedPath = start.slice( 7 ) ;
		return autoCompletePath( query , start , typedPath , 'http://' , false ) ;
	}
	else if ( start.length >= 8 && start.slice( 0 , 8 ) === 'https://' ) {
		typedPath = start.slice( 8 ) ;
		return autoCompletePath( query , start , typedPath , 'https://' , false ) ;
	}
	else if ( start.length >= 5 && start.slice( 0 , 5 ) === 'ws://' ) {
		typedPath = start.slice( 5 ) ;
		return autoCompletePath( query , start , typedPath , 'ws://' , false ) ;
	}

	// Use the default terminal-kit auto-completer with the client array of possibilities
	return termkit.autoComplete( this.clientAutoCompleteArray , start , true ) ;

} ;



function autoCompletePath( query , start , typedPath , prefix , isRelative ) {
	var key , pathArray = [] , node , lastTypedPart , typedDir , typedPathArray , typedDirArray , completion = [] ;

	if ( isRelative ) {
		pathArray = ( query.hostname + ':' + query.port + query.pathname ).split( '/' ) ;
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
	node = pathArray.length ? tree.path.get( pathCompletion , pathArray ) : pathCompletion ;

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
}



var shellYesOrNo = term.yesOrNo.bind( term , {
	yes: [ 'y' , 'ENTER' ] ,
	no: [ 'n' ] ,
	echoYes: 'yes' ,
	echoNo: 'no'
} ) ;



// Third party modules
shell.initModule = function initModule( query ) {
	var k ,
		module_ = query.shellConfig.module ;

	var api = {
		term: term ,
		lastResponse: () => this.lastResponse ,
		emulate: ( command , callback ) => {
			if ( typeof command === 'string' ) {
				this.repl( query , command , callback ) ;
			}
			else if ( Array.isArray( command ) ) {
				async.foreach( command , ( command_ , foreachCallback ) => {
					this.repl( query , command_ , foreachCallback ) ;
				} )
				.exec( callback ) ;
			}
		}
	} ;

	if ( typeof module_.init === 'function' ) { module_.init( api ) ; }

	if ( ! module_.commands || typeof module_.commands !== 'object' ) { module_.commands = {} ; }

	for ( k in module_.commands ) { this.clientAutoCompleteArray.push( k + ' ' ) ; }

	term( "^yModule ^+^_^Y%s^ ^yloaded.^:\n\n" , module_.name || query.shellConfig.configName || '(unknown)' ) ;

	this.module = module_ ;
} ;



shell.parseModuleCommandArguments = function parseModuleCommandArguments( strArgs ) {
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



