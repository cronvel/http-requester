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
var fs = require( 'fs' ) ;
var url = require( 'url' ) ;

var term = require( 'terminal-kit' ).terminal ;
var tree = require( 'tree-kit' ) ;
var async = require( 'async-kit' ) ;



// Create the object
var httpRequester = {} ;

// Export it!
module.exports = httpRequester ;





			/* Command Line Interface */



httpRequester.cli = function cli()
{
	var query = httpRequester.cliArgsToQuery() ;
	
	console.log( query ) ;
	
	async.series( {
		config: function( seriesCallback ) {
			if ( ! query.config ) { seriesCallback() ; return ; }
			httpRequester.loadConfig( query.config , function( error , configQuery ) {
				if ( error ) { seriesCallback( error ) ; return ; }
				tree.extend( { deep: true } , configQuery , query ) ;
				query = configQuery ;
				delete query.config ;
			} ) ;
		} ,
		httpRequest: function( seriesCallback ) {
			httpRequester.httpRequest( query , seriesCallback ) ;
		}
	} )
	.exec( function( error , results ) {
		
		if ( error )
		{
			term.red( "Error: %s\n" , error.toString() ) ;
			process.exit( 1 ) ;
		}
		
		httpRequester.displayResponse( results.httpRequest[ 1 ] ) ;
		
		process.exit( 0 ) ;
	} ) ;
} ;



httpRequester.cliOptions = {
	config: true ,
	host: true ,
	//hostname: true ,
	port: true ,
	localAddress: true ,
	socketPath: true ,
	method: true ,
	path: true ,
	//headers: true ,
	auth: true ,
	agent: true
} ;



httpRequester.cliArgsToQuery = function cliArgsToQuery()
{
	var key , fullUrl , parsedUrl , headers = {} ,
		query = require( 'minimist' )( process.argv.slice( 2 ) ) ;
	
	// Process arguments not belonging to any options
	
	if ( query._.length === 1 )
	{
		query.config = query._[ 0 ] ;
	}
	else if ( query._.length === 2 )
	{
		query.method = query._[ 0 ] ;
		fullUrl = query._[ 1 ] ;
		
		// Default to http, if no protocol given: the 'url' module has no fallback for that
		if ( ! fullUrl.match( /^[a-z]+:\/\// ) ) { fullUrl = 'http://' + fullUrl ; }
		
		parsed = url.parse( fullUrl ) ;
		query.host = parsed.hostname ;	// parsed.host contains port
		if ( parsed.port ) { query.port = parsed.port ; }
		query.path = parsed.path ;
		//console.log( 'parsed:' , parsed ) ;
	}
	
	delete query._ ;
	
	
	// Process headers options
	
	for ( key in query )
	{
		if ( ! httpRequester.cliOptions[ key ] )
		{
			// options that are not in available static CLI options are headers
			if ( key.match( /^header-/ ) )
			{
				headers[ key.replace( /^header-(.*)$/ , '$1' ) ] = query[ key ] ;
			}
			else
			{
				headers[ key ] = query[ key ] ;
			}
			
			delete query[ key ] ;
		}
	}
	
	query.headers = headers ;
	
	return query ;
} ;



httpRequester.loadConfig = function loadConfig( filePath , callback )
{
	fs.readFile( filePath , { encoding: 'utf8' } , function( error , content ) {
		
		var query ;
		
		try {
			query = JSON.parse( content ) ;
		}
		catch ( error ) {
			callback( error ) ;
			return ;
		}
		
		callback( undefined , query ) ;
		httpRequester.httpRequest( query , callback ) ;
	} ) ;
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
		agent: Controls Agent behavior. When an Agent is used request will default to Connection: keep-alive. Possible values:
			undefined (default): use global Agent for this host and port.
			Agent object: explicitly use the passed in Agent.
			false: opts out of connection pooling with an Agent, defaults request to Connection: close.

	callback( error , response )
		error: ...
		response: an object, where:
			httpVersion: the HTTP version of the response
			status: the HTTP status code
			statusMessage: the HTTP status message
			headers: the HTTP response headers
			body: the response body
*/
httpRequester.httpRequest = function httpRequest( query , callback )
{
	query = tree.extend( { deep: true } , { hostname: 'localhost' , port: 80 , headers: {} } , query ) ;
	
	if ( 'body' in query )
	{
		if ( typeof query.body !== 'string' ) { query.body = JSON.stringify( query.body ) ; }
		
		query.headers['Content-Length'] = query.body.length ;
	}
	
	var request = http.request( query , function( response ) {
		
		var body = '' ;
		
		//console.log( '[requester] STATUS: ' + response.statusCode ) ;
		//console.log( '[requester] HEADERS: ' + JSON.stringify( response.headers ) ) ;
		response.setEncoding( 'utf8' ) ;
		
		response.on( 'data', function ( chunk ) {
			body += chunk.toString() ;
			//console.log( '[requester] BODY: ' + chunk ) ;
		} ) ;
		
		response.on( 'end' , function() {
			callback( undefined , {
				httpVersion: response.httpVersion ,
				status: response.statusCode ,
				statusMessage: http.STATUS_CODES[ response.statusCode ] ,
				headers: response.headers ,
				body: body
			} ) ;
		} ) ;
	} ) ;
	
	request.on( 'error' , function( error ) {
		//console.log( '[requester] problem with request: ' + error.message ) ;
		callback( error ) ;
	} ) ;
	
	// Write .body... erf... to request body
	if ( query.body ) {
		//console.log( "BODY to send:" , query.body ) ;
		request.write( query.body ) ;
	}
	request.end() ;
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



httpRequester.displayResponse = function displayResponse( response )
{
	var key , statusGroup = Math.floor( response.status / 100 ) ;
	
	term.magenta( "HTTP/%s " , response.httpVersion ) ;
	
	if ( statusGroup >= 1 && statusGroup <= 2 )
	{
		term.brightGreen.bold( response.status ).green( " %s\n" , response.statusMessage ) ;
	}
	else if ( statusGroup >= 4 && statusGroup <= 5 )
	{
		term.brightRed.bold( response.status ).red( " %s\n" , response.statusMessage ) ;
	}
	else
	{
		term.brightYellow.bold( response.status ).yellow( " %s\n" , response.statusMessage ) ;
	}
	
	//*
	for ( key in response.headers )
	{
		term.brightCyan.bold( httpRequester.normalizeHeader( key ) ).white( ': %s\n' , response.headers[ key ] ) ;
	}
	//*/
	
	/* available in node 0.12, but not in 0.10
	console.log( response.rawHeaders ) ;
	
	for ( key = 0 ; key < response.rawHeaders.length ; key += 2 )
	{
		term( '%s: %s\n' , response.rawHeaders[ key ] , response.rawHeaders[ key + 1 ] ) ;
	}
	//*/
	
	//console.log( response.headers ) ;
	term.brightBlue.bold( '\nBody:\n\n' ) ;
	term( response.body ) ;
	term( '\n\n' ) ;
} ;





