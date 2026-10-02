// Adapted from Cheerio 1.2.0; see README.md and cheerio-LICENSE.
import { describe, it, expect, beforeEach } from '../upstream-support.mjs';
import { cheerio, food } from './fixtures.mjs';
describe('cheerio', () => {
    describe('.merge', () => {
        const $ = cheerio.load('');
        it('should be a function', () => {
            expect(typeof $.merge).toBe('function');
        });
        it('(arraylike, arraylike) : should modify the first array, but not the second', () => {
            const arr1 = [1, 2, 3];
            const arr2 = [4, 5, 6];
            const ret = $.merge(arr1, arr2);
            expect(typeof ret).toBe('object');
            expect(Array.isArray(ret)).toBe(true);
            expect(ret).toBe(arr1);
            expect(arr1).toHaveLength(6);
            expect(arr2).toHaveLength(3);
        });
        it('(arraylike, arraylike) : should handle objects that arent arrays, but are arraylike', () => {
            const arr1 = {
                length: 3,
                0: 'a',
                1: 'b',
                2: 'c',
            };
            const arr2 = {
                length: 3,
                0: 'd',
                1: 'e',
                2: 'f',
            };
            $.merge(arr1, arr2);
            expect(arr1).toHaveLength(6);
            expect(arr1[3]).toBe('d');
            expect(arr1[4]).toBe('e');
            expect(arr1[5]).toBe('f');
            expect(arr2).toHaveLength(3);
        });
        it('(?, ?) : should gracefully reject invalid inputs', () => {
            expect($.merge([4], 3)).toBeFalsy();
            expect($.merge({}, {})).toBeFalsy();
            expect($.merge([], {})).toBeFalsy();
            expect($.merge({}, [])).toBeFalsy();
            const fakeArray1 = { length: 3, 0: 'a', 1: 'b', 3: 'd' };
            expect($.merge(fakeArray1, [])).toBeFalsy();
            expect($.merge([], fakeArray1)).toBeFalsy();
            expect($.merge({ length: '7' }, [])).toBeFalsy();
            expect($.merge({ length: -1 }, [])).toBeFalsy();
        });
        it('(?, ?) : should no-op on invalid inputs', () => {
            const fakeArray1 = { length: 3, 0: 'a', 1: 'b', 3: 'd' };
            $.merge(fakeArray1, []);
            expect(fakeArray1).toHaveLength(3);
            expect(fakeArray1[0]).toBe('a');
            expect(fakeArray1[1]).toBe('b');
            expect(fakeArray1[3]).toBe('d');
            $.merge([], fakeArray1);
            expect(fakeArray1).toHaveLength(3);
            expect(fakeArray1[0]).toBe('a');
            expect(fakeArray1[1]).toBe('b');
            expect(fakeArray1[3]).toBe('d');
        });
    });
    describe('.contains', () => {
        let $;
        beforeEach(() => {
            $ = cheerio.load(food);
        });
        it('(container, contained) : should correctly detect the provided element', () => {
            const $food = $('#food');
            const $fruits = $('#fruits');
            const $apple = $('.apple');
            expect($.contains($food[0], $fruits[0])).toBe(true);
            expect($.contains($food[0], $apple[0])).toBe(true);
        });
        it('(container, other) : should not detect elements that are not contained', () => {
            const $fruits = $('#fruits');
            const $vegetables = $('#vegetables');
            const $apple = $('.apple');
            expect($.contains($vegetables[0], $apple[0])).toBe(false);
            expect($.contains($fruits[0], $vegetables[0])).toBe(false);
            expect($.contains($vegetables[0], $fruits[0])).toBe(false);
            expect($.contains($fruits[0], $fruits[0])).toBe(false);
            expect($.contains($vegetables[0], $vegetables[0])).toBe(false);
        });
    });
});
