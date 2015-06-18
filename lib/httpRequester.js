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
var fs = require( 'fs' ) ;
//var url = require( 'url' ) ;
//var path = require( 'path' ) ;

var term = require( 'terminal-kit' ).terminal ;
var tree = require( 'tree-kit' ) ;
var async = require( 'async-kit' ) ;



// Create the object and export it
var httpRequester = {} ;
module.exports = httpRequester ;



// Get all the package info
httpRequester.package = require( '../package.json' ) ;

// Extend it with the different parts
tree.extend( null , httpRequester ,
	require( './constants.js' ) ,
	require( './core.js' ) ,
	require( './display.js' ) ,
	require( './shell.js' ) ,
	require( './utils.js' )
) ;





			/* Command Line Interface */



httpRequester.cli = function cli()
{
	var self = this , args , query , serverConf ;
	
	args = require( 'minimist' )( process.argv.slice( 2 ) ) ;
	
	if ( args.help || args.h )
	{
		this.help() ;
		return ;
	}
	
	if ( process.argv.length === 2 ) { args.shell = true ; }
	
	// We should process the config argument beforehand
	if ( args._.length === 1 && ! args._[ 0 ].match( /:\/\// ) ) { args.config = args._[ 0 ] ; }
	
	this.loadConfig( args.config , function( error , config ) {
		
		if ( error ) { term.red( error.toString() + '\n' ) ; process.exit( 1 ) ; }
		
		args = tree.extend( { deep: true } , {} , config , args ) ;
		delete args.config ;
		
		if ( args.server )
		{
			serverConf = self.cliArgsToServerConf( args ) ;
			self.cliServer( serverConf ) ;
			return ;
		}
		
		query = self.cliArgsToQuery( args ) ;
		
		if ( args.shell )
		{
			self.shell( query ) ;
			return ;
		}
		
		if ( query.protocol === 'ws' )
		{
			self.cliWsMessages( query ) ;
			return ;
		}
		
		self.cliRequest( query ) ;
	} ) ;
} ;



httpRequester.help = function help()
{
	this.displayCliHelp() ;
	process.exit( 0 ) ;
} ;



httpRequester.cliRequestOptions = {
	output: true , o: true ,
	input: true , i: true ,
	config: true ,
	url: true ,
	protocol: true , http: true , https: true , ws: true ,
	host: true ,
	hostname: true ,
	port: true , p: true ,
	localAddress: true ,
	socketPath: true ,
	method: true ,
	path: true ,
	headers: true ,
	auth: true ,
	//agent: true
	body: true ,
	timeout: true ,
	messages: true ,
	server: true ,
	closeMatch: true , "close-match": true ,
	"silent-header": true ,
	"silent-body": true ,
	beautify: true , b: true
} ;



httpRequester.protocols = {
	http: true ,
	https: true ,
	ws: true
} ;



httpRequester.cliArgsToQuery = function cliArgsToQuery( args )
{
	var key , splitted ,
		query = tree.extend( { deep: true } , {} , args ) ;
	
	// /!\ The order matters! /!\
	
	delete query.shell ;
	
	// short-option substitution
	if ( query.p ) { query.port = query.p ; delete query.p ; }
	if ( query.o ) { query.output = query.o ; delete query.o ; }
	if ( query.i ) { query.input = query.i ; delete query.i ; }
	if ( query.b ) { query.beautify = query.b ; delete query.b ; }
	
	if ( query.host )
	{
		splitted = query.host.split( ':' ) ;
		query.hostname = splitted[ 0 ] ;
		
		if ( splitted[ 1 ] ) { query.port = splitted[ 1 ] ; }
		
		delete query.host ;
	}
	
	// shortcuts
	if ( query.http ) { query.protocol = 'http' ; delete query.http ; }
	if ( query.https ) { query.protocol = 'https' ; delete query.https ; }
	if ( query.ws ) { query.protocol = 'ws' ; delete query.ws ; }
	
	// Process arguments not belonging to any options
	if ( args._.length === 1 && args._[ 0 ].match( /:\/\// ) )
	{
		this.url2query( query._[ 0 ] , query ) ;
	}
	else if ( query._.length === 2 )
	{
		query.method = query._[ 0 ] ;
		
		if ( query._[ 1 ][ 0 ] === '/' ) { query.path = query._[ 1 ] ; }
		else { this.url2query( query._[ 1 ] , query ) ; }
	}
	
	delete query._ ;
	
	
	// URL options
	if ( query.url )
	{
		this.url2query( query.url , query ) ;
		delete query.url ;
	}
	
	
	// If no protocol, set 'http' as default
	if ( ! query.protocol ) { query.protocol = 'http' ; }
	
	
	if ( query.protocol === 'http' || query.protocol === 'https' )
	{
		// Method
		if ( ! query.method ) { query.method = 'GET' ; }
		else { query.method = query.method.toUpperCase() ; }
		
		
	}
	else if ( query.protocol === 'ws' )
	{
		if ( ! query.messages ) { query.messages = [] ; }
		
		if ( query[ 'close-match' ] )
		{
			query.closeMatch = query[ 'close-match' ] ;
			delete query[ 'close-match' ] ;
		}
		
		if ( ! query.closeMatch ) { query.closeMatch = { count: query.messages.length } ; }
	}
	
	
	// Process headers options
	if ( typeof query.headers === 'string' )
	{
		try {
			query.headers = JSON.parse( query.headers ) ;
		}
		catch ( error ) {
			query.headers = undefined ;
		}
	}
	
	if ( ! query.headers || typeof query.headers !== 'object' ) { query.headers = {} ; }
	
	for ( key in query )
	{
		// Any options that are not recognized are turned to header
		if ( ! this.cliRequestOptions[ key ] )
		{
			query.headers[ key ] = query[ key ] ;
			delete query[ key ] ;
		}
	}
	
	// Finally, normalize headers
	this.normalizeHeaders( query.headers ) ;
	
	
	// Defaults...
	if ( ! query.hostname ) { query.hostname = 'localhost' ; }
	if ( ! query.port ) { query.port = query.protocol === 'https' ? 443 : 80 ; }
	if ( ! query.path ) { query.path = '/' ; }
	if ( ! query.timeout ) { query.timeout = 5000 ; }	// 5 seconds
	
	
	return query ;
} ;



httpRequester.cliArgsToServerConf = function cliArgsToServerConf( args )
{
	var serverConf = tree.extend( { deep: true } , {} , args ) ;
	
	delete serverConf.shell ;
	
	// short-option substitution
	if ( serverConf.p ) { serverConf.port = serverConf.p ; delete serverConf.p ; }
	
	// shortcuts
	if ( serverConf.http ) { serverConf.protocol = 'http' ; delete serverConf.http ; }
	if ( serverConf.https ) { serverConf.protocol = 'https' ; delete serverConf.https ; }
	if ( serverConf.ws ) { serverConf.protocol = 'ws' ; delete serverConf.ws ; }
	
	
	if ( ! serverConf.responses ) { serverConf.responses = [] ; }
	
	if ( serverConf[ 'default-response' ] )
	{
		serverConf.defaultResponse = serverConf[ 'default-response' ] ;
		delete serverConf[ 'default-response' ] ;
	}
	
	if ( ! serverConf.defaultResponse )
	{
		serverConf.defaultResponse = {
			status: 404 ,
			headers: {} ,
			body: "404: Not Found."
		} ;
	}
	
	// Defaults...
	if ( ! serverConf.protocol ) { serverConf.protocol = 'http' ; }
	//if ( ! serverConf.hostname ) { serverConf.hostname = 'localhost' ; }
	if ( ! serverConf.port ) { serverConf.port = serverConf.protocol === 'https' ? 443 : 80 ; }
	
	return serverConf ;
} ;



httpRequester.loadConfig = function loadConfig( filePath , callback )
{
	//console.log( filePath ) ;
	if ( ! filePath ) { callback( undefined , {} ) ; return ; }
	
	fs.readFile( filePath , { encoding: 'utf8' } , function( error , content ) {
		
		if ( error ) { callback( error ) ; return ; }
		
		var config ;
		
		try {
			config = JSON.parse( content ) ;
		}
		catch ( error ) {
			callback( error ) ;
			return ;
		}
		
		callback( undefined , config ) ;
	} ) ;
} ;



httpRequester.cliRequest = function cliRequest( query )
{
	//console.log( query ) ;
	var self = this , streams = {} , incomingMessage ;
	
	async.series( {
		output: function( seriesCallback ) {
			
			if ( ! query.output ) { seriesCallback() ; return ; }
			
			streams.output = fs.createWriteStream( query.output ) ;
			
			streams.output.on( 'open' , function() {
				streams.output.removeListener( 'error' , seriesCallback ) ;
				seriesCallback() ;
			} ) ;
			
			streams.output.on( 'error' , seriesCallback ) ;
		} ,
		performRequest: function( seriesCallback ) {
			//console.log( query ) ;
			self.performRequest(
				query , {
					output: streams.output ,
					headerCallback: function( incomingMessage_ ) {
						incomingMessage = incomingMessage_ ;
						self.displayHeader( query , incomingMessage )
					} ,
					progressCallback: self.displayProgressBar.bind( self , {} )
				} , seriesCallback ) ;
		}
	} )
	.exec( function( error , results ) {
		
		if ( error )
		{
			term.red( error.toString() + '\n' ) ;
			process.exit( 1 ) ;
		}
		
		term( '\n' ) ;
		
		if ( ! streams.output ) { self.displayBody( query , results.performRequest[ 1 ] , incomingMessage ) ; }
		
		term.processExit( 0 ) ;
	} ) ;
} ;



httpRequester.cliWsMessages = function cliWsMessages( query )
{
	this.wsMessages( query , function( error , messages ) {
		
		if ( error )
		{
			term.red( error.toString() + '\n' ) ;
			process.exit( 1 ) ;
		}
		
		process.exit( 0 ) ;
	} ) ;
} ;



httpRequester.cliServer = function cliServer( serverConf )
{
	//console.log( serverConf ) ;
	var self = this , streams = {} ;
	
	async.series( {
		output: function( seriesCallback ) {
			
			if ( ! serverConf.output ) { seriesCallback() ; return ; }
			
			streams.output = fs.createWriteStream( serverConf.output ) ;
			
			streams.output.on( 'open' , function() {
				streams.output.removeListener( 'error' , seriesCallback ) ;
				seriesCallback() ;
			} ) ;
			
			streams.output.on( 'error' , seriesCallback ) ;
		} ,
		startServer: function( seriesCallback ) {
			//console.log( serverConf ) ;
			self.startServer( serverConf , streams ) ;
		}
	} )
	.exec( function( error , results ) {
		
		if ( error )
		{
			term.red( error.toString() + '\n' ) ;
			process.exit( 1 ) ;
		}
		
		if ( ! streams.output ) { self.displayBody( results.performRequest[ 1 ] ) ; }
		
		process.exit( 0 ) ;
	} ) ;
} ;



