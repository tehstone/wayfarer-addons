// ==UserScript==
// @name         Wayfarer Review Counter
// @version      0.1.2
// @description  Add review counter to Wayfarer
// @namespace    https://github.com/tehstone/wayfarer-addons
// @downloadURL  https://github.com/tehstone/wayfarer-addons/raw/main/wayfarer-review-counter.user.js
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
            if (url == '/api/v1/vault/review') {
                if (method == 'GET') {
                    this.addEventListener('load', injectCounter, false);
                } else if (method == 'POST') {
                    this.addEventListener('load', incrementCounter, false);
                }
            }
            open.apply(this, arguments);
        };
    })(XMLHttpRequest.prototype.open);

    function incrementCounter(e) {
        if (e.target.status == 202) {
            let count = parseInt(sessionStorage.getItem('wfrcCounter') || '0');
            sessionStorage.setItem('wfrcCounter', ++count);
        }
    }

    function injectCounter() {
        const ref = document.querySelector('wf-logo');
        if (!ref) {
            setTimeout(injectCounter, 200);
            return;
        }

        const div = document.createElement('div');
        div.className = 'wayfarerrctr';

        let countLabel = document.createElement('p');
        countLabel.textContent = 'Review count: ';
        let counter = document.createElement('p');
        counter.textContent = sessionStorage.getItem('wfrcCounter') || '0';
        div.appendChild(countLabel);
        div.appendChild(counter);

        function confirmReset() = { 
                if (confirm('Reset review count?')) {
                  sessionStorage.setItem('wfrcCounter', 0);
                  counter.textContent = 0;
                }  
            }
            
        countLabel.addEventListener('click', confirmReset);
        counter.addEventListener('click', confirmReset);

        const container = ref.parentNode.parentNode;
        container.appendChild(div);
    }

    (function() {
        const css = `
          .wayfarerrctr {
              color: #333;
              margin-left: 2em;
              padding-top: 0.3em;
              text-align: center;
              display: block;
          }

          .dark .wayfarerrctr {
              color: #ddd;
          }

          .wayfarerrctr p:nth-child(2) {
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