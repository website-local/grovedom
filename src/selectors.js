// Cheerio aliases are expanded once per cached selector. Ordinary CSS stays on
// the kernel path; no JS DOM mirror or per-node callbacks are introduced.
const selected = 'option:is([selected],select:not([multiple]):not(:has(>option[selected]))>:first-of-type)';
const disabled = ':is(:is(button,input,select,textarea,optgroup,option)[disabled],optgroup[disabled]>option,fieldset[disabled]:not(fieldset[disabled] legend:first-of-type *))';
const aliases = {
    input: ':is(input,textarea,select,button)', header: ':is(h1,h2,h3,h4,h5,h6)',
    button: ':is(button,input[type=button])', text: ':is(input:not([type]),input[type=""],input[type=text])',
    parent: ':not(:empty)',
    selected: `:is(${selected})`,
    checked: `:is(:is(input[type=radio],input[type=checkbox])[checked],${selected})`,
    disabled, enabled: `:not(${disabled})`,
    'any-link': ':is(a,area,link)[href]', link: ':is(a,area,link)[href]',
    // css-select has no dynamic state adapter in Cheerio.
    active: ':not(*)', hover: ':not(*)', visited: ':not(*)',
    checkbox: '[type=checkbox]', radio: '[type=radio]', file: '[type=file]',
    password: '[type=password]', reset: '[type=reset]', image: '[type=image]', submit: '[type=submit]',
};
export function expandSelector(selector) {
    let output = '', start = 0, quote = '', bracket = 0;
    for (let i = 0; i < selector.length; i++) {
        const ch = selector[i];
        if (ch === '\\') {
            i++;
            continue;
        }
        if (quote) {
            if (ch === quote)
                quote = '';
            continue;
        }
        if (ch === '"' || ch === "'") {
            quote = ch;
            continue;
        }
        if (ch === '[')
            bracket++;
        else if (ch === ']')
            bracket--;
        if (bracket || ch !== ':' || selector[i - 1] === ':')
            continue;
        const match = /^[a-z-]+/i.exec(selector.slice(i + 1));
        if (!match)
            continue;
        const name = match[0].toLowerCase(), end = i + 1 + match[0].length;
        if (name === 'contains' && selector[end] === '(') {
            let depth = 1, quoted = '', j = end + 1;
            for (; j < selector.length; j++) {
                const c = selector[j];
                if (c === '\\') {
                    j++;
                    continue;
                }
                if (quoted) {
                    if (c === quoted)
                        quoted = '';
                    continue;
                }
                if (c === '"' || c === "'")
                    quoted = c;
                else if (c === '(')
                    depth++;
                else if (c === ')' && --depth === 0)
                    break;
            }
            if (depth)
                throw new Error('Unclosed :contains argument');
            let value = selector.slice(end + 1, j);
            if (!((value[0] === '"' || value[0] === "'") && value.at(-1) === value[0]))
                value = '"' + value.replace(/(?<!\\)"/g, '\\"').replace(/\n/g, '\\a ') + '"';
            output += selector.slice(start, i) + ':lexbor-contains(' + value + ')';
            start = j + 1;
            i = j;
        }
        else if (Object.hasOwn(aliases, name) && selector[end] !== '(') {
            output += selector.slice(start, i) + aliases[name];
            start = end;
            i = end - 1;
        }
    }
    return output ? output + selector.slice(start) : selector;
}
