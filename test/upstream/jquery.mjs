// Adapted from jQuery 3.7.1; see README.md and jquery-LICENSE.
import { QUnit, fixtureCheerio as jQuery } from "../upstream-support.mjs";
QUnit.skip( "attr(non-ASCII)", function( assert ) {
	assert.expect( 2 );

	var $div = jQuery( "<div Ω='omega' aØc='alpha'></div>" ).appendTo( "#qunit-fixture" );

	assert.equal( $div.attr( "Ω" ), "omega", ".attr() exclusively lowercases characters in the range A-Z (gh-2730)" );
	assert.equal( $div.attr( "AØC" ), "alpha", ".attr() exclusively lowercases characters in the range A-Z (gh-2730)" );
} );

QUnit.test( "removeAttr(Multi String, variable space width)", function( assert ) {
	assert.expect( 8 );

	var div = jQuery( "<div id='a' alt='b' title='c' rel='d'></div>" ),
		tests = {
			id: "a",
			alt: "b",
			title: "c",
			rel: "d"
		};

	jQuery.each( tests, function( key, val ) {
		assert.equal( div.attr( key ), val, "Attribute `" + key + "` exists, and has a value of `" + val + "`" );
	} );

	div.removeAttr( "id   alt title  rel  " );

	jQuery.each( tests, function( key ) {
		assert.equal( div.attr( key ), undefined, "Attribute `" + key + "` was removed" );
	} );
} );

QUnit.test( "removeClass() removes duplicates", function( assert ) {
	assert.expect( 1 );

	var $div = jQuery( jQuery.parseHTML( "<div class='x x x'></div>" ) );

	$div.removeClass( "x" );

	assert.ok( !$div.hasClass( "x" ), "Element with multiple same classes does not escape the wrath of removeClass()" );
} );

QUnit.test( "removeClass(undefined) is a no-op", function( assert ) {
	assert.expect( 1 );

	var $div = jQuery( "<div class='base second'></div>" );
	$div.removeClass( undefined );

	assert.ok( $div.hasClass( "base" ) && $div.hasClass( "second" ), "Element still has classes after removeClass(undefined)" );
} );

QUnit.skip( "addClass, removeClass, hasClass on elements with classes with non-HTML whitespace (gh-3072, gh-3003)", function( assert ) {
	assert.expect( 9 );

	var $elem = jQuery( "<div class='&#xA0;test'></div>" );

	function testMatches() {
		assert.ok( $elem.is( ".\\A0 test" ), "Element matches with collapsed space" );
		assert.ok( $elem.is( ".\\A0test" ), "Element matches with non-breaking space" );
		assert.ok( $elem.hasClass( "\xA0test" ), "Element has class with non-breaking space" );
	}

	testMatches();
	$elem.addClass( "foo" );
	testMatches();
	$elem.removeClass( "foo" );
	testMatches();
} );

QUnit.test( "contents().hasClass() returns correct values", function( assert ) {
	assert.expect( 2 );

	var $div = jQuery( "<div><span class='foo'></span><!-- comment -->text</div>" ),
	$contents = $div.contents();

	assert.ok( $contents.hasClass( "foo" ), "Found 'foo' in $contents" );
	assert.ok( !$contents.hasClass( "undefined" ), "Did not find 'undefined' in $contents (correctly)" );
} );

QUnit.test( "hasClass correctly interprets non-space separators (trac-13835)", function( assert ) {
	assert.expect( 4 );

	var
		map = {
			tab: "&#9;",
			"line-feed": "&#10;",
			"form-feed": "&#12;",
			"carriage-return": "&#13;"
		},
		classes = jQuery.map( map, function( separator, label ) {
			return " " + separator + label + separator + " ";
		} ),
		$div = jQuery( "<div class='" + classes + "'></div>" );

	jQuery.each( map, function( label ) {
		assert.ok( $div.hasClass( label ), label.replace( "-", " " ) );
	} );
} );

QUnit.test( "coords returns correct values in IE6/IE7, see trac-10828", function( assert ) {
	assert.expect( 1 );

	var area,
		map = jQuery( "<map></map>" );

	area = map.html( "<area shape='rect' coords='0,0,0,0' href='#' alt='a'></area>" ).find( "area" );
	assert.equal( area.attr( "coords" ), "0,0,0,0", "did not retrieve coords correctly" );
} );

QUnit.test( "should not throw at $(option).val() (trac-14686)", function( assert ) {
	assert.expect( 1 );

	try {
		jQuery( "<option></option>" ).val();
		assert.ok( true );
	} catch ( _ ) {
		assert.ok( false );
	}
} );

QUnit.test( "append to multiple elements (trac-8070)", function( assert ) {

	assert.expect( 2 );

	var selects = jQuery( "<select class='test8070'></select><select class='test8070'></select>" ).appendTo( "#qunit-fixture" );
	selects.append( "<OPTION>1</OPTION><OPTION>2</OPTION>" );

	assert.equal( selects[ 0 ].childNodes.length, 2, "First select got two nodes" );
	assert.equal( selects[ 1 ].childNodes.length, 2, "Second select got two nodes" );
} );

QUnit.skip( "html() on empty set", function( assert ) {

	assert.expect( 1 );

	assert.strictEqual( jQuery().html(), undefined, ".html() returns undefined for empty sets (trac-11962)" );
} );

QUnit.test( "manipulate mixed jQuery and text (trac-12384, trac-12346)", function( assert ) {

	assert.expect( 2 );

	var div = jQuery( "<div>a</div>" ).append( "&nbsp;", jQuery( "<span>b</span>" ), "&nbsp;", jQuery( "<span>c</span>" ) ),
		nbsp = String.fromCharCode( 160 );

	assert.equal( div.text(), "a" + nbsp + "b" + nbsp + "c", "Appending mixed jQuery with text nodes" );

	div = jQuery( "<div><div></div></div>" )
		.find( "div" )
		.after( "<p>a</p>", "<p>b</p>" )
		.parent();
	assert.equal( div.find( "*" ).length, 3, "added 2 paragraphs after inner div" );
} );

QUnit.test( "Index for function argument should be received (trac-13094)", function( assert ) {
	assert.expect( 2 );

	var i = 0;

	jQuery( "<div></div><div></div>" ).before( function( index ) {
		assert.equal( index, i++, "Index should be correct" );
	} );

} );
