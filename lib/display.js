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
var term = require( 'terminal-kit' ).terminal ;



// Create the object and export it
var httpRequester = {} ;
module.exports = httpRequester ;



// Display headers of an incoming message, also compatible with the query format
httpRequester.displayHeader = function displayHeader( config , incomingMessage )
{
	if ( config[ 'silent-header' ] ) { return ; }
	
	var key , statusGroup ;
	
	// First line, it depends on the message being a request or a response
	
	if ( incomingMessage.method )
	{
		term.brightGreen.bold( incomingMessage.method + ' ' ) ;
		term.green( incomingMessage.path || incomingMessage.url + ' ' ) ;
	}
	
	if ( incomingMessage.httpVersion ) { term.magenta( "HTTP/%s " , incomingMessage.httpVersion ) ; }
	
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
		term.brightCyan.bold( this.normalizeHeader( key ) )( ': %s\n' , incomingMessage.headers[ key ] ) ;
	}
	
	if ( incomingMessage.auth )
	{
		term.brightCyan.bold( 'Authorization' ).dim.italic( ': %s\n' , incomingMessage.auth ) ;
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



httpRequester.displayConnectionError = function displayConnectionError( config , id , error )
{
	if ( config.server ) { term.red( 'Connection #%i: %s\n' , error.toString() ) ; }
	else { term.red( 'Connection: %s\n' , error.toString() ) ; }
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
	this.displayIntro() ;
	
	term( '\n' ) ;
	term.brightCyan.bold( 'Available options:\n' ) ;
	term.cyan( '\t--help, -h' ).dim( '   display this help\n' ) ;
	term.cyan( '\t--shell' ).dim( '   run requests in an interactive shell, ' ).magenta.bold( 'like a boss!\n' ) ;
	term.cyan( '\t--method <method>' ).dim( '   set the HTTP method\n' ) ;
	term.cyan( '\t--protocol http|https|ws' ).dim( "   set the protocol, 'http', 'https' or 'ws'\n" ) ;
	term.cyan( '\t--host <host>' ).dim( '   set the targeted host\n' ) ;
	term.cyan( '\t--port <port number>, -p <port number>' ).dim( '   set the targeted port, default is 80 (HTTP) or 443 (HTTPS)\n' ) ;
	term.cyan( '\t--path <path>' ).dim( '   set the path of the targeted resource in the host\n' ) ;
	term.cyan( '\t--url <URL>' ).dim( '   the full URL of the resource, will be splitted into protocol, host, port and path\n' ) ;
	term.cyan( '\t--headers.* <header value>' ).dim( '   any header can be specified as an option, e.g. ').cyan( '--headers.content-type application/json' ).dim( '.\n' ) ;
	term.dim( '\t\tIf it is not conflicting with another options, it can be used without prefix,\n' ) ;
	term.dim( '\t\tlike' ).cyan( ' --content-type application/json\n' ) ;
	term.cyan( '\t--headers <json string>' ).dim( '   specify all headers using the JSON format\n' ) ;
	term.cyan( '\t--auth "<user>:<password>"' ).dim( '   basic authentication i.e. "user:password" to compute an Authorization header\n' ) ;
	term.cyan( '\t--timeout <ms>' ).dim( '   set the request timeout in ms\n' ) ;
	term.cyan( '\t--output <file>, -o <file>' ).dim( "   if given, the body's response will be written to this file instead of STDOUT\n" ) ;
	term.cyan( '\t--http' ).dim( '   shortcut for ' ).cyan( '--protocol http\n' ) ;
	term.cyan( '\t--https' ).dim( '   shortcut for ' ).cyan( '--protocol https\n' ) ;
	term.cyan( '\t--ws' ).dim( '   shortcut for ' ).cyan( '--protocol ws\n' ) ;
	term.cyan( '\t--server' ).dim( '   start a server\n' ) ;
	term.cyan( '\t--config <file>' ).dim( '   a JSON config file containing all the above options, structured in an object\n' ) ;
	
	term( '\n' ) ;
	term.brightCyan.bold( 'Syntactic sugar:\n' ) ;
	term.cyan( '\thttp-requester' ).dim( '   launch the interactive shell, like ' ).cyan( 'http-requester --shell\n' ) ;
	term.cyan( '\thttp-requester <file>' ).dim( '   load a config file, like ' ).cyan( 'http-requester --config <file>\n' ) ;
	term.cyan( '\thttp-requester <url>' ).dim( '   GET the url, like ' ).cyan( 'http-requester --method get --url <url>\n' ) ;
	term.cyan( '\thttp-requester <method> <url>' ).dim( '   request the url, like ' ).cyan( 'http-requester --method <method> --url <url>\n' ) ;
	
	term( '\n\n' ) ;
} ;



httpRequester.displayIntro = function displayIntro()
{
	term.bold( this.package.name + ' ' )
		.dim( 'v' + this.package.version + '\n' )
		.brightMagenta.bold( "Perform HTTP & WS requests like a boss!\n" ) ;
} ;


