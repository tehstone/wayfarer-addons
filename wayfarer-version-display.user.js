// ==UserScript==
// @name         Wayfarer Version Display
// @version      0.1.2
// @description  Displays the current Wayfarer version.
// @namespace    https://github.com/tehstone/wayfarer-addons
// @downloadURL  https://github.com/tehstone/wayfarer-addons/raw/main/wayfarer-version-display.user.js
// @homepageURL  https://github.com/tehstone/wayfarer-addons
// @match        https://wayfarer.nianticlabs.com/new/*
// ==/UserScript==

// Copyright 2021 tehstone, bilde
// This file is part of the Wayfarer Addons collection.

// This script is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This script is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You can find a copy of the GNU General Public License in the root
// directory of this script's GitHub repository:
// <https://github.com/tehstone/wayfarer-addons/blob/main/LICENSE>
// If not, see <https://www.gnu.org/licenses/>.

/* eslint-env es6 */
/* eslint no-var: "error" */
/* eslint indent: ['error', 4] */

(() => {
    let box = null;
    let version = null;

    // Overwrite the open method of the XMLHttpRequest.prototype to intercept the server calls
    (function (open) {
        XMLHttpRequest.prototype.open = function (method, url) {
            this.addEventListener('load', parseResponse, false);
            open.apply(this, arguments);
        };
    })(XMLHttpRequest.prototype.open);

    function parseResponse(e) {
        if (!box || !document.getElementsByClassName('wfvd-display').length) {
            box = document.createElement('span');
            box.classList.add('wfvd-display');
            awaitElement(() => document.querySelector('wf-logo')).then(ref => {
                ref.appendChild(box);
                ref.parentNode.style.width = '150px';
            });
        }
        try {
            const json = JSON.parse(this.response);
            if (!json) return;
            if (json.version) {
                box.textContent = json.version.replace('release-wayfarer-web-', '');
                if (!version) version = json.version;
                else if (version !== json.version) {
                    const css = `
                    .wfvd-display {
                        color: red;
                        animation: blink-animation 2s steps(2, start) infinite;
                    }
                    @keyframes blink-animation {
                        to { visibility: hidden; }
                    }
                    `;
                    const oldVersion = version;
                    version = json.version;
                    const style = document.createElement('style');
                    style.type = 'text/css';
                    style.innerHTML = css;
                    document.querySelector('head').appendChild(style);
                    const reload = confirm(`Addon message: The Wayfarer API appears to have just updated from version ${oldVersion} to version ${json.version}. It is highly recommended that you reload the page now to avoid unexpected Wayfarer behavior. Reload now?`);
                    if (reload) location.reload();
                }
            }
        } catch (err) {
            console.err(err);
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

    (() => {
        const css = `
        .wfvd-display {
            display: block;
            position: absolute;
            top: 0;
            left: 85px;
            margin-top: -1px;
            color: rgb(32, 184, 227);
            font-weight: bold;
            white-space: nowrap;
        }
        wf-logo {
            position: absolute;
            top: 0.5rem;
            left: 0.5rem;
        }
        `;
        const style = document.createElement('style');
        style.type = 'text/css';
        style.innerHTML = css;
        document.querySelector('head').appendChild(style);
    })();
})();
