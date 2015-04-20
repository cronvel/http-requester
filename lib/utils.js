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
var url = require( 'url' ) ;



// Create the object and export it
var httpRequester = {} ;
module.exports = httpRequester ;



// Normalize an object of headers
httpRequester.normalizeHeaders = function normalizeHeaders( headers )
{
	var header , normalized ;
	
	for ( header in headers )
	{
		normalized = this.normalizeHeader( header ) ;
		
		if ( header !== normalized )
		{
			headers[ normalized ] = headers[ header ] ;
			delete headers[ header ] ;
		}
	}
} ;



// Normalize one header
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



httpRequester.url2query = function url2query( fullUrl , query )
{
	var parsed ;
	
	// Default to http, if no protocol given: the 'url' module has no fallback for that
	if ( ! fullUrl.match( /^[a-z]+:\/\// ) ) { fullUrl = 'http://' + fullUrl ; }
	
	parsed = url.parse( fullUrl ) ;
	
	query.hostname = parsed.hostname ;	// parsed.host contains port
	
	//query.protocol = parsed.protocol ;
	query.protocol = parsed.protocol.replace( /^([a-z+-]+):$/ , '$1' ) ;
	
	if ( parsed.port )
	{
		query.port = parsed.port ;
	}
	else if ( ! query.port )
	{
		if ( query.protocol === 'http' ) { query.port = 80 ; }
		else if ( query.protocol === 'https' ) { query.port = 443 ; }
	}
	
	query.path = parsed.path || '/' ;
} ;

