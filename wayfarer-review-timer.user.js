// ==UserScript==
// @name         Wayfarer Review Timer
// @version      0.1.1
// @description  Add review timer to Wayfarer
// @namespace    https://github.com/tehstone/wayfarer-addons
// @downloadURL  https://github.com/tehstone/wayfarer-addons/raw/main/wayfarer-review-timer.user.js
// @homepageURL  https://github.com/tehstone/wayfarer-addons
// @match        https://wayfarer.nianticlabs.com/*
// ==/UserScript==

// Copyright 2021 tehstone
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

(function() {
    /**
     * Overwrite the open method of the XMLHttpRequest.prototype to intercept the server calls
     */
    (function (open) {
        XMLHttpRequest.prototype.open = function (method, url) {
            if (url == '/api/v1/vault/review' && method == 'GET') {
                this.addEventListener('load', injectTimer, false);
            }
            open.apply(this, arguments);
        };
    })(XMLHttpRequest.prototype.open);

    function injectTimer() {
        const ref = document.querySelector('wf-logo');
        if (!ref) {
            setTimeout(injectTimer, 200);
            return;
        }

        try {
            const response = this.response;
            const json = JSON.parse(response);
            if (!json) return;
            const candidate = json.result;
            if (json.captcha || !candidate) return;

            initTimer(ref.parentNode.parentNode, candidate.expires);
        } catch (e) {
            console.log(e);
        }
    }

    function initTimer(container, expiry) {
        const div = document.createElement('div');
        div.className = 'wayfarerrtmr';

        let countLabel = document.createElement('p');
        countLabel.textContent = 'Time remaining: ';
        let counter = document.createElement('p');
        updateTime(counter, expiry);
        div.appendChild(countLabel);
        div.appendChild(counter);
        container.appendChild(div);

        let timer = setInterval(() => {
            if (!counter.closest('html')) {
                clearInterval(timer);
                return;
            } else {
                updateTime(counter, expiry);
            }
        }, 1000);
    }

    function updateTime(counter, expiry) {
        let diff = Math.ceil((expiry - new Date().getTime()) / 1000);
        let minutes = Math.floor(diff / 60);
        let seconds = Math.abs(diff % 60);
        if (minutes < 10) minutes = `0${minutes}`;
        if (seconds < 10) seconds = `0${seconds}`;
        counter.textContent = `${minutes}:${seconds}`;
    }

    (function() {
        const css = `
          .wayfarerrtmr {
              color: #333;
              margin-left: 2em;
              padding-top: 0.3em;
              text-align: center;
              display: block;
          }

          .dark .wayfarerrtmr {
              color: #ddd;
          }

          .wayfarerrtmr p:nth-child(2) {
              font-size: 20px;
              color: #20B8E3;
          }
        `;
        const style = document.createElement('style');
        style.type = 'text/css';
        style.innerHTML = css;
        document.querySelector('head').appendChild(style);
    })()
})();