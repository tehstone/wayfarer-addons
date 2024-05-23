// ==UserScript==
// @name         Wayfarer Nomination Status History
// @version      1.3.3
// @description  Track changes to nomination status
// @namespace    https://github.com/tehstone/wayfarer-addons/
// @downloadURL  https://github.com/tehstone/wayfarer-addons/raw/main/wayfarer-nomination-status-history.user.js
// @homepageURL  https://github.com/tehstone/wayfarer-addons/
// @match        https://wayfarer.nianticlabs.com/*
// @run-at       document-start
// @grant        GM_info
// ==/UserScript==

// Copyright 2024 tehstone, bilde, Tntnnbltn
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
    const nomDateSelector = 'app-submissions app-details-pane app-submission-tag-set + span';
    const strictClassificationMode = true;

    const eV1ProcessingStateVersion = 22;
    const eV1CutoffParseErrors = 22;
    const eV1CutoffEverything = 21;

    let errorReportingPrompt = !localStorage.hasOwnProperty('wfnshStopAskingAboutCrashReports');
    const importCache = {};
    let ready = false;
    let userHash = 0;

    // https://github.com/bryc/code/blob/master/jshash/experimental/cyrb53.js
    const cyrb53 = function (str, seed = 0) {
        let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
        for (let i = 0, ch; i < str.length; i++) {
            ch = str.charCodeAt(i);
            h1 = Math.imul(h1 ^ ch, 2654435761);
            h2 = Math.imul(h2 ^ ch, 1597334677);
        }
        h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
        h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
        return 4294967296 * (2097151 & h2) + (h1 >>> 0);
    };

    // Overwrite the open method of the XMLHttpRequest.prototype to intercept the server calls
    (function (open) {
        XMLHttpRequest.prototype.open = function (method, url) {
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
        XMLHttpRequest.prototype.send = function (dataText) {
            try {
                const data = JSON.parse(dataText);
                const xhr = this;
                this.addEventListener('load', handleXHRResult(function (result) {
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
            } catch (err) { }
            send.apply(this, arguments);
        };
    })(XMLHttpRequest.prototype.send);

    // Perform validation on result to ensure the request was successful before it's processed further.
    // If validation passes, passes the result to callback function.
    const handleXHRResult = callback => function (e) {
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

    const handleNominations = ({ submissions }) => {
        addNotificationDiv();
        // Check for changes in nomination list.
        getIDBInstance().then(db => checkNominationChanges(db, submissions)).catch(console.error).then(async () => {
            // Delete old PEIID
            let usedLegacyEmailImport = false;
            if (localStorage.hasOwnProperty('wfnshProcessedEmailIDs')) {
                localStorage.removeItem('wfnshProcessedEmailIDs');
                usedLegacyEmailImport = true;
            }
            // Attach to email import API
            const windowRef = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
            if (windowRef.wft_plugins_api && windowRef.wft_plugins_api.emailImport) {
                console.log('Attaching event handler to Email Import API');
                const epInstance = new EmailProcessor(submissions);
                console.log('Starting to process stored emails for history events...');
                const start = new Date();
                await windowRef.wft_plugins_api.emailImport.prepare();
                await epInstance.open();
                for await (const email of windowRef.wft_plugins_api.emailImport.iterate()) {
                    await epInstance.importEmail(email);
                }
                await epInstance.close(false);
                windowRef.wft_plugins_api.emailImport.addListener('wayfarer-nomination-status-history.user.js', {
                    onImportStarted: async () => await epInstance.open(),
                    onImportCompleted: async () => await epInstance.close(true),
                    onEmailImported: async email => await epInstance.importEmail(email)
                });
                console.log(`Imported stored history events from email cache in ${Date.now() - start} msec.`);
                if (usedLegacyEmailImport) {
                    alert('Nomination Status History has updated to a new version, and due to a breaking change, it is highly recommended that all Wayfarer emails are re-imported. By default, this will happen automatically the next time you import your email history.');
                }
            } else if (usedLegacyEmailImport) {
                alert('Nomination Status History has updated to a new version that drastically changes how email imports are handled internally. You are receiving this notification because you have previously used this feature. Please install the Email Import API from wayfarer.tools to continue using the email importer feature.');
            }
        });
        // Add event listener for each element in the nomination list, so we can display the history box for nominations on click.
        awaitElement(() => document.querySelector('app-submissions-list')).then(ref => {
            // Each item in the list only has the image URL for unique identification. Map these to nomination IDs.
            const nomCache = {};
            let box = null;
            submissions.forEach(nom => { nomCache[nom.imageUrl] = nom.id; });
            ref.addEventListener('click', e => {
                // Ensure there is only one selection box.
                var elements = document.querySelectorAll('.wfnshDropdown');
                if (elements.length > 0) {
                    elements.forEach(function(element) {
                        element.remove();
                    });
                }
                const item = e.target.closest('app-submissions-list-item');
                if (item) {
                    // hopefully this index is constant and never changes? i don't see a better way to access it
                    const nomId = item["__ngContext__"][22].id
                    if (nomId) {
                        awaitElement(() => document.querySelector(nomDateSelector)).then(ref => {
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
                                    result.statusHistory.forEach(({ timestamp, status, verified, email }) => {
                                        addEventToHistoryDisplay(box, timestamp, status, verified, email, previous);
                                        previous = status;
                                    });
                                    // Clean up when we're done.
                                    db.close();
                                }
                            });
                        });
                    }
                }
            });
        });
    };

    // Adds a nomination history entry to the given history display <select>.
    const addEventToHistoryDisplay = (box, timestamp, status, verified, email, previous) => {
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
        const dateString = `${date.getUTCFullYear()}-${('0' + (date.getUTCMonth() + 1)).slice(-2)}-${('0' + date.getUTCDate()).slice(-2)}`;
        const text = `${dateString} - `;
        const stateText = stateMap.hasOwnProperty(status) ? stateMap[status] : status;

        const lastLine = box.querySelector('.wfnshOneLine');
        lastLine.textContent = text + stateText;
        const line = document.createElement('p');
        line.appendChild(document.createTextNode(text));
        if (verified) lastLine.classList.add('wfnshVerified');
        else if (lastLine.classList.contains('wfnshVerified')) lastLine.classList.remove('wfnshVerified');

        const windowRef = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
        if (email && windowRef.wft_plugins_api && windowRef.wft_plugins_api.emailImport) {
            const aDisplay = document.createElement('a');
            aDisplay.textContent = stateText;
            aDisplay.addEventListener('click', e => {
                e.stopPropagation();
                windowRef.wft_plugins_api.emailImport.get(email).then(eml => eml.display());
            });
            line.appendChild(aDisplay);
        } else {
            line.appendChild(document.createTextNode(stateText));
        }
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
    const checkNominationChanges = (db, submissions) => {
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
            if (submissions.length < userNominationCount) {
                const missingCount = userNominationCount - submissions.length;
                createNotification(`${missingCount} of ${userNominationCount} nominations are missing!`, "red");
            }

            let newCount = {
                NOMINATION: 0,
                EDIT_TITLE: 0,
                EDIT_DESCRIPTION: 0,
                EDIT_LOCATION: 0,
                PHOTO: 0
            }
            let importCount = 0;
            submissions.forEach(nom => {
                if (nom.id in savedNominations) {
                    // Nomination ALREADY EXISTS in IDB
                    const saved = savedNominations[nom.id];
                    const history = saved.statusHistory;
                    const title = nom.title || (nom.poiData && nom.poiData.title) || "[Title]";
                    const icon = createNotificationIcon(nom.type);
                    // Add upgrade change status if the nomination was upgraded.
                    if (nom.upgraded && !saved.upgraded) {
                        history.push({ timestamp: Date.now(), status: 'UPGRADE' });
                        createNotification(`${title} was upgraded!`, 'blue', icon);
                    }
                    // Add status change if the current status is different to the stored one.
                    if (nom.status != saved.status) {
                        history.push({ timestamp: Date.now(), status: nom.status });
                        // For most status updates, it's also desired to send a notification to the user.
                        if (nom.status !== 'HELD' && !(nom.status === 'NOMINATED' && saved.status === 'HELD')) {
                            const { text, color } = getStatusNotificationText(nom.status);
                            createNotification(`${title} ${text}`, color, icon);
                        }
                    }
                    // Filter out irrelevant fields that we don't need to store.
                    // Only retain fields from savedFields before we put it in IDB
                    const toSave = filterObject(nom, savedFields);
                    if (nom.poiData) {
                        toSave.poiData = { ...nom.poiData };
                    }
                    objectStore.put({ ...toSave, statusHistory: history, userHash });
                } else {
                    // Nomination DOES NOT EXIST in IDB yet
                    newCount[nom.type]++;
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
                    let toSave = filterObject(nom, savedFields);
                    if (nom.poiData) {
                        toSave.poiData = { ...nom.poiData };
                    }
                    objectStore.put({ ...toSave, statusHistory: history, userHash });
                }
            });
            // Commit all changes. (And close the database connection due to tx.oncomplete.)
            tx.commit();
            const actionTypes = ['NOMINATION', 'EDIT_TITLE', 'EDIT_DESCRIPTION', 'EDIT_LOCATION', 'PHOTO'];

            const messageTypeMapping = {
                'NOMINATION': (importCount) => newCount.NOMINATION > 0 ?
                (importCount > 0 ?
                 `Found ${newCount.NOMINATION} new nomination${newCount.NOMINATION > 1 ? 's' : ''} in the list, of which ${importCount} had its history imported from WFES Nomination Notify.` :
                 `Found ${newCount.NOMINATION} new nomination${newCount.NOMINATION > 1 ? 's' : ''} in the list!`) :
                '',
                'EDIT_TITLE': () => newCount.EDIT_TITLE > 0 ? `Found ${newCount.EDIT_TITLE} new title edit${newCount.EDIT_TITLE > 1 ? 's' : ''} in the list!` : '',
                'EDIT_DESCRIPTION': () => newCount.EDIT_DESCRIPTION > 0 ? `Found ${newCount.EDIT_DESCRIPTION} new description edit${newCount.EDIT_DESCRIPTION > 1 ? 's' : ''} in the list!` : '',
                'EDIT_LOCATION': () => newCount.EDIT_LOCATION > 0 ? `Found ${newCount.EDIT_LOCATION} new location edit${newCount.EDIT_LOCATION > 1 ? 's' : ''} in the list!` : '',
                'PHOTO': () => newCount.PHOTO > 0 ? `Found ${newCount.PHOTO} new photo${newCount.PHOTO > 1 ? 's' : ''} in the list!` : ''
            };

            actionTypes.forEach(actionType => {
                const message = messageTypeMapping[actionType](importCount);
                if (message) {
                    createNotification(message, 'gray', createNotificationIcon(actionType));
                }
            });
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
                importCache[key][id].wfesDates.forEach(([date, status]) => {
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
            case 'NOMINATED':
                // This is only generated when it used to have a status other than hold
                text = 'returned to the queue!';
                color = 'brown';
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
            case 'APPEALED':
                text = 'was appealed!';
                color = 'purple';
                break;
            default:
                text = `: unknown status: ${status}`;
                color = 'red';
                break;
        }
        return { text, color };
    };

        const createNotificationIcon = (type) => {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("version", "1.1");
        svg.setAttribute("viewBox", "0 0 512 512");
        svg.setAttribute("xml:space", "preserve");
        svg.setAttribute("width", "20");
        svg.setAttribute("height", "20");
        switch (type) {
            case 'NOMINATION':
                svg.innerHTML = `<g transform="matrix(5.5202 0 0 5.5202 7.5948 7.5921)"><path d="m45 0c-19.537 0-35.375 15.838-35.375 35.375 0 8.722 3.171 16.693 8.404 22.861l26.971 31.764 26.97-31.765c5.233-6.167 8.404-14.139 8.404-22.861 1e-3 -19.536-15.837-35.374-35.374-35.374zm0 48.705c-8.035 0-14.548-6.513-14.548-14.548s6.513-14.548 14.548-14.548 14.548 6.513 14.548 14.548-6.513 14.548-14.548 14.548z" fill="#ffffff" stroke-linecap="round"/></g>`
                break;
            case 'PHOTO':
                svg.innerHTML = `<path d="m190.39 84.949c-6.6975 5.26e-4 -12.661 4.2407-14.861 10.566l-16.951 48.736h-86.783c-16.463 8e-5 -29.807 13.346-29.807 29.809v221.27c-1.31e-4 17.518 14.201 31.719 31.719 31.719h360.38c19.84 1.8e-4 35.922-16.084 35.922-35.924v-215.54c5.2e-4 -17.307-14.029-31.337-31.336-31.338h-86.865l-16.549-48.605c-2.1787-6.3967-8.1858-10.698-14.943-10.697h-129.92zm224.45 102.69c12.237 5.2e-4 22.156 9.8009 22.156 21.889 3.9e-4 12.088-9.9185 21.888-22.156 21.889-12.238 5.4e-4 -22.161-9.7994-22.16-21.889 7e-4 -12.088 9.9224-21.889 22.16-21.889zm-158.85 30.947c37.042-8.9e-4 67.071 30.028 67.07 67.07-1.9e-4 37.042-30.029 67.069-67.07 67.068-37.041-1.8e-4 -67.07-30.028-67.07-67.068-8.9e-4 -37.041 30.029-67.07 67.07-67.07z" fill="#ffffff" />`;
                break;
            case 'EDIT_LOCATION':
                svg.innerHTML = `<path d="m275.28 191.57-37.927 265.39-182.75-401.92zm182.12 46.046-274.31 38.177-128.26-220.75z" stroke-linecap="round" stroke-linejoin="round" fill="#ffffff" stroke="#ffffff" stroke-width="26.07"/>`;
                break;
            case 'EDIT_TITLE':
                svg.innerHTML = `<path d="m15.116 412.39v84.373h84.373" fill="none" stroke="#ffffff" stroke-linecap="round" stroke-linejoin="round" stroke-width="30"/><path d="m496.66 412.24v84.373h-84.373" fill="none" stroke="#ffffff" stroke-linecap="round" stroke-linejoin="round" stroke-width="30"/><path d="m14.915 100.07v-84.373h84.373" fill="none" stroke="#ffffff" stroke-linecap="round" stroke-linejoin="round" stroke-width="30"/><path d="m496.46 100.22v-84.373h-84.373" fill="none" stroke="#ffffff" stroke-linecap="round" stroke-linejoin="round" stroke-width="30"/><path d="m81.232 82.633v142.8l29.4 1.4004c1.2444-20.844 3.4221-38.112 6.5332-51.801 3.4222-14 7.7775-25.044 13.066-33.133 5.6-8.4 12.291-14.156 20.068-17.268 7.7778-3.4222 16.955-5.1328 27.533-5.1328h42.467v261.33c0 14.311-13.844 21.467-41.533 21.467v27.066h155.4v-27.066c-28 0-42-7.1557-42-21.467v-261.33h42c10.578 0 19.755 1.7106 27.533 5.1328 7.7778 3.1111 14.313 8.8676 19.602 17.268 5.6 8.0889 9.9553 19.133 13.066 33.133 3.4222 13.689 5.7556 30.956 7 51.801l29.4-1.4004v-142.8h-349.54z" fill="#ffffff" />`
                break;
            case 'EDIT_DESCRIPTION':
                svg.innerHTML = `<path d="m15.116 412.39v84.373h84.373" fill="none" stroke="#ffffff" stroke-linecap="round" stroke-linejoin="round" stroke-width="30"/><path d="m496.66 412.24v84.373h-84.373" fill="none" stroke="#ffffff" stroke-linecap="round" stroke-linejoin="round" stroke-width="30"/><path d="m14.915 100.07v-84.373h84.373" fill="none" stroke="#ffffff" stroke-linecap="round" stroke-linejoin="round" stroke-width="30"/><path d="m496.46 100.22v-84.373h-84.373" fill="none" stroke="#ffffff" stroke-linecap="round" stroke-linejoin="round" stroke-width="30"/><path d="m79.133 82.633v27.533c27.689 0 41.533 7.1557 41.533 21.467v249.2c0 14.311-13.844 21.467-41.533 21.467v27.066h182c28.311 0 53.201-2.9561 74.668-8.8672s39.355-15.867 53.666-29.867c14.622-14 25.51-32.667 32.666-56 7.1556-23.333 10.734-52.577 10.734-87.732 0-34.533-3.5788-62.533-10.734-84-7.1556-21.467-18.044-38.111-32.666-49.934-14.311-11.822-32.199-19.756-53.666-23.801-21.467-4.3556-46.357-6.5332-74.668-6.5332h-182zm112.93 36.867h76.533c17.422 0 31.889 2.489 43.4 7.4668 11.822 4.6667 21.156 12.134 28 22.4 7.1556 10.267 12.134 23.644 14.934 40.133 2.8 16.178 4.1992 35.779 4.1992 58.801 0 23.022-1.3992 43.555-4.1992 61.6s-7.778 33.288-14.934 45.732c-6.8444 12.133-16.178 21.467-28 28-11.511 6.2222-25.978 9.334-43.4 9.334h-76.533v-273.47z" fill="#ffffff"/>`
                break;
        }
        return svg;
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

    const createNotification = (message, color = 'red', icon) => {
        const notification = document.createElement('div');
        notification.classList.add('wfnshNotification');
        notification.classList.add('wfnshBg-' + color);
        notification.addEventListener('click', () => notification.parentNode.removeChild(notification));

        const contentWrapper = document.createElement('div');
        contentWrapper.style.display = 'flex';
        contentWrapper.style.alignItems = 'center';
        const content = document.createElement('p');
        content.textContent = message;
        
        if (icon) {
            const iconWrapper = document.createElement('div');
            iconWrapper.appendChild(icon);
            iconWrapper.style.width = '30px';
            contentWrapper.appendChild(iconWrapper);
        }
        contentWrapper.appendChild(content);
        notification.appendChild(contentWrapper);
        awaitElement(() => document.getElementById('wfnshNotify')).then(ref => ref.appendChild(notification));
        return notification;
    };

    class UnresolvableProcessingError extends Error { constructor(message) { super(message); this.name = 'UnresolvableProcessingError'; } }
    class NominationMatchingError extends UnresolvableProcessingError { constructor(message) { super(message); this.name = 'NominationMatchingError'; } }
    class AmbiguousRejectionError extends UnresolvableProcessingError { constructor(message) { super(message); this.name = 'AmbiguousRejectionError'; } }

    class EmailParsingError extends Error { constructor(message) { super(message); this.name = 'EmailParsingError'; } }
    class UnknownTemplateError extends EmailParsingError { constructor(message) { super(message); this.name = 'UnknownTemplateError'; } }
    class MissingDataError extends EmailParsingError { constructor(message) { super(message); this.name = 'MissingDataError'; } }

    class EmailProcessor {
        #eQuery = {
            IMAGE_ANY: doc => this.#tryNull(() => doc.querySelector('img').src),
            IMAGE_ALT: alt => doc => this.#tryNull(() => doc.querySelector(`img[alt='${alt}']`).src),
            ING_TYPE_1: doc => this.#tryNull(() => doc.querySelector('h2 ~ p:last-of-type').lastChild.textContent.trim()),
            ING_TYPE_2: doc => this.#tryNull(() => doc.querySelector('h2 ~ p:last-of-type img').src),
            ING_TYPE_3: (status, regex, tooClose) => (doc, email) => {
                const match = email.getHeader('Subject').match(regex);
                if (!match) throw new Error('Unable to extract the name of the Wayspot from this email.');
                const text = doc.querySelector('p').textContent.trim();
                if (tooClose && text.includes(tooClose)) {
                    status = 'ACCEPTED';
                }
                const candidates = this.#submissions.filter(e => e.title == match.groups.title && e.status == status);
                if (!candidates.length) throw new NominationMatchingError(`Unable to find a nomination with status ${status} that matches the title "${match.groups.title}" on this Wayfarer account.`);
                if (candidates.length > 1) throw new NominationMatchingError(`Multiple nominations with status ${status} on this Wayfarer account match the title "${match.groups.title}" specified in the email.`);
                return candidates[0].imageUrl;
            },
            ING_TYPE_4: doc => {
                const query = doc.querySelector('h2 ~ p:last-of-type');
                if (!query) return null;
                const [title, desc] = query.textContent.split('\n');
                if (!title || !desc) return null;
                const candidates = this.#submissions.filter(e => e.title == title);
                if (!candidates.length) throw new Error(`Unable to find a nomination that matches the title "${title}" on this Wayfarer account.`);
                if (candidates.length > 1) {
                    const cand2 = candidates.filter(e => e.description == desc);
                    if (!cand2.length) throw new NominationMatchingError(`Unable to find a nomination that matches the title "${title}" and description "${desc}" on this Wayfarer account.`);
                    if (cand2.length > 1) throw new NominationMatchingError(`Multiple nominations on this Wayfarer account match the title "${title}" and description "${desc}" specified in the email.`);
                    return cand2[0].imageUrl;
                }
                return candidates[0].imageUrl;
            },
            ING_TYPE_5: (doc, email) => {
                const a = doc.querySelector('a[href^="https://www.ingress.com/intel?ll="]');
                if (!a) return null;
                const match = a.href.match(/\?ll=(?<lat>-?\d{1,2}(\.\d{1,6})?),(?<lng>-?\d{1,3}(\.\d{1,6})?)/);
                if (!match) return;
                const candidates = this.#submissions.filter(e => e.lat == parseFloat(match.groups.lat) && e.lng == parseFloat(match.groups.lng));
                if (candidates.length != 1) {
                    const m2 = email.getHeader('Subject').match(/^(Ingress Portal Live|Portal review complete): ?(?<title>.*)$/);
                    if (!m2) throw new Error('Unable to extract the name of the Wayspot from this email.');
                    const cand2 = (candidates.length ? candidates : this.#submissions).filter(e => e.title == m2.groups.title);
                    if (!cand2.length) throw new NominationMatchingError(`Unable to find a nomination that matches the title "${m2.groups.title}" or is located at ${match.groups.lat},${match.groups.lng} on this Wayfarer account.`);
                    if (cand2.length > 1) throw new NominationMatchingError(`Multiple nominations on this Wayfarer account match the title "${m2.groups.title}" and/or are located at ${match.groups.lat},${match.groups.lng} as specified in the email.`);
                    return cand2[0].imageUrl;
                }
                return candidates[0].imageUrl;
            },
            ING_TYPE_6: regex => (doc, email) => {
                const match = email.getHeader('Subject').match(regex);
                if (!match) throw new Error('Unable to extract the name of the Wayspot from this email.');
                const date = new Date(email.getHeader('Date'));
                // Wayfarer is in UTC, but emails are in local time. Work around this by also matching against the preceding
                // and following dates from the one specified in the email.
                const dateCur = this.#utcDateToISO8601(date);
                const dateNext = this.#utcDateToISO8601(this.#shiftDays(date, 1));
                const datePrev = this.#utcDateToISO8601(this.#shiftDays(date, -1));
                const dates = [datePrev, dateCur, dateNext];
                const candidates = this.#submissions.filter(e => dates.includes(e.day) && e.title.trim() == match.groups.title);
                if (!candidates.length) throw new NominationMatchingError(`Unable to find a nomination that matches the title "${match.groups.title}" and submission date ${dateCur} on this Wayfarer account.`);
                if (candidates.length > 1) throw new NominationMatchingError(`Multiple nominations on this Wayfarer account match the title "${match.groups.title}" and submission date ${dateCur} specified in the email.`);
                return candidates[0].imageUrl;
            },
            PGO_TYPE_1: doc => this.#tryNull(() => doc.querySelector('h2 ~ p:last-of-type').previousElementSibling.textContent.trim()),
            PGO_TYPE_2: doc => this.#tryNull(() => doc.querySelector('h2 ~ p:last-of-type').previousElementSibling.querySelector('img').src),
            WF_DECIDED: (regex, monthNames) => doc => {
                const windowRef = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
                const header = (doc.querySelector('.em_font_20') || doc.querySelector('.em_org_u').firstChild).textContent.trim();
                let month = null;
                let match = null;
                for (let i = 0; i < monthNames.length; i++) {
                    const months = monthNames[i];
                    const mr = new RegExp(regex.source.split('(?<month>)').join(`(?<month>${months.join('|')})`));
                    match = header.match(mr);
                    if (match) {
                        month = months.indexOf(match.groups.month) + 1;
                        break;
                    }
                }
                if (!match) return null;
                const date = `${match.groups.year}-${('0' + month).slice(-2)}-${('0' + match.groups.day).slice(-2)}`;
                // Wayfarer is in UTC, but emails are in local time. Work around this by also matching against the preceding
                // and following dates from the one specified in the email.
                const dateNext = this.#utcDateToISO8601(this.#shiftDays(new Date(date), 1));
                const datePrev = this.#utcDateToISO8601(this.#shiftDays(new Date(date), -1));
                const dates = [datePrev, date, dateNext];
                const candidates = this.#submissions.filter(e => dates.includes(e.day) && windowRef.wft_plugins_api.emailImport.stripDiacritics(e.title) == match.groups.title && ['ACCEPTED', 'REJECTED', 'DUPLICATE', 'APPEALED', 'NIANTIC_REVIEW'].includes(e.status));
                if (!candidates.length) throw new NominationMatchingError(`Unable to find a nomination that matches the title "${match.groups.title}" and submission date ${date} on this Wayfarer account.`);
                if (candidates.length > 1) throw new NominationMatchingError(`Multiple nominations on this Wayfarer account match the title "${match.groups.title}" and submission date ${date} specified in the email.`);
                return candidates[0].imageUrl;
            }
        };

        #eMonths = {
            ENGLISH:        ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
            BENGALI:        ['জানু', 'ফেব', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'],
            SPANISH:        ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'],
            FRENCH:         ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'],
            HINDI:          ['जन॰', 'फ़र॰', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुल॰', 'अग॰', 'सित॰', 'अक्तू॰', 'नव॰', 'दिस॰'],
            ITALIAN:        ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'],
            DUTCH:          ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'],
            MARATHI:        ['जाने', 'फेब्रु', 'मार्च', 'एप्रि', 'मे', 'जून', 'जुलै', 'ऑग', 'सप्टें', 'ऑक्टो', 'नोव्हें', 'डिसें'],
            NORWEGIAN:      ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'],
            POLISH:         ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'],
            PORTUGUESE:     ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'],
            RUSSIAN:        ['янв.', 'февр.', 'мар.', 'апр.', 'мая', 'июн.', 'июл.', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.'],
            SWEDISH:        ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'],
            TAMIL:          ['ஜன.', 'பிப்.', 'மார்.', 'ஏப்.', 'மே', 'ஜூன்', 'ஜூலை', 'ஆக.', 'செப்.', 'அக்.', 'நவ.', 'டிச.'],
            TELUGU:         ['జన', 'ఫిబ్ర', 'మార్చి', 'ఏప్రి', 'మే', 'జూన్', 'జులై', 'ఆగ', 'సెప్టెం', 'అక్టో', 'నవం', 'డిసెం'],
            THAI:           ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'],
            NUMERIC:        ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
            ZERO_PREFIXED:  ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'],
        };

        #eType = {
            NOMINATED: 'NOMINATED',
            ACCEPTED: 'ACCEPTED',
            REJECTED: 'REJECTED',
            DUPLICATE: 'DUPLICATE',
            APPEALED: 'APPEALED',
            determineRejectType: (nom, email) => {
                const [appealed] = this.#statusHistory[nom.id].filter(e => e.status === 'APPEALED');
                if (appealed) {
                    const appealDate = new Date(appealed.timestamp);
                    const emailDate = new Date(email.getHeader('Date'));
                    // Niantic doesn't send the correct email when they reject something as duplicate on appeal.
                    // We catch this here to prevent errors.
                    if (appealDate < emailDate) return this.#eType.determineAppealRejectType(nom);
                }
                for (let i = 0; i < this.#statusHistory[nom.id].length; i++) {
                    switch (this.#statusHistory[nom.id][i].status) {
                        case 'REJECTED':
                            return this.#eType.REJECTED;
                        case 'DUPLICATE':
                            return this.#eType.DUPLICATE;
                        case 'APPEALED':
                            if (strictClassificationMode) {
                                throw new AmbiguousRejectionError('This email was rejected because determining the former status of this nomination after appealing it is impossible if it was appealed prior to the installation of this script.');
                            } else {
                                return 'REJECTED';
                            }
                    }
                }
                throw new AmbiguousRejectionError(`This email was rejected because it was not possible to determine how this nomination was rejected (expected status REJECTED or DUPLICATE, but observed ${this.#statusHistory[nom.id][this.#statusHistory[nom.id].length - 1].status}).`);
            },
            determineAppealRejectType: nom => {
                const start = this.#statusHistory[nom.id].indexOf('APPEALED') + 1;
                for (let i = start; i < this.#statusHistory[nom.id].length; i++) {
                    switch (this.#statusHistory[nom.id][i].status) {
                        case 'REJECTED':
                            return this.#eType.REJECTED;
                        case 'DUPLICATE':
                            return this.#eType.DUPLICATE;
                    }
                }
                if (strictClassificationMode) {
                    throw new AmbiguousRejectionError(`This email was not processed because it was not possible to determine how Niantic rejected the appeal (expected status REJECTED or DUPLICATE, but observed ${this.#statusHistory[nom.id][this.#statusHistory[nom.id].length - 1].status}).`);
                } else {
                    return 'REJECTED';
                }
            }
        };

        #eStatusHelpers = {
            WF_DECIDED: (acceptText, rejectText) => (doc, nom, email) => {
                const text = doc.querySelector('.em_font_20')?.parentNode?.nextElementSibling?.textContent.replaceAll(/\s+/g, ' ').trim();
                if (acceptText && text?.includes(acceptText)) return this.#eType.ACCEPTED;
                if (rejectText && text?.includes(rejectText)) return this.#eType.determineRejectType(nom, email);
                return null;
            },
            WF_DECIDED_NIA: (acceptText, rejectText) => (doc, nom, email) => {
                const text = doc.querySelector('.em_org_u')?.textContent.replaceAll(/\s+/g, ' ').trim();
                if (acceptText && text?.includes(acceptText)) return this.#eType.ACCEPTED;
                if (rejectText && text?.includes(rejectText)) return this.#eType.determineRejectType(nom, email);
                return null;
            },
            WF_DECIDED_NIA_2: (acceptText, rejectText) => (doc, nom, email) => {
                const text = doc.querySelector('.em_font_20')?.textContent?.split('\n')[2]?.replaceAll(/\s+/g, ' ').trim();
                if (acceptText && text?.includes(acceptText)) return this.#eType.ACCEPTED;
                if (rejectText && text?.includes(rejectText)) return this.#eType.determineRejectType(nom, email);
                return null;
            },
            WF_APPEAL_DECIDED: (acceptText, rejectText) => (doc, nom) => {
                const text = doc.querySelector('.em_font_20').parentNode.nextElementSibling.textContent.replaceAll(/\s+/g, ' ').trim();
                if (acceptText && text.includes(acceptText)) return this.#eType.ACCEPTED;
                if (rejectText && text.includes(rejectText)) return this.#eType.determineAppealRejectType(nom);
                return null;
            },
            ING_DECIDED: (acceptText1, acceptText2, rejectText, dupText1, tooCloseText, dupText2) => doc => {
                const text = (doc.querySelector('h2 + p') || doc.querySelector('p')).textContent.trim();
                if (acceptText1 && text.startsWith(acceptText1)) return this.#eType.ACCEPTED;
                if (acceptText2 && text.startsWith(acceptText2)) return this.#eType.ACCEPTED;
                if (rejectText && text.includes(rejectText)) return this.#eType.REJECTED;
                if (dupText1 && text.includes(dupText1)) return this.#eType.DUPLICATE;
                if (tooCloseText && text.includes(tooCloseText)) return this.#eType.ACCEPTED;
                const query2 = doc.querySelector('p:nth-child(2)');
                if (query2 && dupText2 && query2.textContent.trim().includes(dupText2)) return this.#eType.DUPLICATE;
                return null;
            }
        };

        #emailParsers = [

            //  ---------------------------------------- ENGLISH [en] ----------------------------------------
            {
                // Nomination decided (Wayfarer)
                subject: /^Niantic Wayspot nomination decided for/,
                status: [this.#eStatusHelpers.WF_DECIDED(
                    'has decided to accept your Wayspot nomination.',
                    'has decided not to accept your Wayspot nomination.'
                ), this.#eStatusHelpers.WF_DECIDED_NIA(
                    'Congratulations, our team has decided to accept your Wayspot nomination',
                    'did not meet the criteria required to be accepted and has been rejected'
                )], image: [this.#eQuery.WF_DECIDED(
                    /^Thank you for your Wayspot nomination (?<title>.*) on (?<month>) (?<day>\d+), (?<year>\d+)!$/,
                    [this.#eMonths.ENGLISH]
                ), this.#eQuery.WF_DECIDED(
                    /^Thank you for taking the time to nominate (?<title>.*) on (?<month>) (?<day>\d+), (?<year>\d+)\./,
                    [this.#eMonths.ENGLISH]
                )]
            },
            {
                // Nomination decided (Wayfarer, NIA)
                subject: /^Decision on your? Wayfarer Nomination,/,
                status: [this.#eStatusHelpers.WF_DECIDED_NIA(
                    undefined, // Accepted - this email template was never used for acceptances
                    'did not meet the criteria required to be accepted and has been rejected'
                )], image: [this.#eQuery.WF_DECIDED(
                    /^Thank you for taking the time to nominate (?<title>.*) on (?<month>) (?<day>\d+), (?<year>\d+)\./,
                    [this.#eMonths.ENGLISH]
                )]
            },
            {
                // Appeal decided
                subject: /^Your Niantic Wayspot appeal has been decided for/,
                status: [this.#eStatusHelpers.WF_APPEAL_DECIDED(
                    'Niantic has decided that your nomination should be added as a Wayspot',
                    'Niantic has decided that your nomination should not be added as a Wayspot'
                )], image: [this.#eQuery.WF_DECIDED(
                    /^Thank you for your Wayspot nomination appeal for (?<title>.*) on (?<month>) (?<day>\d+), (?<year>\d+).$/,
                    [this.#eMonths.ENGLISH]
                )]
            },
            {
                // Nomination received (Ingress)
                subject: /^Portal submission confirmation:/,
                status: [() => this.#eType.NOMINATED],
                image: [this.#eQuery.IMAGE_ALT('Nomination Photo'), this.#eQuery.ING_TYPE_1, this.#eQuery.ING_TYPE_6(
                    /^Portal submission confirmation: (?<title>.*)$/
                )]
            },
            {
                // Nomination decided (Ingress)
                subject: /^Portal review complete:/,
                status: [this.#eStatusHelpers.ING_DECIDED(
                    'Good work, Agent:',
                    'Excellent work, Agent.',
                    'we have decided not to accept this candidate.',
                    'your candidate is a duplicate of an existing Portal.',
                    'this candidate is too close to an existing Portal',
                    'Your candidate is a duplicate of either an existing Portal'
                )], image: [this.#eQuery.IMAGE_ALT('Nomination Photo'), this.#eQuery.ING_TYPE_1, this.#eQuery.ING_TYPE_2, this.#eQuery.ING_TYPE_5, this.#eQuery.ING_TYPE_4]
            },
            {
                // Nomination received (Ingress Redacted)
                subject: /^Ingress Portal Submitted:/,
                status: [() => this.#eType.NOMINATED],
                image: [this.#eQuery.ING_TYPE_6(
                    /^Ingress Portal Submitted: (?<title>.*)$/
                )]
            },
            {
                // Nomination duplicated (Ingress Redacted)
                subject: /^Ingress Portal Duplicate:/,
                status: [() => this.#eType.DUPLICATE],
                image: [this.#eQuery.ING_TYPE_3(
                    this.#eType.DUPLICATE,
                    /^Ingress Portal Duplicate: (?<title>.*)$/
                )]
            },
            {
                // Nomination accepted (Ingress Redacted)
                subject: /^Ingress Portal Live:/,
                status: [() => this.#eType.ACCEPTED],
                image: [this.#eQuery.ING_TYPE_5]
            },
            {
                // Nomination rejected (Ingress Redacted)
                subject: /^Ingress Portal Rejected:/,
                status: [() => this.#eType.REJECTED],
                image: [this.#eQuery.ING_TYPE_3(
                    this.#eType.REJECTED,
                    /^Ingress Portal Rejected: (?<title>.*)$/,
                    'Unfortunately, this Portal is too close to another existing Portal'
                )]
            },
            {
                // Nomination received (PoGo)
                subject: /^Trainer [^:]+: Thank You for Nominating a PokéStop for Review.$/,
                status: [() => this.#eType.NOMINATED],
                image: [this.#eQuery.PGO_TYPE_1]
            },
            {
                // Nomination accepted (PoGo)
                subject: /^Trainer [^:]+: Your PokéStop Nomination Is Eligible!$/,
                status: [() => this.#eType.ACCEPTED],
                image: [this.#eQuery.PGO_TYPE_1, this.#eQuery.PGO_TYPE_2]
            },
            {
                // Nomination rejected (PoGo)
                subject: /^Trainer [^:]+: Your PokéStop Nomination Is Ineligible$/,
                status: [() => this.#eType.REJECTED],
                image: [this.#eQuery.PGO_TYPE_1, this.#eQuery.PGO_TYPE_2]
            },
            {
                // Nomination duplicated (PoGo)
                subject: /^Trainer [^:]+: Your PokéStop Nomination Review Is Complete:/,
                status: [() => this.#eType.DUPLICATE],
                image: [this.#eQuery.PGO_TYPE_1, this.#eQuery.PGO_TYPE_2]
            },

            //  ---------------------------------------- BENGALI [bn] ----------------------------------------
            {
                // Nomination decided (Wayfarer)
                subject: /-এর জন্য Niantic Wayspot মনোনয়নের সিদ্ধান্ত নেওয়া হয়েছে/,
                status: [this.#eStatusHelpers.WF_DECIDED(
                    'অনুসারে আপনার Wayspot মনোনয়ন স্বীকার করতে চানদ',
                    'অনুসারে আপনার Wayspot মনোনয়ন স্বীকার করতে স্বীকার করতে চান না'
                ), this.#eStatusHelpers.WF_DECIDED_NIA_2(
                    'অভিনন্দন, আমাদের দল আপনার Wayspot-এর মনোনয়ন গ্রহণ করার সিদ্ধান্ত নিয়েছেন।',
                    undefined //'did not meet the criteria required to be accepted and has been rejected'
                )], image: [this.#eQuery.WF_DECIDED(
                    /^(?<month>) (?<day>\d+), (?<year>\d+)-এ আপনার Wayspot মনোনয়ন (?<title>.*) করার জন্য আপনাকে ধন্যবাদ জানাই!$/,
                    [this.#eMonths.ENGLISH, this.#eMonths.BENGALI]
                ), this.#eQuery.WF_DECIDED(
                    /^(?<title>.*)-কে(?<day>\d+) (?<month>), (?<year>\d+) -তে মনোয়ন করতে সময় দেওয়ার জন্য আপনাকে ধন্যবাদ।/,
                    [this.#eMonths.BENGALI]
                )]
            },

            //  ---------------------------------------- CZECH [cs] ----------------------------------------
            {
                // Nomination decided (Wayfarer)
                subject: /^Rozhodnutí o nominaci na Niantic Wayspot pro/,
                status: [this.#eStatusHelpers.WF_DECIDED(
                    'se rozhodla přijmout vaši nominaci na Wayspot',
                    'se rozhodla nepřijmout vaši nominaci na Wayspot'
                ), this.#eStatusHelpers.WF_DECIDED_NIA(
                    'Gratulujeme, náš tým se rozhodl vaši nominaci na Wayspot přijmout.',
                    undefined //'did not meet the criteria required to be accepted and has been rejected'
                )], image: [this.#eQuery.WF_DECIDED(
                    /^děkujeme za vaši nominaci na Wayspot (?<title>.*) ze dne (?<day>\d+)\. ?(?<month>)\. ?(?<year>\d+)!$/,
                    [this.#eMonths.NUMERIC]
                ), this.#eQuery.WF_DECIDED(
                    /^děkujeme za vaši nominaci (?<title>.*) ze dne (?<day>\d+)\. ?(?<month>)\. ?(?<year>\d+)\./,
                    [this.#eMonths.NUMERIC]
                )]
            },
            {
                // Appeal decided
                subject: /^Rozhodnutí o odvolání proti nominaci na Niantic Wayspot pro/,
                status: [this.#eStatusHelpers.WF_APPEAL_DECIDED(
                    'Niantic se rozhodla, že vaše nominace ACCEPT by měla/by neměla být přidána jako Wayspot',
                    'Niantic se rozhodla, že vaše nominace REJECT by měla/by neměla být přidána jako Wayspot'
                )], image: [this.#eQuery.WF_DECIDED(
                    /^děkujeme za vaše odvolání proti odmítnutí nominace na Wayspot (?<title>.*) ze dne (?<day>\d+)\. (?<month>)\. (?<year>\d+)\.$/,
                    [this.#eMonths.NUMERIC]
                )]
            },

            //  ---------------------------------------- GERMAN [de] ----------------------------------------
            {
                // Nomination decided (Wayfarer)
                subject: /^Entscheidung zum Wayspot-Vorschlag/,
                status: [this.#eStatusHelpers.WF_DECIDED(
                    'hat entschieden, deinen Wayspot-Vorschlag zu akzeptieren.',
                    'hat entschieden, deinen Wayspot-Vorschlag nicht zu akzeptieren.'
                ), this.#eStatusHelpers.WF_DECIDED_NIA_2(
                    'Glückwunsch, unser Team hat entschieden, deinen Wayspot-Vorschlag zu akzeptieren.',
                    undefined //'did not meet the criteria required to be accepted and has been rejected'
                )], image: [this.#eQuery.WF_DECIDED(
                    /^danke, dass du den Wayspot-Vorschlag (?<title>.*) am (?<day>\d+)\.(?<month>)\.(?<year>\d+) eingereicht hast\.$/,
                    [this.#eMonths.ZERO_PREFIXED]
                ), this.#eQuery.WF_DECIDED(
                    /^Danke, dass du dir die Zeit genommen hast, (?<title>.*) am (?<day>\d+)\.(?<month>)\.(?<year>\d+) vorzuschlagen\./,
                    [this.#eMonths.ZERO_PREFIXED]
                )]
            },
            {
                // Appeal decided
                subject: /^Entscheidung zum Einspruch für den Wayspot/,
                status: [this.#eStatusHelpers.WF_APPEAL_DECIDED(
                    'Niantic hat entschieden, dass dein Vorschlag ein Wayspot werden sollte.',
                    'Niantic hat entschieden, dass dein Vorschlag kein Wayspot werden sollte.'
                )], image: [this.#eQuery.WF_DECIDED(
                    /^danke, dass du am (?<day>\d+)\.(?<month>)\.(?<year>\d+) einen Einspruch für den Wayspot (?<title>.*) eingereicht hast.$/,
                    [this.#eMonths.ZERO_PREFIXED]
                )]
            },
            {
                // Nomination received (Ingress)
                subject: /^Empfangsbestätigung deines eingereichten Portalvorschlags:/,
                status: [() => this.#eType.NOMINATED],
                image: [this.#eQuery.IMAGE_ALT('Nomination Photo'), this.#eQuery.ING_TYPE_1]
            },
            {
                // Nomination decided (Ingress)
                subject: /^Überprüfung des Portals abgeschlossen:/,
                status: [this.#eStatusHelpers.ING_DECIDED(
                    'Gute Arbeit, Agent!',
                    'Hervorragende Arbeit, Agent.',
                    'konnten wir deinen Vorschlag jedoch nicht annehmen.',
                    'Leider ist dieses Portal bereits vorhanden',
                    undefined //'this candidate is too close to an existing Portal.'
                )], image: [this.#eQuery.IMAGE_ALT('Nomination Photo'), this.#eQuery.ING_TYPE_1, this.#eQuery.ING_TYPE_2]
            },
            {
                // Nomination received (PoGo)
                subject: /^Trainer [^:]+: Danke, dass du einen PokéStop zur Überprüfung vorgeschlagen hast$/,
                status: [() => this.#eType.NOMINATED],
                image: [this.#eQuery.PGO_TYPE_1]
            },
            {
                // Nomination accepted (PoGo)
                subject: /^Trainer [^:]+: Dein vorgeschlagener PokéStop ist zulässig!$/,
                status: [() => this.#eType.ACCEPTED],
                image: [this.#eQuery.PGO_TYPE_1, this.#eQuery.PGO_TYPE_2]
            },
            {
                // Nomination rejected (PoGo)
                subject: /^Trainer [^:]+: Dein vorgeschlagener PokéStop ist nicht zulässig$/,
                status: [() => this.#eType.REJECTED],
                image: [this.#eQuery.PGO_TYPE_1, this.#eQuery.PGO_TYPE_2]
            },
            {
                // Nomination duplicated (PoGo)
                subject: /^Trainer [^:]+: Die Prüfung deines PokéStop-Vorschlags wurde abgeschlossen:/,
                status: [() => this.#eType.DUPLICATE],
                image: [this.#eQuery.PGO_TYPE_1, this.#eQuery.PGO_TYPE_2]
            },

            //  ---------------------------------------- SPANISH [es] ----------------------------------------
            {
                // Nomination decided (Wayfarer)
                subject: /^Decisión tomada sobre la propuesta de Wayspot de Niantic/,
                status: [this.#eStatusHelpers.WF_DECIDED(
                    'ha decidido aceptartu propuesta de Wayspot.',
                    'ha decidido no aceptar tu propuesta de Wayspot.'
                ), this.#eStatusHelpers.WF_DECIDED_NIA_2(
                    'Enhorabuena, nuestro equipo ha decidido aceptar tu propuesta de Wayspot.',
                    undefined //'did not meet the criteria required to be accepted and has been rejected'
                )], image: [this.#eQuery.WF_DECIDED(
                    /^¡Gracias por tu propuesta de Wayspot (?<title>.*) enviada el (?<day>\d+)[- ](?<month>)(-|\. )(?<year>\d+)!$/,
                    [this.#eMonths.SPANISH]
                ), this.#eQuery.WF_DECIDED(
                    /^Gracias por dedicar algo de tiempo para realizar tu propuesta de (?<title>.*) el (?<day>\d+) (?<month>)\. (?<year>\d+)\./,
                    [this.#eMonths.SPANISH]
                )]
            },

            //  ---------------------------------------- FRENCH [fr] ----------------------------------------
            {
                // Nomination decided (Wayfarer)
                subject: /^Résultat concernant la proposition du Wayspot Niantic/,
                status: [this.#eStatusHelpers.WF_DECIDED(
                    'a décidé d’accepter votre proposition de Wayspot.',
                    'a décidé de ne pas accepter votre proposition de Wayspot.'
                ), this.#eStatusHelpers.WF_DECIDED_NIA_2(
                    'Félicitations, notre équipe a décidé d’accepter votre proposition de Wayspot.',
                    'Malheureusement, l’équipe a décidé de ne pas accepter votre proposition de Wayspot.'
                )], image: [this.#eQuery.WF_DECIDED(
                    /^Merci pour votre proposition de Wayspot (?<title>.*) le (?<day>\d+) (?<month>)\.? (?<year>\d+)\u2009!$/,
                    [this.#eMonths.FRENCH]
                ), this.#eQuery.WF_DECIDED(
                    /^Merci d’avoir pris le temps de nous envoyer votre proposition (?<title>.*) le (?<day>\d+) (?<month>)\. (?<year>\d+)\./,
                    [this.#eMonths.FRENCH]
                )]
            },

            //  ---------------------------------------- HINDI [hi] ----------------------------------------
            {
                // Nomination decided (Wayfarer)
                subject: /^Niantic Wayspot का नामांकन .* के लिए तय किया गया$/,
                status: [this.#eStatusHelpers.WF_DECIDED(
                    'ने को आपके Wayspot नामांकन को स्वीकार करने का निर्णय लिया है',
                    'ने को आपके Wayspot नामांकन को अस्वीकार करने का निर्णय लिया है'
                ), this.#eStatusHelpers.WF_DECIDED_NIA_2(
                    'बधाई हो, हमारी टीम ने आपके Wayspot नामांकन को मंज़ूरी दे दी है.',
                    'खेद है कि हमारी टीम ने आपका Wayspot नामांकन नामंज़ूर कर दिया है.'
                )], image: [this.#eQuery.WF_DECIDED(
                    /^(?<month>) (?<day>\d+), (?<year>\d+) पर Wayspot नामांकन (?<title>.*) के लिए धन्यवाद!$/,
                    [this.#eMonths.ENGLISH, this.#eMonths.HINDI]
                ), this.#eQuery.WF_DECIDED(
                    /^(?<day>\d+) (?<month>) (?<year>\d+) पर Wayspot नामांकन (?<title>.*) के लिए धन्यवाद!$/,
                    [this.#eMonths.ENGLISH, this.#eMonths.HINDI]
                ), this.#eQuery.WF_DECIDED(
                    /^(?<day>\d+) (?<month>) (?<year>\d+) को (?<title>.*)  के नामांकन के लिए आपने समय निकाला, उसके लिए आपका धन्यवाद\./,
                    [this.#eMonths.HINDI]
                )]
            },

            //  ---------------------------------------- ITALIAN [it] ----------------------------------------
            {
                // Nomination decided (Wayfarer)
                subject: /^Proposta di Niantic Wayspot decisa per/,
                status: [this.#eStatusHelpers.WF_DECIDED(
                    'Congratulazioni, la tua proposta di Wayspot è stata accettata',
                    'Sfortunatamente, la tua proposta di Wayspot è stata respinta'
                ), this.#eStatusHelpers.WF_DECIDED_NIA_2(
                    'Congratulazioni, il nostro team ha deciso di accettare la tua proposta di Wayspot.',
                    undefined //'did not meet the criteria required to be accepted and has been rejected'
                )], image: [this.#eQuery.WF_DECIDED(
                    /^Grazie per la proposta di Wayspot (?<title>.*) in data (?<day>\d+)[ -](?<month>)[ -](?<year>\d+)\.$/,
                    [this.#eMonths.ITALIAN]
                ), this.#eQuery.WF_DECIDED(
                    /^grazie per aver trovato il tempo di inviare la tua proposta (?<title>.*) in data (?<day>\d+) (?<month>) (?<year>\d+)\./,
                    [this.#eMonths.ITALIAN]
                )]
            },

            //  ---------------------------------------- JAPANESE [ja] ----------------------------------------
            {
                // Nomination decided (Wayfarer)
                subject: /^Niantic Wayspotの申請「.*」が決定しました。$/,
                status: [this.#eStatusHelpers.WF_DECIDED(
                    'コミュニティはあなたのWayspot候補を承認しました。',
                    '不幸にも コミュニティはあなたのWayspot候補を承認しませんでした。'
                ), this.#eStatusHelpers.WF_DECIDED_NIA_2(
                    'チームでの検討の結果、あなたのお送りいただいたWayspot候補が採用されましたので、お知らせいたします。',
                    undefined //'did not meet the criteria required to be accepted and has been rejected'
                )], image: [this.#eQuery.WF_DECIDED(
                    /^(?<year>\d+)\/(?<month>)\/(?<day>\d+)にWayspot申請「(?<title>.*)」をご提出いただき、ありがとうございました。$/,
                    [this.#eMonths.ZERO_PREFIXED]
                ), this.#eQuery.WF_DECIDED(
                    /^(?<year>\d+)\/(?<month>)\/(?<day>\d+)に「(?<title>.*)」を候補としてお送りいただき、ありがとうございました。/,
                    [this.#eMonths.ZERO_PREFIXED]
                )]
            },
            {
                // Appeal decided
                subject: /^Niantic Wayspot「.*」に関する申し立てが決定しました。$/,
                status: [this.#eStatusHelpers.WF_APPEAL_DECIDED(
                    'Nianticはあなたが申請された候補をWayspotに追加する定しました。',
                    undefined // 'Niantic has decided that your nomination should not be added as a Wayspot'
                )], image: [this.#eQuery.WF_DECIDED(
                    /^(?<year>\d+)\/(?<month>)\/(?<day>\d+)にWayspot「(?<title>.*)」に関する申し立てをご提出いただき、ありがとうございました。$/,
                    [this.#eMonths.ZERO_PREFIXED]
                )]
            },

            //  ---------------------------------------- KOREAN [ko] ----------------------------------------
            {
                // Nomination decided (Wayfarer)
                subject: /에 대한 Niantic Wayspot 후보 결정이 완료됨$/,
                status: [this.#eStatusHelpers.WF_DECIDED(
                    '제안한 Wayspot 후보를 승인했습니다',
                    '제안한 Wayspot 후보를 승인하지않았습니다 .'
                ), this.#eStatusHelpers.WF_DECIDED_NIA_2(
                    '축하합니다, 귀하께서 추천하신 Wayspot 후보가 승인되었습니다\.',
                    undefined //'did not meet the criteria required to be accepted and has been rejected'
                )], image: [this.#eQuery.WF_DECIDED(
                    /^(?<year>\d+)\. (?<month>)\. (?<day>\d+)\.?에 Wayspot 후보 (?<title>.*)을\(를\) 제출해 주셔서 감사드립니다!$/,
                    [this.#eMonths.NUMERIC]
                ), this.#eQuery.WF_DECIDED(
                    /^(?<year>\d+)\. (?<month>)\. (?<day>\d+)\.?에 시간을 내어 (?<title>.*) \(을\)를 추천해 주셔서 감사합니다\./,
                    [this.#eMonths.NUMERIC]
                )]
            },

            //  ---------------------------------------- MARATHI [mr] ----------------------------------------
            {
                // Nomination decided (Wayfarer)
                subject: /^Niantic वेस्पॉट नामांकन .* साठी निश्चित केले$/,
                status: [this.#eStatusHelpers.WF_DECIDED(
                    'तुमचे Wayspot नामांकन स्वीकारण्याचा निर्णय घेतला आहे',
                    'तुमचे Wayspot नामांकन न स्वीकारण्याचा निर्णय घेतला आहे'
                ), this.#eStatusHelpers.WF_DECIDED_NIA_2(
                    'अभिनंदन, आमच्या टीमने तुमचे Wayspot नामांकन स्वीकारण्याचा निर्णय घेतला आहे\.',
                    undefined //'did not meet the criteria required to be accepted and has been rejected'
                )], image: [this.#eQuery.WF_DECIDED(
                    /^तुमच्या (?<month>) (?<day>\d+), (?<year>\d+) रोजी वेस्पॉट नामांकन (?<title>.*) साठी धन्यवाद!$/,
                    [this.#eMonths.ENGLISH]
                ), this.#eQuery.WF_DECIDED(
                    /^तुमच्या (?<day>\d+) (?<month>), (?<year>\d+) रोजी वेस्पॉट नामांकन (?<title>.*) साठी धन्यवाद!$/,
                    [this.#eMonths.MARATHI]
                ), this.#eQuery.WF_DECIDED(
                    /^(?<day>\d+) (?<month>), (?<year>\d+) तारखेला (?<title>.*)  वर नामांकन करण्यासाठी वेळ दिल्याबद्दल धन्यवाद\./,
                    [this.#eMonths.MARATHI]
                )]
            },
            {
                // Appeal decided
                subject: /^तुमचे Niantic वेस्पॉट आवाहन .* साठी निश्चित करण्यात आले आहे$/,
                status: [this.#eStatusHelpers.WF_APPEAL_DECIDED(
                    'Niantic ने ठरवले आहे की तुमचे नामांकन ACCEPT वेस्पॉट म्हणून जोडले जाऊ नये/नसावे',
                    'Niantic ने ठरवले आहे की तुमचे नामांकन REJECT वेस्पॉट म्हणून जोडले जाऊ नये/नसावे'
                )], image: [this.#eQuery.WF_DECIDED(
                    /^(?<month>) (?<day>\d+), (?<year>\d+) रोजी (?<title>.*) साठी तुमच्या वेस्पॉट नामांकन आवाहनाबद्दल धन्यवाद.$/,
                    [this.#eMonths.ENGLISH, this.#eMonths.MARATHI]
                ), this.#eQuery.WF_DECIDED(
                    /^(?<day>\d+) (?<month>), (?<year>\d+) रोजी (?<title>.*) साठी तुमच्या वेस्पॉट नामांकन आवाहनाबद्दल धन्यवाद.$/,
                    [this.#eMonths.ENGLISH, this.#eMonths.MARATHI]
                )]
            },

            //  ---------------------------------------- DUTCH [nl] ----------------------------------------
            {
                // Nomination decided (Wayfarer)
                subject: /^Besluit over Niantic Wayspot-nominatie voor/,
                status: [this.#eStatusHelpers.WF_DECIDED(
                    'heeft besloten om je Wayspot-nominatie wel te accepteren.',
                    'heeft besloten om je Wayspot-nominatie niet te accepteren.'
                ), this.#eStatusHelpers.WF_DECIDED_NIA_2(
                    'Gefeliciteerd, ons team heeft besloten je Wayspot-nominatie te accepteren.',
                    undefined //'did not meet the criteria required to be accepted and has been rejected'
                )], image: [this.#eQuery.WF_DECIDED(
                    /^Bedankt voor je Wayspot-nominatie (?<title>.*) op (?<day>\d+)[- ](?<month>)(-|\. )(?<year>\d+)!$/,
                    [this.#eMonths.DUTCH]
                ), this.#eQuery.WF_DECIDED(
                    /^Bedankt dat je de tijd hebt genomen om (?<title>.*) te nomineren op (?<day>\d+) (?<month>)\. (?<year>\d+)\./,
                    [this.#eMonths.DUTCH]
                )]
            },

            //  ---------------------------------------- NORWEGIAN [no] ----------------------------------------
            {
                // Nomination decided (Wayfarer)
                subject: /^En avgjørelse er tatt for Niantic Wayspot-nominasjonen for/,
                status: [this.#eStatusHelpers.WF_DECIDED(
                    'har valgt å godta Wayspot-nominasjonen din.',
                    'har valgt å avvise Wayspot-nominasjonen din.'
                )], image: [this.#eQuery.WF_DECIDED(
                    /^Takk for Wayspot-nominasjonen (?<title>.*), som du sendte inn (?<day>\d+)\.(?<month>)\.(?<year>\d+)!$/,
                    [this.#eMonths.NORWEGIAN]
                )]
            },
            {
                // Appeal decided
                subject: /^En avgjørelse er tatt for Niantic Wayspot-klagen for/,
                status: [this.#eStatusHelpers.WF_APPEAL_DECIDED(
                    'Niantic har valgt å legge til nominasjonen som en Wayspot',
                    'Niantic har valgt ikke legge til nominasjonen som en Wayspot'
                )], image: [this.#eQuery.WF_DECIDED(
                    /^Takk for klagen i forbindelse med Wayspot-nominasjonen (?<title>.*), som du sendte inn (?<day>\d+)\.(?<month>)\.(?<year>\d+).$/,
                    [this.#eMonths.NORWEGIAN]
                )]
            },

            //  ---------------------------------------- POLISH [pl] ----------------------------------------
            {
                // Nomination decided (Wayfarer)
                subject: /^Podjęto decyzję na temat nominacji Wayspotu/,
                status: [this.#eStatusHelpers.WF_DECIDED(
                    'zdecydowała zaakceptować nominacji Wayspotu.',
                    'zdecydowała nie przyjąć nominacji Wayspotu.'
                ), this.#eStatusHelpers.WF_DECIDED_NIA_2(
                    'Gratulację, nasz zespół zaakceptował Twoją nominację Punktu trasy.',
                    undefined //'did not meet the criteria required to be accepted and has been rejected'
                )], image: [this.#eQuery.WF_DECIDED(
                    /^Dziękujemy za nominowanie Wayspotu „(?<title>.*)” (?<year>\d+)-(?<month>)-(?<day>\d+).$/,
                    [this.#eMonths.ZERO_PREFIXED, this.#eMonths.POLISH]
                ), this.#eQuery.WF_DECIDED(
                    /^Dziękujemy za nominowanie Wayspotu „(?<title>.*)” (?<day>\d+) (?<month>) (?<year>\d+).$/,
                    [this.#eMonths.POLISH]
                ), this.#eQuery.WF_DECIDED(
                    /^Dziękujemy za poświęcenie czasu na przesłanie nominacji (?<title>.*)  (?<day>\d+) (?<month>) (?<year>\d+)\./,
                    [this.#eMonths.POLISH]
                )]
            },

            //  ---------------------------------------- PORTUGUESE [pt] ----------------------------------------
            {
                // Nomination decided (Wayfarer)
                subject: /^Decisão sobre a indicação do Niantic Wayspot/,
                status: [this.#eStatusHelpers.WF_DECIDED(
                    'a comunidade decidiu aceitar a sua indicação de Wayspot.',
                    'a comunidade decidiu recusar a sua indicação de Wayspot.'
                ), this.#eStatusHelpers.WF_DECIDED_NIA_2(
                    'Parabéns! Nossa equipe aceitou sua indicação de Wayspot.',
                    undefined //'did not meet the criteria required to be accepted and has been rejected'
                )], image: [this.#eQuery.WF_DECIDED(
                    /^Agradecemos a sua indicação do Wayspot (?<title>.*) em (?<day>\d+)(\/| de )(?<month>)(\/| de )(?<year>\d+).$/,
                    [this.#eMonths.PORTUGUESE]
                ), this.#eQuery.WF_DECIDED(
                    /^Agradecemos por indicar (?<title>.*) em (?<day>\d+) de (?<month>) de (?<year>\d+)\./,
                    [this.#eMonths.PORTUGUESE]
                )]
            },

            //  ---------------------------------------- RUSSIAN [ru] ----------------------------------------
            {
                // Nomination decided (Wayfarer)
                subject: /^Вынесено решение по номинации Niantic Wayspot для/,
                status: [this.#eStatusHelpers.WF_DECIDED(
                    'решило принять вашу номинацию Wayspot.',
                    'решило отклонить вашу номинацию Wayspot.'
                ), this.#eStatusHelpers.WF_DECIDED_NIA_2(
                    'Поздравляем, наша команда решила принять вашу номинацию Wayspot.',
                    undefined //'did not meet the criteria required to be accepted and has been rejected'
                )], image: [this.#eQuery.WF_DECIDED(
                    /^Благодарим за то, что отправили номинацию Wayfarer (?<title>.*) (?<day>\d+)[\. ](?<month>)[\. ](?<year>\d+)( г)?!$/,
                    [this.#eMonths.ZERO_PREFIXED, this.#eMonths.RUSSIAN]
                ), this.#eQuery.WF_DECIDED(
                    /^Благодарим вас за то, что нашли время выдвинуть номинацию (?<title>.*)  (?<day>\d+) (?<month>) (?<year>\d+) г\./,
                    [this.#eMonths.RUSSIAN]
                )]
            },

            //  ---------------------------------------- SWEDISH [sv] ----------------------------------------
            {
                // Nomination decided (Wayfarer)
                subject: /^Niantic Wayspot-nominering har beslutats om för/,
                status: [this.#eStatusHelpers.WF_DECIDED(
                    'har beslutat att accepteradin Wayspot-nominering.',
                    'har beslutat att inte acceptera din Wayspot-nominering.'
                ), this.#eStatusHelpers.WF_DECIDED_NIA_2(
                    'Grattis, vårt team har beslutat att acceptera din Wayspot-nominering.',
                    undefined //'did not meet the criteria required to be accepted and has been rejected'
                )], image: [this.#eQuery.WF_DECIDED(
                    /^Tack för din Wayspot-nominering (?<title>.*) den (?<year>\d+)-(?<month>)-(?<day>\d+)!$/,
                    [this.#eMonths.SWEDISH]
                ), this.#eQuery.WF_DECIDED(
                    /^Tack för din Wayspot-nominering (?<title>.*) den (?<day>\d+) (?<month>)\. (?<year>\d+)!$/,
                    [this.#eMonths.SWEDISH]
                ), this.#eQuery.WF_DECIDED(
                    /^Tack för att du tog dig tiden att nominera (?<title>.*) den (?<day>\d+) (?<month>)\. (?<year>\d+)\./,
                    [this.#eMonths.SWEDISH]
                )]
            },
            {
                // Appeal decided
                subject: /^Din Niantic Wayspot-överklagan har beslutats om för/,
                status: [this.#eStatusHelpers.WF_APPEAL_DECIDED(
                    'Niantic har beslutat att din nominering ACCEPT ska/inte ska läggas till som en Wayspot',
                    'Niantic har beslutat att din nominering REJECT ska/inte ska läggas till som en Wayspot'
                )], image: [this.#eQuery.WF_DECIDED(
                    /^Tack för överklagan för din Wayspot-nominering för (?<title>.*) den (?<year>\d+)-(?<month>)-(?<day>\d+)\.$/,
                    [this.#eMonths.SWEDISH]
                ), this.#eQuery.WF_DECIDED(
                    /^Tack för överklagan för din Wayspot-nominering för (?<title>.*) den (?<day>\d+) (?<month>)\. (?<year>\d+)\.$/,
                    [this.#eMonths.SWEDISH]
                )]
            },

            //  ---------------------------------------- TAMIL [ta] ----------------------------------------
            {
                // Nomination decided (Wayfarer)
                subject: /-க்கான Niantic Wayspot பணிந்துரை பரிசீலிக்கப்பட்டது.$/,
                status: [this.#eStatusHelpers.WF_DECIDED(
                    'உங்கள் Wayspot பரிந்துரையை ஏற்றுக்கொள்வதாக முடிவு செய்திருக்கிறது',
                    'உங்கள் Wayspot பரிந்துரையை நிராகரிப்பதாக முடிவு செய்திருக்கிறது'
                ), this.#eStatusHelpers.WF_DECIDED_NIA(
                    'did not meet the criteria required to be accepted and has been rejected', // Actually acceptance, bugged template
                    undefined //'did not meet the criteria required to be accepted and has been rejected'
                )], image: [this.#eQuery.WF_DECIDED(
                    /^நாளது தேதியில் (?<month>) (?<day>\d+), (?<year>\d+), (?<title>.*) -க்கான Wayspot பரிந்துரைக்கு நன்றி!$/,
                    [this.#eMonths.ENGLISH]
                ), this.#eQuery.WF_DECIDED(
                    /^நாளது தேதியில் (?<day>\d+) (?<month>), (?<year>\d+), (?<title>.*) -க்கான Wayspot பரிந்துரைக்கு நன்றி!$/,
                    [this.#eMonths.TAMIL]
                ), this.#eQuery.WF_DECIDED(
                    /^Thank you for taking the time to nominate (?<title>.*) on (?<day>\d+) (?<month>), (?<year>\d+)\./,
                    [this.#eMonths.TAMIL]
                )]
            },

            //  ---------------------------------------- TELUGU [te] ----------------------------------------
            {
                // Nomination decided (Wayfarer)
                subject: /కొరకు Niantic వేస్పాట్ నామినేషన్‌‌పై నిర్ణయం$/,
                status: [this.#eStatusHelpers.WF_DECIDED(
                    'మీ వేస్పాట్ నామినేషన్‌ను అంగీకరించడానికి ఉండటానికి',
                    undefined //'has decided not to accept your Wayspot nomination.',
                ), this.#eStatusHelpers.WF_DECIDED_NIA_2(
                    'శుభాకాంక్షలు, మీ Wayspot నామినేషన్‌ ఆమోదించాలని మా టీమ్ నిర్ణయించింది',
                    undefined //'did not meet the criteria required to be accepted and has been rejected'
                )], image: [this.#eQuery.WF_DECIDED(
                    /^(?<month>) (?<day>\d+), (?<year>\d+) తేదీన మీరు అందించిన వేస్పాట్ నామినేషన్ (?<title>.*) ను బట్టి ధన్యవాదాలు!$/,
                    [this.#eMonths.ENGLISH]
                ), this.#eQuery.WF_DECIDED(
                    /^(?<day>\d+) (?<month>), (?<year>\d+) తేదీన మీరు అందించిన వేస్పాట్ నామినేషన్ (?<title>.*) ను బట్టి ధన్యవాదాలు!$/,
                    [this.#eMonths.TELUGU]
                ), this.#eQuery.WF_DECIDED(
                    /^నామినేట్ చేయడానికి సమయం వెచ్చించినందుకు ధన్యవాదాలు (?<title>.*) on (?<day>\d+) (?<month>), (?<year>\d+)\./,
                    [this.#eMonths.TELUGU]
                )]
            },

            //  ---------------------------------------- THAI [th] ----------------------------------------
            {
                // Nomination decided (Wayfarer)
                subject: /^ผลการตัดสินการเสนอสถานที่ Niantic Wayspot สำหรับ/,
                status: [this.#eStatusHelpers.WF_DECIDED(
                    'ชุมชนได้ตัดสินใจ ยอมรับ Wayspot ของคุณ',
                    'ชุมชนได้ตัดสินใจ ไม่ยอมรับการ Wayspot ของคุณ'
                ), this.#eStatusHelpers.WF_DECIDED_NIA_2(
                    'ขอแสดงความยินดีด้วย ทีมงานของเราได้ตัดสินใจยอมรับการเสนอ Wayspot ของคุณแล้ว',
                    'ขออภัย ทีมงานของเราได้ตัดสินใจที่จะไม่ยอมรับการเสนอ Wayspot ของคุณ'
                )], image: [this.#eQuery.WF_DECIDED(
                    /^ขอบคุณสำหรับการเสนอสถานที่ Wayspot ของคุณ เรื่อง (?<title>.*) เมื่อวันที่ (?<day>\d+) (?<month>) (?<year>\d+)!$/,
                    [this.#eMonths.THAI]
                ), this.#eQuery.WF_DECIDED(
                    /^ขอบคุณที่สละเวลาเสนอ (?<title>.*) ในวันที่ (?<day>\d+) (?<month>) (?<year>\d+)/,
                    [this.#eMonths.THAI]
                )]
            },

            //  ---------------------------------------- CHINESE [zh] ----------------------------------------
            {
                // Nomination decided (Wayfarer)
                subject: /^社群已對 Niantic Wayspot 候選 .* 做出決定$/,
                status: [this.#eStatusHelpers.WF_DECIDED(
                    '社群已決定 接受 Wayspot 候選地。',
                    '社群已決定 不接受你的 Wayspot 候選地。'
                ), this.#eStatusHelpers.WF_DECIDED_NIA_2(
                    '您的Wayspot提名地點已通過團隊審查，在此誠摯恭喜您！',
                    undefined //'did not meet the criteria required to be accepted and has been rejected'
                )], image: [this.#eQuery.WF_DECIDED(
                    /^感謝你在 (?<year>\d+)-(?<month>)-(?<day>\d+) 提交 Wayspot 候選 (?<title>.*)！$/,
                    [this.#eMonths.NUMERIC]
                ), this.#eQuery.WF_DECIDED(
                    /^感謝你在 (?<year>\d+)年(?<month>)月(?<day>\d+)日 提交 Wayspot 候選 (?<title>.*)！$/,
                    [this.#eMonths.NUMERIC]
                ), this.#eQuery.WF_DECIDED(
                    /^感謝您於(?<year>\d+)年(?<month>)月(?<day>\d+)日提交提名地點：(?<title>.*)。 為了構築獨一無二的AR世界地圖，並且打造所有人都能身歷其境的冒險體驗，像您這樣的探索者是不可或缺的關鍵之一。/,
                    [this.#eMonths.NUMERIC]
                )]
            },
        ];

        #eProcessingStatus = {
            SUCCESS: 0,
            SKIPPED: 1,
            UNSUPPORTED: 2,
            AMBIGUOUS: 3,
            FAILURE: 4,
            UNCHANGED: 5,
        };

        #submissions;
        #db = null;
        #statusHistory = null;
        #errors = null;
        #stats = null;
        #messageStatus = null;

        constructor(submissions) {
            this.#submissions = submissions;
        }

        async open() {
            await new Promise(async resolve => {
                this.#db = await getIDBInstance();
                const tx = this.#db.transaction([OBJECT_STORE_NAME], "readonly");
                const objectStore = tx.objectStore(OBJECT_STORE_NAME);
                const getList = objectStore.getAll();
                getList.onsuccess = () => {
                    this.#statusHistory = {};
                    this.#errors = [];
                    this.#stats = [];
                    const eV1State = localStorage.hasOwnProperty('wfnshV1ProcessedEmailStates')
                        ? JSON.parse(localStorage.wfnshV1ProcessedEmailStates)
                        : { version: eV1ProcessingStateVersion, states: {} };
                    this.#messageStatus = eV1State.states;
                    if (eV1State.version < eV1CutoffEverything) {
                        this.#messageStatus = {};
                    }
                    const stateKeys = Object.keys(this.#messageStatus);
                    if (eV1State.version < eV1CutoffParseErrors) {
                        for (let i = 0; i < stateKeys.length; i++) {
                            // Reprocess old failures due to bugfixes and template additions
                            if (this.#messageStatus[stateKeys[i]] == this.#eProcessingStatus.UNSUPPORTED) delete this.#messageStatus[stateKeys[i]];
                            if (this.#messageStatus[stateKeys[i]] == this.#eProcessingStatus.FAILURE) delete this.#messageStatus[stateKeys[i]];
                        }
                    }
                    const counters = Object.keys(this.#eProcessingStatus).length;
                    for (let i = 0; i < counters; i++) this.#stats.push(0);
                    getList.result.forEach(e => { this.#statusHistory[e.id] = e.statusHistory });
                    resolve();
                };
            });
        }

        async close(withNotification) {
            this.#db.close();
            const total = this.#stats.reduce((a, b) => a + b);
            const cUpdated = this.#stats[this.#eProcessingStatus.SUCCESS];
            const cUnchanged = this.#stats[this.#eProcessingStatus.UNCHANGED];
            const cSkipped = this.#stats[this.#eProcessingStatus.SKIPPED];
            const cAmbiguous = this.#stats[this.#eProcessingStatus.AMBIGUOUS];
            const cErrors = this.#stats[this.#eProcessingStatus.FAILURE] + this.#stats[this.#eProcessingStatus.UNSUPPORTED];
            if (withNotification || cUpdated || cAmbiguous) {
                createNotification(`${total} emails from Email API were processed by Nomination Status History (of which ${cUpdated} change(s), ${cUnchanged} unchanged, ${cSkipped} skipped, ${cAmbiguous} unmatched, and ${cErrors} error(s)).`, "gray");
            }
            if (errorReportingPrompt && this.#errors.length) {
                const errors = { errors: this.#errors };
                try {
                    if (GM_info) {
                        errors.version = GM_info.script.version;
                    }
                } catch (e) {
                }
                const anchorp = document.createElement('p');
                const aReport = document.createElement('a');
                aReport.textContent = 'Submit report';
                aReport.addEventListener('click', () => {
                    if (confirm(
                        'Thank you for helping further the development of the Nomination Status History plugin!\n\n' +
                        'The crash report contains a copy of the email(s) that resulted in parsing errors in the script. These emails may contain identifying information such as your username and email address. Error tracing information included with the report may also include a list of other Wayfarer userscripts you may be using.\n\n' +
                        'All data is sent directly to a server under the developer\'s control, and will be treated confidentially. Crash reports may be archived for future testing.\n\n' +
                        'Under the terms of the GDPR, you are entitled to a copy of your stored data, as well as deletion of said data, upon request. GDPR inquiries should be directed by email to post(at)varden(dot)info.\n\n' +
                        'Do you wish to continue?\n\n'
                    )) {
                        const xhr = new XMLHttpRequest();
                        xhr.open('POST', 'https://api.varden.info/wft/nsh/submit-crash.php', true);
                        xhr.setRequestHeader('Content-Type', 'application/json');
                        xhr.onload = () => alert(xhr.response);
                        xhr.send(JSON.stringify(errors));
                    } else {
                        alert('Crash report has been discarded, and no data was submitted.');
                    }
                });
                anchorp.appendChild(aReport);
                anchorp.appendChild(document.createTextNode(' - '));
                const aDismiss = document.createElement('a');
                aDismiss.textContent = 'No thanks';
                anchorp.appendChild(aDismiss);
                anchorp.appendChild(document.createTextNode(' - '));
                const aNever = document.createElement('a');
                aNever.textContent = 'Don\'t ask again';
                aNever.addEventListener('click', () => {
                    localStorage.wfnshStopAskingAboutCrashReports = '1';
                    errorReportingPrompt = false;
                });
                anchorp.appendChild(aNever);
                createNotification(
                    `Errors occurred during processing of some Wayfarer emails by Nomination Status History. Do you wish to report these errors to the script developer?`,
                    'red'
                ).appendChild(anchorp);
            }
            localStorage.wfnshV1ProcessedEmailStates = JSON.stringify({ version: eV1ProcessingStateVersion, states: this.#messageStatus });
            this.#db = null;
            this.#statusHistory = null;
            this.#errors = null;
            this.#stats = null;
            this.#messageStatus = null;
        }

        async importEmail(email) {
            // Already processed
            if (email.messageID in this.#messageStatus) return;

            let { status, reason, change, id, error } = this.#processEmail(email);
            this.#messageStatus[email.messageID] = status;
            if (status == this.#eProcessingStatus.SUCCESS && change && id) {
                const merged = this.#mergeEmailChange(id, change);
                if (merged) await this.#importChangeIntoDatabase(id, merged);
                else status = this.#eProcessingStatus.UNCHANGED;
            }
            if (status == this.#eProcessingStatus.UNSUPPORTED || status == this.#eProcessingStatus.FAILURE) {
                const err = {
                    email: email.createDebugBundle(),
                    error: JSON.parse(JSON.stringify(error, Object.getOwnPropertyNames(error)))
                };
                if (error.stack) err.stack = error.stack.split('\n').filter(n => n.length);
                this.#errors.push(err);
            }
            this.#stats[status]++;
        }

        #importChangeIntoDatabase(id, change) {
            return new Promise((resolve, reject) => {
                const tx = this.#db.transaction([OBJECT_STORE_NAME], "readwrite");
                const start = Date.now();
                const objectStore = tx.objectStore(OBJECT_STORE_NAME);
                const getStored = objectStore.get(id);
                getStored.onsuccess = () => {
                    const { result } = getStored;
                    if (result) {
                        // Nomination ALREADY EXISTS in IDB
                        const update = { ...result, statusHistory: change.updates };
                        objectStore.put(update);
                    }
                    tx.commit();
                    resolve();
                };
            });
        }

        #deduplicateHistoryArray(arr) {
            for (let i = arr.length - 2; i >= 0; i--) {
                if (arr[i].status == arr[i + 1].status) {
                    // Duplicate status
                    const curDate = new Date(arr[i].timestamp);
                    if (!(curDate.getUTCMilliseconds() || curDate.getUTCSeconds() || curDate.getUTCMinutes() || curDate.getUTCHours())) {
                        // All of the above are 0 means this was with extreme likelihood a WFES import that is less accurate.
                        // Thus we keep the email date instead for this one even though it happened "in the future".
                        arr.splice(i, 1);
                    } else {
                        arr.splice(i + 1, 1);
                    }
                }
            }
        }

        #mergeEmailChange(id, change) {
            const joined = [...change.updates, ...this.#statusHistory[id]];
            joined.sort((a, b) => a.timestamp - b.timestamp);
            this.#deduplicateHistoryArray(joined);
            // It should not be possible for the stored history to have duplicates, but this line of code exists because it did somehow happen to someone
            this.#deduplicateHistoryArray(this.#statusHistory[id]);
            const diffs = [];
            if (this.#statusHistory[id].length) {
                for (let i = 0, j = 0; i < this.#statusHistory[id].length && j < joined.length; i++, j++) {
                    while (this.#statusHistory[id][i].status !== joined[j].status) diffs.push({ ...joined[j++], previously: null });
                    if (
                        this.#statusHistory[id][i].timestamp !== joined[j].timestamp
                        || !!this.#statusHistory[id][i].verified !== !!joined[j].verified
                        || this.#statusHistory[id][i].email !== joined[j].email
                    ) diffs.push({ ...joined[j], previously: this.#statusHistory[id][i].timestamp });
                }
            } else {
                for (let j = 0; j < joined.length; j++) {
                    diffs.push({ ...joined[j++], previously: null });
                }
            }
            if (diffs.length) return { ...change, updates: joined, diffs };
            return null;
        };

        #processEmail(email) {
            let change = null;
            let id = null;
            let returnStatus = this.#eProcessingStatus.SUCCESS;
            let reason = null;
            let except = null
            try {
                const emlClass = email.classify();
                if (!['NOMINATION_RECEIVED', 'NOMINATION_DECIDED', 'APPEAL_RECEIVED', 'APPEAL_DECIDED'].includes(emlClass.type) || ['LIGHTSHIP'].includes(emlClass.style)) {
                    returnStatus = this.#eProcessingStatus.SKIPPED;
                    reason = 'This email is either for a type of contribution that is not trackable in Niantic Wayfarer, or for content that is unrelated to Wayfarer.';
                } else {
                    const doc = email.getDocument();
                    let success = false;
                    let template = null;
                    if (emlClass.style == 'WAYFARER' && emlClass.type == 'NOMINATION_RECEIVED') {
                        template = {
                            status: [() => this.#eType.NOMINATED],
                            image: [this.#eQuery.IMAGE_ALT('Submission Photo')]
                        };
                    } else if (emlClass.style == 'WAYFARER' && emlClass.type == 'APPEAL_RECEIVED') {
                        template = {
                            status: [() => this.#eType.APPEALED],
                            image: [this.#eQuery.IMAGE_ALT('Submission Photo')]
                        };
                    } else {
                        const subject = email.getHeader('Subject');
                        for (let j = 0; j < this.#emailParsers.length; j++) {
                            if (subject.match(this.#emailParsers[j].subject)) {
                                template = this.#emailParsers[j];
                                break;
                            }
                        }
                    }
                    if (!template) {
                        throw new UnknownTemplateError('This email does not appear to match any styles of Niantic emails currently known to Nomination Status History.');
                    }
                    let url = null;
                    if (template.image) {
                        for (let k = 0; k < template.image.length && url === null; k++) {
                            url = template.image[k](doc, email);
                            if (url) {
                                const match = url.match(/^https?:\/\/lh3.googleusercontent.com\/(.*)$/);
                                if (!match) url = null;
                                else url = match[1];
                            };
                        }
                    }

                    if (!url) throw new MissingDataError('Could not determine which nomination this email references.');
                    const [nom] = this.#submissions.filter(e => e.imageUrl.endsWith('/' + url));
                    if (!nom) throw new NominationMatchingError(`The nomination that this email refers to cannot be found on this Wayfarer account (failed to match LH3 URL ${url}).`);
                    let status = null;
                    for (let k = 0; k < template.status.length && status === null; k++) {
                        status = template.status[k](doc, nom, email);
                    }
                    if (!status) throw new MissingDataError('Unable to determine the status change that this email represents.');
                    change = {
                        title: nom.title,
                        updates: [{
                            timestamp: new Date(email.getHeader('Date')).getTime(),
                            verified: true,
                            email: email.messageID,
                            status
                        }]
                    };
                    id = nom.id;
                    success = true;
                    if (!success && returnStatus !== this.#eProcessingStatus.SKIPPED) throw new UnknownTemplateError('This email does not appear to match any styles of Niantic emails currently known to Nomination Status History.');
                }
            } catch (e) {
                except = e;
                if (e instanceof UnresolvableProcessingError) {
                    console.warn(e);
                    returnStatus = this.#eProcessingStatus.AMBIGUOUS;
                } else if (e instanceof EmailParsingError) {
                    console.error(e, email);
                    returnStatus = this.#eProcessingStatus.UNSUPPORTED;
                } else {
                    console.error(e, email);
                    returnStatus = this.#eProcessingStatus.FAILURE;
                }
                reason = e.message;
            }
            return { status: returnStatus, reason, change, id, error: except };
        }

        #tryNull(call) {
            try {
                return call() || null;
            } catch (e) {
                return null;
            }
        }

        #utcDateToISO8601(date) {
            return `${date.getUTCFullYear()}-${('0' + (date.getUTCMonth() + 1)).slice(-2)}-${('0' + date.getUTCDate()).slice(-2)}`;
        }

        #shiftDays(date, offset) {
            const nd = new Date(date);
            nd.setUTCDate(nd.getUTCDate() + offset);
            return nd;
        }
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
            .wfnshBg-red a {
                color: #FCC;
            }
            .wfnshBg-green {
                background-color: #09b065;
            }
            .wfnshBg-blue {
                background-color: #1a3aad;
            }
            .wfnshBg-purple {
                background-color: #8b5cf6;
            }
            .wfnshBg-gold {
                background-color: goldenrod;
            }
            .wfnshBg-gray {
                background-color: gray;
            }
            .wfnshBg-brown {
                background-color: #755534;
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
