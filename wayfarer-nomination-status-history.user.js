// ==UserScript==
// @name         Wayfarer Nomination Status History
// @version      0.8.8
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
            const oldStatus = history.length ? history[history.length - 1].status : null;
            const timestamp = Date.now();
            const newStatus = historyOnly ? result.status : status;
            // Add the change in hold status to the nomination's history.
            history.push({ timestamp, status });
            objectStore.put({ ...result, ...extras, status: newStatus, statusHistory: history });
            tx.commit();
            awaitElement(() => document.querySelector('.wfnshDropdown')).then(ref => addEventToHistoryDisplay(ref, timestamp, status, false, oldStatus));
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
                        const leftBox = document.createElement('a');
                        leftBox.classList.add('wfnshDDLeftBox');
                        leftBox.textContent = '\u25b6';
                        box.appendChild(leftBox);
                        const rightBox = document.createElement('div');
                        rightBox.classList.add('wfnshDDRightBox');
                        box.appendChild(rightBox);

                        const oneLine = document.createElement('p');
                        oneLine.classList.add('wfnshOneLine');
                        rightBox.appendChild(oneLine);
                        const textbox = document.createElement('div');
                        textbox.classList.add('wfnshInner');
                        rightBox.appendChild(textbox);

                        let collapsed = true;
                        box.addEventListener('click', e => {
                            e.preventDefault();
                            oneLine.style.display = collapsed ? 'none' : 'block';
                            textbox.style.display = collapsed ? 'block' : 'none';
                            leftBox.textContent = collapsed ? '\u25bc' : '\u25b6';
                            collapsed = !collapsed;
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
                                    oneLine.textContent = result.day + ' - Nominated';
                                    const nomDateLine = document.createElement('p');
                                    nomDateLine.textContent = result.day + ' - Nominated';
                                    textbox.appendChild(nomDateLine);
                                }
                                // Then, add options for each entry in the history.
                                let previous = null;
                                result.statusHistory.forEach(({ timestamp, status, verified }) => {
                                    addEventToHistoryDisplay(box, timestamp, status, verified, previous);
                                    previous = status;
                                });
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
    const addEventToHistoryDisplay = (box, timestamp, status, verified, previous) => {
        if (status === 'NOMINATED' && !!previous) {
            if (previous === 'HELD') {
                status = 'Hold released';
            } else {
                status = 'Returned to queue';
            }
        }

        // Format the date as UTC as this is what Wayfarer uses to display the nomination date.
        // Maybe make this configurable to user's local time later?
        const date = new Date(timestamp);
        const dateString = `${date.getUTCFullYear()}-${('0'+(date.getUTCMonth()+1)).slice(-2)}-${('0'+date.getUTCDate()).slice(-2)}`;
        const text = `${dateString} - ${stateMap.hasOwnProperty(status) ? stateMap[status] : status}`;

        const lastLine = box.querySelector('.wfnshOneLine');
        lastLine.textContent = text;
        const line = document.createElement('p');
        if (verified) lastLine.classList.add('wfnshVerified');
        else if (lastLine.classList.contains('wfnshVerified')) lastLine.classList.remove('wfnshVerified');
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

    const createBackground = () => {
        const outer = document.createElement('div');
        outer.classList.add('wfnshImportBg');
        document.querySelector('body').appendChild(outer);
        return outer;
    };

    const createEmailLoader = () => {
        const outer = createBackground();
        const loadingHeader = document.createElement('h2');
        loadingHeader.textContent = 'Parsing...';
        const loadingStatus = document.createElement('p');
        loadingStatus.textContent = 'Please wait';
        const loadingDiv = document.createElement('div');
        loadingDiv.classList.add('wfnshImportLoading');
        loadingDiv.appendChild(loadingHeader);
        loadingDiv.appendChild(loadingStatus);
        outer.appendChild(loadingDiv);
        return {
            setTitle: text => { loadingHeader.textContent = text },
            setStatus: text => { loadingStatus.textContent = text },
            destroy: () => outer.parentNode.removeChild(outer)
        };
    };

    const getProcessedEmailIDs = () => localStorage.hasOwnProperty('wfnshProcessedEmailIDs') ? JSON.parse(localStorage.wfnshProcessedEmailIDs) : [];

    const importFromIterator = (nominations, loader, iterator, count, callback) => {
        getIDBInstance().then(db => {
            const tx = db.transaction([OBJECT_STORE_NAME], "readonly");
            const objectStore = tx.objectStore(OBJECT_STORE_NAME);
            const getList = objectStore.getAll();
            getList.onsuccess = () => {
                const history = {};
                getList.result.forEach(e => { history[e.id] = e.statusHistory });
                db.close();
                parseEmails(iterator, count, nominations, history, (n, t) => {
                    loader.setStatus(`Processing email ${n} of ${t}`);
                }).then(parsed => {
                    const merged = mergeEmailChanges(history, parsed.parsedChanges);
                    const mergeList = Object.keys(merged).map(id => ({ ...merged[id], id }));
                    mergeList.sort((a, b) => a.title.localeCompare(b.title));

                    let changeCount = 0;
                    mergeList.forEach(e => { changeCount += e.diffs.length; });

                    loader.destroy();
                    const outer = createBackground();

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
                        outer.parentNode.removeChild(outer);
                        const loader2 = createEmailLoader();
                        loader2.setTitle('Importing...');
                        loader2.setStatus('Please wait');
                        const processedIDs = getProcessedEmailIDs();
                        parsed.parsedIDs.forEach(id => {
                            if (!processedIDs.includes(id)) processedIDs.push(id);
                        });
                        parsed.skippedEmails.forEach(({ id }) => {
                            if (id && !processedIDs.includes(id)) processedIDs.push(id);
                        });
                        localStorage.wfnshProcessedEmailIDs = JSON.stringify(processedIDs);
                        if (callback) callback();
                        processEmailImport(mergeList, (n, t) => {
                            loader2.setStatus(`Importing change ${n} of ${t}`);
                        }).then(() => {
                            loader2.destroy();
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
            loader.setStatus('An error occurred');
            console.error(e);
        });
    };

    const importFromEml = nominations => {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = 'multiple';
        input.accept = 'message/rfc822,*.eml';
        input.style.display = 'none';
        input.addEventListener('change', e => {
            const loader = createEmailLoader();
            loader.setTitle('Parsing...');
            loader.setStatus('Please wait');
            const fileCount = e.target.files.length;
            const iterator = async function*() {
                for (let i = 0; i < fileCount; i++) {
                    yield {
                        name: e.target.files[i].name,
                        contents: await e.target.files[i].text()
                    };
                }
            };
            importFromIterator(nominations, loader, iterator, fileCount);
        });
        document.querySelector('body').appendChild(input);
        input.click();
    };

    const importFromGAScript = nominations => {
        const outer = createBackground();
        const inner = document.createElement('div');
        inner.classList.add('wfnshImportInner');
        inner.classList.add('wfnshImportGAScriptOptions');
        outer.appendChild(inner);
        const header = document.createElement('h1');
        header.textContent = 'Import using Google Apps Script';
        inner.appendChild(header);
        const sub = document.createElement('p');
        const s1 = document.createElement('span');
        s1.textContent = 'Please enter your Importer Script details below. New to the Importer Script? ';
        const s2 = document.createElement('a');
        s2.textContent = 'Please click here';
        s2.addEventListener('click', () => {
            const b = new Blob([userManualGAS], { type: 'text/html' });
            const bUrl = URL.createObjectURL(b);
            window.open(bUrl, '_blank', 'popup');
        });
        const s3 = document.createElement('span');
        s3.textContent = ' for detailed setup instructions.';
        sub.appendChild(s1);
        sub.appendChild(s2);
        sub.appendChild(s3);
        inner.appendChild(sub);
        const form = document.createElement('form');
        inner.appendChild(form);
        const tbl = document.createElement('table');
        tbl.classList.add('wfnshGAScriptTable');
        form.appendChild(tbl);

        const inputs = [
            {
                id: 'url',
                type: 'text',
                label: 'Script URL',
                placeholder: 'https://script.google.com/macros/.../exec',
                required: true
            },
            {
                id: 'token',
                type: 'password',
                label: 'Access token',
                required: true
            },
            {
                id: 'since',
                type: 'date',
                label: 'Search emails starting from'
            }
        ];

        const values = localStorage.hasOwnProperty('wfnshGAScriptSettings') ? JSON.parse(localStorage.wfnshGAScriptSettings) : { };

        inputs.forEach(input => {
            const row = document.createElement('tr');
            const col1 = document.createElement('td');
            col1.textContent = `${input.label}:`;
            const col2 = document.createElement('td');
            input.field = document.createElement('input');
            input.field.type = input.type;
            if (input.required) input.field.required = true;
            if (input.placeholder) input.field.placeholder = input.placeholder;
            if (values.hasOwnProperty(input.id)) input.field.value = values[input.id];
            col2.appendChild(input.field);
            row.appendChild(col1);
            row.appendChild(col2);
            tbl.appendChild(row);
        });

        const btn1 = document.createElement('input');
        btn1.type = 'submit';
        btn1.classList.add('wfnshTopButton');
        btn1.value = 'Start import';
        form.appendChild(btn1);

        const btn2 = document.createElement('input');
        btn2.type = 'button';
        btn2.classList.add('wfnshTopButton');
        btn2.classList.add('wfnshCancelButton');
        btn2.value = 'Cancel import';
        btn2.addEventListener('click', () => outer.parentNode.removeChild(outer));
        form.appendChild(btn2);

        form.addEventListener('submit', e => {
            e.preventDefault();
            const gass = {
                url: inputs[0].field.value,
                token: inputs[1].field.value,
                since: inputs[2].field.value
            };
            localStorage.wfnshGAScriptSettings = JSON.stringify(gass);
            outer.parentNode.removeChild(outer);
            const loader = createEmailLoader();
            loader.setTitle('Connecting...');
            loader.setStatus('Validating script credentials');
            const createFetchOptions = object => ({
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify(object)
            });
            fetch(gass.url, createFetchOptions({ request: "test", token: gass.token })).then(response => response.json()).then(async data => {
                if (data.status !== "OK") {
                    alert('Credential validation failed. Please double check your access token and script URL.');
                    loader.destroy();
                } else {
                    const startTime = new Date();
                    loader.setStatus('Searching for new emails');
                    const processedIDs = getProcessedEmailIDs();
                    const ids = [];
                    let count = 0, size = 500, totalFetched = 0;
                    do {
                        const batch = await fetch(gass.url, createFetchOptions({
                            request: "list",
                            token: gass.token,
                            options: {
                                since: gass.since,
                                offset: totalFetched,
                                size
                            }
                        })).then(response => response.json());
                        if (batch.status !== "OK") throw new Error("Email listing failed");
                        count = batch.result.length;
                        totalFetched += count;
                        batch.result.forEach(id => {
                            if (!processedIDs.includes('G-' + id)) ids.push(id);
                        });
                        loader.setStatus(`Searching for new emails (${ids.length}/${totalFetched})`);
                    } while (count == size);
                    const totalCount = ids.length;
                    loader.setTitle('Downloading...');
                    loader.setStatus('Please wait');
                    const dlBatchSize = 20;
                    let offset = 0;
                    let iterSuccess = true;
                    const iterator = async function*() {
                        try {
                            let batch = [];
                            while (ids.length) {
                                while (batch.length < 20 && ids.length) batch.push(ids.shift());
                                loader.setTitle('Downloading...');
                                loader.setStatus(`Downloading ${offset + 1}-${offset + batch.length} of ${totalCount}`);
                                const emlMap = await fetch(gass.url, createFetchOptions({
                                    request: "fetch",
                                    token: gass.token,
                                    options: {
                                        ids: batch
                                    }
                                })).then(response => response.json());
                                if (emlMap.status !== "OK") throw new Error("Email listing failed");
                                loader.setTitle('Parsing...');
                                for (const id in emlMap.result) {
                                    yield {
                                        name: `${id}.eml`,
                                        contents: emlMap.result[id],
                                        id: 'G-' + id
                                    };
                                }
                                offset += batch.length;
                                batch = [];
                            }
                        } catch (e) {
                            iterSuccess = false;
                            console.error(e);
                            alert('An error occurred fetching emails from Google. You may have to continue importing from the same date again to ensure all emails are downloaded.');
                        }
                    };
                    importFromIterator(nominations, loader, iterator, totalCount, () => {
                        if (iterSuccess) {
                            const newSince = utcDateToISO8601(shiftDays(startTime, -1));
                            gass.since = newSince;
                            localStorage.wfnshGAScriptSettings = JSON.stringify(gass);
                        }
                    });
                }
            }).catch(e => {
                console.error(e);
                alert('The Importer Script returned an invalid response. Please see the console for more information.');
                loader.destroy();
            });
            return false;
        });
    };

    const importMethods = [
        {
            title: 'From *.eml files',
            description: 'Import email files saved and exported from an email client, such as Thunderbird',
            callback: importFromEml,
            icon: 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiIHN0YW5kYWxvbmU9Im5vIj8+CjxzdmcKICAgdmVyc2lvbj0iMS4xIgogICBpZD0iTGF5ZXJfMSIKICAgeD0iMHB4IgogICB5PSIwcHgiCiAgIHdpZHRoPSIyODM0LjkzOCIKICAgaGVpZ2h0PSIyOTAyLjE5MzEiCiAgIHZpZXdCb3g9IjAgMCAyODM0LjkzNzkgMjkwMi4xOTMxIgogICBlbmFibGUtYmFja2dyb3VuZD0ibmV3IDAgMCA1MzU2LjkyOSA1MDE0Ljk5NyIKICAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogICB4bWxuczpzdmc9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8ZGVmcwogICAgIGlkPSJkZWZzNDMiIC8+CiAgPGcKICAgICBpZD0iZzM4IgogICAgIHRyYW5zZm9ybT0idHJhbnNsYXRlKC0xMzE1LjQ2NCwtOTQ2LjkxMikiPgogICAgPGcKICAgICAgIGlkPSJnMzYiPgogICAgICA8cGF0aAogICAgICAgICBmaWxsPSIjZjM3MDViIgogICAgICAgICBkPSJtIDQwMzUuNDcsMjA0OS44NzkgYyAtMzAuMTYzLC0xOC4zMjEgLTY0LjE3MiwtMjkuNTg3IC0xMDAuODAyLC0yOS41ODcgSCAxNTMxLjExNyBjIC00OC40NSwwIC05Mi42MzUsMTguNzY3IC0xMjguNjk0LDQ5LjQ2MiBsIDEyMTguNzY1LDkzMi43NzkgNC40NzksMS4zNzggLTQuNDc5LDIuNzA2IDEwNi44MTMsODEuNzU0IDEwOC4zNTMsLTg1LjgzOCAtNC4yODgsLTIuNzI5IDQuMjg4LC0xLjI1NyB6IgogICAgICAgICBpZD0icGF0aDYiIC8+CiAgICAgIDxwYXRoCiAgICAgICAgIGZpbGw9IiNmMzcwNWIiCiAgICAgICAgIGQ9Im0gMTQwMi40MiwyMDczLjc5NiBjIDAsMCAxMTY0LjUxMSwtMTEyNi44ODQgMTMzNS41MDEsLTExMjYuODg0IDE3MS4wNjcsMCAxMjk3LjU1MywxMTA2Ljk4IDEyOTcuNTUzLDExMDYuOTggeiIKICAgICAgICAgaWQ9InBhdGg4IiAvPgogICAgICA8ZwogICAgICAgICBpZD0iZzI0Ij4KICAgICAgICA8cmVjdAogICAgICAgICAgIHg9IjE5MDIuMDc4IgogICAgICAgICAgIHk9IjE3NTQuNzI3MSIKICAgICAgICAgICBmaWxsPSIjZmZmZmZmIgogICAgICAgICAgIHdpZHRoPSIxNjkzLjc1MSIKICAgICAgICAgICBoZWlnaHQ9IjE5NzYuMDUyIgogICAgICAgICAgIGlkPSJyZWN0MTAiIC8+CiAgICAgICAgPHJlY3QKICAgICAgICAgICB4PSIyMDIxLjc2NCIKICAgICAgICAgICB5PSIxOTI2LjA0MzkiCiAgICAgICAgICAgZmlsbD0iI2ZmZDA2NiIKICAgICAgICAgICB3aWR0aD0iMTQ1NC4zMDgiCiAgICAgICAgICAgaGVpZ2h0PSI4OC40MDQ5OTkiCiAgICAgICAgICAgaWQ9InJlY3QxMiIgLz4KICAgICAgICA8cmVjdAogICAgICAgICAgIHg9IjIwMjEuNzY0IgogICAgICAgICAgIHk9IjIzMzAuOTc0MSIKICAgICAgICAgICBmaWxsPSIjZmZkMDY2IgogICAgICAgICAgIHdpZHRoPSIxNDU0LjMwOCIKICAgICAgICAgICBoZWlnaHQ9Ijg4LjM2MSIKICAgICAgICAgICBpZD0icmVjdDE0IiAvPgogICAgICAgIDxyZWN0CiAgICAgICAgICAgeD0iMjAyMS43NjQiCiAgICAgICAgICAgeT0iMjEyOC41MTM5IgogICAgICAgICAgIGZpbGw9IiNmZmQwNjYiCiAgICAgICAgICAgd2lkdGg9IjE0NTQuMzA4IgogICAgICAgICAgIGhlaWdodD0iODguMzkxOTk4IgogICAgICAgICAgIGlkPSJyZWN0MTYiIC8+CiAgICAgICAgPHJlY3QKICAgICAgICAgICB4PSIyMDIxLjc2NCIKICAgICAgICAgICB5PSIyNTMzLjQzNDEiCiAgICAgICAgICAgZmlsbD0iI2ZmZDA2NiIKICAgICAgICAgICB3aWR0aD0iMTQ1NC4zMDgiCiAgICAgICAgICAgaGVpZ2h0PSI4OC4zMzAwMDIiCiAgICAgICAgICAgaWQ9InJlY3QxOCIgLz4KICAgICAgICA8cmVjdAogICAgICAgICAgIHg9IjIwMjEuNzY0IgogICAgICAgICAgIHk9IjI3MjIuNzEiCiAgICAgICAgICAgZmlsbD0iI2ZmZDA2NiIKICAgICAgICAgICB3aWR0aD0iMTQ1NC4zMDgiCiAgICAgICAgICAgaGVpZ2h0PSI4OC40MDQ5OTkiCiAgICAgICAgICAgaWQ9InJlY3QyMCIgLz4KICAgICAgICA8cmVjdAogICAgICAgICAgIHg9IjIwMjEuNzY0IgogICAgICAgICAgIHk9IjI5MjUuMjA4IgogICAgICAgICAgIGZpbGw9IiNmZmQwNjYiCiAgICAgICAgICAgd2lkdGg9IjE0NTQuMzA4IgogICAgICAgICAgIGhlaWdodD0iODguMzIzOTk3IgogICAgICAgICAgIGlkPSJyZWN0MjIiIC8+CiAgICAgIDwvZz4KICAgICAgPGcKICAgICAgICAgaWQ9ImczNCI+CiAgICAgICAgPHBvbHlnb24KICAgICAgICAgICBmaWxsPSIjNjZiYmM5IgogICAgICAgICAgIHBvaW50cz0iMjU1Mi42MzQsMjk1NC4wNjkgMjU1Mi44NCwyOTU0LjIzMSAyNTE2LjEyMSwyOTI2LjA4MiAiCiAgICAgICAgICAgaWQ9InBvbHlnb24yNiIgLz4KICAgICAgICA8cGF0aAogICAgICAgICAgIGZpbGw9IiNmN2JhMWQiCiAgICAgICAgICAgZD0ibSAyNTUyLjg0LDI5NTQuMjMxIC0wLjIwNiwtMC4xNjIgLTM2LjUxMywtMjcuOTg3IC0zNDEuODkyLC0yNjEuNTQ5IC03NzEuODA2LC01OTAuNzM2IGMgLTUyLjQwMSw0NC43NjIgLTg2Ljk1OSwxMTUuMzgyIC04Ni45NTksMTk1LjYxNiB2IDEzMzQuNTY5IGMgMCw2OS45MzUgMjYuMDY5LDEzMi41NTEgNjcuMzc2LDE3Ny4xODkgbCA5NTkuMTI1LC01OTkuOTI4IDI3OS4yMjQsLTE3NC42MjEgeiIKICAgICAgICAgICBpZD0icGF0aDI4IiAvPgogICAgICAgIDxwYXRoCiAgICAgICAgICAgZmlsbD0iI2Y3YmExZCIKICAgICAgICAgICBkPSJtIDQwMzUuNDcsMjA1My44OTYgLTg5Ni43ODUsNzA5LjU4NSB2IDAgbCAtMTg5LjYyMSwxNTAuMDc0IC05Ni42MjQsNzYuMzY2IC0xNi4wOTMsMTIuNjA4IDMzOS43ODUsMjE2LjQzMiA4OTcuMjY5LDU3MS40MTIgYyA0Ni43MDYsLTQ0Ljk1MSA3Ny4wMDEsLTExMS4yODIgNzcuMDAxLC0xODYuMzk1IFYgMjI2OS40MSBjIDAsLTkzLjgxNSAtNDYuOTEzLC0xNzQuMzIgLTExNC45MzIsLTIxNS41MTQgeiIKICAgICAgICAgICBpZD0icGF0aDMwIiAvPgogICAgICAgIDxwYXRoCiAgICAgICAgICAgZmlsbD0iI2U0YTMzYSIKICAgICAgICAgICBkPSJtIDMxNzYuMTQsMzIxOC45NjQgLTMzOS43ODYsLTIxNi40MzIgMTYuMDkzLC0xMi42MDggYyAtMC45ODUsMC42MzQgLTg5LjYzMyw1NS42MzUgLTEzMy41ODksNTUuNjM1IC00My43OTIsMCAtMTY1LjI0OCwtOTAuNjg0IC0xNjYuMDE0LC05MS4zMjggbCA2OC4zNTIsNTIuMzg2IC0yNzkuMjI0LDE3NC42MiAtOTU5LjEyOCw1OTkuOTMgYyAzOC41MjYsNDEuODUxIDkwLjY5Nyw2Ny45MzggMTQ4LjI4NCw2Ny45MzggaCAyNDAzLjU0OSBjIDUzLjE2LDAgMTAxLjA4MSwtMjIuNjI5IDEzOC43MzUsLTU4LjczNSB6IgogICAgICAgICAgIGlkPSJwYXRoMzIiIC8+CiAgICAgIDwvZz4KICAgIDwvZz4KICA8L2c+Cjwvc3ZnPgo='
        },
        {
            title: 'Google Apps Script',
            description: 'Import emails directly from Gmail, using a Google Apps Script',
            callback: importFromGAScript,
            icon: 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiIHN0YW5kYWxvbmU9Im5vIj8+CjxzdmcKICAgdmVyc2lvbj0iMS4xIgogICB3aWR0aD0iNDU2LjEzOTI1IgogICBoZWlnaHQ9IjM2MC44MDg1IgogICBpZD0ic3ZnMjIiCiAgIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIKICAgeG1sbnM6c3ZnPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CiAgPGRlZnMKICAgICBpZD0iZGVmczI2IiAvPgogIDxyZWN0CiAgICAgZmlsbD0iI2VhNDMzNSIKICAgICB4PSIwIgogICAgIHk9IjI1My41MzAzOCIKICAgICB3aWR0aD0iMzczIgogICAgIGhlaWdodD0iMTA3IgogICAgIHJ4PSI1My41IgogICAgIGlkPSJyZWN0MiIgLz4KICA8cmVjdAogICAgIGZpbGw9IiNmYmJjMDQiCiAgICAgeD0iLTQ5Mi45MDU5NCIKICAgICB5PSItMTE0LjA0NzMzIgogICAgIHdpZHRoPSIzNzMiCiAgICAgaGVpZ2h0PSIxMDciCiAgICAgcng9IjUzLjUiCiAgICAgdHJhbnNmb3JtPSJyb3RhdGUoLTE0NCkiCiAgICAgaWQ9InJlY3Q0IiAvPgogIDxyZWN0CiAgICAgZmlsbD0iIzM0YTg1MyIKICAgICB4PSI3MS4wODQ2MjUiCiAgICAgeT0iLTI2My42ODY5MiIKICAgICB3aWR0aD0iMzczIgogICAgIGhlaWdodD0iMTA3IgogICAgIHJ4PSI1My41IgogICAgIHRyYW5zZm9ybT0icm90YXRlKDcyKSIKICAgICBpZD0icmVjdDYiIC8+CiAgPHJlY3QKICAgICBmaWxsPSIjNDI4NWY0IgogICAgIHg9Ii0yNDYuMDAxMSIKICAgICB5PSIzNDUuOTQzNzMiCiAgICAgd2lkdGg9IjM3MyIKICAgICBoZWlnaHQ9IjEwNyIKICAgICByeD0iNTMuNSIKICAgICB0cmFuc2Zvcm09InJvdGF0ZSgtNzIpIgogICAgIGlkPSJyZWN0OCIgLz4KICA8ZwogICAgIGZpbGw9IiNmZmZmZmYiCiAgICAgaWQ9ImcyMCIKICAgICB0cmFuc2Zvcm09InRyYW5zbGF0ZSgtMjcuNTMwMDAxLC03NS4zNjk2MTMpIj4KICAgIDxjaXJjbGUKICAgICAgIGN4PSIyNjUuODQiCiAgICAgICBjeT0iMTI5LjI4IgogICAgICAgcj0iMjYuNzAwMDAxIgogICAgICAgaWQ9ImNpcmNsZTEwIiAvPgogICAgPGNpcmNsZQogICAgICAgY3g9IjEzMS40NCIKICAgICAgIGN5PSIyMjUuNDQiCiAgICAgICByPSIyNi43MDAwMDEiCiAgICAgICBpZD0iY2lyY2xlMTIiIC8+CiAgICA8Y2lyY2xlCiAgICAgICBjeD0iODEuMzYwMDAxIgogICAgICAgY3k9IjM4Mi42MDAwMSIKICAgICAgIHI9IjI2LjcwMDAwMSIKICAgICAgIGlkPSJjaXJjbGUxNCIgLz4KICAgIDxjaXJjbGUKICAgICAgIGN4PSIzNDguMjIiCiAgICAgICBjeT0iMzgxLjY0MDAxIgogICAgICAgcj0iMjYuNzAwMDAxIgogICAgICAgaWQ9ImNpcmNsZTE2IiAvPgogICAgPGNpcmNsZQogICAgICAgY3g9IjQzMC42NzAwMSIKICAgICAgIGN5PSIxMjcuODkiCiAgICAgICByPSIyNi43MDAwMDEiCiAgICAgICBpZD0iY2lyY2xlMTgiIC8+CiAgPC9nPgo8L3N2Zz4K'
        }
    ];

    const addImportButton = nominations => {
        if (document.getElementById('wfnshImportBtn') !== null) return;
        const ref = document.querySelector('wf-logo');
        const div = document.createElement('div');
        const btn = document.createElement('btn');
        btn.textContent = 'Import emails';
        btn.addEventListener('click', () => {
            const outer = document.createElement('div');
            outer.classList.add('wfnshImportBg');
            document.querySelector('body').appendChild(outer);
            const inner = document.createElement('div');
            inner.classList.add('wfnshImportInner');
            inner.classList.add('wfnshImportMethod');
            outer.appendChild(inner);
            const header = document.createElement('h1');
            header.textContent = 'Import history from emails';
            inner.appendChild(header);
            const sub = document.createElement('p');
            sub.textContent = 'Please select how you want to import your emails.';
            inner.appendChild(sub);

            importMethods.forEach(method => {
                const btn = document.createElement('div');
                btn.classList.add('wfnshMethodButton');
                if (method.icon) {
                    btn.style.paddingLeft = '60px';
                    btn.style.backgroundImage = 'url(' + method.icon + ')';
                }
                const btnTitle = document.createElement('p');
                btnTitle.classList.add('wfnshMethodTitle');
                btnTitle.textContent = method.title;
                btn.appendChild(btnTitle);
                const btnDesc = document.createElement('p');
                btnDesc.classList.add('wfnshMethodDesc');
                btnDesc.textContent = method.description;
                btn.appendChild(btnDesc);
                btn.addEventListener('click', () => {
                    outer.parentNode.removeChild(outer);
                    method.callback(nominations);
                });
                inner.appendChild(btn);
            });
        });
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
            if (history[k].length) {
                for (let i = 0, j = 0; i < history[k].length && j < joined.length; i++, j++) {
                    while (history[k][i].status !== joined[j].status) diffs.push({ ...joined[j++], previously: null });
                    if (history[k][i].timestamp !== joined[j].timestamp || !!history[k][i].verified !== !!joined[j].verified) diffs.push({ ...joined[j], previously: history[k][i].timestamp });
                }
            } else {
                for (let j = 0; j < joined.length; j++) {
                    diffs.push({ ...joined[j++], previously: null });
                }
            }
            if (diffs.length) joinedChanges[k] = { ...changes[k], updates: joined, diffs };
        });
        return joinedChanges;
    };

    const parseEmails = (files, fileCount, nominations, statusHistory, progress) => new Promise(async (resolve, reject) => {
        const remapChars = text => {
            const map = {
                A: 'ÀÁÂÃÅÄĀĂĄǍǞǠǺȀȂȦ',
                C: 'ÇĆĈĊČ',
                D: 'Ď',
                E: 'ÈÊËÉĒĔĖĘĚȄȆȨ',
                G: 'ĜĞĠĢǦǴ',
                H: 'ĤȞ',
                I: 'ÌÍÎÏĨĪĬĮİǏȈȊ',
                J: 'Ĵ',
                K: 'ĶǨ',
                L: 'ĹĻĽ',
                N: 'ÑŃŅŇǸ',
                O: 'ÒÔÕÓÖŌŎŐƠǑǪǬȌȎȪȬȮȰ',
                R: 'ŔŖŘȐȒ',
                S: 'ŚŜŞŠȘ',
                T: 'ŢŤȚ',
                U: 'ÙÚÛÜŨŪŬŮŰŲƯǓǕǗǙǛȔȖ',
                W: 'Ŵ',
                Y: 'ÝŶŸȲ',
                Z: 'ŹŻŽ',
                a: 'àáâãåäāăąǎǟǡǻȁȃȧ',
                c: 'çćĉċč',
                d: 'ď',
                e: 'èêëéēĕėęěȅȇȩ',
                g: 'ĝğġģǧǵ',
                h: 'ĥȟ',
                i: 'ìíîïĩīĭįǐȉȋ',
                j: 'ĵǰ',
                k: 'ķǩ',
                l: 'ĺļľ',
                n: 'ñńņňǹ',
                o: 'òôõóöōŏőơǒǫǭȍȏȫȭȯȱ',
                r: 'ŕŗřȑȓ',
                s: 'śŝşšș',
                t: 'ţťț',
                u: 'ùúûüũūŭůűųưǔǖǘǚǜȕȗ',
                w: 'ŵ',
                y: 'ýÿŷȳ',
                z: 'źżž',
                Æ: 'ǢǼ',
                Ø: 'Ǿ',
                æ: 'ǣǽ',
                ø: 'ǿ',
                Ʒ: 'Ǯ',
                ʒ: 'ǯ',
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
                const match = (doc.querySelector('.em_font_20') || doc.querySelector('.em_org_u').firstChild).textContent.trim().match(mr);
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
            WF_DECIDED_NIA: (acceptText, rejectText) => (doc, nom, fh) => {
                const text = doc.querySelector('.em_org_u').textContent.replaceAll(/\s+/g, ' ').trim();
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
                // Nomination decided (Wayfarer, NIA)
                subject: /^Decision on you Wayfarer Nomination,/,
                status: eStatusHelpers.WF_DECIDED_NIA(
                    undefined, // Accepted - this email template has not been used for acceptances yet
                    'did not meet the criteria required to be accepted and has been rejected'
                ), image: [ eQuery.WF_DECIDED(
                    /^Thank you for taking the time to nominate (?<title>.*) on (?<month>) (?<day>\d+), (?<year>\d+)\./,
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
            {
                // Ingress Mission related
                subject: /^Ingress Mission/,
                ignore: true
            },
            {
                // Ingress damage report
                subject: /^Ingress Damage Report:/,
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
            // Ingress Mission related
            // Ingress damage report
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
            // Ingress Mission related
            // Ingress damage report
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
            // Ingress Mission related
            // Ingress damage report
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
            // Ingress Mission related
            // Ingress damage report
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
            // Ingress Mission related
            // Ingress damage report
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
            // Ingress Mission related
            // Ingress damage report
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
            // Ingress Mission related
            // Ingress damage report
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
            // Ingress Mission related
            // Ingress damage report
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
            // Ingress Mission related
            // Ingress damage report
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
            // Ingress Mission related
            // Ingress damage report
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
            // Ingress Mission related
            // Ingress damage report
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
            // Ingress Mission related
            // Ingress damage report
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
            // Ingress Mission related
            // Ingress damage report
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
        const parsedIDs = [];

        const dp = new DOMParser();
        const supportedSenders = [
            'notices@wayfarer.nianticlabs.com',
            'nominations@portals.ingress.com',
            'hello@pokemongolive.com',
            'ingress-support@google.com',
            'ingress-support@nianticlabs.com'
        ];
        let i = 0;
        for await (const file of files()) {
            i++;
            progress(i + 1, fileCount);
            const content = file.contents;
            const mime = parseMIME(content);
            if (!mime) {
                skippedEmails.push({
                    id: file.id,
                    file: file.name,
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

            const emailAddress = extractEmail(fh.from);
            if (!supportedSenders.includes(emailAddress)) {
                skippedEmails.push({
                    id: file.id,
                    file: file.name,
                    subject: fh.subject,
                    date: fh.date,
                    reason: `Sender "${fh.name}" was not recognized as a valid Niantic Wayfarer or OPR-related email address.`
                });
                continue;
            } else if (emailAddress == "hello@pokemongolive.com" && new Date(fh.date).getUTCFullYear() <= 2018) {
                // Newsletters used this email address for some time up until late 2018, which was before this game got Wayfarer/OPR access
                skippedEmails.push({
                    id: file.id,
                    file: file.name,
                    subject: fh.subject,
                    date: fh.date,
                    reason: `The email was classified as a Pokémon Go newsletter.`
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
                    if (!partBody.trim().length) return;
                    for (const i of ['content-transfer-encoding', 'content-type']) {
                        const matching = partHead.filter(e => e[0].toLowerCase() == i);
                        fh[i] = matching.length ? matching.pop()[1] : null;
                    }
                    if (fh['content-type'] === null) return;
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
                    id: file.id,
                    file: file.name,
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
                            id: file.id,
                            file: file.name,
                            subject: fh.subject,
                            date: fh.date,
                            reason: `This email is either for a type of contribution that is not trackable in Niantic Wayfarer, or for content that is unrelated to Wayfarer.`
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
                    if (file.id) parsedIDs.push(file.id);
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
                    id: file.id,
                    file: file.name,
                    subject: fh.subject,
                    date: new Date(fh.date),
                    reason: e.message,
                });
            }
        }

        Object.keys(parsedChanges).forEach(k => parsedChanges[k].updates.sort((a, b) => a.timestamp - b.timestamp));
        resolve({ parsedChanges, parseFailures, skippedEmails, parsedIDs });
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

    const userManualGAS =
`<!DOCTYPE html>
<html>
<head>
<title>GAS Setup Guide</title>
<style>
* {
font-family: sans-serif;
}
code, textarea {
font-family: monospace;
}
img {
box-shadow: 0 0 10px black;
}
body {
background: #ccc;
}
#content {
max-width: 800px;
margin: auto;
padding: 0 30px 30px 30px;
border: 1px solid black;
background: #fff;
}
img {
max-width: 100%;
}
textarea {
width: 100%;
height: 100px;
}
</style>
</head>
<body><div id="content">
<h1>Nomination Status History: GAS Setup Guide</h1>
<p>This user manual will explain how to set up semi-automatic email imports from Gmail using Google Apps Script. If you have previously set up the Wayfarer Planner addon, the steps are similar.</p>
<p>Note: The layout of the Google Apps Script website is subject to change. Please reach out to the developer of the script if you are unsure how to proceed with the setup, or if the guide below is no longer accurate.</p>
<h2>Step 1: Create a Google Apps Script project</h2>
<p><a href="https://script.google.com/home" target="_blank">Click here</a> to open Google Apps Script. Sign in to your Google account, if you aren't already.</p>
<p>Click on the "New Project" button in the top left corner:</p>
<img src="https://i.imgur.com/a8CicNr.png">
<p>The new project will look like this:</p>
<img src="https://i.imgur.com/98mlmxj.png">
<p>Click on "Untitled project" at the top, and give it a name so that you can easily recognize it later. I suggest "Wayfarer Email Importer".</p>
<hr>
<h2>Step 2: Copy and paste the importer code</h2>
<p>Copy the current Importer Script source code below:</p>
<textarea readonly>function setup() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty("accessToken")) props.setProperty("accessToken", randomBase64(128));
  console.log(
    "Script configured!\\n\\nTHIS IS YOUR ACCESS TOKEN:\\n"
    + props.getProperty("accessToken")
    + "\\n\\nKeep it secret, and never share it with anyone else.");
}

function resetScriptData() {
  const props = PropertiesService.getScriptProperties();
  props.deleteAllProperties();
  console.log("Script data successfully reset. Please remember to regenerate an access token by running setup.");
}

function randomBase64(length) {
  let result = '';
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const charactersLength = characters.length;
  let counter = 0;
  while (counter &lt; length) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
    counter += 1;
  }
  return result;
}

function doPost(e) {
  const req = JSON.parse(e.postData.contents);
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty("accessToken");
  const output = { version: 1 };

  if (!token || req.token !== token) {
    output.status = "ERROR";
    output.result = "unauthorized";
  } else {
    let callback = null;
    switch (req.request) {
      case "list": callback = findEmails; break;
      case "fetch": callback = getEmails; break;
      case "test": callback = validate; break;
    }
    if (callback) {
      output.status = "OK";
      output.result = callback(req.options);
    } else {
      output.status = "ERROR";
      output.result = "unknown_route";
    }
  }
  var contentSvc = ContentService.createTextOutput(JSON.stringify(output));
  contentSvc.setMimeType(ContentService.MimeType.JSON);
  return contentSvc;
}

function findEmails({ since, offset, size }) {
  const senders = [
    "hello@pokemongolive.com",
    "nominations@portals.ingress.com",
    "notices@wayfarer.nianticlabs.com",
    "ingress-support@nianticlabs.com",
    "ingress-support@google.com"
  ].map(e => "from:" + e);
  if (since == "") since = "1970-01-01";
  if (!since.match(/^\\d{4}-\\d{2}-\\d{2}$/)) return [];
  const emails = [];
  const threads = GmailApp.search("(" + senders.join(" | ") + ") after:" + since, offset, size);
  for (j = 0; j &lt; threads.length; j++) emails.push(threads[j].getId());
  return emails;
}

function getEmails({ ids }) {
  const emls = {};
  for (let i = 0; i &lt; ids.length; i++) {
    emls[ids[i]] = GmailApp.getThreadById(ids[i]).getMessages()[0].getRawContent();
  }
  return emls;
}

function validate() {
  return "success";
}</textarea>
<p>The Google Apps Script page has a large text area that currently contains <code>function myFunction()</code> and some brackets. Select all of this text, delete it, and press <code>Ctrl+V</code> to replace it with the code you just copied above.</p>
<p>Then save the file by pressing <code>Ctrl+S</code>.</p>
<hr>
<h2>Step 3: Limit the script's permissions</h2>
<p>By default, the script you have pasted will try to get full read and write access to your Gmail account. This level of permission is not necessary, and for the safety of your account, it is recommended that you limit the permissions of the script so that it cannot write or delete emails. This step is <u>optional</u>, but it is <u>highly recommended</u>.</p>
<p>Click on the cog wheel icon (1) to access project settings, then ensure that "Show appsscript.json manifest file" is <u>checked</u>, like in this picture:</p>
<img src="https://i.imgur.com/Q7h200M.png">
<p>Next, return to the script editor by pressing the "Editor" button (1), and click on the new "appsscript.json" file that appears in the file list (2):</p>
<img src="https://i.imgur.com/eB5hred.png">
<p>Copy the correct manifest contents from below:</p>
<textarea readonly>{
  "timeZone": "Etc/UTC",
  "dependencies": {},
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "oauthScopes": [
    "https://www.googleapis.com/auth/gmail.readonly"
  ]
}</textarea>
<p>Then, overwrite the contents of the file by deleting all the contents, then pressing <code>Ctrl+V</code> to paste the contents you just copied. Save the file using <code>Ctrl+S</code>.</p>
<hr>
<h2>Step 4: Authorizing the script to access emails</h2>
<p>Return to the "Code.gs" file (1). In the function dropdown, ensure "setup" is selected (2), then press "Run" (3):</p>
<img src="https://i.imgur.com/VFx9Wgs.png">
<p>You will see an authorization prompt, like the screenshot below. Click on "Review permissions" when it appears.</p>
<img src="https://i.imgur.com/sReSttx.png">
<p>A popup will appear. Click on "Advanced" (1), then "Go to Wayfarer Email Importer (unsafe)" (or the name of your script) (2). This warning screen shows because the script used by Nomination Status History has not been verified by Google. It is completely safe to use - the source code of the script is what you just pasted earlier.</p>
<img src="https://i.imgur.com/3wSTjPy.png">
<p>The following screen will then appear, asking permission to view your emails. Click on Allow.</p>
<img src="https://i.imgur.com/QHiZLc4.png">
<hr>
<h2>Step 5: Copy the access token</h2>
<p>You will be returned to the main Apps Script window, where a new "Execution log" will appear. After a few seconds, an access token will appear in this pane.</p>
<img src="https://i.imgur.com/WUAMGLR.png">
<p>Copy this value, and paste it in the "Access token" box that you are asked for on the "Import using Google Apps Script" window on Wayfarer.</p>
<p><b>It is very important that you do not share this token with <u>anyone</u>. Keep it completely secret.</b></p>
<p>P.S. The input box for the access token will hide its contents to prevent accidental leakage through screenshots. If you ever need it again, for example on another device, you can return to the Google Apps Script and click "Run" using the "setup" function again. If your token is ever accidentally disclosed, you can reset it by running the "resetScriptData" function, and the "setup" again to generate a new token.</p>
<hr>
<h2>Step 6: Deploy the script</h2>
<p>In the top right corner of the Google Apps Script page, there is a blue "Deploy" button. Click on it, and then click "New deployment".</p>
<img src="https://i.imgur.com/WNiIMwf.png">
<p>In the window that appears, click the gear icon, then select "Web app".</p>
<img src="https://i.imgur.com/tmvBq3E.png">
<p>Some settings will appear. Leave "Execute as" set to "Me", but make sure that "Who has access" is set to "Anyone" (1). Then, click "Deploy" (2).</p>
<img src="https://i.imgur.com/a8LPFaM.png">
<p>When the deployment has completed, you will be shown a web app URL. Copy this URL, and paste it into the "Script URL" box in the "Import using Google Apps Script" window on Wayfarer.</p>
<img src="https://i.imgur.com/2ydKg9H.png">
<hr>
<h2>Step 7: First import</h2>
<p>Congratulations, the setup is now complete! Here are a few things to keep in mind that specifically apply to the <u>first time</u> you use the importer:</p>
<ul>
<li>The first time you import emails, the process can take a very long time, as it has to import all of your emails. This can take many minutes.</li>
<li>If you have previously and recently used the manual *.eml file importer function, you may not have any changes detected. It is very important that even if you have no changes detected, you click on "Import 0 change(s)" this time, because this will mark all the emails you just imported as processed, so that it does not have to process every single one of them again the next time you run the importer.</li>
</ul>
</div></body>
</html>
`;

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
            .wfnshDropdown {
                cursor: pointer;
            }
            .wfnshDropdown .wfnshInner {
                display: none;
            }
            .wfnshDropdown .wfnshDDLeftBox {
                float: left;
                margin-right: 7px;
                display: block;
            }
            .wfnshDropdown .wfnshDDRightBox {
                float: right;
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
            .wfnshMethodButton {
                background-color: #e5e5e5;
                border: none;
                padding: 10px 10px;
                cursor: pointer;
                width: 100%;
                background-size: 30px;
                background-position: 15px;
                background-repeat: no-repeat;
                margin-bottom: 10px;
            }
            .wfnshMethodButton .wfnshMethodTitle {
                color: #ff4713;
                font-size: 16px;
            }
            .wfnshMethodButton .wfnshMethodDesc {
                font-size: 12px;
            }
            .wfnshCancelButton {
                color: #000000;
            }
            .wfnshGAScriptTable {
                width: 100%;
            }
            .wfnshGAScriptTable td {
                border: none;
            }
            .wfnshGAScriptTable input {
                background-color: #ddd;
                width: 100%;
                padding: 5px;
            }
            .dark .wfnshGAScriptTable input {
                background-color: #222;
            }

            .dark .wfnshTopButton {
                background-color: #404040;
                color: #20B8E3;
            }
            .dark .wfnshCancelButton {
                color: #ff0000;
            }
            .dark .wfnshMethodButton {
                background-color: #404040;
            }
            .dark .wfnshMethodButton .wfnshMethodTitle {
                color: #20B8E3;
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
            .wfnshImportMethod {
                max-width: 500px;
                height: initial;
            }
            .wfnshImportGAScriptOptions {
                max-width: 700px;
                height: initial;
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
