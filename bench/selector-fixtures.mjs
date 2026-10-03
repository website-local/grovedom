// Deliberately dense/sparse selector diagnostic. Consumer replay establishes
// workload speed; this isolates the cases a rejection filter can help or hurt.
export function page(rows, dense = false) {
  return '<!doctype html><main>' + Array.from({ length: rows }, (_, i) =>
    `<article class="${dense ? 'hit' : 'ordinary'} item"><span>${i}</span></article>`).join('') + '</main>';
}
export function replay(load, source) {
  const $ = load(source);
  try {
    let count = 0;
    for (let i = 0; i < 32; i++) count += $('.hit, .missing-one, .missing-two, .missing-three, .missing-four, .missing-five, .missing-six, .missing-seven').length;
    return String(count);
  } finally { $.dispose?.(); }
}
