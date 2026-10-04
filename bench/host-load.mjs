import fs from 'node:fs';
const list = s => s.trim().split(',').flatMap(p => { const [a, b = a] = p.split('-').map(Number); return Array.from({ length: b - a + 1 }, (_, i) => a + i); });
const allowed = list(fs.readFileSync('/proc/self/status', 'utf8').match(/^Cpus_allowed_list:\s*(.+)$/m)[1]);
const siblings = new Map(allowed.map(cpu => { try {
    return [cpu, list(fs.readFileSync(`/sys/devices/system/cpu/cpu${cpu}/topology/thread_siblings_list`, 'utf8'))];
}
catch {
    return [cpu, [cpu]];
} }));
const sample = () => new Map(fs.readFileSync('/proc/stat', 'utf8').split('\n').filter(l => /^cpu\d+\s/.test(l)).map(l => { const [k, ...v] = l.trim().split(/\s+/), n = v.map(Number); return [Number(k.slice(3)), { total: n.slice(0, 8).reduce((a, b) => a + b, 0), idle: n[3] + n[4] }]; }));
const optional = f => { try {
    return fs.readFileSync(f, 'utf8').trim();
}
catch {
    return null;
} };
export async function checkHost() {
    const attempts = [];
    for (let attempt = 0; attempt < 3; attempt++) {
        const before = sample();
        await new Promise(r => setTimeout(r, 1000));
        const after = sample(), busy = new Map();
        for (const [cpu, b] of before) {
            const a = after.get(cpu);
            if (a && a.total > b.total)
                busy.set(cpu, Math.max(0, 1 - (a.idle - b.idle) / (a.total - b.total)));
        }
        const ranks = allowed.filter(cpu => busy.has(cpu)).map(cpu => { const group = siblings.get(cpu).filter(n => busy.has(n)), loads = group.map(n => busy.get(n)); return { cpu, siblings: group, cpuBusy: busy.get(cpu), siblingMax: Math.max(...loads), siblingMean: loads.reduce((a, b) => a + b, 0) / loads.length }; }).sort((a, b) => a.siblingMax - b.siblingMax || a.siblingMean - b.siblingMean || a.cpuBusy - b.cpuBusy || a.cpu - b.cpu);
        if (!ranks.length)
            throw Error('No permitted CPU with a valid load sample');
        const chosen = ranks[0], report = { timestamp: new Date().toISOString(), seconds: 1, loadavg: optional('/proc/loadavg'), cpuPressure: optional('/proc/pressure/cpu'), memoryAvailableKiB: Number(optional('/proc/meminfo')?.match(/^MemAvailable:\s+(\d+)/m)?.[1]), chosen, quiet: chosen.siblingMax <= .15 };
        attempts.push(report);
        if (report.quiet || attempt === 2)
            return { ...report, attempts };
        await new Promise(r => setTimeout(r, 2000));
    }
}
