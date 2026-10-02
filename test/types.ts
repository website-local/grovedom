import { load, type FilterFunction, type NodeHandle, type SelectorType } from 'grovedom';
const $ = load('<p>Hello</p>', { scriptingEnabled: true });
const selector: SelectorType = 'p';
const filter: FilterFunction<NodeHandle> = function (i, node) { return this === node && i === 0; };
const text: string = $(selector).filter(filter).text();
$(selector).attr('title', function (i, old) { return `${this.name} ${i} ${old}`; }).text(text);
$(selector).each(function (i, node) { $(node).attr('data-i', i); });
const first = $(selector)[0];
if (first) $(first).html('<b>x</b>');
const children: NodeHandle[] | undefined = first?.children;
// @ts-expect-error XML mode is not implemented.
load('<x/>', { xmlMode: true });
$(selector).wrap('<div/>');
$(selector).prop('tagName', 'div');
const names: (string | undefined)[] = $('p').map((i, node) => node.name).get();
$('p').map((i, node) => node).attr('title', 'mapped');
const extracted: { labels: string[] } = $.extract({ labels: ['p'] });
const scores: { scores: number[] } = $.extract({ scores: [{ selector: 'p', value: node => $(node).text().length }] });
$('input').val('x').data('saved', true).css('color', 'red');
// @ts-expect-error Handles are not mutable domhandler trees.
if (first) first.parent = null;
$.dispose();
