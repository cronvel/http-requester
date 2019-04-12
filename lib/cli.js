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



const Promise = require( 'seventh' ) ;

const utils = require( './utils.js' ) ;

const fs = require( 'fs' ) ;
const fsKit = require( 'fs-kit' ) ;
Promise.promisifyNodeApi( fsKit ) ;

//const url = require( 'url' ) ;
const path = require( 'path' ) ;

const term = require( 'terminal-kit' ).terminal ;
const tree = require( 'tree-kit' ) ;
const kungFig = require( 'kung-fig' ) ;

const cliManager = require( 'utterminal' ).cli ;

const HttpRequester = require( './HttpRequester.js' ) ;

const homeDir = require( 'os' ).homedir() ;
const httpRequesterDir = path.join( homeDir , '.local' , 'share' , 'http-requester' ) ;



var cli = module.exports = function() {
	var args , config = {} , query , serverConf , configName = '' ;

	/* eslint-disable indent */
	cliManager.package( require( '../package.json' ) )
		.app( 'HTTP Requester' )
		.baseline( "Perform HTTP & WS requests ^M^+like a boss!" )
		.usage( "[--parameter1 value1] [--parameter2 value2] [...]" )
		.introIfTTY
		.helpOption
		//.camel
		.opt( 'shell' ).flag
			.description( "Run requests in an interactive shell, ^M^+like a boss!" )
		.opt( 'method' ).string
			.typeLabel( 'method' )
			.description( "Set the HTTP method" )
		.opt( 'protocol' ).string
			.typeLabel( 'http|https|ws' )
			.description( "Set the protocol, 'http', 'https' or 'ws'" )
		.opt( 'host' ).string
			.typeLabel( 'host' )
			.description( "Set the targeted host" )
		.opt( [ 'port' , 'p' ] ).number
			.typeLabel( 'port-number' )
			.description( "Set the targeted port, default is 80 (HTTP) or 443 (HTTPS)" )
		.opt( 'path' ).string
			.typeLabel( 'path' )
			.description( "Set the path of the targeted resource in the host" )
		.opt( 'url' ).string
			.typeLabel( 'URL' )
			.description( "The full URL of the resource, will be splitted into protocol, host, port and path" )
		.opt( 'headers' )
			.typeLabel( 'json|object' )
			.description( "Specify all headers using a JSON string, or specify each header with the object syntax."
				+ "Any header can be specified as an option, e.g. ^b--headers.content-type application/json^c. "
				+ "Also if it is not conflicting with another options, it can be used without prefix, like ^b--content-type application/json" )
		.opt( 'auth' ).string
			.typeLabel( 'user:password' )
			.description( 'Basic authentication i.e. "user:password" to compute an Authorization header' )
		.opt( 'timeout' ).number
			.typeLabel( 'ms' )
			.description( "Set the request timeout in ms" )
		.opt( [ 'output' , 'o' ] ).string
			.typeLabel( 'file' )
			.description( "If given, the body's response will be written to this file instead of STDOUT" )
		.opt( 'http' ).flag
			.description( "Shortcut for ^b--protocol http" )
		.opt( 'https' ).flag
			.description( "Shortcut for ^b--protocol https" )
		.opt( 'ws' ).flag
			.description( "Shortcut for ^b--protocol ws" )
		.opt( [ 'breautify' , 'b' ] ).flag
			.description( "Beautify JSON body" )
		.opt( 'server' ).flag
			.description( "Start a server" )
		.opt( 'config' ).string
			.typeLabel( 'file' )
			.description( "A JSON or KFG config file containing all the above options, structured in an object" )
		.opt( 'rc' , true ).flag
			.description( "When set (the default), read the rc file in the user home directory" )
		.restArgs( 'restArgs' )
			.description( "Syntactic sugar, see below" )
		.details( "^+Syntactic sugar:^:\n"
			+ "  ^Khttp-requester                  ^claunch the interactive shell, like ^bhttp-requester --shell^:\n"
			+ "  ^Khttp-requester <file>           ^cload a config file, like ^bhttp-requester --config <file>^:\n"
			+ "  ^Khttp-requester <url>            ^cGET the url, like ^bhttp-requester --method get --url <url>^:\n"
			+ "  ^Khttp-requester <method> <url>   ^crequest the url, like ^bhttp-requester --method <method> --url <url>^:\n" ) ;
	/* eslint-enable indent */

	args = cliManager.run() ;

	if ( process.argv.length === 2 || ( process.argv.length === 3 && process.argv[ 2 ] === '--no-rc' ) ) {
		args.shell = true ;
	}

	// We should process the config argument beforehand
	if ( args.restArgs && args.restArgs.length === 1 ) {
		args.restArgs[ 0 ] = '' + args.restArgs[ 0 ] ;	// Force a string here
		if ( ! args.restArgs[ 0 ].match( /:\/\// ) ) { args.config = args.restArgs[ 0 ] ; }
	}

	// Load the config, if any
	if ( args.config ) {
		try {
			config = kungFig.load( args.config ) ;
			configName = path.basename( path.dirname( path.dirname( args.config ) ) ) ;
		}
		catch ( error ) {
			term.red( error.toString() + '\n' ) ;
			process.exit( 1 ) ;
		}

		delete args.config ;
	}
	else if ( args.rc ) {
		try {
			config = kungFig.load( path.join( 'http-requester' , 'config.kfg' ) ) ;
			configName = path.basename( process.cwd() ) ;
		}
		catch ( error ) {
			// That's not an error
			try {
				config = kungFig.load( path.join( httpRequesterDir , 'config.kfg' ) ) ;
				if ( ! config ) { config = {} ; }
			}
			catch ( error_ ) {
				// That's not an error
				cli.createHomeConfig() ;
				config = {} ;
			}
		}
	}

	if ( ! config.configName ) { config.configName = configName ; }

	delete args.rc ;

	tree.extend( { deep: true } , config , args ) ;

	if ( config.server ) {
		serverConf = cli.confToServerConf( config ) ;
		cli.server( serverConf ) ;
		return ;
	}

	query = cli.confToQuery( config ) ;

	if ( config.shell ) {
		this.shell( query ) ;
		return ;
	}

	if ( query.protocol === 'ws' ) {
		cli.wsMessages( query ) ;
		return ;
	}

	cli.request( query ) ;
} ;



cli.createHomeConfig = function() {
	fsKit.ensurePathSync( httpRequesterDir ) ;

	try {
		fs.writeFileSync( path.join( httpRequesterDir , 'config.kfg' ) , "" ) ;
		fs.writeFileSync( path.join( httpRequesterDir , 'history.json' ) , "[]" ) ;
	}
	catch ( error ) {
		// Not a big deal, print an error? not sure... let's ignore it for instance
	}
} ;



cli.requestOptions = {
	output: true ,
	o: true ,
	input: true ,
	i: true ,
	config: true ,
	url: true ,
	protocol: true ,
	http: true ,
	https: true ,
	ws: true ,
	host: true ,
	hostname: true ,
	port: true ,
	p: true ,
	localAddress: true ,
	socketPath: true ,
	method: true ,
	auth: true ,
	path: true ,
	pathname: true ,
	search: true ,
	headers: true ,
	//agent: true
	body: true ,
	timeout: true ,
	server: true ,

	messages: true ,
	responses: true ,
	defaultResponse: true ,
	"default-response": true ,
	closeMatch: true ,
	"close-match": true ,
	"silent-header": true ,
	"silent-body": true ,
	"silent-trailer": true ,
	
	beautify: true ,
	b: true ,
	decompress: true ,
	d: true ,

	configName: true ,
	autoclear: true ,
	autocookie: true ,
	trailingslash: true ,
	cwd: true ,
	module: true
} ;



cli.confToQuery = function( args ) {
	var key , splitted ,
		query = tree.extend( { deep: true } , {} , args ) ;

	// /!\ The order matters! /!\

	delete query.shell ;

	// short-option substitution
	if ( query.p ) { query.port = query.p ; delete query.p ; }
	if ( query.o ) { query.output = query.o ; delete query.o ; }
	if ( query.i ) { query.input = query.i ; delete query.i ; }
	if ( query.b ) { query.beautify = query.b ; delete query.b ; }
	if ( query.d ) { query.decompress = query.d ; delete query.d ; }

	if ( query.host ) {
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
	if ( args.restArgs && args.restArgs.length === 1 && args.restArgs[ 0 ].match( /:\/\// ) ) {
		utils.urlToQuery( query.restArgs[ 0 ] , query , true ) ;
	}
	else if ( args.restArgs && query.restArgs.length === 2 ) {
		query.method = query.restArgs[ 0 ] ;

		if ( query.restArgs[ 1 ][ 0 ] === '/' ) { query.path = query.restArgs[ 1 ] ; }
		else { utils.urlToQuery( query.restArgs[ 1 ] , query , true ) ; }
	}

	delete query.restArgs ;


	// URL options
	if ( query.url ) {
		utils.urlToQuery( query.url , query , true ) ;
		delete query.url ;
	}


	// If no protocol, set 'http' as default
	if ( ! query.protocol ) { query.protocol = 'http' ; }


	if ( query.protocol === 'http' || query.protocol === 'https' ) {
		// Method
		if ( ! query.method ) { query.method = 'GET' ; }
		else { query.method = query.method.toUpperCase() ; }


	}
	else if ( query.protocol === 'ws' ) {
		if ( ! query.messages ) { query.messages = [] ; }

		if ( query[ 'close-match' ] ) {
			query.closeMatch = query[ 'close-match' ] ;
			delete query[ 'close-match' ] ;
		}

		if ( ! query.closeMatch ) { query.closeMatch = { count: query.messages.length } ; }
	}


	// Process headers options
	if ( typeof query.headers === 'string' ) {
		try {
			query.headers = JSON.parse( query.headers ) ;
		}
		catch ( error ) {
			query.headers = undefined ;
		}
	}

	if ( ! query.headers || typeof query.headers !== 'object' ) { query.headers = {} ; }

	for ( key in query ) {
		// Any options that are not recognized are turned to header
		if ( ! cli.requestOptions[ key ] ) {
			query.headers[ key ] = query[ key ] ;
			delete query[ key ] ;
		}
	}

	// Finally, normalize headers
	utils.normalizeHeaders( query.headers ) ;


	// Defaults...
	if ( ! query.hostname ) { query.hostname = 'localhost' ; }
	if ( ! query.port ) { query.port = query.protocol === 'https' ? 443 : 80 ; }
	if ( ! query.path ) { query.path = '/' ; }
	if ( ! query.pathname ) { query.pathname = '/' ; }
	if ( ! query.timeout ) { query.timeout = 5000 ; }	// 5 seconds
	if ( ! query.cwd ) { query.cwd = process.cwd() ; }


	return query ;
} ;



cli.confToServerConf = function( args ) {
	var serverConf = tree.extend( { deep: true } , {} , args ) ;

	delete serverConf.shell ;

	// short-option substitution
	if ( serverConf.p ) { serverConf.port = serverConf.p ; delete serverConf.p ; }

	// shortcuts
	if ( serverConf.http ) { serverConf.protocol = 'http' ; delete serverConf.http ; }
	if ( serverConf.https ) { serverConf.protocol = 'https' ; delete serverConf.https ; }
	if ( serverConf.ws ) { serverConf.protocol = 'ws' ; delete serverConf.ws ; }


	if ( ! serverConf.responses ) { serverConf.responses = [] ; }

	if ( serverConf[ 'default-response' ] ) {
		serverConf.defaultResponse = serverConf[ 'default-response' ] ;
		delete serverConf[ 'default-response' ] ;
	}

	if ( ! serverConf.defaultResponse ) {
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



cli.request = async function( query ) {
	//console.log( query ) ;
	var streams = {} , incomingMessage , body ;

	try {
		if ( query.output ) {
			streams.output = fs.createWriteStream( query.output ) ;
			await Promise.onceEventOrError( streams.output , 'open' ) ;
		}

		body = await this.performRequest( query , {
			output: streams.output ,
			headerCallback: incomingMessage_ => {
				incomingMessage = incomingMessage_ ;
				this.displayHeader( query , incomingMessage ) ;
			} ,
			progressCallback: this.displayProgressBar.bind( this , {} )
		} ) ;
	}
	catch( error ) {
		term.red( error.toString() + '\n' ) ;
		process.exit( 1 ) ;
	}

	term( '\n' ) ;

	if ( ! streams.output ) {
		this.displayBody( query , body , incomingMessage ) ;
		this.displayTrailer( query , incomingMessage ) ;
	}

	term.dim.magenta( '[Received ' +
	( body ? utils.byteString( body.length ) + ' ' : '' ) +
	'in ' + this.lastResponse.time + 'ms]\n' ) ;

	term.processExit( 0 ) ;
} ;



cli.wsMessages = async function( query ) {
	var messages ;

	try {
		messages = await this.wsMessages( query ) ;
	}
	catch ( error ) {
		term.red( error.toString() + '\n' ) ;
		process.exit( 1 ) ;
	}

	// Do something with those messages...
	process.exit( 0 ) ;
} ;



cli.server = async function( serverConf ) {
	//console.log( serverConf ) ;
	var streams = {} ;

	try {
		if ( serverConf.output ) {
			streams.output = fs.createWriteStream( serverConf.output ) ;
			await Promise.onceEventOrError( streams.output , 'open' ) ;
		}
	}
	catch( error ) {
		term.red( error.toString() + '\n' ) ;
		process.exit( 1 ) ;
	}

	//console.log( serverConf ) ;
	this.startServer( serverConf , streams ) ;
} ;

