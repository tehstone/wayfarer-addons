// ==UserScript==
// @name         Wayfarer Nomination Status History
// @version      0.5.4
// @description  Track changes to nomination status
// @namespace    https://github.com/tehstone/wayfarer-addons/
// @downloadURL  https://github.com/tehstone/wayfarer-addons/raw/main/wayfarer-nomination-status-history.user.js
// @homepageURL  https://github.com/tehstone/wayfarer-addons/
// @match        https://wayfarer.nianticlabs.com/*
// @run-at       document-start
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
    const OBJECT_STORE_NAME = 'nominationHistory';
    const stateMap = {
        ACCEPTED: 'Accepted',
        REJECTED: 'Rejected',
        VOTING: 'Entered voting',
        DUPLICATE: 'Rejected as duplicate',
        WITHDRAWN: 'Withdrawn',
        NOMINATED: 'Hold released',
        APPEALED: 'Appealed',
        NIANTIC_REVIEW: 'Entered Niantic review',
        HELD: 'Held',
        UPGRADE: 'Upgraded'
    };
    const savedFields = ['id', 'type', 'day', 'nextUpgrade', 'upgraded', 'status', 'isNianticControlled', 'canAppeal', 'isClosed', 'canHold', 'canReleaseHold'];
    const nomDateSelector = 'app-nominations app-details-pane app-nomination-tag-set + span';
    const importCache = {};
    let ready = false;
    let userHash = 0;

    // https://github.com/bryc/code/blob/master/jshash/experimental/cyrb53.js
    const cyrb53 = function(str, seed = 0) {
        let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
        for (let i = 0, ch; i < str.length; i++) {
            ch = str.charCodeAt(i);
            h1 = Math.imul(h1 ^ ch, 2654435761);
            h2 = Math.imul(h2 ^ ch, 1597334677);
        }
        h1 = Math.imul(h1 ^ (h1>>>16), 2246822507) ^ Math.imul(h2 ^ (h2>>>13), 3266489909);
        h2 = Math.imul(h2 ^ (h2>>>16), 2246822507) ^ Math.imul(h1 ^ (h1>>>13), 3266489909);
        return 4294967296 * (2097151 & h2) + (h1>>>0);
    };

    // Overwrite the open method of the XMLHttpRequest.prototype to intercept the server calls
    (function (open) {
        XMLHttpRequest.prototype.open = function(method, url) {
            const args = this;
            if (url == '/api/v1/vault/manage' && method == 'GET') {
                this.addEventListener('load', handleXHRResult(handleNominations), false);
            } else if (url == '/api/v1/vault/properties' && method == 'GET') {
                // NOTE: Requires @run-at document-start.
                this.addEventListener('load', handleXHRResult(handleProfile), false);
            } else if (url == '/api/v1/vault/manage/upgrade/immediate' && method == 'POST') {
                this.addEventListener('load', handleXHRResult(handleUpgradeImmediate), false);
            }
            open.apply(this, arguments);
        };
    })(XMLHttpRequest.prototype.open);

    // Overwrite the send method of the XMLHttpRequest.prototype to intercept POST data
    (function (send) {
        XMLHttpRequest.prototype.send = function(dataText) {
            try {
                const data = JSON.parse(dataText);
                const xhr = this;
                this.addEventListener('load', handleXHRResult(function(result) {
                    switch (xhr.responseURL) {
                        case window.origin + '/api/v1/vault/manage/hold':
                            handleHold(data, result);
                            break;
                        case window.origin + '/api/v1/vault/manage/releasehold':
                            handleUnhold(data, result);
                            break;
                        case window.origin + '/api/v1/vault/manage/withdraw':
                            handleWithdraw(data, result);
                            break;
                    }
                }), false);
            } catch (err) {}
            send.apply(this, arguments);
        };
    })(XMLHttpRequest.prototype.send);

    // Perform validation on result to ensure the request was successful before it's processed further.
    // If validation passes, passes the result to callback function.
    const handleXHRResult = callback => function(e) {
        try {
            const response = this.response;
            const json = JSON.parse(response);
            if (!json) return;
            if (json.captcha) return;
            if (!json.result) return;
            callback(json.result, e);
        } catch (err) {
            console.error(err);
        }
    };

    // Handle holds, releases, withdrawals and upgrades dynamically.
    // This lets us update the status immediately instead of waiting for a refresh.
    const handleHold = ({ id }, result) => { if (result === 'DONE') addManualStatusChange(id, 'HELD'); };
    const handleUnhold = ({ id }, result) => { if (result === 'DONE') addManualStatusChange(id, 'NOMINATED'); };
    const handleWithdraw = ({ id }, result) => { if (result === 'DONE') addManualStatusChange(id, 'WITHDRAWN'); };

    const addManualStatusChange = (id, status, historyOnly = false, extras = {}) => new Promise((resolve, reject) => getIDBInstance().then(db => {
        const tx = db.transaction([OBJECT_STORE_NAME], "readwrite");
        // Close DB when we're done with it
        tx.oncomplete = event => db.close();
        const objectStore = tx.objectStore(OBJECT_STORE_NAME);
        const getNom = objectStore.get(id);
        getNom.onsuccess = () => {
            const { result } = getNom;
            const history = result.statusHistory;
            const timestamp = Date.now();
            const newStatus = historyOnly ? result.status : status;
            // Add the change in hold status to the nomination's history.
            history.push({ timestamp, status });
            objectStore.put({ ...result, ...extras, status: newStatus, statusHistory: history });
            tx.commit();
            awaitElement(() => document.querySelector('.wfnshDropdown')).then(ref => addEventToHistoryDisplay(ref, timestamp, status));
            resolve();
        }
        getNom.onerror = reject;
    }));

    // Also handle upgrades dynamically. Requires separate handling due to different response format.
    const handleUpgradeImmediate = result => new Promise(async (resolve, reject) => {
        for (const id in result) {
            if (result.hasOwnProperty(id)) {
                if (result[id].result === 'DONE') {
                    await addManualStatusChange(id, 'UPGRADE', true, { upgraded: true });
                }
            }
        }
        resolve();
    });

    // Get a user ID to properly handle browsers shared between several users. Store a hash only, for privacy.
    const handleProfile = ({ socialProfile }) => {
        if (socialProfile.email) userHash = cyrb53(socialProfile.email);
    };

    const handleNominations = ({ nominations }) => {
        addNotificationDiv();
        // Check for changes in nomination list.
        getIDBInstance().then(db => checkNominationChanges(db, nominations)).catch(console.error);
        // Add event listener for each element in the nomination list, so we can display the history box for nominations on click.
        awaitElement(() => document.querySelector('app-nominations-list')).then(ref => {
            // Each item in the list only has the image URL for unique identification. Map these to nomination IDs.
            const nomCache = {};
            let box = null;
            nominations.forEach(nom => { nomCache[nom.imageUrl] = nom.id; });
            ref.addEventListener('click', e => {
                const item = e.target.closest('app-nominations-list-item');
                if (item) {
                    // Get the nomination ID from the previously built map.
                    const nomId = nomCache[item.querySelector('img').src];
                    awaitElement(() => document.querySelector(nomDateSelector)).then(ref => {
                        // Ensure there is only one selection box.
                        if (box) box.parentElement.removeChild(box);
                        box = document.createElement('div');
                        box.classList.add('wfnshDropdown');
                        const select = document.createElement('select');
                        select.title = 'Right click to expand full history';
                        box.appendChild(select);
                        const textbox = document.createElement('div');
                        textbox.classList.add('wfnshInner');
                        box.appendChild(textbox);
                        select.addEventListener('contextmenu', e => {
                            e.preventDefault();
                            select.style.display = 'none';
                            textbox.style.display = 'block';
                            return false;
                        });
                        ref.parentNode.appendChild(box);
                        // Don't populate the dropdown until the nomination change detection has run successfully.
                        // That process sets ready = true when done. If it was already ready, then this will
                        // continue immediately. When ready, that means the previous connection was closed, so we
                        // open a new connection here to fetch data for the selected nomination.
                        awaitElement(() => ready).then(() => getIDBInstance()).then(db => {
                            const objectStore = db.transaction([OBJECT_STORE_NAME], "readonly").objectStore(OBJECT_STORE_NAME);
                            const getNom = objectStore.get(nomId);
                            getNom.onsuccess = () => {
                                const { result } = getNom;
                                // Create an option for initial nomination; this isn't stored in the IDB history, so we need
                                // to handle this as a special case here.
                                const nomDateOpt = document.createElement('option');
                                nomDateOpt.textContent = result.day + ' - Nominated';
                                select.appendChild(nomDateOpt);
                                const nomDateLine = document.createElement('p');
                                nomDateLine.textContent = result.day + ' - Nominated';
                                textbox.appendChild(nomDateLine);
                                // Then, add options for each entry in the history.
                                result.statusHistory.forEach(({ timestamp, status }) => addEventToHistoryDisplay(box, timestamp, status));
                                // Clean up when we're done.
                                db.close();
                            }
                        });
                    });
                }
            });
        });
    };

    // Adds a nomination history entry to the given history display <select>.
    const addEventToHistoryDisplay = (box, timestamp, status) => {
        // Format the date as UTC as this is what Wayfarer uses to display the nomination date.
        // Maybe make this configurable to user's local time later?
        const date = new Date(timestamp);
        const dateString = `${date.getUTCFullYear()}-${('0'+(date.getUTCMonth()+1)).slice(-2)}-${('0'+date.getUTCDate()).slice(-2)}`;
        const text = `${dateString} - ${stateMap.hasOwnProperty(status) ? stateMap[status] : status}`;

        const opt = document.createElement('option');
        opt.textContent = text;
        // Create a random "value" for our option, so we can select it from the dropdown after it's added.
        opt.value = 'n' + Math.random();
        const select = box.querySelector('select');
        select.appendChild(opt);
        // Select it by its random value.
        select.value = opt.value;

        const line = document.createElement('p');
        line.textContent = text;
        const textbox = box.querySelector('.wfnshInner');
        textbox.appendChild(line);
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

    // Opens an IDB database connection.
    // IT IS YOUR RESPONSIBILITY TO CLOSE THE RETURNED DATABASE CONNECTION WHEN YOU ARE DONE WITH IT.
    // THIS FUNCTION DOES NOT DO THIS FOR YOU - YOU HAVE TO CALL db.close()!
    const getIDBInstance = version => new Promise((resolve, reject) => {
        'use strict';

        if (!window.indexedDB) {
            reject('This browser doesn\'t support IndexedDB!');
            return;
        }

        const openRequest = indexedDB.open('wayfarer-tools-db', version);
        openRequest.onsuccess = event => {
            const db = event.target.result;
            const dbVer = db.version;
            console.log(`IndexedDB initialization complete (database version ${dbVer}).`);
            if (!db.objectStoreNames.contains(OBJECT_STORE_NAME)) {
                db.close();
                console.log(`Database does not contain column ${OBJECT_STORE_NAME}. Closing and incrementing version.`);
                getIDBInstance(dbVer + 1).then(resolve);
            } else {
                resolve(db);
            }
        };
        openRequest.onupgradeneeded = event => {
            console.log('Upgrading database...');
            const db = event.target.result;
            if (!db.objectStoreNames.contains(OBJECT_STORE_NAME)) {
                db.createObjectStore(OBJECT_STORE_NAME, { keyPath: 'id' });
            }
        };
    });

    // Checks for nomination changes. Name should be obvious tbh
    const checkNominationChanges = (db, nominations) => {
        console.log("Checking for nomination changes...");

        const tx = db.transaction([OBJECT_STORE_NAME], "readwrite");
        const start = Date.now();
        // Clean up when we're done (we'll commit later with tx.commit();)
        tx.oncomplete = event => {
            db.close();
            console.log(`Nomination changes processed in ${Date.now() - start} msec.`);
            ready = true;
        }

        const objectStore = tx.objectStore(OBJECT_STORE_NAME);
        const getList = objectStore.getAll();
        getList.onsuccess = () => {
            // Create an ID->nomination map for easy lookups.
            const savedNominations = Object.assign({}, ...getList.result.map(nom => ({ [nom.id]: nom })));

            // Count number of nominations that were submitted by the current user by matching userHash.
            const userNominationCount = getList.result.reduce((prev, cur) => prev + (cur.hasOwnProperty('userHash') && cur.userHash == userHash ? 1 : 0), 0);
            // Use this count to determine whether any nominations are missing from Wayfarer currently, that are stored in our cache in IDB.
            if (nominations.length < userNominationCount) {
                const missingCount = userNominationCount - nominations.length;
                createNotification(`${missingCount} of ${userNominationCount} nominations are missing!`, "red");
            }

            let newCount = 0;
            let importCount = 0;
            nominations.forEach(nom => {
                if (nom.id in savedNominations) {
                    // Nomination ALREADY EXISTS in IDB
                    const saved = savedNominations[nom.id];
                    const history = saved.statusHistory;
                    // Add upgrade change status if the nomination was upgraded.
                    if (nom.upgraded && !saved.upgraded) {
                        history.push({ timestamp: Date.now(), status: 'UPGRADE' });
                        createNotification(`${nom.title} was upgraded!`, 'blue');
                    }
                    // Add status change if the current status is different to the stored one.
                    if (nom.status != saved.status) {
                        history.push({ timestamp: Date.now(), status: nom.status });
                        // For most status updates, it's also desired to send a notification to the user.
                        if (nom.status !== 'HELD' && saved.status !== 'HELD') {
                            const { text, color } = getStatusNotificationText(nom.status);
                            createNotification(`${nom.title} ${text}`, color);
                        }
                    }
                    // Filter out irrelevant fields that we don't need store.
                    // Only retain fields from savedFields before we put it in IDB
                    const toSave = filterObject(nom, savedFields);
                    objectStore.put({ ...toSave, statusHistory: history, userHash });
                } else {
                    // Nomination DOES NOT EXIST in IDB yet
                    newCount++;
                    // Maybe it has WFES history? Check. This returns an empty array if not.
                    const history = importWFESHistoryFor(nom.id);
                    if (history.length) importCount++;
                    // Add current status to the history array if it isn't either
                    // - NOMINATED which is the initial status, or
                    // - the same as the previous status, if it was imported from WFES
                    if (nom.status !== 'NOMINATED') {
                        if (!history.length || history[history.length - 1].status !== nom.status) {
                            history.push({ timestamp: Date.now(), status: nom.status });
                        }
                    }
                    // Filter out irrelevant fields that we don't need store.
                    // Only retain fields from savedFields before we put it in IDB
                    const toSave = filterObject(nom, savedFields);
                    objectStore.put({ ...toSave, statusHistory: history, userHash });
                }
            });
            // Commit all changes. (And close the database connection due to tx.oncomplete.)
            tx.commit();
            if (newCount > 0) {
                let suffix = '';
                if (newCount > 1) {
                    suffix = 's';
                }
                if (importCount > 0) {
                    createNotification(`Found ${newCount} new nomination${suffix} in the list, of which ${importCount} had its history imported from WFES Nomination Notify.`, 'green');
                } else {
                    createNotification(`Found ${newCount} new nomination${suffix} in the list!`, 'green');
                }
            }
        }
    };

    // Return a history array containing old data from WFES Nomination Notify, if any.
    // If there is no history, it just returns an empty array.
    const importWFESHistoryFor = id => {
        // Build an importCache ONCE, so we don't spend a lot of time unnecessarily
        // parsing JSON for each new nomination in the list.
        for (const key in localStorage) {
            if (key.startsWith('wfesNomList') && !importCache.hasOwnProperty(key)) {
                importCache[key] = JSON.parse(localStorage[key]);
            }
        }
        const oldData = [];
        for (const key in importCache) {
            if (importCache.hasOwnProperty(key) && importCache[key].hasOwnProperty(id) && importCache[key][id].hasOwnProperty('wfesDates')) {
                // A match was found. Populate the history array.
                importCache[key][id].wfesDates.forEach(([ date, status ]) => {
                    switch (true) {
                        case status !== 'MISSING':
                        case status !== 'NOMINATED' || oldData.length > 0:
                            oldData.push({ timestamp: Date.parse(`${date}T00:00Z`), status });
                    }
                });
            }
        }
        // There may have been more than one key. Remove duplicate status updates, keeping the older one.
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

    // Returns an copy of obj containing only the keys specified in the keys array.
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
                background-color: goldenrod;
            }
            .dark .wfnshDropdown select {
                background-color: #262626;
            }
            .wfnshDropdown select {
                text-align: right;
            }
            .wfnshDropdown select option {
                text-align: left;
            }
            .wfnshDropdown .wfnshInner {
                display: none;
            }
            ${nomDateSelector} {
                display: none;
            }
            `;
        const style = document.createElement('style');
        style.type = 'text/css';
        style.innerHTML = css;
        // We're loading this script on document-start, which means <head> does not exist yet.
        // Wait for it to start existing before we try to add the CSS to it.
        const tryAdd = setInterval(() => {
            const head = document.querySelector('head');
            if (head) {
                clearInterval(tryAdd);
                console.log('Injecting styles...');
                head.appendChild(style);
            }
        }, 100);
    })();
})();
