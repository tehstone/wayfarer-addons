// ==UserScript==
// @name         Wayfarer Rejections Plus
// @version      0.2.5
// @description  Improves the display of criteria on rejected nominations, allows displaying more than two rejection reasons, and more.
// @namespace    https://github.com/tehstone/wayfarer-addons/
// @downloadURL  https://github.com/tehstone/wayfarer-addons/raw/main/wayfarer-rejections-plus.user.js
// @homepageURL  https://github.com/tehstone/wayfarer-addons/
// @match        https://wayfarer.nianticlabs.com/*
// @run-at       document-start
// ==/UserScript==

// Copyright 2024 tehstone, bilde
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

(() => {
    'use strict';

    /*
    There is a secret function in this script that allows you to force-refresh right from the nominations page.
    This is intentionally hidden because it requires sending requests to the Wayfarer API, which is risky.
    This way, you don't have to refresh the page to get more rejection reasons for your rejected nominations.
    To use this feature, press Alt+Shift+R while having any nomination open that has been rejected for two or
    more criteria. Note that using this feature is entirely at your own risk.
    */

    const idMap = {};
    let refreshHandler = null;
    let wfGlobalLanguage = 'en';

    // Overwrite the open method of the XMLHttpRequest.prototype to intercept the server calls
    (open => {
        XMLHttpRequest.prototype.open = function (method, url) {
            if (url == '/api/v1/vault/manage/detail' && method == 'POST') {
                this.addEventListener('load', interceptDetail, false);
            } else if (url == '/api/v1/vault/manage' && method == 'GET') {
                this.addEventListener('load', interceptManage, false);
            } else if (url == '/api/v1/vault/properties' && method == 'GET') {
                // NOTE: Requires @run-at document-start.
                this.addEventListener('load', interceptProperties, false);
            }
            open.apply(this, arguments);
        };
    })(XMLHttpRequest.prototype.open);

    // Overwrite the send method of the XMLHttpRequest.prototype to intercept POST data
    (send => {
        XMLHttpRequest.prototype.send = function(dataText) {
            try {
                const data = JSON.parse(dataText);
                const xhr = this;
                this.addEventListener('load', () => {
                    if (xhr.responseURL == window.origin + '/api/v1/vault/settings') {
                        const response = xhr.response;
                        const json = JSON.parse(response);
                        if (!json) return;
                        if (json.captcha) return;
                        if (!json.code || json.code !== 'OK') return;
                        if (!data.hasOwnProperty('language')) return;
                        wfGlobalLanguage = data.language;
                        console.log('Detected change in Wayfarer language to:', wfGlobalLanguage);
                    }
                }, false);
            } catch (err) {}
            send.apply(this, arguments);
        };
    })(XMLHttpRequest.prototype.send);

    function interceptDetail() {
        try {
            const response = this.response;
            const json = JSON.parse(response);
            if (!json) return;
            if (json.captcha) return;
            const reasons = json.result.rejectReasons;
            if (!reasons) return;
            const id = json.result.id;
            idMap[json.result.imageUrl] = id;
            const all = updateRejections(id, reasons.map(el => el.reason));
            if (all.length) {
                switch (json.result.status) {
                    case 'REJECTED':
                        renderReasons(id, all);
                        break;
                    case 'APPEALED':
                        // Appealed noms don't have the "Rejection Criteria" header
                        renderAppealHeader();
                        renderReasons(id, all);
                        break;
                }
            }
        } catch (e) {
            console.error(e);
        }
    }

    function interceptProperties() {
        try {
            const response = this.response;
            const json = JSON.parse(response);
            if (!json) return;
            if (!json.result || !json.result.language) return;
            wfGlobalLanguage = json.result.language;
            console.log('Detected Wayfarer language:', wfGlobalLanguage);
        } catch (e) {
            console.error(e);
        }
    }

    function interceptManage() {
        if (refreshHandler) refreshHandler = null;
        const list = document.getElementsByTagName('app-submissions-list')[0];
        list.addEventListener('click', handleNominationClick);
    }

    const initKeyboardCtrl = () => {
        document.addEventListener('keydown', e => {
            if (location.href == 'https://wayfarer.nianticlabs.com/new/nominations') {
                if (e.altKey && e.shiftKey && e.keyCode == 82 && refreshHandler) {
                    refreshHandler();
                }
            }
        });
    }

    const handleNominationClick = e => {
        if (refreshHandler) refreshHandler = null;
        const item = e.target.closest('app-submissions-list-item');
        if (item) {
            // Remove any manually added boxes (for appealed noms) or they will conflict
            const old = document.getElementsByClassName('wfrcc_custom-rejection-box');
            for (let i = old.length - 1; i >= 0; i--) old[i].parentNode.removeChild(old[i]);

            const id = idMap[item.querySelector('img').src];
            if (id) {
                // If the id is stored in idMap then that means a /detail request has already been done for it
                const header = document.querySelector('app-details-pane .card > div.flex-row + .ng-star-inserted h5');
                if (!header) renderAppealHeader();
                const all = updateRejections(id, []);
                if (all.length) renderReasons(id, all);
            }
        }
    }

    const updateRejections = (id, reasons) => {
        const data = localStorage.hasOwnProperty('wfrcc_cache') ? JSON.parse(localStorage.wfrcc_cache) : {};
        if (reasons.length) {
            if (!data.hasOwnProperty(id)) data[id] = [];
            data[id] = [...new Set([...data[id], ...reasons])];
            try {
                localStorage.wfrcc_cache = JSON.stringify(data);
            } catch (e) {
                console.error(e);
                alert('Your localStorage is full! Please clear data from it.');
            }
            return data[id];
        }
        return data[id] || [];
    }

    const renderAppealHeader = () => {
        const l10n = getL10N();
        const h5 = document.createElement('h5');
        h5.textContent = l10n['criteria.rejection'];
        h5.className = 'ng-star-inserted';
        h5.style.color = '#737373';
        h5.style.marginBottom = '8px';
        const pane = document.createElement('div');
        pane.className = 'details-pane__section';
        pane.appendChild(h5);
        const box = document.createElement('div');
        // The box must be manually removed!! So we add a class to it to identify it later.
        box.className = 'ng-star-inserted wfrcc_custom-rejection-box';
        box.appendChild(pane);
        const ref = document.querySelector('app-details-pane .card > div.flex-row');
        console.log(ref);
        ref.parentNode.insertBefore(box, ref.nextSibling);
    }

    const renderReasons = (id, reasons) => awaitElement(() => document.querySelector('app-details-pane .card > div.flex-row + .ng-star-inserted h5')).then(ref => {
        const container = ref.parentNode;
        for (let i = container.childNodes.length - 1; i >= 0; i--) {
            if (container.childNodes[i].tagName == 'DIV') container.removeChild(container.childNodes[i]);
        }
        const l10n = getL10N();
        reasons.forEach(reason => {
            const header = document.createElement('p');
            header.textContent = l10n[`reject.reason.${reason.toLowerCase()}.short`] || reason.toLowerCase();
            header.style.fontWeight = 'bold';
            const body = document.createElement('p');
            body.textContent = l10n[`reject.reason.${reason.toLowerCase()}`];
            body.style.opacity = 0.7;
            const footer = document.createElement('p');
            footer.textContent = l10n[`reject.reason.email.${reason}`];
            footer.style.opacity = 0.4;
            const outer = document.createElement('div');
            outer.style.marginBottom = '8px';
            outer.appendChild(header);
            outer.appendChild(body);
            outer.appendChild(footer);
            container.appendChild(outer);
        });

        for (let i = ref.childNodes.length - 1; i >= 0; i--) {
            if (ref.childNodes[i].nodeName != '#text') ref.removeChild(ref.childNodes[i]);
        }
        if (reasons.length >= 2) {
            const refr1 = document.createElement('span');
            refr1.textContent = ' (';
            const refr2 = document.createElement('a');
            refr2.textContent = 'info';
            refr2.addEventListener('click', showCacheHelp);
            const refr3 = document.createElement('span');
            refr3.textContent = ')';

            const refrbox = document.createElement('span');
            refrbox.appendChild(refr1);
            refrbox.appendChild(refr2);
            refrbox.appendChild(refr3);
            ref.appendChild(refrbox);

            const title = container.closest('app-details-pane').querySelector('h4').textContent;
            refreshHandler = () => callRefresh(id, title, refr2);
        }
    });

    const showCacheHelp = () => {
        alert(
            'Wayfarer currently only returns 2 rejection reasons. However, a nomination can be rejected for more reasons, ' +
            'they are just not displayed. When you view a rejected nomination, the rejection criteria you are shown will be ' +
            'randomly selected from the nomination\'s actual full list of rejection reasons. This means that if you reload ' +
            'the page, you might see a different set of rejection criteria if there were more than two reasons for the rejection.' +
            '\n\n' +
            'Wayfarer Rejections Plus will store all the rejection criteria you see for a nomination each time you click on ' +
            'it after reloading the page, to try to give you the full picture for your nomination\'s rejection. You might have to ' +
            'reload several times, there may not even be more than two rejection criteria, and you can never truly know how ' +
            'many rejection reasons there actually are for your nomination due to the randomness.'
        );
    }

    const callRefresh = (id, title, label) => {
        if (confirm(
            '\u26a0\ufe0f WARNING \u26a0\ufe0f\n' +
            'Please read entire message before you proceed!' +
            '\n\n' +
            'Wayfarer Rejections Plus will store all the rejection criteria you see for a nomination each time you click on ' +
            'it after reloading the page, to try to give you the full picture for your nomination\'s rejection. However, this ' +
            'normally requires refreshing the page. Pressing Alt+Shift+R will send a new request to the Wayfarer API to get ' +
            'more rejection reasons immediately, however this is NON-STANDARD Wayfarer behavior, and if you do so, you do it ' +
            'entirely AT YOUR OWN RISK.' +
            '\n\n' +
            'Are you sure you wish to force a refresh?\n' +
            `Nomination: ${title}`
        )) {
            try {
                const csrf = `; ${document.cookie}`.split('; XSRF-TOKEN=')[1].split(';')[0];
                const xhr = new XMLHttpRequest();
                xhr.open('POST', '/api/v1/vault/manage/detail', true);
                xhr.setRequestHeader('Content-Type', 'application/json');
                xhr.setRequestHeader('x-angular', '');
                xhr.setRequestHeader('X-CSRF-TOKEN', csrf);
                xhr.onreadystatechange = function() {
                    if (xhr.readyState == 4) {
                        label.textContent = 'refresh';
                    }
                }
                xhr.send(JSON.stringify({ id }));
                label.textContent = 'refreshing...';
            } catch (e) {
                console.error(e);
            }
        }
    }

    const getL10N = () => {
        const i18n = JSON.parse(localStorage['@transloco/translations']);
        return i18n[wfGlobalLanguage];
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

    initKeyboardCtrl();
})();
