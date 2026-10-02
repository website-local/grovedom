// Adapted from jQuery 3.7.1; see README.md and jquery-LICENSE.
import { QUnit, fixtureCheerio as jQuery } from "../upstream-support.mjs";
QUnit.skip( "attr(non-ASCII)", function( assert ) {
	assert.expect( 2 );

	var $div = jQuery( "<div Ω='omega' aØc='alpha'></div>" ).appendTo( "#qunit-fixture" );

	assert.equal( $div.attr( "Ω" ), "omega", ".attr() exclusively lowercases characters in the range A-Z (gh-2730)" );
	assert.equal( $div.attr( "AØC" ), "alpha", ".attr() exclusively lowercases characters in the range A-Z (gh-2730)" );
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

QUnit.test( "contents().hasClass() returns correct values", function( assert ) {
	assert.expect( 2 );

	var $div = jQuery( "<div><span class='foo'></span><!-- comment -->text</div>" ),
	$contents = $div.contents();

	assert.ok( $contents.hasClass( "foo" ), "Found 'foo' in $contents" );
	assert.ok( !$contents.hasClass( "undefined" ), "Did not find 'undefined' in $contents (correctly)" );
} );
