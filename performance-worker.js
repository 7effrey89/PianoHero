self.onmessage = (event) => {
    const msg = event.data || {};
    const { id, task, payload } = msg;
    try {
        if (task === 'precompute') {
            const notes = Array.isArray(payload && payload.notes) ? payload.notes : [];
            const simpleNotes = simplifyByMerge(notes);
            const result = {
                bpm: estimateBPM(notes),
                simpleNotes,
                duration: {
                    normal: getSongDuration(notes),
                    simple: getSongDuration(simpleNotes),
                },
            };
            self.postMessage({ id, ok: true, result });
            return;
        }
        self.postMessage({ id, ok: false, error: `Unknown task: ${task}` });
    } catch (err) {
        self.postMessage({ id, ok: false, error: err && err.message ? err.message : 'Worker error' });
    }
};

function getSongDuration(notes) {
    let max = 0;
    for (let i = 0; i < notes.length; i++) {
        const n = notes[i];
        const end = n.time + (n.duration || 0.15);
        if (end > max) max = end;
    }
    return max;
}

function estimateBPM(notes) {
    if (!notes || notes.length < 2) return null;
    const times = new Array(notes.length);
    for (let i = 0; i < notes.length; i++) times[i] = notes[i].time;
    times.sort((a, b) => a - b);
    const gaps = [];
    for (let i = 1; i < times.length; i++) {
        const gap = times[i] - times[i - 1];
        if (gap > 0.05 && gap < 2) gaps.push(gap);
    }
    if (gaps.length === 0) return null;
    gaps.sort((a, b) => a - b);
    const median = gaps[(gaps.length / 2) | 0];
    return Math.round(60 / median);
}

function simplifyByMerge(notes) {
    const work = notes.map(n => ({ ...n }));
    work.sort((a, b) => {
        if (a.note !== b.note) return a.note < b.note ? -1 : 1;
        return a.time - b.time;
    });

    const merged = [];
    let i = 0;
    while (i < work.length) {
        const n = { ...work[i] };
        let nEnd = n.time + (n.duration || 0.15);
        while (i + 1 < work.length && work[i + 1].note === n.note) {
            const nxt = work[i + 1];
            if (nxt.time <= nEnd + 0.01) {
                const nxtEnd = nxt.time + (nxt.duration || 0.15);
                if (nxtEnd > nEnd) {
                    n.duration = nxtEnd - n.time;
                    nEnd = nxtEnd;
                }
                i++;
            } else {
                break;
            }
        }
        merged.push(n);
        i++;
    }

    merged.sort((a, b) => a.time - b.time);
    return merged;
}
