// ==UserScript==
// @name         Wayfarer Nomination Status History
// @version      0.7.0
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
        NOMINATED: 'Nominated',
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
                        case window.origin + '/api/v1/vault/manage/appeal':
                            handleAppeal(data, result);
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
    const handleAppeal = ({ id }, result) => { if (result === 'DONE') addManualStatusChange(id, 'APPEALED'); };

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
            awaitElement(() => document.querySelector('.wfnshDropdown')).then(ref => addEventToHistoryDisplay(ref, timestamp, status, false, 1));
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
        addImportButton(nominations);
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
                                // Create an option for initial nomination; this may not be stored in the IDB history,
                                // so we need to handle this as a special case here.
                                if (!result.statusHistory.length || result.statusHistory[0].status !== 'NOMINATED') {
                                    const nomDateOpt = document.createElement('option');
                                    nomDateOpt.textContent = result.day + ' - Nominated';
                                    select.appendChild(nomDateOpt);
                                    const nomDateLine = document.createElement('p');
                                    nomDateLine.textContent = result.day + ' - Nominated';
                                    textbox.appendChild(nomDateLine);
                                }
                                // Then, add options for each entry in the history.
                                result.statusHistory.forEach(({ timestamp, status, verified }, i) => addEventToHistoryDisplay(box, timestamp, status, verified, i));
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
    const addEventToHistoryDisplay = (box, timestamp, status, verified, index) => {
        if (status === 'NOMINATED' && index > 0) status = 'Hold released';

        // Format the date as UTC as this is what Wayfarer uses to display the nomination date.
        // Maybe make this configurable to user's local time later?
        const date = new Date(timestamp);
        const dateString = `${date.getUTCFullYear()}-${('0'+(date.getUTCMonth()+1)).slice(-2)}-${('0'+date.getUTCDate()).slice(-2)}`;
        const text = `${dateString} - ${stateMap.hasOwnProperty(status) ? stateMap[status] : status}`;

        const opt = document.createElement('option');
        opt.textContent = text + (verified ? ' \u2713' : '');
        // Create a random "value" for our option, so we can select it from the dropdown after it's added.
        opt.value = 'n' + Math.random();
        const select = box.querySelector('select');
        select.appendChild(opt);
        // Select it by its random value.
        select.value = opt.value;

        const line = document.createElement('p');
        line.textContent = text;
        if (verified) line.classList.add('wfnshVerified');
        const textbox = box.querySelector('.wfnshInner');
        textbox.appendChild(line);
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
    };

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
    };

    const createNotification = (message, color = 'red') => {
        const notification = document.createElement('div');
        notification.classList.add('wfnshNotification');
        notification.classList.add('wfnshBg-' + color);
        notification.addEventListener('click', () => notification.parentNode.removeChild(notification));
        const content = document.createElement('p');
        content.textContent = message;
        notification.appendChild(content);
        awaitElement(() => document.getElementById('wfnshNotify')).then(ref => ref.appendChild(notification));
    };

    const addImportButton = nominations => {
        if (document.getElementById('wfnshImportBtn') !== null) return;
        const ref = document.querySelector('wf-logo');
        const div = document.createElement('div');
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = 'multiple';
        input.accept = 'message/rfc822,*.eml';
        input.style.display = 'none';
        input.addEventListener('change', e => {
            const outer = document.createElement('div');
            outer.classList.add('wfnshImportBg');
            document.querySelector('body').appendChild(outer);

            const loadingHeader = document.createElement('h2');
            loadingHeader.textContent = 'Parsing...';
            const loadingStatus = document.createElement('p');
            loadingStatus.textContent = 'Please wait';
            const loadingDiv = document.createElement('div');
            loadingDiv.classList.add('wfnshImportLoading');
            loadingDiv.appendChild(loadingHeader);
            loadingDiv.appendChild(loadingStatus);
            outer.appendChild(loadingDiv);

            getIDBInstance().then(db => {
                const tx = db.transaction([OBJECT_STORE_NAME], "readonly");
                const objectStore = tx.objectStore(OBJECT_STORE_NAME);
                const getList = objectStore.getAll();
                getList.onsuccess = () => {
                    const history = {};
                    getList.result.forEach(e => { history[e.id] = e.statusHistory });
                    db.close();
                    parseEmails(e.target.files, nominations, history, (n, t) => {
                        loadingStatus.textContent = `Processing email ${n} of ${t}`;
                    }).then(parsed => {
                        const merged = mergeEmailChanges(history, parsed.parsedChanges);
                        const mergeList = Object.keys(merged).map(id => ({ ...merged[id], id }));
                        mergeList.sort((a, b) => a.title.localeCompare(b.title));

                        let changeCount = 0;
                        mergeList.forEach(e => { changeCount += e.diffs.length; });

                        loadingDiv.style.display = 'none';
                        const inner = document.createElement('div');
                        inner.classList.add('wfnshImportInner');
                        outer.appendChild(inner);
                        const header = document.createElement('h1');
                        header.textContent = 'Preview email import';
                        inner.appendChild(header);
                        const sub = document.createElement('p');
                        sub.textContent = 'The summary below is a preview of the results of the email import. Please review the changes and click "Import" below to permanently commit the import.';
                        inner.appendChild(sub);
                        const btn1 = document.createElement('btn');
                        btn1.classList.add('wfnshTopButton');
                        btn1.textContent = `Import ${changeCount} change(s)`;
                        btn1.addEventListener('click', () => {
                            outer.removeChild(inner);
                            loadingHeader.textContent = 'Importing...';
                            loadingStatus.textContent = 'Please wait';
                            loadingDiv.style.display = 'block';
                            processEmailImport(mergeList, (n, t) => {
                                loadingStatus.textContent = `Importing change ${n} of ${t}`;
                            }).then(() => {
                                outer.parentNode.removeChild(outer);
                            });
                        });
                        inner.appendChild(btn1);
                        const btn2 = document.createElement('btn');
                        btn2.classList.add('wfnshTopButton');
                        btn2.classList.add('wfnshCancelButton');
                        btn2.textContent = 'Cancel import';
                        btn2.addEventListener('click', () => outer.parentNode.removeChild(outer));
                        inner.appendChild(btn2);

                        if (parsed.parseFailures.length) {
                            const failHeader = document.createElement('h3');
                            failHeader.textContent = `Import failures (${parsed.parseFailures.length})`;
                            inner.appendChild(failHeader);
                            parsed.parseFailures.forEach(e => inner.appendChild(renderEmailFailureEntry(e, false)));
                        }

                        if (mergeList.length) {
                            const changeHeader = document.createElement('h3');
                            changeHeader.textContent = `Changes to import (${changeCount})`;
                            inner.appendChild(changeHeader);
                            mergeList.forEach(e => inner.appendChild(renderEmailImportEntry(e)));
                        }

                        if (parsed.skippedEmails.length) {
                            const skipHeader = document.createElement('h3');
                            skipHeader.textContent = `Skipped emails (${parsed.skippedEmails.length})`;
                            inner.appendChild(skipHeader);
                            parsed.skippedEmails.forEach(e => inner.appendChild(renderEmailFailureEntry(e, true)));
                        }
                    });
                };
            }).catch(e => {
                loadingStatus.textContent = 'An error occurred'
                console.error(e);
            });
        });
        div.appendChild(input);
        const btn = document.createElement('btn');
        btn.textContent = 'Import emails';
        btn.addEventListener('click', () => input.click());
        btn.id = 'wfnshImportBtn';
        btn.classList.add('wfnshTopButton');
        div.appendChild(btn);
        ref.parentNode.parentNode.appendChild(div);
    };

    const renderEmailFailureEntry = (e, ignored) => {
        const timeOpts = { dateStyle: 'medium', timeStyle: 'long' };
        const entry = document.createElement('div');
        entry.classList.add('wfnshImportEntry');
        const title = document.createElement('p');
        title.classList.add('wfnshIETitle');
        title.textContent = e.file;
        entry.appendChild(title);
        if (e.subject) {
            const subject = document.createElement('p');
            subject.classList.add('wfnshIEErrExtra');
            subject.textContent = `Subject: ${e.subject}`;
            entry.appendChild(subject);
        }
        if (e.date) {
            const time = document.createElement('p');
            time.classList.add('wfnshIEErrExtra');
            time.textContent = `Received: ${e.date.toLocaleString(undefined, timeOpts)}`;
            entry.appendChild(time);
        }
        const error = document.createElement('p');
        if (!ignored) error.classList.add('wfnshIEError');
        error.textContent = e.reason;
        entry.appendChild(error);
        return entry;
    }

    const renderEmailImportEntry = e => {
        const timeOpts = { dateStyle: 'medium', timeStyle: 'long' };
        const entry = document.createElement('div');
        entry.classList.add('wfnshImportEntry');
        const title = document.createElement('p');
        title.classList.add('wfnshIETitle');
        title.textContent = e.title;
        entry.appendChild(title);
        e.diffs.forEach(diff => {
            const lblStatus = document.createElement('span');
            lblStatus.classList.add('wfnshIEStatus');
            lblStatus.textContent = stateMap[diff.status];
            const lblOld = document.createElement('span');
            lblOld.classList.add('wfnshIEOld');
            lblOld.textContent = diff.previously ? new Date(diff.previously).toLocaleString(undefined, timeOpts) : '(missing)';
            const lblNew = document.createElement('span');
            lblNew.classList.add('wfnshIENew');
            if (diff.verified) lblNew.classList.add('wfnshVerified');
            lblNew.textContent = new Date(diff.timestamp).toLocaleString(undefined, timeOpts);
            const change = document.createElement('p');
            change.classList.add('wfnshIEChange');
            change.appendChild(lblStatus);
            change.appendChild(document.createTextNode(': '));
            change.appendChild(lblOld);
            change.appendChild(document.createTextNode(' \u2192 '));
            change.appendChild(lblNew);
            entry.appendChild(change);
        });
        return entry;
    }

    const processEmailImport = (changes, progress) => new Promise((resolve, reject) => getIDBInstance().then(db => {
        console.log('Importing changes from emails...');

        const tx = db.transaction([OBJECT_STORE_NAME], "readwrite");
        const start = Date.now();
        // Clean up when we're done (we'll commit later with tx.commit();)
        tx.oncomplete = event => {
            db.close();
            console.log(`Email import completed in ${Date.now() - start} msec.`);
        }

        const objectStore = tx.objectStore(OBJECT_STORE_NAME);
        const getList = objectStore.getAll();
        getList.onsuccess = () => {
            // Create an ID->nomination map for easy lookups.
            const savedNominations = Object.assign({}, ...getList.result.map(nom => ({ [nom.id]: nom })));
            changes.forEach((nom, i) => {
                progress(i + 1, changes.length);
                if (nom.id in savedNominations) {
                    // Nomination ALREADY EXISTS in IDB
                    const saved = savedNominations[nom.id];
                    const update = { ...saved, statusHistory: nom.updates };
                    objectStore.put(update);
                }
            });
            tx.commit();
            resolve();
        };
    }));

    const mergeEmailChanges = (history, changes) => {
        const joinedChanges = {};
        Object.keys(changes).forEach(k => {
            const joined = [...changes[k].updates, ...history[k]];
            joined.sort((a, b) => a.timestamp - b.timestamp);
            for (let i = joined.length - 2; i >= 0; i--) {
                if (joined[i].status == joined[i + 1].status) {
                    // Duplicate status
                    const curDate = new Date(joined[i].timestamp);
                    if (!(curDate.getUTCMilliseconds() || curDate.getUTCSeconds() || curDate.getUTCMinutes() || curDate.getUTCHours())) {
                        // All of the above are 0 means this was with extreme likelihood a WFES import that is less accurate.
                        // Thus we keep the email date instead for this one even though it happened "in the future".
                        joined.splice(i, 1);
                    } else {
                        joined.splice(i + 1, 1);
                    }
                }
            }
            const diffs = [];
            for (let i = 0, j = 0; i < history[k].length && j < joined.length; i++, j++) {
                while (history[k][i].status !== joined[j].status) diffs.push({ ...joined[j++], previously: null });
                if (history[k][i].timestamp !== joined[j].timestamp || !!history[k][i].verified !== !!joined[j].verified) diffs.push({ ...joined[j], previously: history[k][i].timestamp });
            }
            if (diffs.length) joinedChanges[k] = { ...changes[k], updates: joined, diffs };
        });
        return joinedChanges;
    };

    const parseEmails = (files, nominations, statusHistory, progress) => new Promise(async (resolve, reject) => {
        const remapChars = text => {
            const map = {
                'a': 'åä',
                'A': 'ÅÄ',
                'o': 'óö',
                'O': 'ÓÖ',
                'e': 'é',
                'E': 'É',
                'u': 'ü',
                'U': 'Ü',
                "'": '"'
            };
            for (const k in map) {
                if (map.hasOwnProperty(k)) {
                    text = text.replaceAll(new RegExp(`[${map[k]}]`, 'g'), k);
                }
            }
            return text;
        };

        const tryNull = call => {
            try {
                return call() || null;
            } catch (e) {
                return null;
            }
        }

        const eQuery = {
            IMAGE_ANY: doc => tryNull(() => doc.querySelector('img').src),
            IMAGE_ALT: alt => doc => tryNull(() => doc.querySelector(`img[alt='${alt}']`).src),
            ING_TYPE_1: doc => tryNull(() => doc.querySelector('h2 ~ p:last-of-type').lastChild.textContent.trim()),
            ING_TYPE_2: doc => tryNull(() => doc.querySelector('h2 ~ p:last-of-type img').src),
            ING_TYPE_3: (status, regex, tooClose) => (doc, fh) => {
                const match = fh.subject.match(regex);
                if (!match) throw new Error('Unable to extract the name of the Wayspot from this email.');
                const text = doc.querySelector('p').textContent.trim();
                if (tooClose && text.includes(tooClose)) {
                    status = 'ACCEPTED';
                }
                const candidates = nominations.filter(e => e.title == match.groups.title && e.status == status);
                if (!candidates.length) throw new Error(`Unable to find a nomination with status ${status} that matches the title "${match.groups.title}" on this Wayfarer account.`);
                if (candidates.length > 1) throw new Error(`Multiple nominations with status ${status} on this Wayfarer account match the title "${match.groups.title}" specified in the email.`);
                return candidates[0].imageUrl;
            },
            ING_TYPE_4: doc => {
                const query = doc.querySelector('h2 ~ p:last-of-type');
                if (!query) return null;
                const [ title, desc ] = query.textContent.split('\n');
                if (!title || !desc) return null;
                const candidates = nominations.filter(e => e.title == title);
                if (!candidates.length) throw new Error(`Unable to find a nomination that matches the title "${title}" on this Wayfarer account.`);
                if (candidates.length > 1) {
                    const cand2 = candidates.filter(e => e.description == desc);
                    if (!cand2.length) throw new Error(`Unable to find a nomination that matches the title "${title}" and description "${desc}" on this Wayfarer account.`);
                    if (cand2.length > 1) throw new Error(`Multiple nominations on this Wayfarer account match the title "${title}" and description "${desc}" specified in the email.`);
                    return cand2[0].imageUrl;
                }
                return candidates[0].imageUrl;
            },
            ING_TYPE_5: (doc, fh) => {
                const a = doc.querySelector('a[href^="https://www.ingress.com/intel?ll="]');
                if (!a) return null;
                const match = a.href.match(/\?ll=(?<lat>-?\d{1,2}(\.\d{1,6})?),(?<lng>-?\d{1,3}(\.\d{1,6})?)/);
                if (!match) return;
                const candidates = nominations.filter(e => e.lat == parseFloat(match.groups.lat) && e.lng == parseFloat(match.groups.lng));
                if (candidates.length != 1) {
                    const m2 = fh.subject.match(/^(Ingress Portal Live|Portal review complete): ?(?<title>.*)$/);
                    if (!m2) throw new Error('Unable to extract the name of the Wayspot from this email.');
                    const cand2 = (candidates.length ? candidates : nominations).filter(e => e.title == m2.groups.title);
                    if (!cand2.length) throw new Error(`Unable to find a nomination that matches the title "${m2.groups.title}" or is located at ${match.groups.lat},${match.groups.lng} on this Wayfarer account.`);
                    if (cand2.length > 1) throw new Error(`Multiple nominations on this Wayfarer account match the title "${m2.groups.title}" and/or are located at ${match.groups.lat},${match.groups.lng} as specified in the email.`);
                    return cand2[0].imageUrl;
                }
                return candidates[0].imageUrl;
            },
            ING_TYPE_6: regex => (doc, fh) => {
                const match = fh.subject.match(regex);
                if (!match) throw new Error('Unable to extract the name of the Wayspot from this email.');
                const date = new Date(fh.date);
                // Wayfarer is in UTC, but emails are in local time. Work around this by also matching against the preceding
                // and following dates from the one specified in the email.
                const dateCur = utcDateToISO8601(date);
                const dateNext = utcDateToISO8601(shiftDays(date, 1));
                const datePrev = utcDateToISO8601(shiftDays(date, -1));
                const dates = [ datePrev, dateCur, dateNext ];
                const candidates = nominations.filter(e => dates.includes(e.day) && e.title.trim() == match.groups.title);
                if (!candidates.length) throw new Error(`Unable to find a nomination that matches the title "${match.groups.title}" and submission date ${dateCur} on this Wayfarer account.`);
                if (candidates.length > 1) throw new Error(`Multiple nominations on this Wayfarer account match the title "${match.groups.title}" and submission date ${dateCur} specified in the email.`);
                return candidates[0].imageUrl;
            },
            PGO_TYPE_1: doc => tryNull(() => doc.querySelector('h2 ~ p:last-of-type').previousElementSibling.textContent.trim()),
            PGO_TYPE_2: doc => tryNull(() => doc.querySelector('h2 ~ p:last-of-type').previousElementSibling.querySelector('img').src),
            WF_DECIDED: (regex, months) => doc => {
                const mr = new RegExp(regex.source.split('(?<month>)').join(`(?<month>${months.join('|')})`));
                const match = doc.querySelector('.em_font_20').textContent.trim().match(mr);
                const month = months.indexOf(match.groups.month) + 1;
                const date = `${match.groups.year}-${('0' + month).slice(-2)}-${('0' + match.groups.day).slice(-2)}`;
                // Wayfarer is in UTC, but emails are in local time. Work around this by also matching against the preceding
                // and following dates from the one specified in the email.
                const dateNext = utcDateToISO8601(shiftDays(new Date(date), 1));
                const datePrev = utcDateToISO8601(shiftDays(new Date(date), -1));
                const dates = [ datePrev, date, dateNext ];
                const candidates = nominations.filter(e => dates.includes(e.day) && remapChars(e.title) == match.groups.title && ['ACCEPTED', 'REJECTED', 'DUPLICATE', 'APPEALED', 'NIANTIC_REVIEW'].includes(e.status));
                if (!candidates.length) throw new Error(`Unable to find a nomination that matches the title "${match.groups.title}" and submission date ${date} on this Wayfarer account.`);
                if (candidates.length > 1) throw new Error(`Multiple nominations on this Wayfarer account match the title "${match.groups.title}" and submission date ${date} specified in the email.`);
                return candidates[0].imageUrl;
            }
        };

        const eType = {
            NOMINATED: 'NOMINATED',
            ACCEPTED: 'ACCEPTED',
            REJECTED: 'REJECTED',
            DUPLICATE: 'DUPLICATE',
            APPEALED: 'APPEALED',
            determineRejectType: (nom, fh) => {
                const [ appealed ] = statusHistory[nom.id].filter(e => e.status === 'APPEALED');
                if (appealed) {
                    const appealDate = new Date(appealed.timestamp);
                    const emailDate = new Date(fh.date);
                    // Niantic doesn't send the correct email when they reject something as duplicate on appeal.
                    // We catch this here to prevent errors.
                    if (appealDate < emailDate) return eType.determineAppealRejectType(nom);
                }
                for (let i = 0; i < statusHistory[nom.id].length; i++) {
                    switch (statusHistory[nom.id][i].status) {
                        case 'REJECTED':
                            return eType.REJECTED;
                        case 'DUPLICATE':
                            return eType.DUPLICATE;
                        case 'APPEALED':
                            throw new Error('This email was rejected because determining the former status of this nomination after appealing it is impossible if it was appealed prior to the installation of this script.');
                    }
                }
                throw new Error(`This email was rejected because it was not possible to determine how this nomination was rejected (expected status REJECTED or DUPLICATE, but observed ${statusHistory[nom.id][statusHistory[nom.id].length - 1].status}).`);
            },
            determineAppealRejectType: nom => {
                const start = statusHistory[nom.id].indexOf('APPEALED') + 1;
                for (let i = start; i < statusHistory[nom.id].length; i++) {
                    switch (statusHistory[nom.id][i].status) {
                        case 'REJECTED':
                            return eType.REJECTED;
                        case 'DUPLICATE':
                            return eType.DUPLICATE;
                    }
                }
                throw new Error(`This email was not processed because it was not possible to determine how Niantic rejected the appeal (expected status REJECTED or DUPLICATE, but observed ${statusHistory[nom.id][statusHistory[nom.id].length - 1].status}).`);
            }
        };

        const eStatusHelpers = {
            WF_DECIDED: (acceptText, rejectText) => (doc, nom, fh) => {
                const text = doc.querySelector('.em_font_20').parentNode.nextElementSibling.textContent.replaceAll(/\s+/g, ' ').trim();
                if (acceptText && text.includes(acceptText)) return eType.ACCEPTED;
                if (rejectText && text.includes(rejectText)) return eType.determineRejectType(nom, fh);
                return null;
            },
            WF_APPEAL_DECIDED: (acceptText, rejectText) => (doc, nom) => {
                const text = doc.querySelector('.em_font_20').parentNode.nextElementSibling.textContent.replaceAll(/\s+/g, ' ').trim();
                if (acceptText && text.includes(acceptText)) return eType.ACCEPTED;
                if (rejectText && text.includes(rejectText)) return eType.determineAppealRejectType(nom);
                return null;
            },
            ING_DECIDED: (acceptText1, acceptText2, rejectText, dupText1, tooCloseText, dupText2) => doc => {
                const text = (doc.querySelector('h2 + p') || doc.querySelector('p')).textContent.trim();
                if (acceptText1 && text.startsWith(acceptText1)) return eType.ACCEPTED;
                if (acceptText2 && text.startsWith(acceptText2)) return eType.ACCEPTED;
                if (rejectText && text.includes(rejectText)) return eType.REJECTED;
                if (dupText1 && text.includes(dupText1)) return eType.DUPLICATE;
                if (tooCloseText && text.includes(tooCloseText)) return eType.ACCEPTED;
                const query2 = doc.querySelector('p:nth-child(2)');
                if (query2 && dupText2 && query2.textContent.trim().includes(dupText2)) return eType.DUPLICATE;
                return null;
            }
        };

        const emailParsers = [

            //  ---------------------------------------- ENGLISH [en] ----------------------------------------
            {
                // Nomination received (Wayfarer)
                subject: /^Thanks! Niantic Wayspot nomination received for/,
                status: () => eType.NOMINATED,
                image: [ eQuery.IMAGE_ALT('Submission Photo') ]
            },
            {
                // Nomination decided (Wayfarer)
                subject: /^Niantic Wayspot nomination decided for/,
                status: eStatusHelpers.WF_DECIDED(
                    'has decided to accept your Wayspot nomination.',
                    'has decided not to accept your Wayspot nomination.'
                ), image: [ eQuery.WF_DECIDED(
                    /^Thank you for your Wayspot nomination (?<title>.*) on (?<month>) (?<day>\d+), (?<year>\d+)!$/,
                    ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
                ) ]
            },
            {
                // Appeal received
                subject: /^Thanks! Niantic Wayspot appeal received for/,
                status: () => eType.APPEALED,
                image: [ eQuery.IMAGE_ALT('Submission Photo') ]
            },
            {
                // Appeal decided
                subject: /^Your Niantic Wayspot appeal has been decided for/,
                status: eStatusHelpers.WF_APPEAL_DECIDED(
                    'Niantic has decided that your nomination should be added as a Wayspot',
                    'Niantic has decided that your nomination should not be added as a Wayspot'
                ), image: [ eQuery.WF_DECIDED(
                    /^Thank you for your Wayspot nomination appeal for (?<title>.*) on (?<month>) (?<day>\d+), (?<year>\d+).$/,
                    ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
                ) ]
            },
            {
                // Nomination received (Ingress)
                subject: /^Portal submission confirmation:/,
                status: () => eType.NOMINATED,
                image: [ eQuery.IMAGE_ALT('Nomination Photo'), eQuery.ING_TYPE_1, eQuery.ING_TYPE_6(
                    /^Portal submission confirmation: (?<title>.*)$/
                ) ]
            },
            {
                // Nomination decided (Ingress)
                subject: /^Portal review complete:/,
                status: eStatusHelpers.ING_DECIDED(
                    'Good work, Agent:',
                    'Excellent work, Agent.',
                    'we have decided not to accept this candidate.',
                    'your candidate is a duplicate of an existing Portal.',
                    'this candidate is too close to an existing Portal',
                    'Your candidate is a duplicate of either an existing Portal'
                ), image: [ eQuery.IMAGE_ALT('Nomination Photo'), eQuery.ING_TYPE_1, eQuery.ING_TYPE_2, eQuery.ING_TYPE_5, eQuery.ING_TYPE_4 ]
            },
            {
                // Nomination received (Ingress Redacted)
                subject: /^Ingress Portal Submitted:/,
                status: () => eType.NOMINATED,
                image: [ eQuery.ING_TYPE_6(
                    /^Ingress Portal Submitted: (?<title>.*)$/
                ) ]
            },
            {
                // Nomination duplicated (Ingress Redacted)
                subject: /^Ingress Portal Duplicate:/,
                status: () => eType.DUPLICATE,
                image: [ eQuery.ING_TYPE_3(
                    eType.DUPLICATE,
                    /^Ingress Portal Duplicate: (?<title>.*)$/
                ) ]
            },
            {
                // Nomination accepted (Ingress Redacted)
                subject: /^Ingress Portal Live:/,
                status: () => eType.ACCEPTED,
                image: [ eQuery.ING_TYPE_5 ]
            },
            {
                // Nomination rejected (Ingress Redacted)
                subject: /^Ingress Portal Rejected:/,
                status: () => eType.REJECTED,
                image: [ eQuery.ING_TYPE_3(
                    eType.REJECTED,
                    /^Ingress Portal Rejected: (?<title>.*)$/,
                    'Unfortunately, this Portal is too close to another existing Portal'
                ) ]
            },
            {
                // Nomination received (PoGo)
                subject: /^Trainer [^:]+: Thank You for Nominating a PokéStop for Review.$/,
                status: () => eType.NOMINATED,
                image: [ eQuery.PGO_TYPE_1 ]
            },
            {
                // Nomination accepted (PoGo)
                subject: /^Trainer [^:]+: Your PokéStop Nomination Is Eligible!$/,
                status: () => eType.ACCEPTED,
                image: [ eQuery.PGO_TYPE_1, eQuery.PGO_TYPE_2 ]
            },
            {
                // Nomination rejected (PoGo)
                subject: /^Trainer [^:]+: Your PokéStop Nomination Is Ineligible$/,
                status: () => eType.REJECTED,
                image: [ eQuery.PGO_TYPE_1, eQuery.PGO_TYPE_2 ]
            },
            {
                // Nomination duplicated (PoGo)
                subject: /^Trainer [^:]+: Your PokéStop Nomination Review Is Complete:/,
                status: () => eType.DUPLICATE,
                image: [ eQuery.PGO_TYPE_1, eQuery.PGO_TYPE_2 ]
            },
            {
                // Photo, edit, or report; received or decided (PoGo)
                subject: /^(Photo Submission|Edit Suggestion|Invalid Pokéstop\/Gym Report) (Accepted|Received|Rejected)$/,
                ignore: true
            },
            {
                // Photo, edit, or report decided (Wayfarer)
                subject: /^Niantic Wayspot (edit suggestion|media submission|report) decided for/,
                ignore: true
            },
            {
                // Photo, edit, or report received (Wayfarer)
                subject: /^Thanks! Niantic Wayspot (edit suggestion|Photo|report) received for/,
                ignore: true
            },
            {
                // Photo or edit decided (Ingress)
                subject: /^Portal (edit|photo) review complete/,
                ignore: true
            },
            {
                // Edit received (Ingress)
                subject: /^Portal Edit Suggestion Received$/,
                ignore: true
            },
            {
                // Photo received (Ingress) or edit received (Ingress OPR)
                subject: /^Portal (edit|photo) submission confirmation/,
                ignore: true
            },
            {
                // Report received or decided (Ingress)
                subject: /^Invalid Ingress Portal report (received|reviewed)$/,
                ignore: true
            },

            //  ---------------------------------------- GERMAN [de] ----------------------------------------
            {
                // Nomination received (Wayfarer)
                subject: /^Danke! Wir haben deinen Vorschlag für den Wayspot/,
                status: () => eType.NOMINATED,
                image: [ eQuery.IMAGE_ALT('Submission Photo') ]
            },
            {
                // Nomination decided (Wayfarer)
                subject: /^Entscheidung zum Wayspot-Vorschlag/,
                status: eStatusHelpers.WF_DECIDED(
                    'hat entschieden, deinen Wayspot-Vorschlag zu akzeptieren.',
                    'hat entschieden, deinen Wayspot-Vorschlag nicht zu akzeptieren.'
                ), image: [ eQuery.WF_DECIDED(
                    /^danke, dass du den Wayspot-Vorschlag (?<title>.*) am (?<day>\d+)\.(?<month>)\.(?<year>\d+) eingereicht hast.$/,
                    ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']
                ) ]
            },
            {
                // Appeal received
                subject: /^Danke! Wir haben deinen Einspruch für den Wayspot/,
                status: () => eType.APPEALED,
                image: [ eQuery.IMAGE_ALT('Submission Photo') ]
            },
            {
                // Appeal decided
                subject: /^Entscheidung zum Einspruch für den Wayspot/,
                status: eStatusHelpers.WF_APPEAL_DECIDED(
                    'Niantic hat entschieden, dass dein Vorschlag ein Wayspot werden sollte.',
                    'Niantic hat entschieden, dass dein Vorschlag kein Wayspot werden sollte.'
                ), image: [ eQuery.WF_DECIDED(
                    /^danke, dass du am (?<day>\d+)\.(?<month>)\.(?<year>\d+) einen Einspruch für den Wayspot (?<title>.*) eingereicht hast.$/,
                    ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']
                ) ]
            },
            {
                // Nomination received (Ingress)
                subject: /^Empfangsbestätigung deines eingereichten Portalvorschlags:/,
                status: () => eType.NOMINATED,
                image: [ eQuery.IMAGE_ALT('Nomination Photo'), eQuery.ING_TYPE_1 ]
            },
            {
                // Nomination decided (Ingress)
                subject: /^Überprüfung des Portals abgeschlossen:/,
                status: eStatusHelpers.ING_DECIDED(
                    'Gute Arbeit, Agent!',
                    'Hervorragende Arbeit, Agent.',
                    'konnten wir deinen Vorschlag jedoch nicht annehmen.',
                    'Leider ist dieses Portal bereits vorhanden',
                    undefined //'this candidate is too close to an existing Portal.'
                ), image: [ eQuery.IMAGE_ALT('Nomination Photo'), eQuery.ING_TYPE_1, eQuery.ING_TYPE_2 ]
            },
            {
                // Nomination received (PoGo)
                subject: /^Trainer [^:]+: Danke, dass du einen PokéStop zur Überprüfung vorgeschlagen hast$/,
                status: () => eType.NOMINATED,
                image: [ eQuery.PGO_TYPE_1 ]
            },
            {
                // Nomination accepted (PoGo)
                subject: /^Trainer [^:]+: Dein vorgeschlagener PokéStop ist zulässig!$/,
                status: () => eType.ACCEPTED,
                image: [ eQuery.PGO_TYPE_1, eQuery.PGO_TYPE_2 ]
            },
            {
                // Nomination rejected (PoGo)
                subject: /^Trainer [^:]+: Dein vorgeschlagener PokéStop ist nicht zulässig$/,
                status: () => eType.REJECTED,
                image: [ eQuery.PGO_TYPE_1, eQuery.PGO_TYPE_2 ]
            },
            {
                // Nomination duplicated (PoGo)
                subject: /^Trainer [^:]+: Die Prüfung deines PokéStop-Vorschlags wurde abgeschlossen:/,
                status: () => eType.DUPLICATE,
                image: [ eQuery.PGO_TYPE_1, eQuery.PGO_TYPE_2 ]
            },
            {
                // Photo, edit, or report; received or decided (PoGo)
                subject: /^(Fotovorschlag|Vorschlag für Bearbeitung|Meldung zu unzulässigen PokéStop\/Arena) (akzeptiert|abgelehnt|erhalten)$/,
                ignore: true
            },
            {
                // Photo, edit, or report decided (Wayfarer)
                subject: /^Danke! Wir haben (den Upload Photo|deine Meldung|deinen Änderungsvorschlag) für den Wayspot/,
                ignore: true
            },
            {
                // Photo, edit, or report received (Wayfarer)
                subject: /^Entscheidung zu (deinem Upload|deiner Meldung|deinem Änderungsvorschlag) für den Wayspot/,
                ignore: true
            },
            {
                // Photo or edit decided (Ingress)
                subject: /^Überprüfung des (Vorschlags zur Änderung eines Portals|Portalfotos) abgeschlossen/,
                ignore: true
            },
            {
                // Photo or edit received (Ingress)
                subject: /^(Vorschlag für die Änderung eines Portals|Portalfotovorschlag) erhalten/,
                ignore: true
            },
            {
                // Report received or decided (Ingress)
                subject: /^Meldung zu ungültigem Ingress-Portal (erhalten|geprüft)$/,
                ignore: true
            },

            //  ---------------------------------------- SPANISH [es] ----------------------------------------
            // MISSING:
            // Appeal received
            // Appeal decided
            // Nomination received (Ingress)
            // Nomination decided (Ingress)
            // Nomination received (PoGo)
            // Nomination accepted (PoGo)
            // Nomination rejected (PoGo)
            // Nomination duplicated (PoGo)
            // Photo, edit, or report; received or decided (PoGo)
            // Photo, edit, or report decided (Wayfarer)
            // Photo, edit, or report received (Wayfarer)
            // Photo or edit decided (Ingress)
            // Edit received (Ingress)
            // Photo received (Ingress)
            // Report received or decided (Ingress)
            {
                // Nomination received (Wayfarer)
                subject: /^¡Gracias! ¡Hemos recibido la propuesta de Wayspot de Niantic/,
                status: () => eType.NOMINATED,
                image: [ eQuery.IMAGE_ALT('Submission Photo') ]
            },
            {
                // Nomination decided (Wayfarer)
                subject: /^Decisión tomada sobre la propuesta de Wayspot de Niantic/,
                status: eStatusHelpers.WF_DECIDED(
                    'ha decidido aceptartu propuesta de Wayspot.',
                    'ha decidido no aceptar tu propuesta de Wayspot.'
                ), image: [ eQuery.WF_DECIDED(
                    /^¡Gracias por tu propuesta de Wayspot (?<title>.*) enviada el (?<day>\d+)-(?<month>)-(?<year>\d+)!$/,
                    ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic']
                ) ]
            },
            {
                // Appeal received
                subject: /^¡Gracias! ¡Recurso de Wayspot de Niantic recibido para/,
                status: () => eType.APPEALED,
                image: [ eQuery.IMAGE_ALT('Submission Photo') ]
            },

            //  ---------------------------------------- FRENCH [fr] ----------------------------------------
            // MISSING:
            // Appeal received
            // Appeal decided
            // Nomination received (Ingress)
            // Nomination decided (Ingress)
            // Nomination received (PoGo)
            // Nomination accepted (PoGo)
            // Nomination rejected (PoGo)
            // Nomination duplicated (PoGo)
            // Photo, edit, or report; received or decided (PoGo)
            // Photo, edit, or report decided (Wayfarer)
            // Photo, edit, or report received (Wayfarer)
            // Photo or edit decided (Ingress)
            // Edit received (Ingress)
            // Photo received (Ingress)
            // Report received or decided (Ingress)
            {
                // Nomination received (Wayfarer)
                subject: /^Remerciements ! Proposition d’un Wayspot Niantic reçue pour/,
                status: () => eType.NOMINATED,
                image: [ eQuery.IMAGE_ALT('Submission Photo') ]
            },
            {
                // Nomination decided (Wayfarer)
                subject: /^Résultat concernant la proposition du Wayspot Niantic/,
                status: eStatusHelpers.WF_DECIDED(
                    'a décidé d’accepter votre proposition de Wayspot.',
                    undefined //'has decided not to accept your Wayspot nomination.'
                ), image: [ eQuery.WF_DECIDED(
                    /^Merci pour votre proposition de Wayspot (?<title>.*) le (?<day>\d+) (?<month>)\.? (?<year>\d+)\u2009!$/,
                    ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc']
                ) ]
            },

            //  ---------------------------------------- HINDI [hi] ----------------------------------------
            // MISSING:
            // Nomination received (Wayfarer)
            // Appeal received
            // Appeal decided
            // Nomination received (Ingress)
            // Nomination decided (Ingress)
            // Nomination received (PoGo)
            // Nomination accepted (PoGo)
            // Nomination rejected (PoGo)
            // Nomination duplicated (PoGo)
            // Photo, edit, or report; received or decided (PoGo)
            // Photo, edit, or report decided (Wayfarer)
            // Photo, edit, or report received (Wayfarer)
            // Photo or edit decided (Ingress)
            // Edit received (Ingress)
            // Photo received (Ingress)
            // Report received or decided (Ingress)
            {
                // Nomination decided (Wayfarer)
                subject: /^Niantic Wayspot का नामांकन .* के लिए तय किया गया$/,
                status: eStatusHelpers.WF_DECIDED(
                    undefined, //'has decided to accept your Wayspot nomination.',
                    'ने को आपके Wayspot नामांकन को अस्वीकार करने का निर्णय लिया है'
                ), image: [ eQuery.WF_DECIDED(
                    /^(?<month>) (?<day>\d+), (?<year>\d+) पर Wayspot नामांकन (?<title>.*) के लिए धन्यवाद!$/,
                    ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
                ) ]
            },

            //  ---------------------------------------- ITALIAN [it] ----------------------------------------
            // MISSING:
            // Appeal received
            // Appeal decided
            // Nomination received (Ingress)
            // Nomination decided (Ingress)
            // Nomination received (PoGo)
            // Nomination accepted (PoGo)
            // Nomination rejected (PoGo)
            // Nomination duplicated (PoGo)
            // Photo, edit, or report; received or decided (PoGo)
            // Photo, edit, or report decided (Wayfarer)
            // Photo, edit, or report received (Wayfarer)
            // Photo or edit decided (Ingress)
            // Edit received (Ingress)
            // Photo received (Ingress)
            // Report received or decided (Ingress)
            {
                // Nomination received (Wayfarer)
                subject: /^Grazie! Abbiamo ricevuto una candidatura di Niantic Wayspot per/,
                status: () => eType.NOMINATED,
                image: [ eQuery.IMAGE_ALT('Submission Photo') ]
            },
            {
                // Nomination decided (Wayfarer)
                subject: /^Proposta di Niantic Wayspot decisa per/,
                status: eStatusHelpers.WF_DECIDED(
                    undefined, //'has decided to accept your Wayspot nomination.',
                    'Sfortunatamente, la tua proposta di Wayspot è stata respinta'
                ), image: [ eQuery.WF_DECIDED(
                    /^Grazie per la proposta di Wayspot (?<title>.*) in data (?<day>\d+)-(?<month>)-(?<year>\d+).$/,
                    ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']
                ) ]
            },

            //  ---------------------------------------- JAPANESE [jp] ----------------------------------------
            // MISSING:
            // Appeal received
            // Appeal decided
            // Nomination received (Ingress)
            // Nomination decided (Ingress)
            // Nomination received (PoGo)
            // Nomination accepted (PoGo)
            // Nomination rejected (PoGo)
            // Nomination duplicated (PoGo)
            // Photo, edit, or report; received or decided (PoGo)
            // Photo, edit, or report decided (Wayfarer)
            // Photo, edit, or report received (Wayfarer)
            // Photo or edit decided (Ingress)
            // Edit received (Ingress)
            // Photo received (Ingress)
            // Report received or decided (Ingress)
            {
                // Nomination received (Wayfarer)
                subject: /^ありがとうございます。 Niantic Wayspotの申請「.*」が受領されました。$/,
                status: () => eType.NOMINATED,
                image: [ eQuery.IMAGE_ALT('Submission Photo') ]
            },
            {
                // Nomination decided (Wayfarer)
                subject: /^Niantic Wayspotの申請「.*」が決定しました。$/,
                status: eStatusHelpers.WF_DECIDED(
                    undefined, //'has decided to accept your Wayspot nomination.',
                    '不幸にも コミュニティはあなたのWayspot候補を承認しませんでした。'
                ), image: [ eQuery.WF_DECIDED(
                    /^(?<year>\d+)\/(?<month>)\/(?<day>\d+)にWayspot申請「(?<title>.*)」をご提出いただき、ありがとうございました。$/,
                    ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']
                ) ]
            },

            //  ---------------------------------------- KOREAN [kr] ----------------------------------------
            // MISSING:
            // Appeal received
            // Appeal decided
            // Nomination received (Ingress)
            // Nomination decided (Ingress)
            // Nomination received (PoGo)
            // Nomination accepted (PoGo)
            // Nomination rejected (PoGo)
            // Nomination duplicated (PoGo)
            // Photo, edit, or report; received or decided (PoGo)
            // Photo, edit, or report decided (Wayfarer)
            // Photo, edit, or report received (Wayfarer)
            // Photo or edit decided (Ingress)
            // Edit received (Ingress)
            // Photo received (Ingress)
            // Report received or decided (Ingress)
            {
                // Nomination received (Wayfarer)
                subject: /^감사합니다! .*에 대한 Niantic Wayspot 후보 신청이 완료되었습니다!$/,
                status: () => eType.NOMINATED,
                image: [ eQuery.IMAGE_ALT('Submission Photo') ]
            },
            {
                // Nomination decided (Wayfarer)
                subject: /에 대한 Niantic Wayspot 후보 결정이 완료됨$/,
                status: eStatusHelpers.WF_DECIDED(
                    undefined, //'has decided to accept your Wayspot nomination.',
                    '제안한 Wayspot 후보를 승인하지않았습니다 .'
                ), image: [ eQuery.WF_DECIDED(
                    /^(?<year>\d+). (?<month>). (?<day>\d+)에 Wayspot 후보 (?<title>.*)을\(를\) 제출해 주셔서 감사드립니다!$/,
                    ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']
                ) ]
            },

            //  ---------------------------------------- DUTCH [nl] ----------------------------------------
            // MISSING:
            // Appeal received
            // Appeal decided
            // Nomination received (Ingress)
            // Nomination decided (Ingress)
            // Nomination received (PoGo)
            // Nomination accepted (PoGo)
            // Nomination rejected (PoGo)
            // Nomination duplicated (PoGo)
            // Photo, edit, or report; received or decided (PoGo)
            // Photo, edit, or report decided (Wayfarer)
            // Photo, edit, or report received (Wayfarer)
            // Photo or edit decided (Ingress)
            // Edit received (Ingress)
            // Photo received (Ingress)
            // Report received or decided (Ingress)
            {
                // Nomination received (Wayfarer)
                subject: /^Bedankt! Niantic Wayspot-nominatie ontvangen voor/,
                status: () => eType.NOMINATED,
                image: [ eQuery.IMAGE_ALT('Submission Photo') ]
            },
            {
                // Nomination decided (Wayfarer)
                subject: /^Besluit over Niantic Wayspot-nominatie voor/,
                status: eStatusHelpers.WF_DECIDED(
                    'heeft besloten om je Wayspot-nominatie wel te accepteren.',
                    'heeft besloten om je Wayspot-nominatie niet te accepteren.'
                ), image: [ eQuery.WF_DECIDED(
                    /^Bedankt voor je Wayspot-nominatie (?<title>.*) op (?<day>\d+)-(?<month>)-(?<year>\d+)!$/,
                    ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
                ) ]
            },

            //  ---------------------------------------- NORWEGIAN [no] ----------------------------------------
            // MISSING:
            // Nomination received (Wayfarer)
            // Nomination decided (Wayfarer)
            // Appeal received
            // Nomination received (Ingress)
            // Nomination decided (Ingress)
            // Nomination received (PoGo)
            // Nomination accepted (PoGo)
            // Nomination rejected (PoGo)
            // Nomination duplicated (PoGo)
            // Photo, edit, or report; received or decided (PoGo)
            // Photo, edit, or report decided (Wayfarer)
            // Photo, edit, or report received (Wayfarer)
            // Photo or edit decided (Ingress)
            // Edit received (Ingress)
            // Photo received (Ingress)
            // Report received or decided (Ingress)
            {
                // Appeal decided
                subject: /^En avgjørelse er tatt for Niantic Wayspot-klagen for/,
                status: eStatusHelpers.WF_APPEAL_DECIDED(
                    'Niantic har valgt å legge til nominasjonen som en Wayspot',
                    undefined //'Niantic has decided that your nomination should not be added as a Wayspot'
                ), image: [ eQuery.WF_DECIDED(
                    /^Takk for klagen i forbindelse med Wayspot-nominasjonen (?<title>.*), som du sendte inn (?<day>\d+)\.(?<month>)\.(?<year>\d+).$/,
                    ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des']
                ) ]
            },

            //  ---------------------------------------- PORTUGESE [pt] ----------------------------------------
            // MISSING:
            // Appeal received
            // Appeal decided
            // Nomination received (Ingress)
            // Nomination decided (Ingress)
            // Nomination received (PoGo)
            // Nomination accepted (PoGo)
            // Nomination rejected (PoGo)
            // Nomination duplicated (PoGo)
            // Photo, edit, or report; received or decided (PoGo)
            // Photo, edit, or report decided (Wayfarer)
            // Photo, edit, or report received (Wayfarer)
            // Photo or edit decided (Ingress)
            // Edit received (Ingress)
            // Photo received (Ingress)
            // Report received or decided (Ingress)
            {
                // Nomination received (Wayfarer)
                subject: /^Agradecemos a sua indicação para o Niantic Wayspot/,
                status: () => eType.NOMINATED,
                image: [ eQuery.IMAGE_ALT('Submission Photo') ]
            },
            {
                // Nomination decided (Wayfarer)
                subject: /^Decisão sobre a indicação do Niantic Wayspot/,
                status: eStatusHelpers.WF_DECIDED(
                    'a comunidade decidiu aceitar a sua indicação de Wayspot.',
                    undefined //'has decided not to accept your Wayspot nomination.'
                ), image: [ eQuery.WF_DECIDED(
                    /^Agradecemos a sua indicação do Wayspot (?<title>.*) em (?<day>\d+)\/(?<month>)\/(?<year>\d+).$/,
                    ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
                ) ]
            },

            //  ---------------------------------------- RUSSIAN [ru] ----------------------------------------
            // MISSING:
            // Appeal received
            // Appeal decided
            // Nomination received (Ingress)
            // Nomination decided (Ingress)
            // Nomination received (PoGo)
            // Nomination accepted (PoGo)
            // Nomination rejected (PoGo)
            // Nomination duplicated (PoGo)
            // Photo, edit, or report; received or decided (PoGo)
            // Photo, edit, or report decided (Wayfarer)
            // Photo, edit, or report received (Wayfarer)
            // Photo or edit decided (Ingress)
            // Edit received (Ingress)
            // Photo received (Ingress)
            // Report received or decided (Ingress)
            {
                // Nomination received (Wayfarer)
                subject: /^Спасибо! Номинация Niantic Wayspot для .* получена!$/,
                status: () => eType.NOMINATED,
                image: [ eQuery.IMAGE_ALT('Submission Photo') ]
            },
            {
                // Nomination decided (Wayfarer)
                subject: /^Вынесено решение по номинации Niantic Wayspot для/,
                status: eStatusHelpers.WF_DECIDED(
                    undefined, //'has decided to accept your Wayspot nomination.',
                    'решило отклонить вашу номинацию Wayspot.'
                ), image: [ eQuery.WF_DECIDED(
                    /^Благодарим за то, что отправили номинацию Wayfarer (?<title>.*) (?<day>\d+)\.(?<month>)\.(?<year>\d+)!$/,
                    ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']
                ) ]
            },

            //  ---------------------------------------- SWEDISH [sv] ----------------------------------------
            // MISSING:
            // Appeal received
            // Nomination received (Ingress)
            // Nomination decided (Ingress)
            // Nomination received (PoGo)
            // Nomination accepted (PoGo)
            // Nomination rejected (PoGo)
            // Nomination duplicated (PoGo)
            // Photo, edit, or report; received or decided (PoGo)
            // Photo, edit, or report decided (Wayfarer)
            // Photo, edit, or report received (Wayfarer)
            // Photo or edit decided (Ingress)
            // Edit received (Ingress)
            // Photo received (Ingress)
            // Report received or decided (Ingress)
            {
                // Nomination received (Wayfarer)
                subject: /^Tack! Niantic Wayspot-nominering har tagits emot för/,
                status: () => eType.NOMINATED,
                image: [ eQuery.IMAGE_ALT('Submission Photo') ]
            },
            {
                // Nomination decided (Wayfarer)
                subject: /^Niantic Wayspot-nominering har beslutats om för/,
                status: eStatusHelpers.WF_DECIDED(
                    'har beslutat att accepteradin Wayspot-nominering.',
                    'har beslutat att inte acceptera din Wayspot-nominering.'
                ), image: [ eQuery.WF_DECIDED(
                    /^Tack för din Wayspot-nominering (?<title>.*) den (?<year>\d+)-(?<month>)-(?<day>\d+)!$/,
                    ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
                ) ]
            },
            {
                // Appeal decided
                subject: /^Din Niantic Wayspot-överklagan har beslutats om för/,
                status: eStatusHelpers.WF_APPEAL_DECIDED(
                    'Niantic har beslutat att din nominering ACCEPT ska/inte ska läggas till som en Wayspot',
                    undefined //'Niantic has decided that your nomination should not be added as a Wayspot'
                ), image: [ eQuery.WF_DECIDED(
                    /^Tack för överklagan för din Wayspot-nominering för (?<title>.*) den (?<year>\d+)-(?<month>)-(?<day>\d+).$/,
                    ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
                ) ]
            },

            //  ---------------------------------------- THAI [th] ----------------------------------------
            // MISSING:
            // Appeal received
            // Appeal decided
            // Nomination received (Ingress)
            // Nomination decided (Ingress)
            // Nomination received (PoGo)
            // Nomination accepted (PoGo)
            // Nomination rejected (PoGo)
            // Nomination duplicated (PoGo)
            // Photo, edit, or report; received or decided (PoGo)
            // Photo, edit, or report decided (Wayfarer)
            // Photo, edit, or report received (Wayfarer)
            // Photo or edit decided (Ingress)
            // Edit received (Ingress)
            // Photo received (Ingress)
            // Report received or decided (Ingress)
            {
                // Nomination received (Wayfarer)
                subject: /^ขอบคุณ! เราได้รับการเสนอสถานที่ Niantic Wayspot สำหรับ/,
                status: () => eType.NOMINATED,
                image: [ eQuery.IMAGE_ALT('Submission Photo') ]
            },
            {
                // Nomination decided (Wayfarer)
                subject: /^ผลการตัดสินการเสนอสถานที่ Niantic Wayspot สำหรับ/,
                status: eStatusHelpers.WF_DECIDED(
                    undefined, //'has decided to accept your Wayspot nomination.',
                    'ชุมชนได้ตัดสินใจ ไม่ยอมรับการ Wayspot ของคุณ'
                ), image: [ eQuery.WF_DECIDED(
                    /^ขอบคุณสำหรับการเสนอสถานที่ Wayspot ของคุณ เรื่อง (?<title>.*) เมื่อวันที่ (?<day>\d+) (?<month>) (?<year>\d+)!$/,
                    ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
                ) ]
            },

            //  ---------------------------------------- CHINESE [zh] ----------------------------------------
            // MISSING:
            // Appeal received
            // Appeal decided
            // Nomination received (Ingress)
            // Nomination decided (Ingress)
            // Nomination received (PoGo)
            // Nomination accepted (PoGo)
            // Nomination rejected (PoGo)
            // Nomination duplicated (PoGo)
            // Photo, edit, or report; received or decided (PoGo)
            // Photo, edit, or report decided (Wayfarer)
            // Photo, edit, or report received (Wayfarer)
            // Photo or edit decided (Ingress)
            // Edit received (Ingress)
            // Photo received (Ingress)
            // Report received or decided (Ingress)
            {
                // Nomination received (Wayfarer)
                subject: /^感謝你！ 我們已收到 Niantic Wayspot 候選/,
                status: () => eType.NOMINATED,
                image: [ eQuery.IMAGE_ALT('Submission Photo') ]
            },
            {
                // Nomination decided (Wayfarer)
                subject: /^社群已對 Niantic Wayspot 候選 .* 做出決定$/,
                status: eStatusHelpers.WF_DECIDED(
                    '社群已決定 接受 Wayspot 候選地。',
                    undefined //'has decided not to accept your Wayspot nomination.'
                ), image: [ eQuery.WF_DECIDED(
                    /^感謝你在 (?<year>\d+)-(?<month>)-(?<day>\d+) 提交 Wayspot 候選 (?<title>.*)！$/,
                    ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']
                ) ]
            },
        ];

        const parsedChanges = {};
        const parseFailures = [];
        const skippedEmails = [];

        const dp = new DOMParser();
        const supportedSenders = [
            'notices@wayfarer.nianticlabs.com',
            'nominations@portals.ingress.com',
            'hello@pokemongolive.com',
            'ingress-support@google.com',
            'ingress-support@nianticlabs.com'
        ];
        for (let i = 0; i < files.length; i++) {
            progress(i + 1, files.length);
            const content = await files[i].text();
            const mime = parseMIME(content);
            if (!mime) {
                skippedEmails.push({
                    file: files[i].name,
                    reason: `This file does not appear to be an email in MIME format (invalid RFC 822 data).`
                });
                continue;
            }
            const [ headers, mimeBody ] = mime;

            const fh = {};
            for (const i of ['subject', 'date', 'from', 'content-transfer-encoding', 'content-type']) {
                const matching = headers.filter(e => e[0].toLowerCase() == i);
                fh[i] = matching.length ? matching.pop()[1] : null;
            }

            if (!supportedSenders.includes(extractEmail(fh.from))) {
                skippedEmails.push({
                    file: files[i].name,
                    subject: fh.subject,
                    date: fh.date,
                    reason: `Sender "${fh.name}" was not recognized as a valid Niantic Wayfarer or OPR-related email address.`
                });
                continue;
            }

            let htmlBody = null, charset = null;
            const ct = parseContentType(fh['content-type']);
            if (fh['content-transfer-encoding'] == null && ct.type == 'multipart/alternative') {
                // Multipart message - extract the HTML part
                mimeBody.split(`--${ct.params.boundary}`).forEach(part => {
                    const partMime = parseMIME(part);
                    if (!partMime) return;
                    const [ partHead, partBody ] = partMime;
                    for (const i of ['content-transfer-encoding', 'content-type']) {
                        const matching = partHead.filter(e => e[0].toLowerCase() == i);
                        fh[i] = matching.length ? matching.pop()[1] : null;
                    }
                    const partCT = parseContentType(fh['content-type']);
                    if (fh['content-transfer-encoding'] && fh['content-transfer-encoding'].toLowerCase() == 'quoted-printable' && partCT.type == 'text/html') {
                        htmlBody = partBody;
                        charset = (partCT.params.charset || 'utf-8').toLowerCase();
                    }
                });
            } else if (fh['content-transfer-encoding'].toLowerCase() == 'quoted-printable' && ct.type == 'text/html') {
                // HTML message
                htmlBody = mimeBody;
                charset = (ct.params.charset || 'utf-8').toLowerCase();
            } else {
                parseFailures.push({
                    file: files[i].name,
                    subject: fh.subject,
                    date: fh.date,
                    reason: `Unsupported Content-Transfer-Encoding (${fh['content-transfer-encoding']}) and/or Content-Type (${fh['content-type']}).`
                });
                continue;
            }

            try {
                // Unfold QP CTE
                const body = htmlBody
                .split(/=\r?\n/).join('')
                .split(/\r?\n/).map(e => {
                    const uriStr = e.split('%').join('=25').split('=').join('%');
                    switch (charset) {
                        case 'utf-8':
                            return decodeURIComponent(uriStr);
                        case 'iso-8859-1':
                        case 'us-ascii':
                        case 'windows-1252':
                            return decodeURIComponent(asciiToUTF8(uriStr));
                        default:
                            throw new Error(`Unknown charset ${charset}.`);
                    }
                }).join('\n');

                const doc = dp.parseFromString(body, 'text/html');
                /* DEBUG */
                //console.log(doc);
                /* DEBUG */
                let success = false;
                let ignore = false;
                for (let j = 0; j < emailParsers.length; j++) {
                    if (!fh.subject.match(emailParsers[j].subject)) continue;
                    if (emailParsers[j].ignore) {
                        skippedEmails.push({
                            file: files[i].name,
                            subject: fh.subject,
                            date: fh.date,
                            reason: `Edit, photo, and wayspot removal submission and decision emails are not supported at this time.`
                        });
                        ignore = true;
                        break;
                    }
                    let url = null;
                    if (emailParsers[j].image) {
                        for (let k = 0; k < emailParsers[j].image.length && url === null; k++) {
                            url = emailParsers[j].image[k](doc, fh);
                            if (url) {
                                const match = url.match(/^https?:\/\/lh3.googleusercontent.com\/(.*)$/);
                                if (!match) url = null;
                                else url = match[1];
                            };
                        }
                    }
                    if (!url) throw new Error('Could not determine which nomination this email references.');
                    const [ nom ] = nominations.filter(e => e.imageUrl.endsWith('/' + url));
                    if (!nom) throw new Error('The nomination that this email refers to cannot be found on this Wayfarer account.');
                    const status = emailParsers[j].status(doc, nom, fh);
                    if (!status) throw new Error('Unable to determine the status change that this email represents.');
                    if (!parsedChanges.hasOwnProperty(nom.id)) {
                        parsedChanges[nom.id] = {
                            title: nom.title,
                            updates: []
                        }
                    }
                    parsedChanges[nom.id].updates.push({
                        timestamp: new Date(fh.date).getTime(),
                        verified: true,
                        status
                    });
                    success = true;
                }
                if (!success && !ignore) throw new Error('This email does not appear to match any styles of Niantic emails currently known to Nomination Status History.');
            } catch (e) {
                console.log(e);
                parseFailures.push({
                    file: files[i].name,
                    subject: fh.subject,
                    date: new Date(fh.date),
                    reason: e.message,
                });
            }
        }

        Object.keys(parsedChanges).forEach(k => parsedChanges[k].updates.sort((a, b) => a.timestamp - b.timestamp));
        resolve({ parsedChanges, parseFailures, skippedEmails });
    });

    const parseMIME = data => {
        const bound = data.indexOf('\r\n\r\n');
        if (bound < 0) return null;
        const headers = data.substr(0, bound)
            .replaceAll(/\r\n\s/g, ' ')
            .split(/\r\n/).map(e => {
                const b = e.indexOf(':');
                const token = e.substr(0, b);
                // Decode RFC 2047 atoms
                const field = e.substr(b + 1).trim().replaceAll(/=\?([A-Za-z0-9-]+)\?([QqBb])\?([^\?]+)\?=(?:\s+(?==\?[A-Za-z0-9-]+\?[QqBb]\?[^\?]+\?=))?/g, (_, charset, encoding, text) => {
                    if (!['utf-8', 'us-ascii', 'iso-8859-1', 'windows-1252'].includes(charset.toLowerCase())) throw new Error(`Unknown charset "${charset}".`);
                    switch (encoding) {
                        case 'Q': case 'q':
                            text = text.split('_').join(' ').split('%').join('=25').split('=').join('%');
                            return decodeURIComponent(charset.toLowerCase() == 'utf-8' ? text : asciiToUTF8(text))
                        case 'B': case 'b': return charset.toLowerCase() == 'utf-8' ? atobUTF8(text) : atob(text);
                        default: throw new Error(`Invalid RFC 2047 encoding format "${encoding}".`);
                    }
                });
                return [ token, field.trim() ];
            });
        const body = data.substr(bound + 4);
        return [ headers, body ];
    };

    const parseContentType = ctHeader => {
        const m = ctHeader.match(/^(?<type>[^\/]+\/[^\/;\s]+)(?=($|(?<params>(;[^;]*)*)))/);
        const { type, params } = m.groups;
        const paramMap = {};
        if (params) params.substr(1).split(';').forEach(param => {
            const [ attr, value ] = param.trim().split('=');
            paramMap[attr.toLowerCase()] = value.startsWith('"') && value.endsWith('"') ? value.substring(1, value.length - 1) : value;
        });
        return { type: type.toLowerCase(), params: paramMap };
    };

    const extractEmail = fromHeader => {
        const sb = fromHeader.lastIndexOf('<');
        const eb = fromHeader.lastIndexOf('>');
        if (sb < 0 && eb < 0) return fromHeader;
        else return fromHeader.substr(sb + 1, eb - sb - 1);
    }

    // https://stackoverflow.com/a/30106551/1955334
    const atobUTF8 = text => decodeURIComponent(atob(text).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));

    const asciiToUTF8 = text => text.replaceAll(/%([A-Fa-f][0-9A-Fa-f])/g, (match, p1) => {
        const ci = parseInt(p1, 16);
        if (ci <= 0xBF) return '%c2%' + ci.toString(16);
        if (ci >= 0xC0) return '%c3%' + (ci - 0x40).toString(16);
    });

    const utcDateToISO8601 = date => `${date.getUTCFullYear()}-${('0' + (date.getUTCMonth() + 1)).slice(-2)}-${('0' + date.getUTCDate()).slice(-2)}`;
    const shiftDays = (date, offset) => {
        const nd = new Date(date);
        nd.setUTCDate(nd.getUTCDate() + offset);
        return nd;
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
            .wfnshTopButton {
                background-color: #e5e5e5;
                border: none;
                color: #ff4713;
                padding: 10px 10px;
                margin: 10px;
                text-align: center;
                text-decoration: none;
                display: inline-block;
                font-size: 16px;
                cursor: pointer;
            }
            .wfnshCancelButton {
                color: #000000;
            }

            .dark .wfnshTopButton {
                background-color: #404040;
                color: #20B8E3;
            }
            .dark .wfnshCancelButton {
                color: #ff0000;
            }

            .wfnshImportBg {
                position: fixed;
                top: 0;
                left: 0;
                height: 100vh;
                width: 100vw;
                background-color: rgba(0,0,0,0.5);
                z-index: 100000;
            }
            .wfnshImportInner {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translateX(-50%) translateY(-50%);
                width: calc(100vw - 50px);
                height: calc(100vh - 50px);
                overflow-x: hidden;
                overflow-y: scroll;
                background-color: #fff;
                padding: 20px;
                max-width: 900px;
                max-height: 500px;
            }
            .dark .wfnshImportInner {
                background-color: #333;
            }
            .wfnshImportInner h3 {
                font-weight: bold;
                margin: 10px auto;
            }
            .wfnshImportInner > p {
                margin: 10px auto;
            }
            .wfnshImportLoading {
                text-align: center;
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translateX(-50%) translateY(-50%);
                padding: 20px;
                background-color: #fff;
            }
            .dark .wfnshImportLoading {
                background-color: #333;
            }
            .wfnshImportLoading h2 {
                margin-bottom: 10px;
            }
            .wfnshImportEntry {
                margin: 10px 0;
            }
            .wfnshIETitle {
                font-weight: bold;
                font-size: 1.15em;
            }
            .wfnshIEChange::before {
                content: '\u2022 ';
            }
            .wfnshIEStatus {
                color: #DF471C;
            }
            .wfnshIEOld, .wfnshIEErrExtra {
                color: #7F7F7F;
            }
            .wfnshIENew {
                color: #20B8E3;
            }
            .wfnshIEError {
                color: #FF0000;
            }
            .wfnshVerified::after {
                content: ' \u2713';
                color: green;
                font-family: initial;
            }
            .dark .wfnshVerified::after {
                color: lime;
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
