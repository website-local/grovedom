import { unsupported } from './common.js';
export function xmlFlags(options) {
    const value = typeof options.xml === 'object' && options.xml !== null ? options.xml : {};
    let flags = 1;
    for (const key of Object.keys(value)) {
        if (!['decodeEntities', 'lowerCaseTags', 'lowerCaseAttributeNames', 'selfClosingTags', 'emptyAttrs', 'encodeEntities', 'xmlMode', 'recognizeSelfClosing', 'recognizeCDATA'].includes(key))
            unsupported(`Unsupported XML option: ${key}`);
        if (key !== 'encodeEntities' && typeof value[key] !== 'boolean')
            throw new TypeError(`Expected XML ${key} boolean`);
    }
    if (value.xmlMode === false)
        unsupported('The htmlparser2 HTML parser mode is not supported.');
    if (value.decodeEntities === false)
        flags = 16;
    if (value.lowerCaseTags)
        flags |= 2;
    if (value.lowerCaseAttributeNames)
        flags |= 4;
    if (value.selfClosingTags === false)
        flags |= 8;
    if (value.encodeEntities !== undefined) {
        if (![true, false, 'utf8'].includes(value.encodeEntities))
            throw new TypeError('Expected encodeEntities boolean or utf8');
        flags &= ~16;
        if (value.encodeEntities === false)
            flags |= 16;
    }
    return flags;
}
export function serializerOptions(state, options) {
    if (!options || typeof options !== 'object' || Array.isArray(options))
        throw new TypeError('Expected serializer options');
    const flat = { ...options };
    if (flat.xml && typeof flat.xml === 'object')
        Object.assign(flat, flat.xml);
    for (const key of Object.keys(flat)) {
        if (!['xml', 'xmlMode', 'decodeEntities', 'encodeEntities', 'selfClosingTags', 'emptyAttrs'].includes(key))
            unsupported(`Unsupported serializer option: ${key}`);
        if (key === 'xml') {
            if (typeof flat.xml !== 'boolean' && (!flat.xml || typeof flat.xml !== 'object' || Array.isArray(flat.xml)))
                throw new TypeError('Expected xml boolean or serializer options');
        }
        else if (key === 'encodeEntities') {
            if (![true, false, 'utf8'].includes(flat[key]))
                throw new TypeError('Expected encodeEntities boolean or utf8');
        }
        else if (typeof flat[key] !== 'boolean')
            throw new TypeError(`Expected ${key} boolean`);
    }
    if (!state.xml && !flat.xml && !flat.xmlMode)
        return null;
    delete flat.xml;
    delete flat.xmlMode;
    // Cheerio retains its nested xml options when applying top-level render
    // options. A new xml object (or boolean) replaces that nested precedence.
    return xmlFlags({ xml: { ...state.serialization, ...flat, ...(options.xml === undefined ? state.serialization : typeof options.xml === 'object' ? options.xml : {}) } }) & 24;
}
