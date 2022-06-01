// ==UserScript==
// @name         Wayfarer LocalStorage Check
// @version      0.0.1
// @description  Add LocalStorage contents size
// @namespace    https://github.com/tehstone/wayfarer-addons/
// @downloadURL  https://github.com/tehstone/wayfarer-addons/raw/main/wayfarer-localstoragecheck.user.js
// @homepageURL  https://github.com/tehstone/wayfarer-addons/
// @match        https://wayfarer.nianticlabs.com/*
// ==/UserScript==

// Copyright 2022 tehstone
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

function init() {
    let tryNumber = 10;
    let stats;

    /**
     * Overwrite the open method of the XMLHttpRequest.prototype to intercept the server calls
     */
    (function (open) {
        XMLHttpRequest.prototype.open = function (method, url) {
            if (url == '/api/v1/vault/profile') {
                if (method == 'GET') {
                    this.addEventListener('load', parseProfile, false);
                }
            }
            open.apply(this, arguments);
        };
    })(XMLHttpRequest.prototype.open);

    addCss();

    function parseProfile(e) {
        try {
            const response = this.response;
            const json = JSON.parse(response);
            if (!json) {
                console.warn('Failed to parse response from Wayfarer');
                return;
            }
            // ignore if it's related to captchas
            if (json.captcha)
                return;

            stats = json.result;
            if (!stats) {
                console.warn('Wayfarer\'s response didn\'t include nominations.');
                return;
            }
            awaitElement(() => document.querySelector('wf-rating-bar'))
            .then((ref) => {
                checkLocalStorageSize();
            });
            

        } catch (e)    {
            console.log(e); // eslint-disable-line no-console
        }
    }


    function checkLocalStorageSize() {
        const ref = document.querySelector('wf-logo');
        if (!ref) {
            setTimeout(checkLocalStorageSize, 200);
            return;
        }

        const div = document.createElement('div');
        div.className = 'wayfarercls';

        let storageSizeLabel = document.createElement('p');
        storageSizeLabel.textContent = 'LocalStorage: ';
        let storageSizeText = document.createElement('p');

        const storageSize = getLocalStorageSize();

        
        storageSizeText.textContent = `${storageSize} MB`;

        div.appendChild(storageSizeLabel);
        div.appendChild(storageSizeText);

        const container = ref.parentNode.parentNode;
        console.log(document.querySelector('.wayfarercls'));
        if (document.querySelector('.wayfarercls') === null) {
            container.appendChild(div);
        }
    }

    function getLocalStorageSize() {
        let total = 0;
        for (let x in localStorage) {
            // Value is multiplied by 2 due to data being stored in `utf-16` format, which requires twice the space.
            let amount = (localStorage[x].length * 2) / 1024 / 1024;
            if (!isNaN(amount) && localStorage.hasOwnProperty(x)) {
                total += amount;
            }
        }
        return total.toFixed(2);
    };

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

    function addCss() {
        const css = `
            .wayfarercls {
                color: #333;
                margin-left: 2em;
                padding-top: 0.3em;
                text-align: center;
                display: block;
            }
            .dark .wayfarercls {
                color: #ddd;
            }
            .wayfarercls p:nth-child(2) {
                font-size: 20px;
                color: #20B8E3;
            }
            `;
        const style = document.createElement('style');
        style.type = 'text/css';
        style.innerHTML = css;
        document.querySelector('head').appendChild(style);
    }
    }

    init();