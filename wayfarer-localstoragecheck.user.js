// ==UserScript==
// @name         Wayfarer LocalStorage Manager
// @version      0.2.2
// @description  Adds a manager to let you manage your localStorage easily.
// @namespace    https://github.com/tehstone/wayfarer-addons/
// @downloadURL  https://github.com/tehstone/wayfarer-addons/raw/main/wayfarer-localstoragecheck.user.js
// @homepageURL  https://github.com/tehstone/wayfarer-addons/
// @match        https://wayfarer.nianticlabs.com/*
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
    const wfColor = '#FF6D38';

    const originMap = [
        {
            regex: /^@transloco/,
            label: 'Part of vanilla Wayfarer',
            color: wfColor
        },
        {
            regex: /^heroVideoShown$/,
            label: 'Part of vanilla Wayfarer',
            color: wfColor
        },
        {
            regex: /^_grecaptcha$/,
            label: 'Part of vanilla Wayfarer',
            color: wfColor
        },
        {
            regex: /^_wfTheme$/,
            label: 'Part of vanilla Wayfarer',
            color: wfColor
        },
        {
            regex: /^wfes_AppealData_/,
            label: 'Set by WFES Appeal Data addon'
        },
        {
            regex: /^wfesNomList/,
            label: 'Set by WFES Nomination Notify addon'
        },
        {
            regex: /^wfes_CurrentAppealState_/,
            label: 'Set by WFES Nomination Notify addon'
        },
        {
            regex: /^wfpNominationTypes$/,
            label: 'Used by Wayfarer Nomination Types addon'
        },
        {
            regex: /^wfrh(Saved|_)/,
            label: 'Set by Wayfarer Review History addon'
        },
        {
            regex: /^wfrcc_cache$/,
            label: 'Set by Wayfarer Rejections Plus addon'
        },
        {
            regex: /^wfrt_/,
            label: 'Set by Wayfarer Review Timer addon'
        },
        {
            regex: /^wfmm_/,
            label: 'Set by Wayfarer Review Map Mods addon'
        },
        {
            regex: /^wfcc_/,
            label: 'Set by Wayfarer Extended Stats addon'
        },
        {
            regex: /^wfpSaved/,
            label: 'Stored WayFarer+ review history; now deprecated'
        },
        {
            regex: /^wfpVersion$/,
            label: 'Set by WayFarer+; now deprecated'
        },
    ];

    const getCurrentStorageUsage = () => {
        let total = 0;
        for (const x in localStorage) {
            if (localStorage.hasOwnProperty(x)) {
                const size = localStorage[x].length + x.length;
                if (!isNaN(size)) total += size * 2; // UTF-16 = 2 Bpc
            }
        }
        return total;
    }

    const totalCapacity = (() => {
        const testStart = new Date();
        let maxCapacity = 0;
        let testSize = 0;
        const testKey = 'wfLSM-test';
        localStorage.setItem(testKey, '');
        for (let step = 6; step >= 0; step--) {
            try {
                for (let i = 0; i < 10; i++) {
                    testSize += Math.pow(10, step);
                    localStorage.removeItem(testKey);
                    localStorage.setItem(testKey, '0'.repeat(testSize));
                    maxCapacity = getCurrentStorageUsage();
                }
            } catch (e) {
                localStorage.removeItem(testKey);
                testSize -= Math.pow(10, step);
            }
        }

        const timeTaken = new Date() - testStart;
        console.log(`Found max localStorage capacity of ${maxCapacity} (testing took ${timeTaken} ms)`);
        return maxCapacity;
    })();

    const humanSize = size => {
        const prefixes = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
        let tmp = size;
        let index = 0;
        while (tmp > 1024) {
            index++;
            tmp /= 1024;
        }
        return (index == 0 ? tmp : tmp.toFixed(tmp < 100 ? 2 : 1)) + ' ' + prefixes[index];
    }

    const createPopup = () => {
        const outer = document.createElement('div');
        outer.classList.add('wfLSM-bg');
        document.querySelector('body').appendChild(outer);

        const inner = document.createElement('div');
        inner.classList.add('wfLSM-popup');
        outer.appendChild(inner);

        const header = document.createElement('h1');
        header.textContent = 'localStorage manager';
        inner.appendChild(header);

        const closeBtn = document.createElement('div');
        closeBtn.textContent = '❌';
        closeBtn.classList.add('wfLSM-close');
        closeBtn.addEventListener('click', () => {
            outer.parentNode.removeChild(outer);
        });
        inner.appendChild(closeBtn);

        const subtitle = document.createElement('p');
        subtitle.classList.add('wfLSM-popup-subtitle');
        inner.appendChild(subtitle);

        const updateSubtitle = () => {
            for (let i = subtitle.childNodes.length - 1; i >= 0; i--) subtitle.removeChild(subtitle.childNodes[i]);
            const curUsage = getCurrentStorageUsage();
            const elems = {
                'Total': humanSize(totalCapacity),
                'Used': humanSize(curUsage) + ' (' + percentage(curUsage / totalCapacity) + ')',
                'Free': humanSize(totalCapacity - curUsage) + ' (' + percentage((totalCapacity - curUsage) / totalCapacity) + ')'
            };
            let first = true;
            for (const k in elems) {
                if (elems.hasOwnProperty(k)) {
                    const subK = document.createElement('span');
                    subK.textContent = (first ? '' : '; ') + k + ': ';
                    subtitle.appendChild(subK);
                    const subV = document.createElement('span');
                    subV.classList.add('wfLSM-usage-label');
                    subV.textContent = elems[k];
                    subtitle.appendChild(subV);
                    first = false;
                }
            }
        }
        updateSubtitle();

        const table = document.createElement('table');
        inner.appendChild(table);
        const headerTr = document.createElement('tr');
        table.appendChild(headerTr);
        const headerTh1 = document.createElement('th');
        headerTh1.textContent = 'Key';
        headerTr.appendChild(headerTh1);
        const headerTh2 = document.createElement('th');
        headerTh2.textContent = 'Gross size';
        headerTr.appendChild(headerTh2);
        const headerTh3 = document.createElement('th');
        headerTh3.textContent = 'Actions';
        headerTr.appendChild(headerTh3);

        const lssm = [];
        for (const x in localStorage) {
            if (localStorage.hasOwnProperty(x)) {
                const length = localStorage[x].length + x.length;
                if (!isNaN(length)) {
                    lssm.push([ x, length * 2 ]); // UTF-16 = 2 Bpc
                }
            }
        }

        lssm.sort((a, b) => b[1] - a[1]);
        for (let i = 0; i < lssm.length; i++) {
            const [ key, size ] = lssm[i];
            const hSize = humanSize(size);
            const row = document.createElement('tr');
            table.appendChild(row);
            const keyCell = document.createElement('td');
            keyCell.title = key;
            const keyName = document.createElement('span');
            keyName.textContent = key;
            keyCell.appendChild(keyName);
            const keyOrigin = document.createElement('span');
            keyOrigin.textContent = '<unknown origin>';
            keyOrigin.classList.add('wfLSM-origin');
            keyOrigin.style.opacity = 0.6;
            for (let i = 0; i < originMap.length; i++) {
                if (key.match(originMap[i].regex)) {
                    keyOrigin.textContent = originMap[i].label;
                    if (originMap[i].hasOwnProperty('color')) {
                        keyOrigin.style.color = originMap[i].color;
                        keyOrigin.style.opacity = 1;
                    } else {
                        //keyOrigin.style.color = '#20B8E3';
                    }
                    break;
                }
            }
            keyCell.appendChild(keyOrigin);
            row.appendChild(keyCell);
            const sizeCell = document.createElement('td');
            sizeCell.textContent = hSize;
            row.appendChild(sizeCell);
            const actionCell = document.createElement('td');
            row.appendChild(actionCell);

            const actions = {
                '🗑️': {
                    title: 'Delete',
                    action: () => {
                        if (confirm(`Are you sure you wish to delete ${key}?`)) {
                            localStorage.removeItem(key);
                            calculateStorage();
                            updateSubtitle();
                            table.removeChild(row);
                        }
                    }
                },
                '💾': {
                    title: 'Export to file',
                    action: () => {
                        const blob = new Blob([localStorage.getItem(key)], { type: 'text/plain' });
                        const url = URL.createObjectURL(blob);
                        const anchor = document.createElement('a');
                        anchor.setAttribute("href", url);
                        anchor.setAttribute("download", key + ".txt");
                        anchor.style.display = 'hidden';
                        document.querySelector('body').appendChild(anchor);
                        anchor.click();
                        anchor.parentNode.removeChild(anchor);
                    }
                }
            };

            for (const k in actions) {
                if (actions.hasOwnProperty(k)) {
                    const btn = document.createElement('span');
                    btn.textContent = k;
                    btn.title = actions[k].title;
                    btn.addEventListener('click', actions[k].action);
                    btn.classList.add('wfLSM-action');
                    actionCell.appendChild(btn);
                }
            }
        }
    }

    const percentage = decimal => (decimal * 100).toFixed(2) + '%';

    let valueBox = null;
    const calculateStorage = () => {
        if (valueBox) {
            const cutoff = 0.9;
            const used = getCurrentStorageUsage() / totalCapacity;
            valueBox.textContent = percentage(used);
            if (used >= cutoff && !valueBox.classList.contains('wfLSM-warn')) valueBox.classList.add('wfLSM-warn');
            else if (used < cutoff && valueBox.classList.contains('wfLSM-warn')) valueBox.classList.remove('wfLSM-warn');
        }
    }

    // Recalculate storage every 10 seconds
    const calcLoop = setInterval(calculateStorage, 10000);
    // Check that the localStorage box in the header is actually there every half second
    const setupLoop = setInterval(() => {
        const boxes = document.getElementsByClassName('wfLSM-box');
        if (!boxes.length) {
            const logo = document.querySelector('wf-logo');
            if (logo) {
                const div = document.createElement('div');
                div.classList.add('wfLSM-box');

                const label = document.createElement('p');
                label.textContent = 'LocalStorage usage:';
                div.appendChild(label);

                valueBox = document.createElement('p');
                valueBox.addEventListener('click', createPopup);
                calculateStorage();
                div.appendChild(valueBox);

                logo.parentNode.parentNode.appendChild(div);
            }
        }
    }, 500);



    (() => {
        const css = `
            .wfLSM-box {
                color: #333;
                margin-left: 2em;
                padding-top: 0.3em;
                text-align: center;
                display: block;
            }
            .dark .wfLSM-box {
                color: #ddd;
            }
            .wfLSM-box p:nth-child(2) {
                font-size: 20px;
                color: #20B8E3;
                cursor: pointer;
            }
            .wfLSM-warn {
                color: #f00 !important;
            }
            .wfLSM-bg {
                position: fixed;
                top: 0;
                left: 0;
                height: 100vh;
                width: 100vw;
                background: rgba(0,0,0,0.5);
                z-index: 100000;
            }
            .wfLSM-popup {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translateX(-50%) translateY(-50%);
                width: 500px;
                height: 500px;
                padding: 10px;
                max-width: calc(100vw - 20px);
                max-height: calc(100vh - 20px);
                overflow-x: hidden;
                overflow-y: scroll;
                background: #fff;
            }
            .dark .wfLSM-popup {
                background: #333;
            }
            .wfLSM-popup-subtitle {
                margin: 10px 0;
            }
            .wfLSM-usage-label {
                color: #20B8E3;
            }
            .wfLSM-popup table {
                width: 100%;
                max-width: 100%;
            }
            .wfLSM-popup tr td:nth-child(1) {
                overflow-x: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                max-width: 0;
            }
            .wfLSM-popup tr td:nth-child(2) {
                width: 20%;
                text-align: right;
            }
            .wfLSM-popup tr td:nth-child(3) {
                width: 15%;
            }
            .wfLSM-action {
                cursor: pointer;
                margin-right: 2px;
                opacity: 0.7;
                font-size: 1.2em;
            }
            .wfLSM-origin {
                font-size: 0.8em;
                display: block;
                margin-top: -4px;
                overflow-x: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .wfLSM-close {
                position: absolute;
                top: 10px;
                right: 10px;
                z-index: 2;
                font-size: 2em;
                cursor: pointer;
                opacity: 0.5;
            }
            .wfLSM-action:hover, .wfLSM-close:hover {
                opacity: 1;
            }
            `;
        const style = document.createElement('style');
        style.type = 'text/css';
        style.innerHTML = css;
        document.querySelector('head').appendChild(style);
    })();
})();
