/*
	The Cedric's Swiss Knife (CSK) - CSK HTTP Requester

	Copyright (c) 2015 - 2016 Cédric Ronvel 
	
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

exports.init = function init( api_ ) { api = api_ ; } ;

var commands = exports.commands = {} ;


commands.hello = function hello( args , query , callback )
{
	api.term( '^bHellow ^R%s^b!^:\n' , args[ 0 ] ) ;
	callback() ;
} ;



commands.google = function google( args , query , callback )
{
	api.emulate( 'https://google.com/' , function() {
		api.emulate( 'get' , callback ) ;
	} ) ;
} ;



commands.google2 = function google2( args , query , callback )
{
	api.emulateMulti( [
			'https://google.com/' ,
			'get'
		] ,
		callback
	) ;
} ;


