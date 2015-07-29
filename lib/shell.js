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



// Load modules
//var http = require( 'http' ) ;
//var https = require( 'https' ) ;
var WebSocket = require( 'ws' ) ;
var path = require( 'path' ) ;

var term = require( 'terminal-kit' ).terminal ;
var async = require( 'async-kit' ) ;
var tree = require( 'tree-kit' ) ;



// Create the object and export it
var httpRequester = {} ;
module.exports = httpRequester ;





httpRequester.shell = function shell( query )
{
	if ( ! query.shell || typeof query.shell !== 'object' ) { query.shell = {} ; }
	if ( ! query.shell.autoclear ) { query.shell.autoclear = { headers: false , auth: false , body: true } ; }
	
	this.displayIntro() ;
	term.blue( 'Type ' ).blue.bold( 'help' ).blue( ' for command description, press ' )
		.blue.bold( 'TAB' ).blue( ' to auto-complete, press ' )
		.blue.bold( 'CTRL-C' ).blue( ' to quit.\n' ) ;
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
	term.processExit() ;
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
			
			term.inputField( {
					history: history ,
					autoComplete: self.clientAutoComplete ,
					autoCompleteMenu: {
						selectedStyle: term.dim.blue.bgGreen
					}
				} , function( error , input ) {
				
				term( '\n' ) ;
				
				if ( error ) { seriesCallback( error ) ; return ; }
				
				// Only add a line to the history if it's not blank
				if ( input.match( /\S/ ) ) { history.push( input ) ; }
				
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
		command.type = 'help' ;
	}
	else if ( rawCommand.match( /^\s*body\s*$/ ) )
	{
		// Body without argument start the multiline body input mode
		command.type = 'multiLineBody' ;
	}
	else if ( matches = rawCommand.match( /^\s*(\S*:\/\/.*)\s*$/ ) )	// jshint ignore:line
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
			if ( command.path && command.path.match( /:\/\// ) ) { this.url2query( command.path , command ) ; }
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
		else if ( matches[ 1 ] === 'beautify' )
		{
			command.type = 'beautify' ;
		}
		else if ( matches[ 1 ] === 'autocookie' )
		{
			command.type = 'autocookie' ;
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
	else if ( matches = rawCommand.match( /^\s*([a-zA-Z0-9-]+):\s+(.*)\s*$/ ) )	// jshint ignore:line
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
	term.cyan( 'clear ' ).yellow( '[headers|auth|body]' ).column( column ).dim( 'Clear headers, auth or body, without argument: clear both.\n' ) ;
	term.cyan( 'autoclear ' ).yellow( '[headers|auth|body]' ).column( column ).dim( 'Switch autoclear mode for headers/auth/body after each request, w/o arg: display.\n' ) ;
	term.cyan( 'autocookie' ).column( column ).dim( 'Turn autocookie on/off.\n' ) ;
	term.cyan( 'beautify' ).column( column ).dim( 'Turn beautify on/off for JSON body.\n' ) ;
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
	var upperCased ;
	
	switch ( command.field )
	{
		case 'method' :
			upperCased = command.value.toUpperCase() ;
			
			if ( this.methods[ upperCased ] )
			{
				query.method = upperCased ;
			}
			else
			{
				term.red( "'" )
					.italic.bold.red( command.value )
					.red( "' is not a valid HTTP method and is unlikely to succeed. " )
					.brightGreen( "Proceed anyway? " )
					.bold( "[Y/n] " ) ;
				
				shellYesOrNo( function( error , ok ) {
					
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
	query.path = path.resolve( query.path , command.path || '/' ) ;
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
		case 'auth' :
			query.shell.autoclear.auth = ! query.shell.autoclear.auth ;
			break ;
	}
	
	term.blue( 'Autoclear status:   headers ' ).blue.bold( query.shell.autoclear.headers ? 'on' : 'off' )
		.blue( '   auth ' ).blue.bold( query.shell.autoclear.auth ? 'on' : 'off' )
		.blue( '   body ' ).blue.bold( query.shell.autoclear.body ? 'on' : 'off' )( '\n' ) ;
	
	callback() ;
} ;



httpRequester.runShellCommand.beautify = function runShellCommandBeautify( command , query , callback )
{
	query.beautify = ! query.beautify ;
	term.blue( 'Beautify status: ' ).blue.bold( query.beautify ? 'on' : 'off' )( '\n' ) ;
	callback() ;
} ;



httpRequester.runShellCommand.autocookie = function runShellCommandAutocookie( command , query , callback )
{
	query.shell.autocookie = ! query.shell.autocookie ;
	term.blue( 'Autocookie status: ' ).blue.bold( query.shell.autocookie ? 'on' : 'off' )( '\n' ) ;
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
	var self = this , query , streams = {} , incomingMessage , shouldRedirect = false ;
	
	query = tree.extend( { deep: true } , {} , query_ ) ;
	
	if ( command.method ) { query.method = command.method ; }
	if ( command.path ) { query.path = command.path ; }
	if ( command.protocol ) { query.protocol = command.protocol ; }
	if ( command.host ) { query.host = command.host ; }
	if ( command.hostname ) { query.hostname = command.hostname ; }
	if ( command.port ) { query.port = command.port ; }
	if ( command.auth ) { query.auth = command.auth ; }
		
	//console.log( query ) ;
	
	if ( query.protocol === 'ws' )
	{
		this.wsChat( command , query_ , callback ) ;
		return ;
	}
	
	this.performRequest(
		query , {
			output: streams.output ,
			headerCallback: function( incomingMessage_ ) {
				incomingMessage = incomingMessage_ ;
				self.displayHeader( query , incomingMessage )
			} ,
			progressCallback: self.displayProgressBar.bind( self , {} )
		} , function( error , body , time ) {
			
			term( '\n' ) ;
			
			if ( error )
			{
				term.red.bold( error + "\n" ) ;
				// Do not issue error: this is not an internal fatal error, just a request that cannot be processed...
				callback() ;
				return ;
			}
			
			// Do not auto-clear in case of errors
			if ( query_.shell.autoclear.body ) { delete query_.body ; }
			if ( query_.shell.autoclear.auth ) { delete query_.auth ; }
			if ( query_.shell.autoclear.headers ) { query_.headers = {} ; }
			
			if ( query_.shell.autocookie && incomingMessage.headers && incomingMessage.headers['set-cookie'] )
			{
				query_.headers.cookie = incomingMessage.headers['set-cookie'] ;
			}
			
			if ( ! streams.output ) { self.displayBody( query , body , incomingMessage ) ; }
			
			term.dim.magenta( '[Received ' + ( body ? self.byteString( body.length ) + ' ' : '' ) + 'in ' + time + 'ms]\n' ) ;
			
			// Handle redirections
			if ( incomingMessage.headers && incomingMessage.headers['location'] )
			{
				switch ( incomingMessage.status )
				{
					case 301 :
					case 307 :
					case 308 :
						command = {} ;
						self.url2query( incomingMessage.headers['location'] , command ) ;
						command.method = query_.method ;
						shouldRedirect = true ;
						break ;
					case 302 :
					case 303 :
						command = {} ;
						self.url2query( incomingMessage.headers['location'] , command ) ;
						command.method = 'GET' ;
						shouldRedirect = true ;
						break ;
				}
				
				if ( shouldRedirect )
				{
					if ( command.hostname === '' ) { command.hostname = query_.hostname ; }
					
					//console.log( command ) ;
					
					term.brightGreen( 'Redirect to ' )
						.yellow( '(' + command.method + ') ' )
						.dim.noFormat( incomingMessage.headers['location'] )
						.brightGreen( ' ? ' )
						.bold( '[Y/n] ' ) ;
					
					shellYesOrNo( function( error , ok ) {
						
						if ( error ) { callback( error ) ; return ; }
						
						term( '\n' ) ;
						
						if ( ok )
						{
							tree.extend( null , query_ , command ) ;
							httpRequester.runShellCommand.request.call( self , command , query_ , callback ) ;
						}
						else
						{
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



httpRequester.wsChat = function wsChat( command , query , callback )
{
	var self = this , ws ,
		inputControler , onKey , terminated = false , rawMode = false ,
		outputBuffer , history = [] ;
	
	// TODO: fix callback hell?
	
	ws = new WebSocket( 'ws://' + query.hostname + ':' + query.port + query.path , { headers: query.headers } ) ;
	
	var terminate = function terminate( error ) {
		
		if ( terminated ) { return ; }
		
		terminated = true ;
		
		if ( onKey ) { term.removeListener( 'key' , onKey ) ; }
		
		if ( inputControler )
		{
			inputControler.abort() ;
			inputControler = undefined ;
		}
		
		ws.terminate() ;
		
		// Give some time to close the connection (avoid a 'closed connection' message after the next prompt)
		setTimeout( function() { callback( error ) ; } , 20 ) ;
	} ;
	
	ws.on( 'open' , function() {
		
		self.displayOpenedConnection( query ) ;
		
		term.blue( 'Websocket Chatter, ' )
			.blue.bold( 'CTRL-T' ).blue( ' to switch mode, ' )
			.blue.bold( 'CTRL-X' ).blue( ' to terminate:\n' ) ;
		
		onKey = function onKey( key , matches , data ) {
			
			switch ( key )
			{
				case 'CTRL_X' :
					if ( rawMode )
					{
						term( '\n' ) ;
						terminate() ;
					}
					else
					{
						term( '\n' ) ;
						terminate() ;
					}
					break ;
				
				case 'CTRL_T' :
					rawMode = ! rawMode ;
					
					if ( rawMode )
					{
						term.blue( '\nWebsocket Raw Mode, ' )
							.blue.bold( 'CTRL-T' ).blue( ' to switch mode, ' )
							.blue.bold( 'CTRL-X' ).blue( ' to terminate:\n' ) ;
						
						if ( inputControler )
						{
							inputControler.abort() ;
							inputControler = undefined ;
						}
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
				if ( error ) { terminate( error ) ; return ; }
				
				history.push( input ) ;
				
				ws.send( input , function( error ) {
					if ( error ) { terminate( error ) ; return ; }
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
			if ( inputControler && inputControler.ready )
			{
				// Get the input field position
				inputPosition = inputControler.getPosition() ;
				//console.error( inputPosition ) ;
				
				// Hide the input field
				inputControler.hide() ;
				
				// Insert the message before the current prompt and input field
				term.moveTo.cyan.bold( 1 , inputPosition.y , '< ' + message ).eraseLineAfter() ;
			}
			else
			{
				// Insert the message before the current prompt and input field
				term.column.cyan.bold( 1 , '< ' + message ).eraseLineAfter() ;
			}
			
			// Restore the prompt
			term( '\n> ' ) ;
			
			// Rebase the input field to the current position
			inputControler.rebase() ;
		}
	} ) ;
	
	ws.on( 'close' , function() {
		
		if ( inputControler ) { inputControler.hide() ; term.column( 1 ) ; }
		else { term( '\n' ) ; }
		
		self.displayClosedConnection( query ) ;
		
		term( '\n' ) ;
		
		terminate() ;
	} ) ;
	
	ws.on( 'error' , function( error ) {
		
		if ( inputControler ) { inputControler.hide() ; term.column( 1 ) ; }
		
		term.red( '\n' + error + '\n' ) ;
		
		terminate() ;
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



var shellYesOrNo = term.yesOrNo.bind( term , {
	yes: [ 'y' , 'ENTER' ] ,
	no: [ 'n' ] ,
	echoYes: 'yes' ,
	echoNo: 'no'
} ) ;



