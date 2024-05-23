// ==UserScript==
// @name         Wayfarer Appeal Info
// @version      0.1.9
// @description  Save and display info about appeals
// @namespace    https://github.com/tehstone/wayfarer-addons/
// @downloadURL  https://github.com/tehstone/wayfarer-addons/raw/main/wayfarer-appeal-info.user.js
// @homepageURL  https://github.com/tehstone/wayfarer-addons/
// @match        https://wayfarer.nianticlabs.com/*
// ==/UserScript==

// Copyright 2024 tehstone
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
    const MAX_APPEALS = 2;
    const APPEAL_COOLDOWN = 20;
    const OBJECT_STORE_NAME = 'appealInfo';
    const idMap = {};
    const statusMap = {};
    let nominations;

    console.log("Wayfarer Appeal Info init");
    addCss();

    /**
     * Overwrite the open method of the XMLHttpRequest.prototype to intercept the server calls
     */
    (function (open) {
        XMLHttpRequest.prototype.open = function (method, url) {
            if (url == '/api/v1/vault/manage/detail' && method == 'POST') {
                this.addEventListener('load', interceptDetail, false);
            } else if (url == '/api/v1/vault/manage'&& method == 'GET') {
                this.addEventListener('load', interceptManage, false);
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
                    if (xhr.responseURL == window.origin + '/api/v1/vault/manage/appeal') {
                        handleSubmittedAppeal(data, result).catch(console.error);
                    }
                }), false);
            } catch (err) { }
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
            console.error(`No json data found in response (probably nothing to worry about)\n${err}`);
        }
    };

    function checkAppealStatus(canAppeal) {
        awaitElement(() => document.querySelector('wf-logo')).then(ref => {      
            let appeal = document.createElement('p');
            const userId = getUserId();
            let appealQueue = [];
            if (localStorage.hasOwnProperty(`wfai_appeal_history_${userId}`)) {
                appealHistory = JSON.parse(localStorage[`wfai_appeal_history_${userId}`]);
                setItem(appealQueue, appealHistory["0"]);
                setItem(appealQueue, appealHistory["1"]);
                localStorage.setItem(`wfai_appeal_queue_${userId}`, JSON.stringify(appealQueue));
                localStorage.removeItem(`wfai_appeal_history_${userId}`);
            } else if (localStorage.hasOwnProperty(`wfai_last_appeal_date_${userId}`)) {
                let appealTimestamp = localStorage.getItem(`wfai_last_appeal_date_${userId}`);
                if (appealTimestamp === undefined || appealTimestamp === null || appealTimestamp === ""){
                    setItem(appealQueue, 0);
                    setItem(appealQueue, 1);
                } else {
                    setItem(appealQueue, 0);
                    setItem(appealQueue, appealTimestamp);
                }
                localStorage.setItem(`wfai_appeal_queue_${userId}`, JSON.stringify(appealQueue));
                localStorage.removeItem(`wfai_last_appeal_date_${userId}`);
            }
            if (localStorage.hasOwnProperty(`wfai_appeal_queue_${userId}`)) {
                appealQueue = JSON.parse(localStorage[`wfai_appeal_queue_${userId}`]);
            } else {
                setItem(appealQueue, 0);
                setItem(appealQueue, 1);
                localStorage.setItem(`wfai_appeal_queue_${userId}`, JSON.stringify(appealQueue));
            }
            const firstAppealTimestamp = parseInt(appealQueue[appealQueue.length - 1]);
            const secondAppealTimestamp = parseInt(appealQueue[appealQueue.length - 2]);
            const current = Date.now();
            const daysUntilFirst = Math.round(((firstAppealTimestamp + (APPEAL_COOLDOWN * 1000 * 60 * 60 * 24) ) - current) / (1000 * 60 * 60 * 24));
            const daysUntilSecond = Math.round(((secondAppealTimestamp + (APPEAL_COOLDOWN * 1000 * 60 * 60 * 24) ) - current) / (1000 * 60 * 60 * 24));
            if (daysUntilFirst <= 0 || daysUntilSecond <= 0) {
                if (!canAppeal) {
                    appeal.textContent = 'No';
                    console.warn("Wayfarer Appeal Info: Appeal is not available but stored history indicates it should be.")
                } else if (daysUntilFirst <= 0 && daysUntilSecond <= 0) {
                    appeal.textContent = '2';
                } else {
                    appeal.textContent = '1';
                }
            }
            
            if (daysUntilFirst > 0 && daysUntilSecond > 0) {
                if (canAppeal) {
                    console.warn("Wayfarer Appeal Info: Appeal available but stored history indicates otherwise.")
                    appeal.textContent = 'Yes';
                } else {
                    appeal.textContent = `in ~${Math.min(daysUntilFirst, daysUntilSecond)} days`;
                }
            }
            if (document.querySelector('.wfai_can_appeal') === null) {
                const div = document.createElement('div');
                div.className = 'wfai_can_appeal';

                let appealLabel = document.createElement('p');
                appealLabel.textContent = 'Appeals available: ';
                div.appendChild(appealLabel);
                div.appendChild(appeal);

                const container = ref.parentNode.parentNode;
                container.appendChild(div);
            } else {
                const oldAppeal = document.querySelector('.wfai_can_appeal').childNodes[1];
                oldAppeal.textContent = appeal.textContent;
            }
        });
    }

    function interceptManage(e) {
        const list = document.getElementsByTagName('app-submissions-list')[0];
        list.addEventListener('click', handleNominationClick);
        try {
            const response = this.response;
            const json = JSON.parse(response);
            if (!json) {
                console.log('Wayfarer Appeal Info: Failed to parse response from Wayfarer');
                return;
            }
            if (json.captcha) return; // ignore if it's related to captchas
            nominations = json.result.submissions;
            if (!nominations) {
                console.log('Wayfarer Appeal Info: Wayfarer\'s response didn\'t include nominations.');
                return;
            }
            setTimeout(() => {
                if ("canAppeal" in json.result) {
                    checkAppealStatus(json.result["canAppeal"]);
                }
            }, 300);
        } catch (e) {
            console.warn(`Wayfarer Appeal Info: Exception encountered while processing nominations list:\n${e}`); // eslint-disable-line no-console
        }
    }

    function interceptDetail() {
        try {
            const response = this.response;
            const json = JSON.parse(response);
            if (!json) return;
            if (json.captcha) return;
            const id = json.result.id;
            idMap[json.result.imageUrl] = id;
            statusMap[id] = json.result.status;
            checkAppealRecord(id).then(result => {
                if (result) {
                    renderAppealHeader();
                    renderAppealInfo(id);
                }
            })
        } catch (e) {
            console.error(e);
        }
    }

    const handleNominationClick = e => {
        const item = e.target.closest('app-submissions-list-item');
        if (item) {
            // Remove any manually added boxes (for appealed noms) or they will conflict
            const old = document.getElementsByClassName('wfai_appeal-display');
            for (let i = old.length - 1; i >= 0; i--) old[i].parentNode.removeChild(old[i]);

            const id = idMap[item.querySelector('img').src];
            if (id) {
                // If the id is stored in idMap then that means a /detail request has already been done for it
                checkAppealRecord(id).then(result => {
                    if (result) {
                        const header = document.querySelector('app-details-pane .card > div.flex-row + .ng-star-inserted h5');
                        if (!header) {
                            renderAppealHeader();
                        }
                        renderAppealInfo(id)
                    }
                })
            }
        }
    }

    const renderAppealHeader = () => {
        const h5 = document.createElement('h5');
        h5.textContent = "Appeal Info";
        h5.className = 'ng-star-inserted';
        h5.style.color = '#737373';
        h5.style.marginBottom = '8px';
        const pane = document.createElement('div');
        pane.className = 'details-pane__section';
        pane.appendChild(h5);
        const box = document.createElement('div');
        // The box must be manually removed!! So we add a class to it to identify it later.
        box.className = 'ng-star-inserted wfai_appeal-display';
        box.appendChild(pane);
        const ref = document.querySelector('app-details-pane .card > div.flex-row');
        ref.parentNode.insertBefore(box, ref.nextSibling);
    }

    const renderAppealInfo = (nominationId) => {
        getIDBInstance().then(db => {
            const tx = db.transaction([OBJECT_STORE_NAME], "readonly");
            tx.oncomplete = event => { db.close(); };
            const objectStore = tx.objectStore(OBJECT_STORE_NAME);
            let record = objectStore.get(nominationId);
            record.onsuccess = () => {
                let parent = document.getElementsByClassName('wfai_appeal-display');
                if (parent && parent.length > 0) {
                    parent = parent[0];
                    const { result } = record;

                    let dateInfo = document.createElement('span');
                    const date = new Date(result["appealTimestamp"]);
                    dateInfo.textContent = `Appeal Date: ${date.toLocaleString()}`;
                    parent.appendChild(dateInfo);

                    parent.appendChild(document.createElement('br'));

                    let appealText = document.createElement('span');
                    let content = result["statement"];
                    if (content == null || content == undefined) {
                        content = result["appealText"];
                    }
                    appealText.textContent = `Appeal Statement:\n${content}`;
                    parent.appendChild(appealText);
                }

                if (nominationId in statusMap) {
                    if (statusMap[nominationId] !== 'APPEALED') {
                        const ref = document.querySelector('app-details-pane');
                        const tagRef = ref.querySelector('app-submission-tag-set');
                        const tag = document.createElement('div');
                        tag.classList.add('submission-tag');
                        const text = document.createElement('span');
                        text.style.color = "white";
                        text.style.backgroundColor = "gray";
                        text.textContent = "Was Appealed";
                        tag.appendChild(text);
                        tagRef.appendChild(tag);
                    }
                }
            }
        })
    }

    const handleSubmittedAppeal = (data, result) => new Promise((resolve, reject) => {
        const appealTimestamp = Date.now();
        const userId = getUserId();
        let appealQueue = [];
        try {
            if (localStorage.hasOwnProperty(`wfai_appeal_queue_${userId}`)) {
                appealQueue = JSON.parse(localStorage[`wfai_appeal_queue_${userId}`])
                console.log(`Wayfarer Appeal Info: Discarding oldest appeal date of ${appealQueue[appealQueue.length - 1]}, oldest appeal date set to ${appealQueue[appealQueue.length - 2]}, latest appeal date set to ${appealTimestamp}`);
                setItem(appealQueue, appealTimestamp);
                localStorage.setItem(`wfai_appeal_queue_${userId}`, JSON.stringify(appealQueue));
            } else {
                console.log(`Wayfarer Appeal Info: No stored appeal history found, oldest appeal date set to 0, latest appeal date set to ${appealTimestamp}`);
                appealQueue.setItem(appealQueue, 0);
                setItem(appealQueue, appealTimestamp);
                localStorage.setItem(`wfai_appeal_queue_${userId}`, JSON.stringify(appealQueue));
            }
        } catch (err) {
            console.warn(`Failed to save appeal timestamp ${appealTimestamp} to local storage with error:\n${err}`);
        }
        data["appealTimestamp"] = appealTimestamp;
        getIDBInstance().then(db => {
            const tx = db.transaction([OBJECT_STORE_NAME], "readwrite");
            tx.oncomplete = event => { db.close(); };
            tx.onerror = reject;
            const objectStore = tx.objectStore(OBJECT_STORE_NAME);
            objectStore.put(data);
            console.log('Wayfarer Appeal Info: appeal data saved to datastore');
            tx.commit();
            resolve();
        }).catch(reject); 
    });

    const checkAppealRecord = (nominationId) => new Promise((resolve, reject) => {
        getIDBInstance().then(db => {
            const tx = db.transaction([OBJECT_STORE_NAME], "readonly");
            tx.oncomplete = event => { db.close(); };
            tx.onerror = reject;
            const objectStore = tx.objectStore(OBJECT_STORE_NAME);
            let count = objectStore.count(nominationId);
            count.onsuccess = () => {
                resolve(count.result !== 0);
            }
        }).catch(reject);
    });

    const addData = (data) => {
        getIDBInstance().then(db => {
            const tx = db.transaction([OBJECT_STORE_NAME], "readwrite");
            tx.oncomplete = event => { db.close(); };
            const objectStore = tx.objectStore(OBJECT_STORE_NAME);
            objectStore.put(data);
            tx.commit();
        })
    }

    function getUserId() {
        var els = document.getElementsByTagName("image");
        for (var i = 0; i < els.length; i++) {
           const element = els[i];
           const attribute = element.getAttribute("href");
           let fields = attribute.split('/');
           let userId = fields[fields.length-1];
           fields = userId.split('=');
           userId = fields[0];
           return userId;
        }
        return "temporary_default_userid";
    }

    function setItem (array, item) {
        array.unshift(item) > MAX_APPEALS ?  array.pop() : null
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
            console.log(`Wayfarer Appeal Info: IndexedDB initialization complete (database version ${dbVer}).`);
            if (!db.objectStoreNames.contains(OBJECT_STORE_NAME)) {
                db.close();
                console.log(`Wayfarer Appeal Info: Database does not contain column ${OBJECT_STORE_NAME}. Closing and incrementing version.`);
                getIDBInstance(dbVer + 1).then(resolve);
            } else {
                resolve(db);
            }
        };
        openRequest.onupgradeneeded = event => {
            console.log('Wayfarer Appeal Info: Upgrading database...');
            const db = event.target.result;
            if (!db.objectStoreNames.contains(OBJECT_STORE_NAME)) {
                db.createObjectStore(OBJECT_STORE_NAME, { keyPath: 'id' });
            }
        };
    });

    function addCss() {
        const css = `
            .wfai_can_appeal {
                color: #333;
                margin-left: 2em;
                padding-top: 0.3em;
                text-align: center;
                display: block;
            }

            .dark .wfai_can_appeal {
                color: #ddd;
            }

            .wfai_can_appeal p:nth-child(2) {
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
