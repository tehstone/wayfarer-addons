// ==UserScript==
// @name         Wayfarer Nomination Status History
// @version      0.3.0
// @description  Track changes to nomination status
// @namespace    https://github.com/tehstone/wayfarer-addons/
// @downloadURL  https://github.com/tehstone/wayfarer-addons/raw/main/wayfarer-nomination-status-history.user.js
// @homepageURL  https://github.com/tehstone/wayfarer-addons/
// @match        https://wayfarer.nianticlabs.com/*
// ==/UserScript==

// Copyright 2022 tehstone, bilde
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
    const states = ["ACCEPTED", "REJECTED", "VOTING", "DUPLICATE", "WITHDRAWN", "NOMINATED", "APPEALED", "NIANTIC_REVIEW", "HELD"];
    const stateMap = {
        ACCEPTED: 'Accepted',
        REJECTED: 'Rejected',
        VOTING: 'Entered voting',
        DUPLICATE: 'Rejected as duplicate',
        WITHDRAWN: 'Withdrawn',
        NOMINATED: 'Unheld',
        APPEALED: 'Appealed',
        NIANTIC_REVIEW: 'Entered Niantic review',
        HELD: 'Held',
        UPGRADE: 'Upgraded'
    };
    const savedFields = ['id', 'type', 'day', 'nextUpgrade', 'upgraded', 'status', 'isNianticControlled', 'canAppeal', 'isClosed', 'canHold', 'canReleaseHold'];
    const nomDateSelector = 'app-nominations app-details-pane app-nomination-tag-set + span';
    const importCache = {};
    let ready = false;

    /**
     * Overwrite the open method of the XMLHttpRequest.prototype to intercept the server calls
     */
    (function (open) {
        XMLHttpRequest.prototype.open = function (method, url) {
            if (url == '/api/v1/vault/manage' && method == 'GET') {
                this.addEventListener('load', parseNominations, false);
            }
            open.apply(this, arguments);
        };
    })(XMLHttpRequest.prototype.open);

    function parseNominations(e) {
        try {
            const response = this.response;
            const json = JSON.parse(response);
            if (!json) {
                console.warn('Failed to parse response from Wayfarer');
                return;
            }
            // ignore if it's related to captchas
            if (json.captcha) return;
            if (!json.result.nominations) {
                console.warn('Wayfarer\'s response didn\'t include nominations.');
                return;
            }
            handleNominations(json.result.nominations);
        } catch (e) {
            console.warn(e); // eslint-disable-line no-console
        }
    }

    const handleNominations = nominations => {
        addNotificationDiv();
        getIDBInstance().then(db => checkNominationChanges(db, nominations)).catch(console.error);
        awaitElement(() => document.querySelector('app-nominations-list')).then(ref => {
            const nomCache = {};
            let select = null;
            nominations.forEach(nom => { nomCache[nom.imageUrl] = nom.id; });
            ref.addEventListener('click', e => {
                const item = e.target.closest('app-nominations-list-item');
                if (item) {
                    const nomId = nomCache[item.querySelector('img').src];
                    const renderRef = () => document.querySelector(nomDateSelector);
                    awaitElement(renderRef).then(ref => {
                        if (select) select.parentElement.removeChild(select);
                        select = document.createElement('select');
                        select.classList.add('wfnshDropdown');
                        ref.parentNode.appendChild(select);
                        awaitElement(() => ready).then(() => getIDBInstance()).then(db => {
                            const objectStore = db.transaction(['nominationHistory'], "readonly").objectStore('nominationHistory');
                            const getNom = objectStore.get(nomId);
                            getNom.onsuccess = () => {
                                const { result } = getNom;
                                const nomDateOpt = document.createElement('option');
                                nomDateOpt.textContent = result.day + ' - Nominated';
                                select.appendChild(nomDateOpt);
                                result.statusHistory.forEach(({ timestamp, status }, idx) => {
                                    const date = new Date(timestamp);
                                    const dateString = `${date.getUTCFullYear()}-${('0'+(date.getUTCMonth()+1)).slice(-2)}-${('0'+date.getUTCDate()).slice(-2)}`;
                                    const opt = document.createElement('option');
                                    opt.textContent = `${dateString} - ${stateMap.hasOwnProperty(status) ? stateMap[status] : status}`;
                                    opt.value = 'n' + idx;
                                    select.appendChild(opt);
                                    select.value = opt.value;
                                });
                            }
                        });
                    });
                }
            });
        });
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

    const getIDBInstance = () => new Promise((resolve, reject) => {
        'use strict';

        if (!window.indexedDB) {
            reject('This browser doesn\'t support IndexedDB!');
            return;
        }

        const openRequest = indexedDB.open('wayfarer-tools-db', 3);
        openRequest.onsuccess = event => {
            console.log('IndexedDB initialization complete.');
            resolve(event.target.result);
        };
        openRequest.onupgradeneeded = (event) => {
            let db1 = event.target.result;
            if (!db1.objectStoreNames.contains('nominationHistory')) {
                db1.createObjectStore('nominationHistory', { keyPath: 'id' });
            }
        };
    });

    const checkNominationChanges = (db, nominations) => {
        console.log("Checking for nomination changes...");

        const tx = db.transaction(['nominationHistory'], "readwrite");
        // Clean up when we're done (we'll commit later with tx.commit();)
        tx.oncomplete = event => {
            db.close();
            ready = true;
        }

        const objectStore = tx.objectStore('nominationHistory');
        const getList = objectStore.getAll();
        getList.onsuccess = () => {
            const savedNominations = Object.assign({}, ...getList.result.map(nom => ({ [nom.id]: nom })));
            if (nominations.length < savedNominations.length) {
                const missingcount = savedNominations.length - nominations.length;
                createNotification(`${missingcount} nominations are missing from the list!`, "red");
            }

            let newCount = 0;
            let importCount = 0;
            nominations.forEach(nom => {
                if (nom.id in savedNominations) {
                    const saved = savedNominations[nom.id];
                    const history = saved.statusHistory;
                    if (nom.upgraded && !saved.upgraded) {
                        history.push({ timestamp: Date.now(), status: 'UPGRADE' });
                        createNotification(`${nom.title} was upgraded!`, 'blue');
                    }
                    if (nom.status != saved.status) {
                        history.push({ timestamp: Date.now(), status: nom.status });
                        if (nom.status !== 'HELD' && saved.status !== 'HELD') {
                            const { text, color } = getStatusNotificationText(nom.status);
                            createNotification(`${nom.title} ${text}`, color);
                        }
                    }
                    const toSave = filterObject(nom, savedFields);
                    objectStore.put({ ...toSave, statusHistory: history });
                } else {
                    newCount++;
                    const history = importWFESHistoryFor(nom.id);
                    if (history.length) importCount++;
                    if (nom.status !== 'NOMINATED') {
                        if (!history.length || history[history.length - 1].status !== nom.status) {
                            history.push({ timestamp: Date.now(), status: nom.status });
                        }
                    }
                    const toSave = filterObject(nom, savedFields);
                    objectStore.put({ ...toSave, statusHistory: history });
                }
            });
            tx.commit();
            if (newCount > 0) {
                if (importCount > 0) {
                    createNotification(`Found ${newCount} new nominations in the list, of which ${importCount} had its history imported from WFES Nomination Notify.`, 'green');
                } else {
                    createNotification(`Found ${newCount} new nominations in the list!`, 'green');
                }
            }
        }
    };

    const importWFESHistoryFor = id => {
        for (const key in localStorage) {
            if (key.startsWith('wfesNomList_') && !importCache.hasOwnProperty(key)) {
                importCache[key] = JSON.parse(localStorage[key]);
                console.log(importCache[key]);
            }
        }
        const oldData = [];
        for (const key in importCache) {
            if (importCache.hasOwnProperty(key) && importCache[key].hasOwnProperty(id) && importCache[key][id].hasOwnProperty('wfesDates')) {
                importCache[key][id].wfesDates.forEach(([ date, status ]) => {
                    switch (true) {
                        case status !== 'MISSING':
                        case status !== 'NOMINATED' || oldData.length > 0:
                            oldData.push({ timestamp: Date.parse(`${date}T00:00Z`), status });
                    }
                });
            }
        }
        oldData.sort((a, b) => a.timestamp - b.timestamp);
        for (let i = oldData.length - 2; i >= 0; i--) {
            if (oldData[i].status == oldData[i + 1].status) oldData.splice(i + 1, 1);
        };
        return [...oldData];
    }

    const getStatusNotificationText = status => {
        let text, color;
        switch (status) {
            case 'ACCEPTED':
                text = 'was accepted!';
                color = 'green';
                break;
            case 'REJECTED':
                text = 'was rejected!';
                color = 'red';
                break;
            case 'DUPLICATE':
                text = 'was rejected as duplicate!';
                color = 'red';
                break;
            case 'VOTING':
                text = 'entered voting!';
                color = 'gold';
                break;
            case 'NIANTIC_REVIEW':
                text = 'went into Niantic review!';
                color = 'blue';
                break;
            default:
                text = `: unknown status: ${status}`;
                color = 'red';
                break;
        }
        return { text, color };
    };

    const filterObject = (obj, keys) => Object
        .keys(obj)
        .filter(key => keys.includes(key))
        .reduce((nObj, key) => { nObj[key] = obj[key]; return nObj; }, {});

    const addNotificationDiv = () => {
        if (document.getElementById("wfnshNotify") === null) {
            let container = document.createElement("div");
            container.id = "wfnshNotify";
            document.getElementsByTagName("body")[0].appendChild(container);
        }
    }

    const createNotification = (message, color = 'red') => {
        const notification = document.createElement('div');
        notification.classList.add('wfnshNotification');
        notification.classList.add('wfnshBg-' + color);
        notification.addEventListener('click', () => notification.parentNode.removeChild(notification));
        const content = document.createElement('p');
        content.textContent = message;
        notification.appendChild(content);
        awaitElement(() => document.getElementById('wfnshNotify')).then(ref => ref.appendChild(notification));
    }

    (() => {
        const css = `
            #wfnshNotify {
                position: absolute;
                bottom: 1em;
                right: 1em;
                width: 30em;
                z-index: 100;
            }
            .wfnshNotification {
                font-weight: bold;
                border-radius: 1em;
                padding: 1em;
                margin-top: 1.5em;
                color: white;
            }
            .wfnshBg-red {
                background-color: #CC0000;
            }
            .wfnshBg-green {
                background-color: #09b065;
            }
            .wfnshBg-blue {
                background-color: #1a3aad;
            }
            .wfnshBg-gold {
                background-color: #f5da42;
            }
            .dark .wfnshDropdown {
                background-color: #262626;
            }
            .wfnshDropdown {
                text-align: right;
            }
            ${nomDateSelector} {
                display: none;
            }
            `;
        const style = document.createElement('style');
        style.type = 'text/css';
        style.innerHTML = css;
        document.querySelector('head').appendChild(style);
    })();
})();
