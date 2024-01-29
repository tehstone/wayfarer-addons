// ==UserScript==
// @name         Wayfarer Edits Difference
// @version      1.0.1
// @description  Highlights the differences between similar options on edit reviews in Wayfarer
// @namespace    https://github.com/tehstone/wayfarer-addons
// @downloadURL  https://github.com/tehstone/wayfarer-addons/raw/main/wayfarer-edits-diff.user.js
// @homepageURL  https://github.com/tehstone/wayfarer-addons
// @require      https://cdnjs.cloudflare.com/ajax/libs/jsdiff/5.0.0/diff.min.js
// @match        https://wayfarer.nianticlabs.com/*
// ==/UserScript==

// Copyright 2024 bilde, tehstone
// This file is part of the Wayfarer Addons collection.

// This script is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This script is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.    See the
// GNU General Public License for more details.

// You can find a copy of the GNU General Public License in the root
// directory of this script's GitHub repository:
// <https://github.com/tehstone/wayfarer-addons/blob/main/LICENSE>
// If not, see <https://www.gnu.org/licenses/>.

/* eslint-env es6 */
/* eslint no-var: "error" */
/* eslint indent: ['error', 4] */

(() => {
    const threshold = 0.85;

    /**
     * Overwrite the open method of the XMLHttpRequest.prototype to intercept the server calls
     */
    (function (open) {
        XMLHttpRequest.prototype.open = function (method, url) {
            if (url == '/api/v1/vault/review') {
                if (method == 'GET') {
                    this.addEventListener('load', checkResponse, false);
                }
            }
            open.apply(this, arguments);
        };
    })(XMLHttpRequest.prototype.open);

    function checkResponse(e) {
        try {
            const response = this.response;
            const json = JSON.parse(response);
            if (!json) return;
            if (json.captcha) return;
            const candidate = json.result;
            if (!candidate) return;
            awaitElement(() => document.querySelector('app-review-edit')).then(processEdit).catch(() => {});
        } catch (e) {
            console.err(e);
        }
    }

    const awaitElement = get => new Promise((resolve, reject) => {
        let triesLeft = 10;
        const queryLoop = () => {
            const ref = get();
            if (ref) resolve(ref);
            else if (!triesLeft) reject();
            else setTimeout(queryLoop, 100);
            triesLeft--;
        }
        queryLoop();
    });

    const processEdit = e => {
        const title = e.querySelector('app-select-title-edit');
        if (title) analyze(title);
        const desc = e.querySelector('app-select-description-edit');
        if (desc) analyze(desc);
    };

    const analyze = e => {
        const opts = [...e.querySelectorAll('mat-radio-button .mat-radio-label-content')];
        opts.pop();
        const result = analyzeStrings(opts.map(e => e.textContent.trim()));
        for (let i = 0; i < opts.length; i++) {
            opts[i].innerHTML = ' ' + result[i];
        }
    };

    const analyzeStrings = strs => {
        const l = strs.length;

        const grid = matrix(l);
        for (let i = 0; i < l; i++) {
            const opt_i = strs[i];
            for (let j = i + 1; j < l; j++) {
                const opt_j = strs[j];
                const maxLen = Math.max(opt_i.length, opt_j.length);
                const dist = maxLen > 0 ? levDist(opt_i, opt_j) / maxLen : 0;
                const sim = 1 - dist;
                grid[i][j] = sim;
            }
        }

        const pooled = [];
        const pools = [];
        for (let i = 0; i < l; i++) {
            if (pooled.includes(i)) continue;
            const visited = [];
            const queue = [i];
            const pool = [i];
            while (queue.length) {
                const cur = queue.pop();
                visited.push(cur);
                for (let j = cur + 1; j < l; j++) {
                    if (grid[cur][j] > threshold) {
                        if (!pool.includes(j)) pool.push(j);
                        if (!pooled.includes(j)) pooled.push(j);
                        if (!visited.includes(j)) queue.push(j);
                    }
                }
            }
            if (pool.length > 1) {
                pools.push(pool);
            }
        }

        const sanitize = document.createElement('span');
        for (let i = 0; i < pools.length; i++) {
            let base = strs[pools[i][0]];
            for (let j = 1; j < pools[i].length; j++) {
                const diff = Diff.diffChars(base, strs[pools[i][j]]);
                base = '';
                for (let k = 0; k < diff.length; k++) {
                    if (diff[k].added || diff[k].removed) continue;
                    base += diff[k].value;
                }
            }
            for (let j = 0; j < pools[i].length; j++) {
                let add = false;
                let patched = '<span>';
                const diff = Diff.diffChars(base, strs[pools[i][j]]);
                for (let k = 0; k < diff.length; k++) {
                    if (diff[k].added) {
                        if (!add) {
                            patched += '</span><span class="wf-edit-differs">';
                            add = true;
                        }
                    } else if (!diff[k].removed) {
                        if (add) {
                            patched += '</span><span>';
                            add = false;
                        }
                    }
                    sanitize.textContent = diff[k].value;
                    patched += sanitize.innerHTML;
                }
                patched += '</span>';
                strs[pools[i][j]] = patched;
            }
        }
        console.log('Calculated edit similarity grid (for debug purposes): ' + JSON.stringify(grid));
        return strs;
    };

    const matrix = size => {
        const m = [];
        for (let i = size; i >= 0; i--) m[i-1] = [];
        return m;
    };

    // The following function is sourced from James Westgate on Stack Overflow:
    // https://stackoverflow.com/a/11958496/1955334
    const levDist = (s, t) => {
        const d = []; //2d matrix

        // Step 1
        const n = s.length;
        const m = t.length;
        if (n == 0) return m;
        if (m == 0) return n;

        // Create an array of arrays in javascript (a descending loop is quicker)
        for (let i = n; i >= 0; i--) d[i] = [];

        // Step 2
        for (let i = n; i >= 0; i--) d[i][0] = i;
        for (let j = m; j >= 0; j--) d[0][j] = j;

        // Step 3
        for (let i = 1; i <= n; i++) {
            const s_i = s.charAt(i - 1);

            // Step 4
            for (let j = 1; j <= m; j++) {

                // Check the jagged ld total so far
                if (i == j && d[i][j] > 4) return n;

                const t_j = t.charAt(j - 1);
                const cost = (s_i == t_j) ? 0 : 1; // Step 5

                // Calculate the minimum
                let mi = d[i - 1][j] + 1;
                const b = d[i][j - 1] + 1;
                const c = d[i - 1][j - 1] + cost;

                if (b < mi) mi = b;
                if (c < mi) mi = c;

                d[i][j] = mi; // Step 6

                // Damerau transposition
                if (i > 1 && j > 1 && s_i == t.charAt(j - 2) && s.charAt(i - 2) == t_j) {
                    d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + cost);
                }
            }
        }

        // Step 7
        return d[n][m];
    }

    (() => {
        const style = document.createElement('style');
        style.type = 'text/css';
        style.innerHTML = '.wf-edit-differs { border-bottom: 2px solid #FF6D38; background-color: rgba(255, 109, 56, 0.3); }';
        document.querySelector('head').appendChild(style);
    })();
})();
