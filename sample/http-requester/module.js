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

// Test of modules



var api ;

exports.name = 'sample module' ;

exports.init = function( api_ ) { api = api_ ; } ;

var commands = exports.commands = {} ;


commands.hello = function( args ) {
	api.term( '^bHellow ^R%s^b!^:\n' , args[ 0 ] ) ;
} ;



commands.google = async function( args ) {
	await api.emulate( 'https://google.com/' ) ;
	await api.emulate( 'get' ) ;
	
	var response = api.lastResponse() ;
	
	if ( response ) {
		api.term.red( 'Got response status %s\n' , response.status ) ;
		api.term.yellow( 'Got body:\n%s\n' , response.body ) ;
	}
} ;



commands.google2 = function( args ) {
	return api.emulate( [
		'https://google.com/' ,
		'get'
	] ) ;
} ;

