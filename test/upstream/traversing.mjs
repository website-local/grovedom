// Adapted from Cheerio 1.2.0; see README.md and cheerio-LICENSE.
import { describe, it, expect, beforeEach } from '../upstream-support.mjs';
import { load } from '../upstream-support.mjs';
import { Cheerio } from '../upstream-support.mjs';
import { isText } from '../upstream-support.mjs';
import { food, fruits, eleven, text, mixedText, } from './fixtures.mjs';
function getText(el) {
    if (el.length === 0)
        return undefined;
    const [firstChild] = el[0].childNodes;
    return isText(firstChild) ? firstChild.data : undefined;
}
describe('$(...)', () => {
    let $;
    beforeEach(() => {
        $ = load(fruits);
    });
    describe('.children', () => {
        it('() : should get all children', () => {
            expect($('ul').children()).toHaveLength(3);
        });
        it('() : should skip text nodes', () => {
            expect($(mixedText).children()).toHaveLength(0);
        });
        it('() : should return children of all matched elements', () => {
            expect($('ul ul', food).children()).toHaveLength(5);
        });
        it('(selector) : should return children matching selector', () => {
            const { attribs } = $('ul').children('.orange')[0];
            expect(attribs).toHaveProperty('class', 'orange');
        });
        it('(invalid selector) : should return empty', () => {
            expect($('ul').children('.lulz')).toHaveLength(0);
        });
        it('should only match immediate children, not ancestors', () => {
            expect($(food).children('li')).toHaveLength(0);
        });
    });
    describe('.contents', () => {
        beforeEach(() => {
            $ = load(text);
        });
        it('() : should get all contents', () => {
            expect($('p').contents()).toHaveLength(5);
        });
        it('() : should skip text nodes', () => {
            expect($(mixedText).contents()).toHaveLength(2);
        });
        it('() : should include text nodes', () => {
            expect($('p').contents().first()[0].type).toBe('text');
        });
        it('() : should include comment nodes', () => {
            expect($('p').contents().last()[0].type).toBe('comment');
        });
    });
    describe('.next', () => {
        it('() : should return next element', () => {
            const { attribs } = $('.orange').next()[0];
            expect(attribs).toHaveProperty('class', 'pear');
        });
        it('() : should skip text nodes', () => {
            expect($(mixedText).next()[0]).toHaveProperty('name', 'b');
        });
        it('(no next) : should return empty for last child', () => {
            expect($('.pear').next()).toHaveLength(0);
        });
        it('(next on empty object) : should return empty', () => {
            expect($('.banana').next()).toHaveLength(0);
        });
        it('() : should operate over all elements in the selection', () => {
            expect($('.apple, .orange', food).next()).toHaveLength(2);
        });
        it('() : should return elements in order', () => {
            const result = load(eleven)('.red').next();
            expect(result).toHaveLength(2);
            expect(result.eq(0).text()).toBe('Six');
            expect(result.eq(1).text()).toBe('Ten');
        });
        it('should reject elements that violate the filter', () => {
            expect($('.apple').next('.non-existent')).toHaveLength(0);
        });
        it('should accept elements that satisfy the filter', () => {
            expect($('.apple').next('.orange')).toHaveLength(1);
        });
        describe('(selector) :', () => {
            it('should reject elements that violate the filter', () => {
                expect($('.apple').next('.non-existent')).toHaveLength(0);
            });
            it('should accept elements that satisfy the filter', () => {
                expect($('.apple').next('.orange')).toHaveLength(1);
            });
        });
    });
    describe('.nextAll', () => {
        it('() : should return all following siblings', () => {
            const elems = $('.apple').nextAll();
            expect(elems).toHaveLength(2);
            expect(elems[0].attribs).toHaveProperty('class', 'orange');
            expect(elems[1].attribs).toHaveProperty('class', 'pear');
        });
        it('(no next) : should return empty for last child', () => {
            expect($('.pear').nextAll()).toHaveLength(0);
        });
        it('(nextAll on empty object) : should return empty', () => {
            expect($('.banana').nextAll()).toHaveLength(0);
        });
        it('() : should operate over all elements in the selection', () => {
            expect($('.apple, .carrot', food).nextAll()).toHaveLength(3);
        });
        it('() : should not contain duplicate elements', () => {
            const elems = $('.apple, .orange', food);
            expect(elems.nextAll()).toHaveLength(2);
        });
        it('() : should not contain text elements', () => {
            const elems = $('.apple', fruits.replace(/></g, '>\n<'));
            expect(elems.nextAll()).toHaveLength(2);
        });
        describe('(selector) :', () => {
            it('should filter according to the provided selector', () => {
                expect($('.apple').nextAll('.pear')).toHaveLength(1);
            });
            it("should not consider siblings' contents when filtering", () => {
                expect($('#fruits', food).nextAll('li')).toHaveLength(0);
            });
        });
    });
    describe('.prev', () => {
        it('() : should return previous element', () => {
            const { attribs } = $('.orange').prev()[0];
            expect(attribs).toHaveProperty('class', 'apple');
        });
        it('() : should skip text nodes', () => {
            expect($($(mixedText)[2]).prev()[0]).toHaveProperty('name', 'a');
        });
        it('(no prev) : should return empty for first child', () => {
            expect($('.apple').prev()).toHaveLength(0);
        });
        it('(prev on empty object) : should return empty', () => {
            expect($('.banana').prev()).toHaveLength(0);
        });
        it('() : should operate over all elements in the selection', () => {
            expect($('.orange, .pear', food).prev()).toHaveLength(2);
        });
        it('() : should maintain elements order', () => {
            const sel = load(eleven)('.sel');
            expect(sel).toHaveLength(3);
            expect(sel.eq(0).text()).toBe('Three');
            expect(sel.eq(1).text()).toBe('Nine');
            expect(sel.eq(2).text()).toBe('Eleven');
            // Swap last elements
            const el = sel[2];
            sel[2] = sel[1];
            sel[1] = el;
            const result = sel.prev();
            expect(result).toHaveLength(3);
            expect(result.eq(0).text()).toBe('Two');
            expect(result.eq(1).text()).toBe('Ten');
            expect(result.eq(2).text()).toBe('Eight');
        });
        describe('(selector) :', () => {
            it('should reject elements that violate the filter', () => {
                expect($('.orange').prev('.non-existent')).toHaveLength(0);
            });
            it('should accept elements that satisfy the filter', () => {
                expect($('.orange').prev('.apple')).toHaveLength(1);
            });
            it('(selector) : should reject elements that violate the filter', () => {
                expect($('.orange').prev('.non-existent')).toHaveLength(0);
            });
            it('(selector) : should accept elements that satisfy the filter', () => {
                expect($('.orange').prev('.apple')).toHaveLength(1);
            });
        });
    });
    describe('.prevAll', () => {
        it('() : should return all preceding siblings', () => {
            const elems = $('.pear').prevAll();
            expect(elems).toHaveLength(2);
            expect(elems[0].attribs).toHaveProperty('class', 'orange');
            expect(elems[1].attribs).toHaveProperty('class', 'apple');
        });
        it('() : should not contain text elements', () => {
            const elems = $('.pear', fruits.replace(/></g, '>\n<'));
            expect(elems.prevAll()).toHaveLength(2);
        });
        it('(no prev) : should return empty for first child', () => {
            expect($('.apple').prevAll()).toHaveLength(0);
        });
        it('(prevAll on empty object) : should return empty', () => {
            expect($('.banana').prevAll()).toHaveLength(0);
        });
        it('() : should operate over all elements in the selection', () => {
            expect($('.orange, .sweetcorn', food).prevAll()).toHaveLength(2);
        });
        it('() : should not contain duplicate elements', () => {
            const elems = $('.orange, .pear', food);
            expect(elems.prevAll()).toHaveLength(2);
        });
        describe('(selector) :', () => {
            it('should filter returned elements', () => {
                const elems = $('.pear').prevAll('.apple');
                expect(elems).toHaveLength(1);
            });
            it("should not consider siblings's descendents", () => {
                const elems = $('#vegetables', food).prevAll('li');
                expect(elems).toHaveLength(0);
            });
        });
    });
    describe('.siblings', () => {
        it('() : should get all the siblings', () => {
            expect($('.orange').siblings()).toHaveLength(2);
            expect($('#fruits').siblings()).toHaveLength(0);
            expect($('.apple, .carrot', food).siblings()).toHaveLength(3);
        });
        it('(selector) : should get all siblings that match the selector', () => {
            expect($('.orange').siblings('.apple')).toHaveLength(1);
            expect($('.orange').siblings('.peach')).toHaveLength(0);
        });
        it.skip('(selector) : should throw an Error if given an invalid selector', () => {
            expect(() => {
                $('.orange').siblings(':bah');
            }).toThrow('Unknown pseudo-class :bah');
        });
        it('(selector) : does not consider the contents of siblings when filtering (GH-374)', () => {
            expect($('#fruits', food).siblings('li')).toHaveLength(0);
        });
        it('() : when two elements are siblings to each other they have to be included', () => {
            const result = load(eleven)('.sel').siblings();
            expect(result).toHaveLength(7);
            expect(result.eq(0).text()).toBe('One');
            expect(result.eq(1).text()).toBe('Two');
            expect(result.eq(2).text()).toBe('Four');
            expect(result.eq(3).text()).toBe('Eight');
            expect(result.eq(4).text()).toBe('Nine');
            expect(result.eq(5).text()).toBe('Ten');
            expect(result.eq(6).text()).toBe('Eleven');
        });
        it('(selector) : when two elements are siblings to each other they have to be included', () => {
            const result = load(eleven)('.sel').siblings('.red');
            expect(result).toHaveLength(2);
            expect(result.eq(0).text()).toBe('Four');
            expect(result.eq(1).text()).toBe('Nine');
        });
        it('(cheerio) : test filtering with cheerio object', () => {
            const doc = load(eleven);
            const result = doc('.sel').siblings(doc(':not([class])'));
            expect(result).toHaveLength(4);
            expect(result.eq(0).text()).toBe('One');
            expect(result.eq(1).text()).toBe('Two');
            expect(result.eq(2).text()).toBe('Eight');
            expect(result.eq(3).text()).toBe('Ten');
        });
    });
    describe('.parent', () => {
        it('() : should return the parent of each matched element', () => {
            let result = $('.orange').parent();
            expect(result).toHaveLength(1);
            expect(result[0].attribs).toHaveProperty('id', 'fruits');
            result = $('li', food).parent();
            expect(result).toHaveLength(2);
            expect(result[0].attribs).toHaveProperty('id', 'fruits');
            expect(result[1].attribs).toHaveProperty('id', 'vegetables');
        });
        it('(undefined) : should not throw an exception', () => {
            expect(() => {
                $('li').parent(undefined);
            }).not.toThrow();
        });
        it('() : should return an empty object for top-level elements', () => {
            const result = $('html').parent();
            expect(result).toHaveLength(0);
        });
        it('() : should not contain duplicate elements', () => {
            const result = $('li').parent();
            expect(result).toHaveLength(1);
        });
        it('(selector) : should filter the matched parent elements by the selector', () => {
            const parents = $('.orange').parent();
            expect(parents).toHaveLength(1);
            expect(parents[0].attribs).toHaveProperty('id', 'fruits');
            const fruits = $('li', food).parent('#fruits');
            expect(fruits).toHaveLength(1);
            expect(fruits[0].attribs).toHaveProperty('id', 'fruits');
        });
    });
    describe('.closest', () => {
        it('() : should return an empty array', () => {
            const result = $('.orange').closest();
            expect(result).toHaveLength(0);
            expect(result).toBeInstanceOf(Cheerio);
        });
        it('(selector) : should find the closest element that matches the selector, searching through its ancestors and itself', () => {
            expect($('.orange').closest('.apple')).toHaveLength(0);
            expect($('.orange', food).closest('#food')[0].attribs).toHaveProperty('id', 'food');
            expect($('.orange', food).closest('ul')[0].attribs).toHaveProperty('id', 'fruits');
            expect($('.orange', food).closest('li')[0].attribs).toHaveProperty('class', 'orange');
        });
        it('(selector) : should find the closest element of each item, removing duplicates', () => {
            const result = $('li', food).closest('ul');
            expect(result).toHaveLength(2);
        });
        it('() : should not break if the selector does not have any results', () => {
            const result = $('.saladbar', food).closest('ul');
            expect(result).toHaveLength(0);
        });
        it('(selector) : should find closest element for text nodes', () => {
            const textNode = $('.apple', food).contents().first();
            const result = textNode.closest('#food');
            expect(result[0].attribs).toHaveProperty('id', 'food');
        });
    });
    describe('.each', () => {
        it('( (i, elem) -> ) : should loop selected returning fn with (i, elem)', () => {
            const items = [];
            const classes = ['apple', 'orange', 'pear'];
            $('li').each(function (idx, elem) {
                items[idx] = elem;
                expect(this.attribs).toHaveProperty('class', classes[idx]);
            });
            expect(items[0].attribs).toHaveProperty('class', 'apple');
            expect(items[1].attribs).toHaveProperty('class', 'orange');
            expect(items[2].attribs).toHaveProperty('class', 'pear');
        });
        it('( (i, elem) -> ) : should break iteration when the iterator function returns false', () => {
            let iterationCount = 0;
            $('li').each((idx) => {
                iterationCount++;
                return idx < 1;
            });
            expect(iterationCount).toBe(2);
        });
    });
    if (typeof Symbol !== 'undefined') {
        describe('[Symbol.iterator]', () => {
            it('should yield each element', () => {
                // The equivalent of: for (const element of $('li')) ...
                const $li = $('li');
                const iterator = $li[Symbol.iterator]();
                expect(iterator.next().value.attribs).toHaveProperty('class', 'apple');
                expect(iterator.next().value.attribs).toHaveProperty('class', 'orange');
                expect(iterator.next().value.attribs).toHaveProperty('class', 'pear');
                expect(iterator.next().done).toBe(true);
            });
        });
    }
    describe('.map', () => {
        it('(fn) : should be invoked with the correct arguments and context', () => {
            const $fruits = $('li');
            const args = [];
            const thisVals = [];
            $fruits.map(function (...myArgs) {
                args.push(myArgs);
                thisVals.push(this);
                return undefined;
            });
            expect(args).toStrictEqual([
                [0, $fruits[0]],
                [1, $fruits[1]],
                [2, $fruits[2]],
            ]);
            expect(thisVals).toStrictEqual([$fruits[0], $fruits[1], $fruits[2]]);
        });
        it('(fn) : should return an Cheerio object wrapping the returned items', () => {
            const $fruits = $('li');
            const $mapped = $fruits.map((i) => $fruits[2 - i]);
            expect($mapped).toHaveLength(3);
            expect($mapped[0]).toBe($fruits[2]);
            expect($mapped[1]).toBe($fruits[1]);
            expect($mapped[2]).toBe($fruits[0]);
        });
        it('(fn) : should ignore `null` and `undefined` returned by iterator', () => {
            const $fruits = $('li');
            const retVals = [null, undefined, $fruits[1]];
            const $mapped = $fruits.map((i) => retVals[i]);
            expect($mapped).toHaveLength(1);
            expect($mapped[0]).toBe($fruits[1]);
        });
        it('(fn) : should perform a shallow merge on arrays returned by iterator', () => {
            const $fruits = $('li');
            const $mapped = $fruits.map(() => [1, [3, 4]]);
            expect($mapped.get()).toStrictEqual([1, [3, 4], 1, [3, 4], 1, [3, 4]]);
        });
        it('(fn) : should tolerate `null` and `undefined` when flattening arrays returned by iterator', () => {
            const $fruits = $('li');
            const $mapped = $fruits.map(() => [null, undefined]);
            expect($mapped.get()).toStrictEqual([
                null,
                undefined,
                null,
                undefined,
                null,
                undefined,
            ]);
        });
    });
    describe('.filter', () => {
        it('(selector) : should reduce the set of matched elements to those that match the selector', () => {
            const pear = $('li').filter('.pear').text();
            expect(pear).toBe('Pear');
        });
        it('(selector) : should not consider nested elements', () => {
            const lis = $('#fruits').filter('li');
            expect(lis).toHaveLength(0);
        });
        it('(selection) : should reduce the set of matched elements to those that are contained in the provided selection', () => {
            const $fruits = $('li');
            const $pear = $fruits.filter('.pear, .apple');
            expect($fruits.filter($pear)).toHaveLength(2);
        });
        it('(element) : should reduce the set of matched elements to those that specified directly', () => {
            const $fruits = $('li');
            const pear = $fruits.filter('.pear')[0];
            expect($fruits.filter(pear)).toHaveLength(1);
        });
        it("(fn) : should reduce the set of matched elements to those that pass the function's test", () => {
            const orange = $('li')
                .filter(function (i, el) {
                expect(this).toBe(el);
                expect(el.tagName).toBe('li');
                expect(typeof i).toBe('number');
                return $(this).attr('class') === 'orange';
            })
                .text();
            expect(orange).toBe('Orange');
        });
        it('should also iterate over text nodes (#1867)', () => {
            const text = $('<a>a</a>b<c></c>').filter((_, el) => isText(el));
            expect(text[0].data).toBe('b');
        });
    });
    describe('.not', () => {
        it('(selector) : should reduce the set of matched elements to those that do not match the selector', () => {
            const $fruits = $('li');
            const $notPear = $fruits.not('.pear');
            expect($notPear).toHaveLength(2);
            expect($notPear[0]).toBe($fruits[0]);
            expect($notPear[1]).toBe($fruits[1]);
        });
        it('(selector) : should not consider nested elements', () => {
            const lis = $('#fruits').not('li');
            expect(lis).toHaveLength(1);
        });
        it('(selection) : should reduce the set of matched elements to those that are not contained in the provided selection', () => {
            const $fruits = $('li');
            const $orange = $('.orange');
            const $notOrange = $fruits.not($orange);
            expect($notOrange).toHaveLength(2);
            expect($notOrange[0]).toBe($fruits[0]);
            expect($notOrange[1]).toBe($fruits[2]);
        });
        it('(element) : should reduce the set of matched elements to those that specified directly', () => {
            const $fruits = $('li');
            const apple = $('.apple')[0];
            const $notApple = $fruits.not(apple);
            expect($notApple).toHaveLength(2);
            expect($notApple[0]).toBe($fruits[1]);
            expect($notApple[1]).toBe($fruits[2]);
        });
        it("(fn) : should reduce the set of matched elements to those that do not pass the function's test", () => {
            const $fruits = $('li');
            const $notOrange = $fruits.not(function (i, el) {
                expect(this).toBe(el);
                expect(el).toHaveProperty('name', 'li');
                expect(typeof i).toBe('number');
                return $(this).attr('class') === 'orange';
            });
            expect($notOrange).toHaveLength(2);
            expect($notOrange[0]).toBe($fruits[0]);
            expect($notOrange[1]).toBe($fruits[2]);
        });
    });
    describe('.has', () => {
        beforeEach(() => {
            $ = load(food);
        });
        it('(selector) : should reduce the set of matched elements to those with descendants that match the selector', () => {
            const $fruits = $('#fruits,#vegetables').has('.pear');
            expect($fruits).toHaveLength(1);
            expect($fruits[0]).toBe($('#fruits')[0]);
        });
        it('(selector) : should only consider nested elements', () => {
            const $empty = $('#fruits').has('#fruits');
            expect($empty).toHaveLength(0);
        });
        it('(element) : should reduce the set of matched elements to those that are ancestors of the provided element', () => {
            const $fruits = $('#fruits,#vegetables').has($('.pear')[0]);
            expect($fruits).toHaveLength(1);
            expect($fruits[0]).toBe($('#fruits')[0]);
        });
        it('(element) : should only consider nested elements', () => {
            const $fruits = $('#fruits');
            const fruitsEl = $fruits[0];
            const $empty = $fruits.has(fruitsEl);
            expect($empty).toHaveLength(0);
        });
    });
    describe('.first', () => {
        it('() : should return the first item', () => {
            const $src = $('<span>foo</span><span>bar</span><span>baz</span>');
            const $elem = $src.first();
            expect($elem.length).toBe(1);
            expect($elem[0].childNodes[0]).toHaveProperty('data', 'foo');
        });
        it('() : should return an empty object for an empty object', () => {
            const $src = $();
            const $first = $src.first();
            expect($first.length).toBe(0);
            expect($first[0]).toBeUndefined();
        });
    });
    describe('.last', () => {
        it('() : should return the last element', () => {
            const $src = $('<span>foo</span><span>bar</span><span>baz</span>');
            const $elem = $src.last();
            expect($elem.length).toBe(1);
            expect($elem[0].childNodes[0]).toHaveProperty('data', 'baz');
        });
        it('() : should return an empty object for an empty object', () => {
            const $src = $();
            const $last = $src.last();
            expect($last.length).toBe(0);
            expect($last[0]).toBeUndefined();
        });
    });
    describe('.eq', () => {
        it('(i) : should return the element at the specified index', () => {
            expect(getText($('li').eq(0))).toBe('Apple');
            expect(getText($('li').eq(1))).toBe('Orange');
            expect(getText($('li').eq(2))).toBe('Pear');
            expect(getText($('li').eq(3))).toBeUndefined();
            expect(getText($('li').eq(-1))).toBe('Pear');
        });
    });
    describe('.get', () => {
        it('(i) : should return the element at the specified index', () => {
            const children = $('#fruits').children();
            expect(children.get(0)).toBe(children[0]);
            expect(children.get(1)).toBe(children[1]);
            expect(children.get(2)).toBe(children[2]);
        });
        it('(-1) : should return the element indexed from the end of the collection', () => {
            const children = $('#fruits').children();
            expect(children.get(-1)).toBe(children[2]);
            expect(children.get(-2)).toBe(children[1]);
            expect(children.get(-3)).toBe(children[0]);
        });
        it('() : should return an array containing all of the collection', () => {
            const children = $('#fruits').children();
            const all = children.get();
            expect(Array.isArray(all)).toBe(true);
            expect(all).toStrictEqual([children[0], children[1], children[2]]);
        });
    });
    describe('.index', () => {
        describe('() :', () => {
            it('returns the index of a child amongst its siblings', () => {
                expect($('.orange').index()).toBe(1);
            });
            it('returns -1 when the selection has no parent', () => {
                expect($('<div/>').index()).toBe(-1);
            });
        });
        describe('(selector) :', () => {
            it('returns the index of the first element in the set matched by `selector`', () => {
                expect($('.apple').index('#fruits, li')).toBe(1);
            });
            it('returns -1 when the item is not present in the set matched by `selector`', () => {
                expect($('.apple').index('#fuits')).toBe(-1);
            });
            it('returns -1 when the first element in the set has no parent', () => {
                expect($('<div/>').index('*')).toBe(-1);
            });
        });
        describe('(node) :', () => {
            it('returns the index of the given node within the current selection', () => {
                const $lis = $('li');
                expect($lis.index($lis.get(1))).toBe(1);
            });
            it('returns the index of the given node within the current selection when the current selection has no parent', () => {
                const $apple = $('.apple').remove();
                expect($apple.index($apple.get(0))).toBe(0);
            });
            it('returns -1 when the given node is not present in the current selection', () => {
                expect($('li').index($('#fruits').get(0))).toBe(-1);
            });
            it('returns -1 when the current selection is empty', () => {
                expect($('.not-fruit').index($('#fruits').get(0))).toBe(-1);
            });
        });
        describe('(selection) :', () => {
            it('returns the index of the first node in the provided selection within the current selection', () => {
                const $lis = $('li');
                expect($lis.index($('.orange, .pear'))).toBe(1);
            });
            it('returns -1 when the given node is not present in the current selection', () => {
                expect($('li').index($('#fruits'))).toBe(-1);
            });
            it('returns -1 when the current selection is empty', () => {
                expect($('.not-fruit').index($('#fruits'))).toBe(-1);
            });
        });
    });
    describe('.slice', () => {
        it('(start) : should return all elements after the given index', () => {
            const sliced = $('li').slice(1);
            expect(sliced).toHaveLength(2);
            expect(getText(sliced.eq(0))).toBe('Orange');
            expect(getText(sliced.eq(1))).toBe('Pear');
        });
        it('(start, end) : should return all elements matching the given range', () => {
            const sliced = $('li').slice(1, 2);
            expect(sliced).toHaveLength(1);
            expect(getText(sliced.eq(0))).toBe('Orange');
        });
        it('(-start) : should return element matching the offset from the end', () => {
            const sliced = $('li').slice(-1);
            expect(sliced).toHaveLength(1);
            expect(getText(sliced.eq(0))).toBe('Pear');
        });
    });
    describe('.end() :', () => {
        let $fruits;
        beforeEach(() => {
            $fruits = $('#fruits').children();
        });
        it('returns an empty object at the end of the chain', () => {
            expect($fruits.end().end().end()).toBeTruthy();
            expect($fruits.end().end().end()).toHaveLength(0);
        });
        it('find', () => {
            expect($fruits.find('.apple').end()).toBe($fruits);
        });
        it('filter', () => {
            expect($fruits.filter('.apple').end()).toBe($fruits);
        });
        it('map', () => {
            expect($fruits
                .map(function () {
                return this;
            })
                .end()).toBe($fruits);
        });
        it('contents', () => {
            expect($fruits.contents().end()).toBe($fruits);
        });
        it('eq', () => {
            expect($fruits.eq(1).end()).toBe($fruits);
        });
        it('first', () => {
            expect($fruits.first().end()).toBe($fruits);
        });
        it('last', () => {
            expect($fruits.last().end()).toBe($fruits);
        });
        it('slice', () => {
            expect($fruits.slice(1).end()).toBe($fruits);
        });
        it('children', () => {
            expect($fruits.children().end()).toBe($fruits);
        });
        it('parent', () => {
            expect($fruits.parent().end()).toBe($fruits);
        });
        it('parents', () => {
            expect($fruits.parents().end()).toBe($fruits);
        });
        it('closest', () => {
            expect($fruits.closest('ul').end()).toBe($fruits);
        });
        it('siblings', () => {
            expect($fruits.siblings().end()).toBe($fruits);
        });
        it('next', () => {
            expect($fruits.next().end()).toBe($fruits);
        });
        it('nextAll', () => {
            expect($fruits.nextAll().end()).toBe($fruits);
        });
        it('prev', () => {
            expect($fruits.prev().end()).toBe($fruits);
        });
        it('prevAll', () => {
            expect($fruits.prevAll().end()).toBe($fruits);
        });
        it('clone', () => {
            expect($fruits.clone().end()).toBe($fruits);
        });
    });
});
