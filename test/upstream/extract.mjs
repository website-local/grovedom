// Adapted from Cheerio 1.2.0; see README.md and cheerio-LICENSE.
import { describe, it, expect } from '../upstream-support.mjs';
import * as fixtures from './fixtures.mjs';
import { load } from '../upstream-support.mjs';
describe('$.extract', () => {
    it('should return an empty object when no selectors are provided', () => {
        const $ = load(fixtures.eleven);
        const $root = $.root();
        const emptyExtract = $root.extract({});
        expect(emptyExtract).toStrictEqual({});
    });
    it('should return undefined for selectors that do not match any elements', () => {
        const $ = load(fixtures.eleven);
        const $root = $.root();
        const simpleExtract = $root.extract({ foo: 'bar' });
        expect(simpleExtract).toStrictEqual({ foo: undefined });
    });
    it('should extract values for existing selectors', () => {
        const $ = load(fixtures.eleven);
        const $root = $.root();
        expect($root.extract({ red: '.red' })).toStrictEqual({ red: 'Four' });
        expect($root.extract({ red: '.red', sel: '.sel' })).toStrictEqual({
            red: 'Four',
            sel: 'Three',
        });
    });
    it('should extract values using descriptor objects', () => {
        const $ = load(fixtures.eleven);
        const $root = $.root();
        expect($root.extract({
            red: { selector: '.red' },
            sel: { selector: '.sel' },
        })).toStrictEqual({ red: 'Four', sel: 'Three' });
    });
    it('should extract multiple values for selectors', () => {
        const $ = load(fixtures.eleven);
        const $root = $.root();
        const multipleExtract = $root.extract({
            red: ['.red'],
            sel: ['.sel'],
        });
        expect(multipleExtract).toStrictEqual({
            red: ['Four', 'Five', 'Nine'],
            sel: ['Three', 'Nine', 'Eleven'],
        });
    });
    it('should extract custom properties specified by the user', () => {
        const $ = load(fixtures.eleven);
        const $root = $.root();
        expect($root.extract({
            red: { selector: '.red', value: 'outerHTML' },
            sel: { selector: '.sel', value: 'tagName' },
        })).toStrictEqual({ red: '<li class="red">Four</li>', sel: 'LI' });
    });
    it('should extract multiple custom properties for selectors', () => {
        const $ = load(fixtures.eleven);
        const $root = $.root();
        expect($root.extract({
            red: [{ selector: '.red', value: 'outerHTML' }],
        })).toStrictEqual({
            red: [
                '<li class="red">Four</li>',
                '<li class="red">Five</li>',
                '<li class="red sel">Nine</li>',
            ],
        });
    });
    it('should extract values using custom extraction functions', () => {
        const $ = load(fixtures.eleven);
        const $root = $.root();
        expect($root.extract({
            red: {
                selector: '.red',
                value: (el, key) => `${key}=${$(el).text()}`,
            },
        })).toStrictEqual({ red: 'red=Four' });
    });
    it('should correctly type check custom extraction functions returning non-string values', () => {
        const $ = load(fixtures.eleven);
        const $root = $.root();
        expect($root.extract({
            red: {
                selector: '.red',
                value: (el) => $(el).text().length,
            },
        })).toStrictEqual({ red: 4 });
    });
    it('should extract multiple values using custom extraction functions', () => {
        const $ = load(fixtures.eleven);
        const $root = $.root();
        expect($root.extract({
            red: [
                {
                    selector: '.red',
                    value: (el, key) => `${key}=${$(el).text()}`,
                },
            ],
        })).toStrictEqual({ red: ['red=Four', 'red=Five', 'red=Nine'] });
    });
    it('should extract nested objects based on selectors', () => {
        const $ = load(fixtures.eleven);
        const $root = $.root();
        const subExtractObject = $root.extract({
            section: {
                selector: 'ul:nth(1)',
                value: {
                    red: '.red',
                    sel: '.blue',
                },
            },
        });
        expect(subExtractObject).toStrictEqual({
            section: {
                red: 'Five',
                sel: 'Seven',
            },
        });
    });
    it('should correctly type check nested objects returning non-string values', () => {
        const $ = load(fixtures.eleven);
        const $root = $.root();
        expect($root.extract({
            section: {
                selector: 'ul:nth(1)',
                value: {
                    red: {
                        selector: '.red',
                        value: (el) => $(el).text().length,
                    },
                },
            },
        })).toStrictEqual({
            section: {
                red: 4,
            },
        });
    });
    it('should handle missing href properties without errors (#4239)', () => {
        const $ = load(fixtures.eleven);
        expect($.extract({ links: [{ selector: 'li', value: 'href' }] })).toStrictEqual({ links: [] });
    });
});
