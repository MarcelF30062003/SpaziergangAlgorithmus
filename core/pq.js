// core/pq.js
export class MinHeap {
    constructor() { this.a = []; }
    push(key, val) { // key = priority, val = payload
        this.a.push({ key, val }); this._up(this.a.length - 1);
    }
    pop() {
        if (!this.a.length) return null;
        const top = this.a[0];
        const last = this.a.pop();
        if (this.a.length) { this.a[0] = last; this._down(0); }
        return top;
    }
    _up(i) {
        while (i) {
            const p = (i - 1) >> 1;
            if (this.a[p].key <= this.a[i].key) break;
            [this.a[p], this.a[i]] = [this.a[i], this.a[p]];
            i = p;
        }
    }
    _down(i) {
        const n = this.a.length;
        for (;;) {
            let l = i*2+1, r = l+1, s = i;
            if (l < n && this.a[l].key < this.a[s].key) s = l;
            if (r < n && this.a[r].key < this.a[s].key) s = r;
            if (s === i) break;
            [this.a[s], this.a[i]] = [this.a[i], this.a[s]];
            i = s;
        }
    }
    get size(){ return this.a.length; }
}
