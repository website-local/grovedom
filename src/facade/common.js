export const empty = new Uint32Array();
export const boolAttributes = new Set('autofocus autoplay async checked controls defer disabled hidden ismap loop multiple open readonly required scoped selected'.split(' '));
export function unsupported(message) {
    const error = new Error(message);
    error.code = 'ERR_GROVEDOM_UNSUPPORTED';
    throw error;
}
export function alive(state) {
    if (state.closed) {
        const error = new Error('Document has been disposed');
        error.code = 'ERR_GROVEDOM_DISPOSED';
        throw error;
    }
}
