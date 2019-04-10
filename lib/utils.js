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
var url = require( 'url' ) ;



// Create the object and export it
var utils = {} ;
module.exports = utils ;



// Normalize an object of headers
utils.normalizeHeaders = function normalizeHeaders( headers ) {
	var header , normalized ;

	for ( header in headers ) {
		normalized = this.normalizeHeader( header ) ;

		if ( header !== normalized ) {
			headers[ normalized ] = headers[ header ] ;
			delete headers[ header ] ;
		}
	}
} ;



// Normalize one header
utils.normalizeHeader = function normalizeHeader( header ) {
	var i , splitted = header.split( '-' ) ;

	for ( i = 0 ; i < splitted.length ; i ++ ) {
		splitted[ i ] = splitted[ i ].charAt( 0 ).toUpperCase() + splitted[ i ].slice( 1 ) ;
	}

	header = splitted.join( '-' ) ;

	return header ;
} ;



// Return the size in B, KB, MB or GB
utils.byteString = function byteString( size ) {
	if ( size < 1000 ) { return '' + size + 'B' ; }
	else if ( size < 1000000 ) { return '' + Math.round( size / 100 ) / 10 + 'KB' ; }
	else if ( size < 1000000000 ) { return '' + Math.round( size / 100000 ) / 10 + 'MB' ; }
	return '' + Math.round( size / 100000000 ) / 10 + 'GB' ;
} ;



utils.url2query = function url2query( fullUrl , query , preservePort ) {
	var parsed ;

	// Default to http, if no protocol given: the 'url' module has no fallback for that
	if ( ! fullUrl.match( /^[a-z]+:\/\// ) ) {
		fullUrl =
			( query.protocol ? query.protocol + '://' : 'http://' ) +
			( fullUrl[ 0 ] === '/' && query.hostname ? query.hostname : '' ) +
			fullUrl ;
	}

	parsed = url.parse( fullUrl ) ;

	query.hostname = parsed.hostname ;	// parsed.host contains port

	//query.protocol = parsed.protocol ;
	query.protocol = parsed.protocol.replace( /^([a-z+-]+):$/ , '$1' ) ;

	if ( parsed.port ) {
		query.port = parseInt( parsed.port , 10 ) ;
	}
	else if ( ! query.port || ! preservePort ) {
		if ( query.protocol === 'http' ) { query.port = 80 ; }
		else if ( query.protocol === 'https' ) { query.port = 443 ; }
	}

	query.path = parsed.path || '/' ;

	query.pathname = parsed.pathname || '/' ;

	if ( query.shellConfig.trailingslash === true && query.pathname[ query.pathname.length - 1 ] !== '/' ) {
		query.pathname += '/' ;
	}
	else if ( query.shellConfig.trailingslash === false && query.pathname[ query.pathname.length - 1 ] === '/' ) {
		query.pathname = query.pathname.slice( 0 , -1 ) ;
	}

	query.search = parsed.search ;
} ;


