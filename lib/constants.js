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


// Create the object and export it
var httpRequester = {} ;
module.exports = httpRequester ;







			/* Auto-completion */



httpRequester.clientAutoComplete = [
	'GET ' , 'HEAD ' , 'POST ' , 'PUT ' , 'DELETE ' , 'TRACE ' , 'OPTIONS ' , 'CONNECT ' , 'PATCH ' ,
	'get ' , 'head ' , 'post ' , 'put ' , 'delete ' , 'trace ' , 'options ' , 'connect ' , 'patch ' ,
	'help' , 'request' , 'ls' ,
	'cd ' ,
	'clear ' ,
	'clear body' ,
	'clear headers' ,
	'autoclear ' ,
	'autoclear body' ,
	'autoclear headers' ,
	'host ' ,
	'host localhost' ,
	'protocol ' ,
	'protocol http' ,
	//'protocol https' ,	// useless
	'protocol ws' ,
	'port ' ,
	'port 80' ,
	'port 8080' ,
	'port 443' ,
	'method ' ,
	'method get' ,
	'method head' ,
	'method post' ,
	'method put' ,
	'method delete' ,
	'method trace' ,
	'method options' ,
	'method connect' ,
	'method patch' ,
	'method GET' ,
	'method HEAD' ,
	'method POST' ,
	'method PUT' ,
	'method DELETE' ,
	'method TRACE' ,
	'method OPTIONS' ,
	'method CONNECT' ,
	'method PATCH' ,
	'path ' , 'headers ' , 'auth ' , 'body ' , 'timeout ' ,
	'http://' ,
	'http://localhost' ,
	'https://' ,
	'https://localhost' ,
	'ws://' ,
	'ws://localhost' ,
	'Accept: ' ,
	'Accept-Charset: ' ,
	'Accept-Encoding: ' ,
	'Accept-Language: ' ,
	'Accept-Datetime: ' ,
	'Authorization: ' ,
	'Cache-Control: ' ,
	'Connection: ' ,
	'Content-Length: ' ,
	'Content-MD5: ' ,
	'Content-Type: ' ,
	'Content-Type: text/html' ,
	'Content-Type: application/json' ,
	'Content-Type: text/xml' ,
	'Content-Type: application/xml' ,
	'Cookie: ' ,
	'Date: ' ,
	'Expect: ' ,
	'From: ' ,
	'Host: ' ,
	'If-Match: ' ,
	'If-Modified-Since: ' ,
	'If-None-Match: ' ,
	'If-Range: ' ,
	'If-Unmodified-Since: ' ,
	'Max-Forwards: ' ,
	'Origin: ' ,
	'Pragma: ' ,
	'Proxy-Authorization: ' ,
	'Range: ' ,
	'Referer: ' ,
	'TE: ' ,
	'Upgrade: ' ,
	'User-Agent: ' ,
	'Via: ' ,
	'Warning: '
] ;



